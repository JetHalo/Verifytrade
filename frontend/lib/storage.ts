/**
 * Server-side JSON file storage. Replaces the on-chain Competition contract
 * for the workshop demo — rounds + submissions live in `data/state.json`.
 *
 * - bigint serialised as decimal string (state.json must round-trip safely)
 * - simple per-process mutex prevents two concurrent POSTs from clobbering writes
 * - file is created with an empty schema on first read if missing
 *
 * For production this gets replaced by a real DB; for one demo machine + a
 * Workshop crowd, file storage is more than enough.
 */
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface RoundRow {
  id: number;
  periodStart: string;   // unix ms
  periodEnd: string;     // unix ms
  creator: string;       // wallet or alias
  active: boolean;
  finalized: boolean;
  createdAt: string;     // ISO
}

export interface SubmissionRow {
  roundId: number;
  /** Identity: 0x... wallet OR plain string alias. */
  identity: string;
  /** poseidon(binance_uid, user_wallet) — used for sybil check. */
  uidBindingHash: string;
  tradeCount: number;
  volumeX1e8: string;    // decimal string of uint128
  pnlX1e8: string;       // decimal string of int64
  /** zkVerify attestation reference. */
  attestationId: string;
  blockHash?: string;
  txHash?: string;
  submittedAt: string;   // ISO
}

interface State {
  rounds: RoundRow[];
  submissions: SubmissionRow[];
}

const DATA_DIR  = resolve(process.cwd(), "data");
const STATE_FILE = resolve(DATA_DIR, "state.json");

const EMPTY: State = { rounds: [], submissions: [] };

let mutex: Promise<unknown> = Promise.resolve();

/** Serialize all reads + writes through one chain. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = mutex;
  let release!: () => void;
  mutex = new Promise<void>((r) => (release = r));
  try {
    await previous;
    return await fn();
  } finally {
    release();
  }
}

async function ensureFile(): Promise<void> {
  if (existsSync(STATE_FILE)) return;
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(EMPTY, null, 2), "utf-8");
}

async function load(): Promise<State> {
  await ensureFile();
  const txt = await readFile(STATE_FILE, "utf-8");
  try {
    const parsed = JSON.parse(txt) as State;
    return {
      rounds: parsed.rounds ?? [],
      submissions: parsed.submissions ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

async function save(state: State): Promise<void> {
  await ensureFile();
  // Atomic write: write to a sibling .tmp file, then rename. POSIX rename(2)
  // is atomic on the same filesystem, so even a crash mid-write cannot leave
  // state.json half-written. Combined with the in-memory `mutex`, this is the
  // same guarantee SQLite gives you for free, minus the native build pain.
  const tmp = STATE_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await rename(tmp, STATE_FILE);
}

/* ============================================================
   Public API
   ============================================================ */

export async function listRounds(): Promise<RoundRow[]> {
  return withLock(async () => (await load()).rounds);
}

export async function getRound(roundId: number): Promise<RoundRow | null> {
  return withLock(async () => {
    const s = await load();
    return s.rounds.find((r) => r.id === roundId) ?? null;
  });
}

export async function createRound(input: {
  periodStartMs: bigint;
  periodEndMs: bigint;
  creator: string;
}): Promise<RoundRow> {
  return withLock(async () => {
    const s = await load();
    const id = s.rounds.length > 0 ? Math.max(...s.rounds.map((r) => r.id)) + 1 : 0;
    const row: RoundRow = {
      id,
      periodStart: input.periodStartMs.toString(),
      periodEnd:   input.periodEndMs.toString(),
      creator: input.creator,
      active: true,
      finalized: false,
      createdAt: new Date().toISOString(),
    };
    s.rounds.push(row);
    await save(s);
    return row;
  });
}

/** Remove a round AND all submissions attached to it. Idempotent. */
export async function deleteRound(roundId: number): Promise<{ removedSubmissions: number }> {
  return withLock(async () => {
    const s = await load();
    const before = s.submissions.length;
    s.rounds       = s.rounds.filter((r) => r.id !== roundId);
    s.submissions  = s.submissions.filter((x) => x.roundId !== roundId);
    const removed = before - s.submissions.length;
    await save(s);
    return { removedSubmissions: removed };
  });
}

export async function finalizeRound(roundId: number, who: string): Promise<RoundRow> {
  return withLock(async () => {
    const s = await load();
    const r = s.rounds.find((x) => x.id === roundId);
    if (!r) throw new Error(`round ${roundId} not found`);
    if (r.creator !== who) throw new Error("only the creator may finalize");
    r.active = false;
    r.finalized = true;
    await save(s);
    return r;
  });
}

/** Sort by pnl descending; return rows for the given round. */
export async function leaderboardFor(roundId: number): Promise<SubmissionRow[]> {
  return withLock(async () => {
    const s = await load();
    const rows = s.submissions.filter((x) => x.roundId === roundId);
    rows.sort((a, b) => {
      const diff = BigInt(b.pnlX1e8) - BigInt(a.pnlX1e8);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    return rows;
  });
}

export async function appendSubmission(row: SubmissionRow): Promise<void> {
  return withLock(async () => {
    const s = await load();

    const round = s.rounds.find((r) => r.id === row.roundId);
    if (!round) throw new Error(`round ${row.roundId} not found`);
    if (!round.active) throw new Error(`round ${row.roundId} is not active`);

    // Sybil gates disabled for the workshop demo: any successful Notarize +
    // ZK proof + zkVerify finalize round-trip should yield a leaderboard row,
    // even if the same wallet / identity / Binance UID is re-using the same
    // round. Re-enable these two checks for any production-style competition.
    //
    //   const uidSeen = s.submissions.some(
    //     (x) => x.roundId === row.roundId && x.uidBindingHash === row.uidBindingHash,
    //   );
    //   if (uidSeen) throw new Error("uid_already_used");
    //
    //   const identitySeen = s.submissions.some(
    //     (x) => x.roundId === row.roundId && x.identity.toLowerCase() === row.identity.toLowerCase(),
    //   );
    //   if (identitySeen) throw new Error("identity_already_submitted");

    s.submissions.push(row);
    await save(s);
  });
}
