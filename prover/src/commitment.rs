//! Commitment / encoding helpers shared with the Noir circuit.
//!
//! Everything in this file MUST stay byte-for-byte consistent with
//! `circuit/src/main.nr`. A mismatch makes every proof unverifiable
//! with no actionable error. Use the `cross_consistency_test` to catch drift.

use crate::binance::{decimal_to_fixed_i64, UserTrade};
use anyhow::{anyhow, Result};
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use light_poseidon::{Poseidon, PoseidonHasher};
use num_bigint::BigUint;

/// Must match `PNL_OFFSET` in circuit/src/main.nr (= 1e18).
pub const PNL_OFFSET_DECIMAL: &str = "1000000000000000000";

/// Maximum trades per proof (matches circuit `MAX_TRADES`).
pub const MAX_TRADES: usize = 100;

fn pnl_offset_fr() -> Fr {
    Fr::from(BigUint::parse_bytes(PNL_OFFSET_DECIMAL.as_bytes(), 10).unwrap())
}

/// Encode a fixed-point (x1e8) signed PnL into the unsigned Field the circuit consumes.
/// encoded = real_pnl_x1e8 + PNL_OFFSET
pub fn encode_pnl_fixed(fixed: i64) -> Fr {
    let offset = pnl_offset_fr();
    if fixed >= 0 {
        offset + Fr::from(fixed as u64)
    } else {
        offset - Fr::from((-fixed) as u64)
    }
}

/// Encode a whole-USDT amount (no fractional component).
pub fn encode_pnl_usdt(usdt: i64) -> Fr {
    encode_pnl_fixed(usdt * 100_000_000)
}

/// Walk Binance trades into the (encoded_pnl[100], time[100], valid_count) shape the circuit expects.
pub fn encode_trades_for_circuit(trades: &[UserTrade]) -> (Vec<Fr>, Vec<Fr>, u64) {
    let mut pnl_encoded = vec![pnl_offset_fr(); MAX_TRADES]; // padding decodes to 0
    let mut time = vec![Fr::from(0u64); MAX_TRADES];

    let count = trades.len().min(MAX_TRADES);

    for (i, t) in trades.iter().take(MAX_TRADES).enumerate() {
        let fixed = decimal_to_fixed_i64(&t.realized_pnl).unwrap_or(0);
        pnl_encoded[i] = encode_pnl_fixed(fixed);
        time[i] = Fr::from(t.time);
    }

    if trades.len() > MAX_TRADES {
        tracing::warn!(
            "user has {} trades; circuit caps at {}; ignoring extras",
            trades.len(),
            MAX_TRADES
        );
    }

    (pnl_encoded, time, count as u64)
}

/// Compute poseidon(binance_uid, user_wallet_field).
/// Matches `std::hash::poseidon::bn254::hash_2([binance_uid, user_wallet])` in circuit.
pub fn compute_uid_binding(binance_uid: u64, user_wallet_hex: &str) -> Result<Fr> {
    let wallet_fr = wallet_hex_to_fr(user_wallet_hex)?;
    Ok(poseidon_2(Fr::from(binance_uid), wallet_fr))
}

/// Compute the trades commitment, matching `compute_trades_commitment` in main.nr:
///   acc = hash_2(uid, valid_count)
///   for i in 0..MAX_TRADES:
///       acc = hash_3(acc, pnl_encoded[i], time[i])
pub fn compute_trades_commitment(
    pnl_encoded: &[Fr],
    time: &[Fr],
    valid_count: u64,
    binance_uid: u64,
) -> Fr {
    let mut acc = poseidon_2(Fr::from(binance_uid), Fr::from(valid_count));
    for i in 0..MAX_TRADES {
        acc = poseidon_3(acc, pnl_encoded[i], time[i]);
    }
    acc
}

/// Pretty-print a Field for Prover.toml output.
/// Noir's Prover.toml accepts hex ("0x...") or decimal strings; we emit decimal.
pub fn fr_to_decimal(x: &Fr) -> String {
    let bytes = x.into_bigint().to_bytes_be();
    BigUint::from_bytes_be(&bytes).to_str_radix(10)
}

