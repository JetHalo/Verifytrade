/**
 * Browser-side fetchers for the local Next.js API.
 * All amounts are in x1e8 fixed-point (decimal strings on the wire to avoid bigint JSON issues).
 */

export interface RoundDTO {
  id: number;
  periodStart: string;
  periodEnd: string;
  creator: string;
  active: boolean;
  finalized: boolean;
  createdAt: string;
}

export interface LeaderboardRowDTO {
  roundId: number;
  identity: string;
  uidBindingHash: string;
  tradeCount: number;
  volumeX1e8: string;
  pnlX1e8: string;
  attestationId: string;
  blockHash?: string;
  txHash?: string;
  submittedAt: string;
}

export async function listRounds(): Promise<RoundDTO[]> {
  const r = await fetch("/api/rounds", { cache: "no-store" });
  if (!r.ok) throw new Error(`listRounds ${r.status}`);
  const j = await r.json();
  return j.rounds;
}

export async function getRound(roundId: number): Promise<RoundDTO | null> {
  const r = await fetch(`/api/rounds/${roundId}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`getRound ${r.status}`);
  const j = await r.json();
  return j.round;
}

export async function deleteRound(roundId: number): Promise<{ removedSubmissions: number }> {
  const r = await fetch(`/api/rounds/${roundId}`, { method: "DELETE" });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `deleteRound ${r.status}`);
  }
  return await r.json();
}

export async function createRound(input: {
  periodStart: string;
  periodEnd: string;
  creator: string;
}): Promise<RoundDTO> {
  const r = await fetch("/api/rounds", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `createRound ${r.status}`);
  }
  const j = await r.json();
  return j.round;
}

export async function getLeaderboard(roundId: number): Promise<LeaderboardRowDTO[]> {
  const r = await fetch(`/api/rounds/${roundId}/leaderboard`, { cache: "no-store" });
  if (!r.ok) throw new Error(`leaderboard ${r.status}`);
  const j = await r.json();
  return j.rows;
}

/**
 * Submit a proof bundle (produced by the Prover CLI) to the backend.
 * Backend will:
 *   1. Submit to zkVerify Volta
 *   2. Wait for finalization (~30-90s)
 *   3. Append a row to the leaderboard on success
 *
 * Returns the zkVerify attestation reference.
 */
export async function submitBundle(roundId: number, bundle: unknown): Promise<{
  attestationId: string;
  blockHash?: string;
  txHash?: string;
}> {
  const r = await fetch(`/api/rounds/${roundId}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bundle),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `submit ${r.status}`);
  return j;
}
