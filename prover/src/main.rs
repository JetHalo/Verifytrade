//! VerifyTrade Prover CLI

mod binance;
mod bundle;
mod commitment;
mod tlsn;

use anyhow::{Context, Result};
use base64::Engine as _;
use clap::Parser;
use std::path::PathBuf;
use tracing::{info, warn};

use crate::commitment::{fr_to_decimal, fr_to_hex};

#[derive(Parser, Debug)]
#[command(
    name = "veirfytrade-prover",
    version,
    about = "Generate a TLSNotary-backed proof of Binance Futures PnL"
)]
struct Cli {
    /// Notary WebSocket URL (e.g. wss://my-notary.up.railway.app)
    #[arg(long, env = "VEIRFYTRADE_NOTARY_URL")]
    notary: String,

    /// roundId you are submitting to
    #[arg(long)]
    round_id: u64,

    /// Your wallet address (0x…)
    #[arg(long)]
    wallet: String,

    /// Binance Futures Testnet session cookie (paste from browser DevTools → Application → Cookies)
    #[arg(long, env = "BINANCE_COOKIE")]
    binance_cookie: String,

    /// Output bundle path
    #[arg(long, default_value = "./output/proof-bundle.json")]
    output: PathBuf,

    /// Path to the circuit project (must contain Nargo.toml + src/main.nr)
    #[arg(long, default_value = "../circuit")]
    circuit_dir: PathBuf,

    /// Period start (Unix ms)
    #[arg(long)]
    period_start: u64,

    /// Period end (Unix ms)
    #[arg(long)]
    period_end: u64,

    /// Threshold in USDT (positive integer)
    #[arg(long)]
    threshold_usdt: i64,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let args = Cli::parse();
    info!("VerifyTrade prover starting · round={} · wallet={}", args.round_id, args.wallet);

    // -------- 1. UID lookup --------
    info!("Step 1/5: Fetching Binance UID via authenticated session");
    let binance_uid = binance::fetch_uid_from_session(&args.binance_cookie)
        .await
        .context("UID lookup failed (re-login at testnet.binancefuture.com and re-copy cookie)")?;
    info!("  Binance UID: {}", binance_uid);

    // -------- 2. MPC-TLS session --------
    info!("Step 2/5: MPC-TLS session via notary {}", args.notary);
    info!("  (this will exchange ~20MB with the notary — TLSNotary MPC overhead)");
    let session = tlsn::run_mpc_tls_session(&args.notary, &args.binance_cookie)
        .await
        .context("MPC-TLS session failed")?;
    info!("  Response body: {} bytes", session.response_body.len());

    // -------- 3. Parse trades --------
    info!("Step 3/5: Parsing trades");
    let trades = binance::parse_user_trades(&session.response_body)
        .context("parsing trades from response")?;
    info!("  Parsed {} trades", trades.len());

    if trades.is_empty() {
        warn!("No trades found. Place a few trades on testnet.binancefuture.com first.");
    }

    // -------- 4. Encode + commit --------
    info!("Step 4/5: Encoding inputs + computing commitments");
    let (trades_pnl_encoded, trades_time, valid_count) =
        commitment::encode_trades_for_circuit(&trades);
    let threshold_encoded = commitment::encode_pnl_usdt(args.threshold_usdt);
    let uid_binding_hash =
        commitment::compute_uid_binding(binance_uid, &args.wallet)
            .context("uid_binding_hash compute")?;
    let disclosed_commitment = commitment::compute_trades_commitment(
        &trades_pnl_encoded,
        &trades_time,
        valid_count,
        binance_uid,
    );
    info!("  threshold_encoded:   {}", fr_to_hex(&threshold_encoded));
    info!("  uid_binding_hash:    {}", fr_to_hex(&uid_binding_hash));
    info!("  disclosed_commitment:{}", fr_to_hex(&disclosed_commitment));

    let presentation = tlsn::build_presentation(&session, disclosed_commitment)
        .context("build presentation")?;

    // -------- 5. UltraHonk proof --------
    info!("Step 5/5: Generating UltraHonk proof (nargo + bb)");
    let wallet_decimal = wallet_to_decimal(&args.wallet)?;
    let ultrahonk_proof = tlsn::generate_ultrahonk_proof(
        &args.circuit_dir,
        &trades_pnl_encoded,
        &trades_time,
        valid_count,
        binance_uid,
        threshold_encoded,
        args.period_start,
        args.period_end,
        &wallet_decimal,
        uid_binding_hash,
        disclosed_commitment,
    )
    .await
    .context("UltraHonk proof generation")?;
    info!("  proof size: {} bytes", ultrahonk_proof.len());

    // -------- Output --------
    let b64 = base64::engine::general_purpose::STANDARD;
    let pi = bundle::PublicInputs {
        threshold_encoded: fr_to_decimal(&threshold_encoded),
        period_start: args.period_start.to_string(),
        period_end: args.period_end.to_string(),
        user_wallet: args.wallet.clone(),
        uid_binding_hash: fr_to_hex(&uid_binding_hash),
        disclosed_commitment: fr_to_hex(&disclosed_commitment),
    };
    let pkg = bundle::ProofBundle {
        round_id: args.round_id,
        tlsn_presentation: b64.encode(&presentation),
        ultrahonk_proof: b64.encode(&ultrahonk_proof),
        public_inputs: pi,
    };
    bundle::write(&pkg, &args.output)?;
    info!("✓ Bundle written to {}", args.output.display());
    info!("Next: upload via VerifyTrade web app, or run `pnpm submit -- --bundle {}` in scripts/", args.output.display());

    Ok(())
}

/// Convert a 0x-prefixed hex wallet to a decimal string suitable for Noir's Prover.toml.
fn wallet_to_decimal(wallet: &str) -> Result<String> {
    use num_bigint::BigUint;
    let s = wallet.trim_start_matches("0x");
    let padded = format!("{:0>40}", s);
    let bytes = hex::decode(&padded).context("invalid wallet hex")?;
    Ok(BigUint::from_bytes_be(&bytes).to_str_radix(10))
}
