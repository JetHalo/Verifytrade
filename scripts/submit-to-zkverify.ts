/**
 * Submit a proof bundle to zkVerify for verification.
 *
 * Usage:
 *   pnpm submit -- --bundle ./output/proof-bundle.json
 *
 * Requires:
 *   ZKVERIFY_SEED         (your zkVerify Volta testnet seed phrase)
 *   CIRCUIT_VK_PATH       (path to circuit verification key, e.g. ../circuit/target/vk)
 */

import { readFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  zkVerifySession,
  UltrahonkVersion,
  UltrahonkVariant,
  ZkVerifyEvents,
} from "zkverifyjs";
import "dotenv/config";

interface ProofBundle {
  round_id: number;
  tlsn_presentation: string;
  ultrahonk_proof: string;
  public_inputs: {
    threshold_encoded: string;
    period_start: string;
    period_end: string;
    user_wallet: string;
    uid_binding_hash: string;
    disclosed_commitment: string;
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      bundle: { type: "string", short: "b" },
      vk: { type: "string" },
    },
  });

  if (!values.bundle) {
    console.error("Usage: pnpm submit -- --bundle <path> [--vk <vk-path>]");
    process.exit(1);
  }

  const seed = process.env.ZKVERIFY_SEED;
  if (!seed) {
    console.error("Set ZKVERIFY_SEED in .env (your Volta testnet seed phrase)");
    process.exit(1);
  }

  const vkPath = values.vk ?? process.env.CIRCUIT_VK_PATH ?? "../circuit/target/vk";
  if (!existsSync(vkPath)) {
    console.error(`Verification key not found at ${vkPath}.`);
    console.error('Generate with: cd ../circuit && bb write_vk_ultra_honk -b ./target/verifytrade_circuit.json -o ./target/vk');
    process.exit(1);
  }

  const bundle: ProofBundle = JSON.parse(readFileSync(values.bundle, "utf-8"));
  console.log(`Loaded bundle for round ${bundle.round_id}`);

  const proofBytes = Buffer.from(bundle.ultrahonk_proof, "base64");
  const vkBytes = readFileSync(vkPath);

  console.log(`  proof:   ${proofBytes.length} bytes`);
  console.log(`  vk:      ${vkBytes.length} bytes`);
  console.log(`  starting zkVerify Volta session…`);

  const session = await zkVerifySession.start().Volta().withAccount(seed);

  try {
    console.log(`  submitting UltraHonk proof to zkVerify…`);
    const { events, transactionResult } = await session
      .verify()
      .ultrahonk({
        version: UltrahonkVersion.V3_0,
        variant: UltrahonkVariant.Plain,
      })
      .execute({
        proofData: {
          vk: vkBytes,
          proof: proofBytes,
          publicSignals: [
            bundle.public_inputs.threshold_encoded,
            bundle.public_inputs.period_start,
            bundle.public_inputs.period_end,
            bundle.public_inputs.user_wallet,
            bundle.public_inputs.uid_binding_hash,
            bundle.public_inputs.disclosed_commitment,
          ],
        } as never,
      });

    events.on(ZkVerifyEvents.IncludedInBlock, (e: unknown) => {
      console.log("  ✓ included in block", e);
    });
    events.on(ZkVerifyEvents.Finalized, (e: unknown) => {
      console.log("  ✓ finalized", e);
    });
    events.on(ZkVerifyEvents.ErrorEvent, (e: unknown) => {
      console.error("  ✗ error event", e);
    });

    const result = await transactionResult;
    console.log("");
    console.log("==========================================");
    console.log("  VERIFICATION SUCCESSFUL");
    console.log("==========================================");
    console.log("  attestationId:", (result as { attestationId?: unknown }).attestationId);
    console.log("  blockHash:    ", (result as { blockHash?: unknown }).blockHash);
    console.log("  txHash:       ", (result as { txHash?: unknown }).txHash);
    console.log("");
    console.log("Paste this attestationId into the VerifyTrade web app submission form,");
    console.log("or use it directly: contract.submitProof(roundId, attestationId, …public inputs)");
  } finally {
    await session.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
