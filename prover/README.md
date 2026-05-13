# Prover CLI

Rust binary that runs on the participant's laptop. Connects to the notary, fetches Binance Futures trades through MPC-TLS, generates the UltraHonk proof.

## Build modes

Two feature flags:

```bash
# Mock mode (default) — skips MPC, fetches Binance directly over HTTPS.
# Use this for developing/testing the rest of the pipeline.
cargo build --release

# Full mode — uses TLSNotary tlsn-prover crates.
# Requires you to pin a tagged tlsn release that matches the API surface in src/tlsn.rs.
cargo build --release --features tlsn
```

## Run

```bash
# Fetch Binance cookie:
#   1. Log in at https://testnet.binancefuture.com (GitHub one-click)
#   2. DevTools → Application → Cookies → copy "Cookie" header
export BINANCE_COOKIE="..."

./target/release/veirfytrade-prover \
  --notary       wss://my-notary.up.railway.app \
  --round-id     0 \
  --wallet       0xABCDEF1234567890ABCDEF1234567890ABCDEF12 \
  --period-start 1717200000000 \
  --period-end   1717804800000 \
  --threshold-usdt 500
```

Output → `./output/proof-bundle.json`

## What each module does

```
main.rs           CLI entry, orchestrates the 5-step flow
binance.rs        Parse /fapi/v1/userTrades; fetch UID via authenticated request
commitment.rs     PNL offset encoding + BN254 Poseidon (via light-poseidon)
tlsn.rs           MPC-TLS session + presentation + UltraHonk proof generation
bundle.rs         JSON output schema
```

## Important: Poseidon alignment

The Rust-side `compute_uid_binding` and `compute_trades_commitment` MUST produce identical hashes to the Noir circuit's equivalent functions. We use `light-poseidon` with the `new_circom` parameter set, which targets Circom-compatible BN254 Poseidon.

**Before trusting any commitment binding**, run the cross-consistency check:

```bash
# Rust side prints canonical hashes:
cargo test cross_consistency_test -- --nocapture
# expect output like:
#   poseidon_2(1, 2)    = 0x...
#   poseidon_3(1, 2, 3) = 0x...

# Noir side:
cd ../circuit && nargo test test_poseidon_canonical
# Update the placeholder asserts in main.nr with the Rust output and re-run.
# If both pass, alignment is confirmed.
```

If outputs differ, swap `light-poseidon` for a crate that targets Noir's exact parameters (try `poseidon-rs` from iden3 or extract Noir's constants directly).

## External tools

The prover shells out to:

- **`nargo`** — Noir compiler + executor. Install: `curl -L noirup.dev | bash && noirup`
- **`bb`** — Barretenberg CLI (UltraHonk backend). Install: `curl -L bbup.dev | bash && bbup`

Both must be on `$PATH`.

## TLSNotary integration status

The `tlsn` feature wires up `tlsn-core`, `tlsn-prover`, `tlsn-formats`, `tlsn-common` from the TLSNotary GitHub repo at the pinned tag in `Cargo.toml`.

**One missing piece**: `ws_stream_to_async` in `tlsn.rs` needs the `ws_stream_tungstenite` adapter (or equivalent) to bridge the WebSocket and the async byte stream the tlsn session needs. The code is structured to drop that adapter in when you enable the feature; uncomment the `todo!` and add `ws_stream_tungstenite = "0.13"` to deps.

If the TLSNotary API has moved since the pinned tag, you may need to update the function signatures in `tlsn.rs` to match. The structure (Session → Prover → MPC commit → connect → request → finalize) is the canonical pattern from the TLSNotary `examples/` directory.

## Local testing without a notary

```bash
# Mock mode runs end-to-end (minus the notary signature):
cargo build --release
export BINANCE_COOKIE=...
./target/release/veirfytrade-prover --notary wss://unused \
  --round-id 0 --wallet 0xABCDEF... \
  --period-start ... --period-end ... --threshold-usdt 500
# Bundles will be marked as MOCK in the presentation field.
```

## References

- [TLSNotary examples](https://github.com/tlsnotary/tlsn/tree/main/crates/examples)
- [Noir + Barretenberg proving](https://noir-lang.org/)
- [Binance Futures Testnet API](https://binance-docs.github.io/apidocs/futures/en/#testnet)
- [light-poseidon](https://crates.io/crates/light-poseidon)
