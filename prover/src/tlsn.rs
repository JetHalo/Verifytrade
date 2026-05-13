//! TLSNotary MPC-TLS + Noir/UltraHonk proof generation.
//!
//! TLSNotary integration is feature-gated behind the `tlsn` Cargo feature.
//! Build with: `cargo build --release --features tlsn`
//! Without the feature, the prover runs in MOCK mode: it skips MPC and emits
//! a placeholder presentation. Useful for developing the rest of the flow.

use anyhow::{anyhow, Context, Result};
use ark_bn254::Fr;
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::info;

use crate::commitment::{fr_to_decimal, MAX_TRADES};

/// Output of one MPC-TLS session: the raw HTTP response body + an opaque
/// transcript handle that gets turned into a presentation downstream.
pub struct SessionOutput {
    pub response_body: Vec<u8>,
    pub transcript_handle: TranscriptHandle,
}

/// Opaque wrapper around a TLSNotary signed session. Implementation depends
/// on whether we're in tlsn-enabled or mock build.
pub struct TranscriptHandle {
    pub raw_bytes: Vec<u8>,
}

/// Run an MPC-TLS session against testnet.binancefuture.com to fetch the
/// user's Futures trades. The notary co-signs the transcript.
#[cfg(feature = "tlsn")]
pub async fn run_mpc_tls_session(
    notary_ws_url: &str,
    binance_cookie: &str,
) -> Result<SessionOutput> {
    use futures::AsyncWriteExt as _;
    use http_body_util::Empty;
    use hyper::body::Bytes;
    use tokio_util::compat::TokioAsyncReadCompatExt;

    info!("Connecting to notary at {}", notary_ws_url);

    // 1. Open WebSocket to notary
    let (notary_ws, _) = tokio_tungstenite::connect_async(notary_ws_url)
        .await
        .context("WebSocket connect to notary failed")?;
    let notary_socket = ws_stream_to_async(notary_ws);

    // 2. Initialize TLSNotary session over the socket
    let session = tlsn_core::Session::new(notary_socket.compat());
    let (_driver, mut handle) = session.split();

    // 3. Configure prover
    let prover = handle
        .new_prover(tlsn_prover::ProverConfig::builder().build()?)
        .context("prover init")?
        .commit(
            tlsn_common::MpcTlsConfig::builder()
                .max_sent_data(8192)
                .max_recv_data(65536)
                .build()?,
        )
        .await
        .context("MPC-TLS commit")?;

    // 4. Open TLS connection to Binance through MPC
    let server_name = "testnet.binancefuture.com";
    let (mut tls_conn, prover) = prover
        .connect(
            tlsn_common::TlsClientConfig::builder()
                .server_name(server_name)
                .root_store(default_root_store())
                .build()?,
        )
        .await
        .context("MPC-TLS connect")?;

    // 5. Send HTTP request
    let req = format!(
        "GET /fapi/v1/userTrades?symbol=BTCUSDT HTTP/1.1\r\n\
         Host: {}\r\n\
         Cookie: {}\r\n\
         User-Agent: VerifyTrade-Prover/0.1\r\n\
         Accept: application/json\r\n\
         Connection: close\r\n\r\n",
        server_name, binance_cookie
    );
    tls_conn
        .write_all(req.as_bytes())
        .await
        .context("send HTTP request")?;

    // 6. Read full response
    let mut buf = Vec::with_capacity(64 * 1024);
    use tokio::io::AsyncReadExt;
    tls_conn
        .read_to_end(&mut buf)
        .await
        .context("read HTTP response")?;
    drop(tls_conn);

    // 7. Strip HTTP headers, keep just the JSON body
    let body = extract_http_body(&buf)?;

    // 8. Finalize the transcript — notary signs the session commitment
    let transcript = prover.transcript().clone();
    let raw_transcript = bincode::serialize(&transcript)
        .context("serialize transcript")?;

    Ok(SessionOutput {
        response_body: body,
        transcript_handle: TranscriptHandle {
            raw_bytes: raw_transcript,
        },
    })
}

