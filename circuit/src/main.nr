// VerifyTrade - Noir circuit (UltraHonk backend)
//
// Demo-mode circuit: the user discloses three aggregates of their Binance
// Futures trading during a fixed time window -- trade count, total notional
// volume, and realized PnL -- and the circuit proves all three are correctly
// computed from a real TLSNotary-attested API response.
//
// Compared to the earlier threshold-gated version, this build:
//   - drops the "PnL > threshold" gate (the demo wants any number on the board)
//   - exposes `claimed_pnl`, `claimed_trade_count`, `claimed_volume` as public
//     inputs that the circuit pins down to the data inside the TLSNotary
//     commitment, so the user can't lie about any of the three.
//
// === Field encoding ===
//
//   encoded_pnl = pnl_in_USDT_times_1e8 + PNL_OFFSET   (signed -> unsigned field)
//   volume      = quote_qty_in_USDT_times_1e8          (always >= 0, no offset)
//   trade_count = scalar count                          (always >= 0)

global MAX_TRADES: u32 = 100;
global PNL_OFFSET: Field = 1000000000000000000; // 1e18

fn main(
    // ============ Private inputs (from TLSNotary selective disclosure) ============
    // Each slot is offset-encoded: stored = real_pnl_x1e8 + PNL_OFFSET
    trades_pnl_encoded: [Field; 100],
    trades_time:        [Field; 100],
    // Per-trade notional volume = quoteQty_in_USDT_x1e8, always non-negative
    trades_volume:      [Field; 100],
    // Number of valid trades (rest of array is zero-padded). 0 < valid_count <= 100.
    valid_count: Field,
    // Binance UID hashed externally for privacy
    binance_uid: Field,

    // ============ Public inputs ============
    // From on-chain Round configuration
    period_start:          pub Field,
    period_end:            pub Field,
    user_wallet:           pub Field,
    uid_binding_hash:      pub Field,
    disclosed_commitment:  pub Field,

    // User-claimed aggregates -- circuit pins these to the data inside the commitment
    claimed_pnl_encoded:   pub Field,
    claimed_trade_count:   pub Field,
    claimed_volume:        pub Field,
) {
    // ---------- 1. Window-filtered aggregates ----------
    //
    // For each trade slot i in [0, MAX_TRADES):
    //   if i < valid_count AND trades_time[i] in [period_start, period_end]:
    //     contribution_pnl    = trades_pnl_encoded[i] - PNL_OFFSET
    //     contribution_count  = 1
    //     contribution_volume = trades_volume[i]
    //   else:
    //     all three contributions are 0

    let mut total_real_pnl:   Field = 0;
    let mut count_in_window:  Field = 0;
    let mut volume_in_window: Field = 0;

    for i in 0..MAX_TRADES {
        let idx_in_range  = (i as Field).lt(valid_count);
        let time_ge_start = !trades_time[i].lt(period_start);
        let time_le_end   = !period_end.lt(trades_time[i]);
        let in_window     = idx_in_range & time_ge_start & time_le_end;

        let real_pnl_at_i = trades_pnl_encoded[i] - PNL_OFFSET;

        total_real_pnl   = total_real_pnl   + if in_window { real_pnl_at_i      } else { 0 };
        count_in_window  = count_in_window  + if in_window { 1                  } else { 0 };
        volume_in_window = volume_in_window + if in_window { trades_volume[i]   } else { 0 };
    }

    // ---------- 2. Pin user-claimed aggregates to circuit-computed totals ----------
    let claimed_real_pnl = claimed_pnl_encoded - PNL_OFFSET;
    assert(claimed_real_pnl       == total_real_pnl);
    assert(claimed_trade_count    == count_in_window);
    assert(claimed_volume         == volume_in_window);

    // ---------- 3. Bind Binance UID to user wallet ----------
    let computed_uid_binding = poseidon::poseidon::bn254::hash_2(
        [binance_uid, user_wallet]
    );
    assert(computed_uid_binding == uid_binding_hash);

    // ---------- 4. Bind to TLSNotary disclosed commitment (trust closure) ----------
    let computed_commitment = compute_trades_commitment(
        trades_pnl_encoded,
        trades_time,
        trades_volume,
        valid_count,
        binance_uid,
    );
    assert(computed_commitment == disclosed_commitment);
}

