/**
 * Server-side wrapper around zkverifyjs. Submits an UltraHonk proof to
 * zkVerify Volta testnet and waits for finalization, returning the
 * attestation id.
 *
 * Implementation note: we use a *dynamic* import of zkverifyjs inside the
 * function body. That keeps the @polkadot/api + websocket runtime out of
 * Next.js's "Collecting page data" build phase (which would otherwise crash
 * loading the route module). The heavy deps only load on the first real
 * request to /api/rounds/[id]/submit.
 *
 * Env:
 *   ZKVERIFY_SEED      Volta testnet seed phrase (server-side secret, NOT NEXT_PUBLIC)
 *   CIRCUIT_VK_PATH    Path to the verification key file (raw bytes, from `bb prove --write_vk`)
 */
import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface SubmitInput {
  proofBase64: string;
  publicInputs: {
    period_start: string;
    period_end: string;
    user_wallet: string;
    uid_binding_hash: string;
    disclosed_commitment: string;
    claimed_pnl_encoded: string;
    claimed_trade_count: string;
    claimed_volume: string;
  };
}

export interface VerifyResult {
  attestationId: string;
  blockHash?: string;
  txHash?: string;
}

/**
 * Load the verification key as a 0x-prefixed hex string.
 *
 * zkverifyjs's ultrahonk formatter calls `.startsWith('0x')` on whatever you
 * pass it -- so we must pre-stringify here. Passing a raw Buffer would JSON-
 * serialize into `{"type":"Buffer","data":[...]}` and blow up downstream.
 */
function loadVkHex(): string {
  const vkPath = process.env.CIRCUIT_VK_PATH
    ? resolve(process.env.CIRCUIT_VK_PATH)
    : resolve(process.cwd(), "data", "vk");
  if (!existsSync(vkPath)) {
    throw new Error(
      `verification key not found at ${vkPath}. ` +
      `Generate via 'bb prove --write_vk' or set CIRCUIT_VK_PATH.`,
    );
  }
  return "0x" + readFileSync(vkPath).toString("hex");
}

export async function verifyOnZkVerify(input: SubmitInput): Promise<VerifyResult> {
  const seed = process.env.ZKVERIFY_SEED;
  if (!seed) {
    throw new Error("ZKVERIFY_SEED env var is not set");
  }

  // Dynamic import — keep heavy deps out of build-time page-data collection.
  const {
    zkVerifySession,
    UltrahonkVersion,
    UltrahonkVariant,
    ZkVerifyEvents,
  } = await import("zkverifyjs");

  // zkverifyjs expects 0x-hex strings, not Node Buffers.
  const vkHex = loadVkHex();
  const proofHex = "0x" + Buffer.from(input.proofBase64, "base64").toString("hex");

  // zkverifyjs encodes public signals as `Vec<[u8;32]>` -- the pallet
  // requires every BN254 field element to be padded out to exactly 32 bytes
  // (64 hex chars after the `0x` prefix). The dApp sends a mix of decimal
  // strings (timestamps, wallet address, counts) and short 0x hex (Poseidon
  // hashes that happened to fit in fewer bytes), so we normalize and pad here.
  const toHex32 = (s: string): string => {
    const trimmed = s.trim();
    const stripped = trimmed.startsWith("0x") || trimmed.startsWith("0X")
      ? trimmed.slice(2)
      : BigInt(trimmed).toString(16);
    if (stripped.length > 64) {
      throw new Error(`public signal exceeds 32 bytes: ${trimmed}`);
    }
    return "0x" + stripped.padStart(64, "0").toLowerCase();
  };

  const session = await zkVerifySession.start().Volta().withAccount(seed);
  try {
    // VK size dictates which UltrahonkVersion enum to declare:
    //   V0_84  -> 1825 bytes (bb 0.84.x; what we generate locally)
    //   V3_0   -> 1888 bytes (bb 3.x+, newer ABI)
    //   Legacy -> pre-0.84 format
    // Our bb is 0.84.0, so the VK is 1825 bytes -- must be V0_84.
    const { events, transactionResult } = await session
      .verify()
      .ultrahonk({
        version: UltrahonkVersion.V0_84,
        variant: UltrahonkVariant.Plain,
      })
      .execute({
        proofData: {
          vk: vkHex,
          proof: proofHex,
          publicSignals: [
            input.publicInputs.period_start,
            input.publicInputs.period_end,
            input.publicInputs.user_wallet,
            input.publicInputs.uid_binding_hash,
            input.publicInputs.disclosed_commitment,
            input.publicInputs.claimed_pnl_encoded,
            input.publicInputs.claimed_trade_count,
            input.publicInputs.claimed_volume,
          ].map(toHex32),
        } as never,
      });

    events.on(ZkVerifyEvents.ErrorEvent, (e: unknown) => {
      console.error("[zkverify] error event:", e);
    });
    events.on(ZkVerifyEvents.IncludedInBlock, (e: unknown) => {
      console.log("[zkverify] included in block:", e);
    });
    events.on(ZkVerifyEvents.Finalized, (e: unknown) => {
      console.log("[zkverify] finalized:", e);
    });

    const result = (await transactionResult) as {
      // New (current) zkverifyjs API.
      aggregationId?: unknown;
      statement?: unknown;
      domainId?: unknown;
      blockHash?: unknown;
      txHash?: unknown;
      status?: unknown;
      // Old field name, kept defensively in case some older runtime path still
      // populates it.
      attestationId?: unknown;
    };

    console.log("[zkverify] transactionResult:", JSON.stringify(result));

    // Build an on-chain reference. We prefer aggregationId (the post-rename
    // equivalent of attestationId) but accept any non-empty proof-of-inclusion.
    const id = result.aggregationId ?? result.attestationId ?? result.statement;
    if (id === undefined || id === null || id === "") {
      // The tx might have made it in-block but verification failed silently.
      // Surface as much context as we have so the dApp can show a useful error.
      throw new Error(
        "zkVerify returned no aggregationId/statement -- proof may have failed " +
          "verification on-chain. txHash=" +
          String(result.txHash ?? "<none>") +
          " status=" +
          String(result.status ?? "<unknown>"),
      );
    }

    return {
      attestationId: String(id),
      blockHash: result.blockHash ? String(result.blockHash) : undefined,
      txHash: result.txHash ? String(result.txHash) : undefined,
    };
  } finally {
    await session.close();
  }
}