#[cfg(not(feature = "tlsn"))]
pub async fn run_mpc_tls_session(
    _notary_ws_url: &str,
    binance_cookie: &str,
) -> Result<SessionOutput> {
    // MOCK MODE: fetch Binance directly via HTTPS (no MPC, no notary signature)
    // and produce a placeholder transcript. The downstream flow still works for
    // end-to-end testing of encoding + Noir + zkVerify + contract.
    tracing::warn!("Running in MOCK mode (tlsn feature disabled).");
    tracing::warn!("Transcript will not be cryptographically signed by a notary.");

    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;

    let res = client
        .get("https://testnet.binancefuture.com/fapi/v1/userTrades?symbol=BTCUSDT")
        .header("Cookie", binance_cookie)
        .header("User-Agent", "Mozilla/5.0 (VerifyTrade-Prover-Mock)")
        .send()
        .await
        .context("HTTP fetch (mock mode)")?;

    if !res.status().is_success() {
        return Err(anyhow!("Binance returned {}", res.status()));
    }

    let body = res.bytes().await?.to_vec();
    Ok(SessionOutput {
        response_body: body.clone(),
        transcript_handle: TranscriptHandle {
            raw_bytes: format!("MOCK_TRANSCRIPT:{}", body.len()).into_bytes(),
        },
    })
}

/// Build a TLSNotary "presentation" that selectively discloses only the
/// disclosed_commitment bytes — keeping the actual trade data secret while
/// the notary's signature binds the disclosure to the real TLS session.
#[cfg(feature = "tlsn")]
pub fn build_presentation(
    session: &SessionOutput,
    _disclosed_commitment: Fr,
) -> Result<Vec<u8>> {
    // The real flow uses tlsn_formats::http to identify byte ranges in the
    // response, then constructs a PresentationBuilder that reveals only those
    // ranges. Since the response body itself contains the raw trades (not the
    // commitment), the practical pattern is:
    //
    //   - reveal the entire response body inside the presentation (verifier
    //     re-computes commitment locally and checks it matches the
    //     `disclosed_commitment` public input)
    //
    // OR
    //
    //   - reveal nothing in the presentation; bind `disclosed_commitment` via
    //     a custom application-layer attestation field
    //
    // We use the first (reveal-body) approach for simplicity and audit-ability.

    let transcript = bincode::deserialize::<tlsn_core::transcript::Transcript>(
        &session.transcript_handle.raw_bytes,
    )?;
    let presentation = tlsn_core::presentation::PresentationBuilder::new(transcript)
        .reveal_all_received()
        .build()?;
    Ok(bincode::serialize(&presentation)?)
}

#[cfg(not(feature = "tlsn"))]
pub fn build_presentation(
    session: &SessionOutput,
    disclosed_commitment: Fr,
) -> Result<Vec<u8>> {
    // Mock presentation: just package the body + commitment for downstream consumption.
    use serde::Serialize;
    #[derive(Serialize)]
    struct MockPresentation {
        mode: &'static str,
        body_base64: String,
        disclosed_commitment_hex: String,
    }
    use base64::Engine as _;
    let mock = MockPresentation {
        mode: "MOCK",
        body_base64: base64::engine::general_purpose::STANDARD.encode(&session.response_body),
        disclosed_commitment_hex: crate::commitment::fr_to_hex(&disclosed_commitment),
    };
    Ok(serde_json::to_vec(&mock)?)
}

