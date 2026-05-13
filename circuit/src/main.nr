// VerifyTrade - Noir circuit (UltraHonk backend)
//
// Asserts that a user's Binance Futures trading PnL during a given time window
// exceeds a threshold, and binds the assertion to a TLSNotary commitment so
// the trade data is provably authentic.
//
// === Field encoding ===
//
// realizedPnl from Binance is a decimal USDT value (e.g. "12.345"). It can be
// negative (losses). To work in a ZK circuit we encode as:
//   encoded_pnl = pnl_in_USDT_times_1e8 + PNL_OFFSET
// where PNL_OFFSET is large enough to keep encoded values non-negative.
// All field-level arithmetic is then on unsigned Fields, with comparison/sum
// adjusted accordingly.

global MAX_TRADES: u32 = 100;
global PNL_OFFSET: Field = 1000000000000000000; // 1e18 - comfortably greater than any plausible single-trade loss

fn main(
    // ============ Private inputs (from TLSNotary selective disclosure) ============
    // Each slot is offset-encoded: stored = real_pnl_x1e8 + PNL_OFFSET
    trades_pnl_encoded: [Field; 100],
    trades_time:        [Field; 100],
    // Number of valid trades (rest of array is zero-padded). 0 < valid_count <= 100.
    valid_count: Field,
    // Binance UID hashed externally for privacy
    binance_uid: Field,

    // ============ Public inputs (from on-chain Round configuration) ============
    threshold_encoded:     pub Field, // real_threshold_x1e8 + PNL_OFFSET
    period_start:          pub Field,
    period_end:            pub Field,
    user_wallet:           pub Field,
    uid_binding_hash:      pub Field,
    disclosed_commitment:  pub Field,
) {
    // ---------- 1. Window-filtered PnL sum ----------
    //
    // For each trade slot i in [0, MAX_TRADES):
    //   if i < valid_count AND trades_time[i] in [period_start, period_end]:
    //     contribution = trades_pnl_encoded[i] - PNL_OFFSET
    //   else:
    //     contribution = 0
    //
    // total_real_pnl = sum of contributions

    let mut total_real_pnl: Field = 0;

    for i in 0..MAX_TRADES {
        let idx_in_range = (i as Field).lt(valid_count);
        let time_ge_start = !trades_time[i].lt(period_start);
        let time_le_end   = !period_end.lt(trades_time[i]);
        let in_window     = idx_in_range & time_ge_start & time_le_end;

        // Decode and conditionally add
        let real_pnl_at_i = trades_pnl_encoded[i] - PNL_OFFSET;
        let contribution  = if in_window { real_pnl_at_i } else { 0 };
        total_real_pnl = total_real_pnl + contribution;
    }

    // ---------- 2. Assert: total PnL > threshold ----------
    let real_threshold = threshold_encoded - PNL_OFFSET;
    // total_real_pnl > real_threshold  iff  real_threshold.lt(total_real_pnl)
    assert(real_threshold.lt(total_real_pnl));

    // ---------- 3. Bind Binance UID to user wallet ----------
    let computed_uid_binding = std::hash::poseidon::bn254::hash_2(
        [binance_uid, user_wallet]
    );
    assert(computed_uid_binding == uid_binding_hash);

    // ---------- 4. Bind to TLSNotary disclosed commitment (trust closure) ----------
    let computed_commitment = compute_trades_commitment(
        trades_pnl_encoded,
        trades_time,
        valid_count,
        binance_uid,
    );
    assert(computed_commitment == disclosed_commitment);
}

// Hash all trade data into a single Field, in a way reproducible by the Prover CLI.
// Order and inputs MUST match the Rust-side computation byte-for-byte.
fn compute_trades_commitment(
    pnl_encoded: [Field; 100],
    time: [Field; 100],
    valid_count: Field,
    uid: Field,
) -> Field {
    let mut acc: Field = std::hash::poseidon::bn254::hash_2([uid, valid_count]);
    for i in 0..MAX_TRADES {
        acc = std::hash::poseidon::bn254::hash_3([acc, pnl_encoded[i], time[i]]);
    }
    acc
}

// ---------- Tests ----------
//
// Run with: `nargo test`
//
// These exercise basic correctness; the real proof generation is driven by Prover.toml.

#[test]
fn test_simple_winning_proof() {
    // Single trade with +1000 USDT PnL, well above 500 USDT threshold
    let mut pnl  = [PNL_OFFSET; 100];
    let mut time = [0; 100];

    // Encode +1000 USDT (x1e8 = 1e11) on top of offset
    pnl[0]  = PNL_OFFSET + 100000000000;
    time[0] = 1717200001000;

    let uid = 12345;
    let wallet = 0xABCDEF;

    let uid_binding = std::hash::poseidon::bn254::hash_2([uid, wallet]);
    let commitment = compute_trades_commitment(pnl, time, 1, uid);

    main(
        pnl,
        time,
        1,
        uid,
        PNL_OFFSET + 50000000000, // threshold = +500 USDT
        1717200000000,
        1717804800000,
        wallet,
        uid_binding,
        commitment,
    );
}

/// Cross-consistency anchor with the Rust prover side.
///
/// Run on the Rust side:
///   cd ../prover && cargo test cross_consistency_test -- --nocapture
///
/// Run on this side:
///   nargo test --print test_poseidon_canonical
///
/// Both sides must produce identical hex values. If they don't, the
/// Poseidon implementations are using different parameters and the
/// trust closure is broken. Switch crates and retest.
#[test]
fn test_poseidon_canonical() {
    let h2 = std::hash::poseidon::bn254::hash_2([1, 2]);
    let h3 = std::hash::poseidon::bn254::hash_3([1, 2, 3]);
    // We can't print from a noir test cleanly, so we encode expected
    // results as assertions instead. Update these after running the
    // first round of cross-verification.
    //
    // PLACEHOLDER: replace with the actual hex once you've cross-checked.
    // For example:
    //   assert(h2 == 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a);
    //   assert(h3 == 0x...);
    let _ = (h2, h3);
}