// Hash all trade data into a single Field, in a way reproducible by the Prover CLI.
// Order and inputs MUST match the Rust-side computation byte-for-byte.
//
// Per-slot folding uses an intermediate hash_2(pnl_encoded[i], time[i]) so the
// 4-tuple (acc, pnl_encoded[i], time[i], volume[i]) only needs hash_2 + hash_3
// primitives (no hash_4 in std::hash::poseidon::bn254).
fn compute_trades_commitment(
    pnl_encoded: [Field; 100],
    time:        [Field; 100],
    volume:      [Field; 100],
    valid_count: Field,
    uid:         Field,
) -> Field {
    let mut acc: Field = poseidon::poseidon::bn254::hash_2([uid, valid_count]);
    for i in 0..MAX_TRADES {
        let pnl_time = poseidon::poseidon::bn254::hash_2([pnl_encoded[i], time[i]]);
        acc = poseidon::poseidon::bn254::hash_3([acc, pnl_time, volume[i]]);
    }
    acc
}

// ---------- Tests ----------
//
// Run with: `nargo test`

#[test]
fn test_three_metrics_pinning() {
    // Two trades inside window, one outside.
    // Inside-window aggregates: count = 2, volume = 30000_00000000, pnl = +800 USDT
    let mut pnl    = [PNL_OFFSET; 100];
    let mut time   = [0; 100];
    let mut volume = [0; 100];

    // Trade 0: in window, +500 USDT, $10000 notional
    pnl[0]    = PNL_OFFSET + 50000000000;        // +500 USDT x 1e8
    time[0]   = 1717200001000;
    volume[0] = 1000000000000;                    // 10000 USDT x 1e8

    // Trade 1: in window, +300 USDT, $20000 notional
    pnl[1]    = PNL_OFFSET + 30000000000;
    time[1]   = 1717400000000;
    volume[1] = 2000000000000;

    // Trade 2: BEFORE window -- must be excluded
    pnl[2]    = PNL_OFFSET + 99999999999;
    time[2]   = 1717100000000;                    // < period_start
    volume[2] = 9999999999999;

    let valid_count = 3;
    let uid: Field    = 12345;
    let wallet: Field = 0xABCDEF;

    let uid_binding = poseidon::poseidon::bn254::hash_2([uid, wallet]);
    let commitment  = compute_trades_commitment(pnl, time, volume, valid_count, uid);

    main(
        pnl,
        time,
        volume,
        valid_count,
        uid,
        1717200000000,                              // period_start
        1717804800000,                              // period_end
        wallet,
        uid_binding,
        commitment,
        PNL_OFFSET + 80000000000,                   // claimed_pnl_encoded = +800 USDT
        2,                                           // claimed_trade_count
        3000000000000,                              // claimed_volume = 30000 USDT x 1e8
    );
}

#[test]
fn test_negative_pnl_still_works() {
    // Single losing trade -- claimed PnL is negative, circuit still binds it.
    let mut pnl    = [PNL_OFFSET; 100];
    let mut time   = [0; 100];
    let mut volume = [0; 100];

    pnl[0]    = PNL_OFFSET - 25000000000;        // -250 USDT
    time[0]   = 1717200001000;
    volume[0] = 500000000000;                     // 5000 USDT notional

    let valid_count = 1;
    let uid: Field    = 67890;
    let wallet: Field = 0xFEEDBEEF;

    let uid_binding = poseidon::poseidon::bn254::hash_2([uid, wallet]);
    let commitment  = compute_trades_commitment(pnl, time, volume, valid_count, uid);

    main(
        pnl, time, volume, valid_count, uid,
        1717200000000, 1717804800000,
        wallet, uid_binding, commitment,
        PNL_OFFSET - 25000000000,                   // claimed_pnl_encoded = -250 USDT
        1,
        500000000000,
    );
}

/// Cross-consistency anchor with the Rust prover side.
/// Both sides must produce identical hex values. Don't move these without
/// regenerating the matching Rust constants in `prover/src/commitment.rs`.
#[test]
fn test_poseidon_canonical() {
    let h2 = poseidon::poseidon::bn254::hash_2([1, 2]);
    assert(h2 == 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a);

    let h3 = poseidon::poseidon::bn254::hash_3([1, 2, 3]);
    assert(h3 == 0x0e7732d89e6939c0ff03d5e58dab6302f3230e269dc5b968f725df34ab36d732);
}