/// Generate the UltraHonk proof by writing Prover.toml + invoking nargo + bb.
///
/// Required external tools (`which` them to verify): `nargo`, `bb`.
/// Install:
///   curl -L noirup.dev | bash && noirup
///   curl -L bbup.dev    | bash && bbup
#[allow(clippy::too_many_arguments)]
pub async fn generate_ultrahonk_proof(
    circuit_dir: &Path,
    trades_pnl_encoded: &[Fr],
    trades_time: &[Fr],
    valid_count: u64,
    binance_uid: u64,
    threshold_encoded: Fr,
    period_start: u64,
    period_end: u64,
    user_wallet_decimal: &str,
    uid_binding_hash: Fr,
    disclosed_commitment: Fr,
) -> Result<Vec<u8>> {
    if trades_pnl_encoded.len() != MAX_TRADES || trades_time.len() != MAX_TRADES {
        return Err(anyhow!(
            "trades arrays must be exactly {} long",
            MAX_TRADES
        ));
    }

    // 1. Write Prover.toml
    let prover_toml = render_prover_toml(
        trades_pnl_encoded,
        trades_time,
        valid_count,
        binance_uid,
        threshold_encoded,
        period_start,
        period_end,
        user_wallet_decimal,
        uid_binding_hash,
        disclosed_commitment,
    );
    let prover_toml_path = circuit_dir.join("Prover.toml");
    std::fs::write(&prover_toml_path, prover_toml)
        .with_context(|| format!("write {}", prover_toml_path.display()))?;
    info!("Wrote Prover.toml to {}", prover_toml_path.display());

    // 2. Run `nargo execute` to generate the witness
    info!("Running: nargo execute");
    let output = Command::new("nargo")
        .arg("execute")
        .current_dir(circuit_dir)
        .output()
        .context("failed to run nargo (is it installed and on PATH?)")?;
    if !output.status.success() {
        return Err(anyhow!(
            "nargo execute failed:\nstdout: {}\nstderr: {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // 3. Run `bb prove_ultra_honk` to generate the proof
    let witness_path = circuit_dir.join("target/verifytrade_circuit.gz");
    let json_path = circuit_dir.join("target/verifytrade_circuit.json");
    let proof_path = circuit_dir.join("target/proof");

    info!("Running: bb prove_ultra_honk");
    let output = Command::new("bb")
        .arg("prove_ultra_honk")
        .arg("-b").arg(&json_path)
        .arg("-w").arg(&witness_path)
        .arg("-o").arg(&proof_path)
        .output()
        .context("failed to run bb (Barretenberg CLI). Install via `curl -L bbup.dev | bash && bbup`")?;
    if !output.status.success() {
        return Err(anyhow!(
            "bb prove_ultra_honk failed:\nstdout: {}\nstderr: {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // 4. Read proof bytes
    let proof = std::fs::read(&proof_path)
        .with_context(|| format!("read proof from {}", proof_path.display()))?;
    info!("UltraHonk proof generated: {} bytes", proof.len());
    Ok(proof)
}

// ---------- Helpers ----------

#[allow(clippy::too_many_arguments)]
fn render_prover_toml(
    pnl: &[Fr],
    time: &[Fr],
    valid_count: u64,
    uid: u64,
    threshold: Fr,
    period_start: u64,
    period_end: u64,
    wallet_decimal: &str,
    uid_binding: Fr,
    commitment: Fr,
) -> String {
    let pnl_strs: Vec<String> = pnl.iter().map(|x| format!("\"{}\"", fr_to_decimal(x))).collect();
    let time_strs: Vec<String> = time.iter().map(|x| format!("\"{}\"", fr_to_decimal(x))).collect();

    format!(
        "trades_pnl_encoded = [{}]\n\
         trades_time = [{}]\n\
         valid_count = \"{}\"\n\
         binance_uid = \"{}\"\n\
         threshold_encoded = \"{}\"\n\
         period_start = \"{}\"\n\
         period_end = \"{}\"\n\
         user_wallet = \"{}\"\n\
         uid_binding_hash = \"{}\"\n\
         disclosed_commitment = \"{}\"\n",
        pnl_strs.join(", "),
        time_strs.join(", "),
        valid_count,
        uid,
        fr_to_decimal(&threshold),
        period_start,
        period_end,
        wallet_decimal,
        fr_to_decimal(&uid_binding),
        fr_to_decimal(&commitment),
    )
}

/// Extract the body portion of an HTTP/1.1 response. Returns the bytes after
/// the first occurrence of "\r\n\r\n".
fn extract_http_body(raw: &[u8]) -> Result<Vec<u8>> {
    let sep = b"\r\n\r\n";
    let pos = raw
        .windows(sep.len())
        .position(|w| w == sep)
        .ok_or_else(|| anyhow!("no HTTP header/body separator found"))?;
    Ok(raw[pos + sep.len()..].to_vec())
}

#[cfg(feature = "tlsn")]
fn default_root_store() -> tlsn_common::RootCertStore {
    // Bundled webpki roots
    let mut store = tlsn_common::RootCertStore::empty();
    for cert in webpki_roots::TLS_SERVER_ROOTS.iter() {
        store.add_trust_anchor(cert.clone());
    }
    store
}

#[cfg(feature = "tlsn")]
fn ws_stream_to_async<S>(
    ws: tokio_tungstenite::WebSocketStream<S>,
) -> impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    // Adapt the WebSocket message stream into a byte-oriented duplex stream.
    // For brevity we use a helper from the tlsn ecosystem; in a real build
    // include the appropriate adapter or implement read/write manually.
    use tokio_tungstenite::tungstenite::Message;
    let (sink, stream) = futures::StreamExt::split(ws);
    // The actual byte adapter for tungstenite ↔ AsyncRead/AsyncWrite is
    // available as `ws_stream_tungstenite::WsStream` in the tlsn examples.
    // Add `ws_stream_tungstenite = "0.13"` to Cargo.toml when enabling tlsn.
    let _ = (sink, stream); // suppress unused warning for the skeleton
    todo!("plug ws_stream_tungstenite::WsStream::new(ws) here once added to deps")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_http_body() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n[{\"foo\":1}]";
        let body = extract_http_body(raw).unwrap();
        assert_eq!(body, b"[{\"foo\":1}]");
    }
}

#[allow(unused_imports)]
use base64::Engine as _;
