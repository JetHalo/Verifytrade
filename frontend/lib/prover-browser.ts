/**
 * Browser-side end-to-end proof generation.
 *
 * Given the TLSNotary attestation result from the extension, this module:
 *   1. Parses the revealed trade data
 *   2. Encodes trades + computes window aggregates (count, volume, PnL)
 *   3. Computes disclosed_commitment via Poseidon (matches circuit)
 *   4. Generates a witness via Noir
 *   5. Generates the UltraHonk proof via bb.js
 *   6. Returns a bundle ready for on-chain submission
 */

import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import {
  encodeTradesForCircuit,
  encodePnlFixed,
  computeUidBinding,
  computeTradesCommitment,
  windowAggregates,
  fieldToHex,
  walletHexToField,
  type RawTrade,
} from "./commitment";
import type { TlsnResult } from "./tlsn-provider";

export interface ProveBundleInputs {
  /** Raw response body from the TLSNotary attestation -- we extract trades from it */
  attestationResult: TlsnResult;
  /** User's connected wallet address */
  walletAddress: `0x${string}`;
  /** Binance UID (parse from the attestation if available, else require user input) */
  binanceUid: bigint;
  /** Round configuration (must match the contract's Round) */
  periodStartMs: bigint;
  periodEndMs: bigint;
  /** Pre-compiled circuit JSON, loaded from /circuit/verifytrade_circuit.json */
  circuitJson: { bytecode: string; abi: unknown };
}

export interface ProveBundle {
  proof: Uint8Array;
  publicInputs: {
    periodStart: bigint;
    periodEnd: bigint;
    userWallet: bigint;
    uidBindingHash: bigint;
    disclosedCommitment: bigint;
    claimedPnlEncoded: bigint;
    claimedTradeCount: bigint;
    claimedVolume: bigint;
  };
  /** Convenience: signed PnL (x1e8) that will go on the leaderboard. */
  claimedPnlUsdtX1e8: bigint;
  /** Convenience: trade count + volume that will go on the leaderboard. */
  claimedTradeCount: bigint;
  claimedVolumeX1e8: bigint;
  /** The raw TLSNotary attestation (for contract-side signature verification) */
  attestation: string;
}

/** Extract Binance trades from a TLSNotary attestation.
 *
 *  Handles two response shapes:
 *  - fapi (public, HMAC-signed):  [{symbol, time, realizedPnl, quoteQty, ...}]
 *  - bapi (web-UI, cookie-auth):  {code, data: [{symbol, insertTime, realizedProfit, totalQuota, ...}]}
 *
 *  We try direct JSON parse first, then fall back to regex scanning over the
 *  flattened attestation tree (the tlsn presentation may interleave revealed
 *  bytes with redacted gaps).
 */
export function parseTradesFromAttestation(result: TlsnResult): RawTrade[] {
  if (!result.raw) {
    throw new Error("attestation result is empty (plugin may not have called done())");
  }

  // Collect every plausible string value in the result tree
  const allText: string[] = [];
  function walk(node: unknown) {
    if (typeof node === "string") allText.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  }
  walk(result.parsed ?? result.raw);

  const combined = allText.join("\n");

  // Diagnostic: dump a window of the combined text so we can see what
  // shape (or what error blob) the verifier actually returned. Strip
  // cookie/csrftoken to keep the log mildly safe even if it leaks to chat.
  // eslint-disable-next-line no-console
  console.log(
    "[VerifyTrade] attestation revealed text (first 1200 chars):",
    combined.slice(0, 1200).replace(/("cookie"|"csrftoken")[^,}]+/gi, "$1:<redacted>"),
  );

  // Try direct array parse on the raw string first (mock / debug case).
  try {
    const data = JSON.parse(result.raw);
    if (Array.isArray(data) && data.length > 0) {
      if ("realizedPnl" in data[0]) return data as RawTrade[];
      if ("realizedProfit" in data[0]) return data.map(normalizeBapiTrade);
    }
    if (data && typeof data === "object" && Array.isArray(data.data)) {
      return (data.data as Record<string, unknown>[]).map(normalizeBapiTrade);
    }
  } catch {
    // continue with regex
  }

  // Regex scan -- look for EITHER fapi or bapi field names. We pair each
  // realized-PnL/Profit with the closest preceding symbol/time/volume keys.
  const trades: RawTrade[] = [];
  const fieldRe = /"(symbol|time|insertTime|realizedPnl|realizedProfit|quoteQty|totalQuota|price|qty)"\s*:\s*("[^"]*"|-?[0-9.]+)/g;
  let current: Partial<RawTrade> = {};
  const haveCore = (t: Partial<RawTrade>) => t.time !== undefined && t.realizedPnl !== undefined;
  let match: RegExpExecArray | null;
  while ((match = fieldRe.exec(combined)) !== null) {
    const key = match[1];
    const rawVal = match[2];
    const val = rawVal.startsWith('"') ? rawVal.slice(1, -1) : rawVal;
    switch (key) {
      case "symbol":         current.symbol = val; break;
      case "time":
      case "insertTime":     current.time = Number(val); break;
      case "realizedPnl":
      case "realizedProfit": current.realizedPnl = val; break;
      case "quoteQty":
      case "totalQuota":     current.quoteQty = val; break;
      case "price":          current.price = val; break;
      case "qty":            current.qty = val; break;
    }
    if (haveCore(current)) {
      trades.push(current as RawTrade);
      current = {};
    }
  }
  return trades;
}

