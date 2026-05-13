# Circuit — Noir Business Assertion

The Noir circuit that asserts Binance Futures PnL > threshold over a time window, bound to a TLSNotary commitment.

## What it proves

> "I, the holder of wallet `W`, accumulated more than `T` USDT of realized PnL on Binance Futures account `U` between timestamps `[A, B]` — and this data is bound to a TLSNotary attestation I generated."

## Public inputs

| Name | Meaning |
| --- | --- |
| `threshold_encoded` | Minimum profit (offset-encoded) |
| `period_start`, `period_end` | Time window (Unix ms) |
| `user_wallet` | Submitter's wallet address |
| `uid_binding_hash` | `poseidon(binance_uid, user_wallet)` — locks Binance account to wallet |
| `disclosed_commitment` | `poseidon` chain over all trade data — must match TLSNotary's disclosed value |

## Private inputs

| Name | Meaning |
| --- | --- |
| `trades_pnl_encoded` | Up to 100 trades, offset-encoded realized PnL |
| `trades_time` | Corresponding timestamps |
| `valid_count` | How many of the 100 slots are real |
| `binance_uid` | Binance account ID |

## Build & test

```bash
nargo check                # syntax
nargo test                 # unit tests
nargo test test_poseidon_canonical -- --print  # cross-consistency anchor
nargo execute              # with Prover.toml
nargo prove                # generate UltraHonk proof (uses bb)
nargo verify               # local verification
```

## Encoding rules (CRITICAL — must match `prover/src/commitment.rs`)

### PnL offset encoding
```
encoded = real_pnl × 10^8 + 10^18
```
- Zero / padding slot → exactly `10^18` (decodes to 0)
- Positive values → `> 10^18`
- Negative values → `< 10^18` (still positive in the Field)

### Commitment chain
```
acc = poseidon_2(binance_uid, valid_count)
for i in 0..100:
    acc = poseidon_3(acc, pnl_encoded[i], time[i])
disclosed_commitment = acc
```

Both sides use BN254 Poseidon with Circom-compatible parameters (Noir's `std::hash::poseidon::bn254`, Rust's `light_poseidon::new_circom`).

## Cross-consistency check

`prover/src/commitment.rs` and `circuit/src/main.nr` must produce identical Poseidon outputs for the same inputs. Run both sides and compare:

```bash
# Rust side
cd ../prover && cargo test cross_consistency_test -- --nocapture
# Note the printed hex values for poseidon_2(1,2) and poseidon_3(1,2,3)

# Noir side
cd ../circuit && nargo test test_poseidon_canonical
# Update the assert lines in test_poseidon_canonical with the Rust-side hex,
# then re-run. If asserts pass, alignment is confirmed.
```

If they don't match, the trust binding is broken. Switch to a Rust crate that matches Noir's exact Poseidon parameters and re-test.

## What's parameterized (= changes per activity)

| Constant in circuit | Changes? |
| --- | --- |
| `MAX_TRADES = 100` | No (compile-time constant; raise + recompile for higher caps) |
| `PNL_OFFSET = 1e18` | No |
| Poseidon parameters | No |
| `threshold_encoded`, `period_*`, etc. | Yes — passed as public inputs each time |

The same compiled circuit serves any number of competitions with different thresholds and windows. Don't recompile per activity.