pub fn fr_to_hex(x: &Fr) -> String {
    let bytes = x.into_bigint().to_bytes_be();
    format!("0x{}", hex::encode(bytes))
}

// ---------- Poseidon (BN254, Circom-compatible, matches Noir stdlib) ----------
//
// light-poseidon's `new_circom(rate)` produces a Poseidon hasher with parameters
// matching circomlib's poseidon and (by convention) Noir's std::hash::poseidon::bn254.
//
// ⚠ VERIFICATION REQUIRED: run `nargo test test_poseidon_consistency` against this
// crate's `cross_consistency_test` to confirm matching outputs before trusting
// any commitment binding in production. If they don't match, swap to a different
// crate (e.g. poseidon-rs) and re-verify.

fn poseidon_2(a: Fr, b: Fr) -> Fr {
    let mut hasher = Poseidon::<Fr>::new_circom(2).expect("init poseidon t=3");
    hasher.hash(&[a, b]).expect("poseidon hash_2")
}

fn poseidon_3(a: Fr, b: Fr, c: Fr) -> Fr {
    let mut hasher = Poseidon::<Fr>::new_circom(3).expect("init poseidon t=4");
    hasher.hash(&[a, b, c]).expect("poseidon hash_3")
}

// ---------- Helpers ----------

fn wallet_hex_to_fr(wallet: &str) -> Result<Fr> {
    let s = wallet.trim_start_matches("0x");
    if s.len() > 64 {
        return Err(anyhow!("wallet hex too long: {}", s.len()));
    }
    let padded = format!("{:0>64}", s);
    let bytes = hex::decode(&padded)?;
    Ok(Fr::from(BigUint::from_bytes_be(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encoding_zero_pads_to_offset() {
        // A zero / padding slot is exactly PNL_OFFSET
        let zero_encoded = encode_pnl_fixed(0);
        assert_eq!(zero_encoded, pnl_offset_fr());
    }

    #[test]
    fn encoding_positive_pnl() {
        // +1 USDT × 1e8 + PNL_OFFSET
        let one_usdt_encoded = encode_pnl_usdt(1);
        let expected = pnl_offset_fr() + Fr::from(100_000_000u64);
        assert_eq!(one_usdt_encoded, expected);
    }

    #[test]
    fn encoding_negative_pnl() {
        // -1 USDT × 1e8 + PNL_OFFSET — still positive
        let neg_one_encoded = encode_pnl_usdt(-1);
        let expected = pnl_offset_fr() - Fr::from(100_000_000u64);
        assert_eq!(neg_one_encoded, expected);
    }

    #[test]
    fn uid_binding_is_deterministic() {
        let h1 = compute_uid_binding(12345, "0xABCDEF0123456789ABCDEF0123456789ABCDEF01").unwrap();
        let h2 = compute_uid_binding(12345, "0xABCDEF0123456789ABCDEF0123456789ABCDEF01").unwrap();
        assert_eq!(h1, h2);

        let h3 = compute_uid_binding(99999, "0xABCDEF0123456789ABCDEF0123456789ABCDEF01").unwrap();
        assert_ne!(h1, h3);
    }

    /// Print canonical Poseidon outputs for cross-verification against the Noir circuit.
    /// Run: `cargo test cross_consistency_test -- --nocapture`
    /// Then compare with `circuit/tests/poseidon_consistency.nr`.
    #[test]
    fn cross_consistency_test() {
        let h2_1_2 = poseidon_2(Fr::from(1u64), Fr::from(2u64));
        let h3_1_2_3 = poseidon_3(Fr::from(1u64), Fr::from(2u64), Fr::from(3u64));
        println!("poseidon_2(1, 2)    = {}", fr_to_hex(&h2_1_2));
        println!("poseidon_3(1, 2, 3) = {}", fr_to_hex(&h3_1_2_3));

        let uid_b = compute_uid_binding(
            12345,
            "0x0000000000000000000000000000000000ABCDEF",
        )
        .unwrap();
        println!("uid_binding(12345, 0x...ABCDEF) = {}", fr_to_hex(&uid_b));
    }
}