/** Map a bapi /private/future/user-data/trade-history record to RawTrade. */
function normalizeBapiTrade(raw: Record<string, unknown>): RawTrade {
  return {
    symbol:      typeof raw.symbol === "string" ? raw.symbol : undefined,
    time:        typeof raw.insertTime === "number" ? raw.insertTime : Number(raw.insertTime),
    realizedPnl: String(raw.realizedProfit ?? "0"),
    quoteQty:    raw.totalQuota !== undefined ? String(raw.totalQuota) : undefined,
    price:       raw.price !== undefined ? String(raw.price) : undefined,
    qty:         raw.qty !== undefined ? String(raw.qty) : undefined,
  };
}

/** Run the full pipeline: parse -> commit -> witness -> prove. */
export async function generateProofBundle(input: ProveBundleInputs): Promise<ProveBundle> {
  const trades = parseTradesFromAttestation(input.attestationResult);
  if (trades.length === 0) {
    throw new Error("no trades found in attestation -- place some trades on Binance testnet and re-notarize");
  }

  const encoded = encodeTradesForCircuit(trades);
  const uidBindingHash = computeUidBinding(input.binanceUid, input.walletAddress);
  const disclosedCommitment = computeTradesCommitment(encoded, input.binanceUid);

  // Aggregate the three numbers that go on the public leaderboard.
  const agg = windowAggregates(encoded, input.periodStartMs, input.periodEndMs);
  const claimedPnlEncoded = encodePnlFixed(agg.pnlX1e8);

  // Build the Noir input map. Field names MUST match main.nr.
  const noirInputs = {
    trades_pnl_encoded: encoded.pnlEncoded.map((x) => fieldToHex(x)),
    trades_time:        encoded.time.map((x) => fieldToHex(x)),
    trades_volume:      encoded.volume.map((x) => fieldToHex(x)),
    valid_count:        fieldToHex(encoded.validCount),
    binance_uid:        fieldToHex(input.binanceUid),
    period_start:       fieldToHex(input.periodStartMs),
    period_end:         fieldToHex(input.periodEndMs),
    user_wallet:        fieldToHex(walletHexToField(input.walletAddress)),
    uid_binding_hash:   fieldToHex(uidBindingHash),
    disclosed_commitment: fieldToHex(disclosedCommitment),
    claimed_pnl_encoded:  fieldToHex(claimedPnlEncoded),
    claimed_trade_count:  fieldToHex(agg.tradeCount),
    claimed_volume:       fieldToHex(agg.volumeX1e8),
  };

  // Execute the circuit to generate the witness
  const noir = new Noir(input.circuitJson as never);
  const { witness } = await noir.execute(noirInputs);

  // Generate the UltraHonk proof.
  //
  // `keccak: true` MUST match the `--oracle_hash keccak` flag used to write
  // the VK (see circuit/target/proof_out/vk). zkVerify Volta only accepts
  // UltraHonk proofs whose Fiat-Shamir transcript is hashed with Keccak256;
  // the default (poseidon2) would produce both a VK and a proof that the
  // pallet rejects with "VerificationKeyTooLarge" / wrong byte length.
  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(input.circuitJson.bytecode, api);
  const { proof } = await backend.generateProof(witness, { keccak: true });

  return {
    proof,
    publicInputs: {
      periodStart: input.periodStartMs,
      periodEnd: input.periodEndMs,
      userWallet: walletHexToField(input.walletAddress),
      uidBindingHash,
      disclosedCommitment,
      claimedPnlEncoded,
      claimedTradeCount: agg.tradeCount,
      claimedVolume:     agg.volumeX1e8,
    },
    claimedPnlUsdtX1e8: agg.pnlX1e8,
    claimedTradeCount:  agg.tradeCount,
    claimedVolumeX1e8:  agg.volumeX1e8,
    attestation: input.attestationResult.raw,
  };
}
