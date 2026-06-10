import { NextRequest, NextResponse } from "next/server";
import { appendSubmission, getRound } from "@/lib/storage";
import { verifyOnZkVerify } from "@/lib/zkverify-server";

/**
 * Accepts a proof bundle, submits it to zkVerify Volta, and on success
 * appends a row to the leaderboard.
 *
 * Request body shape (same as `prover/src/bundle.rs::ProofBundle`):
 * {
 *   round_id: 0,
 *   tlsn_presentation: "<base64>",
 *   ultrahonk_proof:   "<base64>",
 *   public_inputs: {
 *     period_start, period_end, user_wallet, uid_binding_hash,
 *     disclosed_commitment, claimed_pnl_encoded, claimed_trade_count, claimed_volume
 *   },
 *   identity?: "alias-or-wallet"   // optional override; falls back to user_wallet
 * }
 *
 * Long-running: zkVerify finalization may take 30-90s. Caller should show a spinner.
 */
export const dynamic = "force-dynamic";
// Allow up to 2 minutes for zkVerify finalization
export const maxDuration = 120;

interface ProofBundle {
  round_id: number;
  ultrahonk_proof: string;
  public_inputs: {
    period_start: string;
    period_end: string;
    user_wallet: string;
    uid_binding_hash: string;
    disclosed_commitment: string;
    claimed_pnl_encoded: string;
    claimed_trade_count: string;
    claimed_volume: string;
  };
  identity?: string;
}

// PNL_OFFSET = 1e18 — must match circuit + Rust + Solidity
const PNL_OFFSET = 10n ** 18n;

export async function POST(req: NextRequest, { params }: { params: { roundId: string } }) {
  const roundId = Number(params.roundId);
  const bundle = (await req.json().catch(() => null)) as ProofBundle | null;
  if (!bundle || !bundle.public_inputs || !bundle.ultrahonk_proof) {
    return NextResponse.json({ error: "bundle missing required fields" }, { status: 400 });
  }

  // 1. Validate round + period inputs
  const round = await getRound(roundId);
  if (!round) return NextResponse.json({ error: "round_not_found" }, { status: 404 });
  if (!round.active) return NextResponse.json({ error: "round_not_active" }, { status: 400 });
  if (bundle.public_inputs.period_start !== round.periodStart) {
    return NextResponse.json({ error: "period_start mismatch" }, { status: 400 });
  }
  if (bundle.public_inputs.period_end !== round.periodEnd) {
    return NextResponse.json({ error: "period_end mismatch" }, { status: 400 });
  }

  // 2. Submit to zkVerify -- this is the critical step.
  //    If this throws/fails the row is NOT recorded.
  let verifyResult;
  try {
    verifyResult = await verifyOnZkVerify({
      proofBase64: bundle.ultrahonk_proof,
      publicInputs: bundle.public_inputs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `zkverify_failed: ${msg}` }, { status: 502 });
  }

  // 3. Decode the three aggregates from public inputs for storage.
  const claimedPnlEncoded = BigInt(bundle.public_inputs.claimed_pnl_encoded);
  const pnlX1e8 = claimedPnlEncoded - PNL_OFFSET; // signed
  const tradeCount = Number(BigInt(bundle.public_inputs.claimed_trade_count));
  const volumeX1e8 = BigInt(bundle.public_inputs.claimed_volume).toString();

  // 4. Determine identity (alias overrides; otherwise use the hex wallet from public inputs).
  let identity = bundle.identity ?? "";
  if (!identity) {
    // public_inputs.user_wallet is a decimal-encoded field; render it back as 0x...40 hex.
    const walletField = BigInt(bundle.public_inputs.user_wallet);
    identity = `0x${walletField.toString(16).padStart(40, "0")}`;
  }

  // 5. Append to leaderboard (sybil + duplicate checks happen inside).
  try {
    await appendSubmission({
      roundId,
      identity,
      uidBindingHash: bundle.public_inputs.uid_binding_hash,
      tradeCount,
      volumeX1e8,
      pnlX1e8: pnlX1e8.toString(),
      attestationId: verifyResult.attestationId,
      blockHash: verifyResult.blockHash,
      txHash: verifyResult.txHash,
      submittedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, attestationId: verifyResult.attestationId }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    attestationId: verifyResult.attestationId,
    blockHash: verifyResult.blockHash,
    txHash: verifyResult.txHash,
  }, { status: 201 });
}
