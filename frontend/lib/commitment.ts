/**
 * Browser-side Poseidon BN254 commitment computation.
 *
 * MUST be byte-for-byte consistent with:
 *   - prover/src/commitment.rs (Rust, via light-poseidon)
 *   - circuit/src/main.nr (Noir, via noir-lang/poseidon)
 *
 * We use poseidon-lite (npm), which targets Circom-compatible BN254 Poseidon
 * — the same parameter set as noir-lang/poseidon and light-poseidon::new_circom.
 *
 * Cross-consistency: see `cross_consistency_test` in commitment.rs and
 * `test_poseidon_canonical` in main.nr. Same inputs must produce same outputs.
 */

import { poseidon2, poseidon3 } from "poseidon-lite";

export const PNL_OFFSET = 1_000_000_000_000_000_000n; // 1e18
export const MAX_TRADES = 100;

/** Aggregates over a window — the three numbers that go on the public leaderboard. */
export interface WindowAggregates {
  pnlX1e8: bigint;
  tradeCount: bigint;
  volumeX1e8: bigint;
}

/** Encode a fixed-point (x1e8) signed PnL into the Field value the circuit consumes. */
export function encodePnlFixed(fixedX1e8: bigint): bigint {
  return PNL_OFFSET + fixedX1e8;
}

/** Encode a whole-USDT amount (no fractional component). */
export function encodePnlUsdt(usdt: bigint): bigint {
  return encodePnlFixed(usdt * 100_000_000n);
}

/** Convert a Binance decimal string (e.g. "12.34567890" or "-0.5") to fixed-point bigint x1e8. */
export function decimalToFixed(s: string): bigint {
  const neg = s.startsWith("-");
  const stripped = neg ? s.slice(1) : s;
  const [int = "0", frac = ""] = stripped.split(".");
  const fracPadded = (frac + "00000000").slice(0, 8);
  const result = BigInt(int) * 100_000_000n + BigInt(fracPadded);
  return neg ? -result : result;
}

export interface RawTrade {
  symbol?: string;
  time: number;
  realizedPnl: string;
  /** quote currency notional, decimal string (e.g. "30000.00000000"). Optional;
   *  if absent, callers may fall back to price * qty. */
  quoteQty?: string;
  price?: string;
  qty?: string;
}

export interface EncodedTrades {
  pnlEncoded: bigint[]; // length MAX_TRADES
  time: bigint[];       // length MAX_TRADES
  volume: bigint[];     // length MAX_TRADES — quote notional x 1e8, always >= 0
  validCount: bigint;
}

/** Notional in quote currency (USDT) x 1e8 for one trade. Prefers `quoteQty`. */
function tradeNotionalX1e8(t: RawTrade): bigint {
  if (t.quoteQty && t.quoteQty.length > 0) {
    const v = decimalToFixed(t.quoteQty);
    return v < 0n ? 0n : v;
  }
  if (t.price && t.qty) {
    const p = decimalToFixed(t.price);   // x1e8
    const q = decimalToFixed(t.qty);     // x1e8
    if (p < 0n || q < 0n) return 0n;
    return (p * q) / 100_000_000n;        // (x1e8 * x1e8) / 1e8 = x1e8
  }
  return 0n;
}

/** Convert raw Binance trades into the (encoded_pnl[100], time[100], volume[100], valid_count)
 *  shape the circuit expects. Padding slots are 0 in all three arrays. */
export function encodeTradesForCircuit(trades: RawTrade[]): EncodedTrades {
  const pnlEncoded: bigint[] = new Array(MAX_TRADES).fill(PNL_OFFSET);
  const time:       bigint[] = new Array(MAX_TRADES).fill(0n);
  const volume:     bigint[] = new Array(MAX_TRADES).fill(0n);
  const count = Math.min(trades.length, MAX_TRADES);

  for (let i = 0; i < count; i++) {
    const t = trades[i];
    const fixed = decimalToFixed(t.realizedPnl);
    pnlEncoded[i] = encodePnlFixed(fixed);
    time[i] = BigInt(t.time);
    volume[i] = tradeNotionalX1e8(t);
  }

  return { pnlEncoded, time, volume, validCount: BigInt(count) };
}

/** Sum the in-window aggregates the user is going to put on the leaderboard. */
export function windowAggregates(
  enc: EncodedTrades,
  periodStartMs: bigint,
  periodEndMs: bigint,
): WindowAggregates {
  let pnl = 0n;
  let count = 0n;
  let vol = 0n;
  for (let i = 0; i < MAX_TRADES; i++) {
    if (i >= Number(enc.validCount)) break;
    const t = enc.time[i];
    if (t < periodStartMs || t > periodEndMs) continue;
    pnl += enc.pnlEncoded[i] - PNL_OFFSET;
    count += 1n;
    vol += enc.volume[i];
  }
  return { pnlX1e8: pnl, tradeCount: count, volumeX1e8: vol };
}

/** Compute `poseidon(binance_uid, user_wallet_field)`. Matches Noir hash_2. */
export function computeUidBinding(binanceUid: bigint, userWalletHex: string): bigint {
  const walletField = walletHexToField(userWalletHex);
  return poseidon2([binanceUid, walletField]);
}

/**
 * Compute disclosed_commitment by walking the same Poseidon chain as the circuit:
 *   acc = poseidon_2(uid, valid_count)
 *   for i in 0..MAX_TRADES:
 *       pnl_time = poseidon_2(pnl_encoded[i], time[i])
 *       acc      = poseidon_3(acc, pnl_time, volume[i])
 */
export function computeTradesCommitment(
  enc: EncodedTrades,
  binanceUid: bigint
): bigint {
  let acc = poseidon2([binanceUid, enc.validCount]);
  for (let i = 0; i < MAX_TRADES; i++) {
    const pnlTime = poseidon2([enc.pnlEncoded[i], enc.time[i]]);
    acc = poseidon3([acc, pnlTime, enc.volume[i]]);
  }
  return acc;
}

/** Convert a 0x-prefixed hex address to a Field value. EVM address fits in BigInt. */
export function walletHexToField(hex: string): bigint {
  const stripped = hex.replace(/^0x/i, "").padStart(64, "0");
  return BigInt("0x" + stripped);
}

/** Render a bigint as a 0x-prefixed 32-byte hex string. */
export function fieldToHex(x: bigint): string {
  return "0x" + x.toString(16).padStart(64, "0");
}
