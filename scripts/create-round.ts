/**
 * Create a new competition Round on the Competition contract.
 *
 * Usage:
 *   pnpm create-round -- --period-start 1717200000000 --period-end 1717804800000 \
 *                       --threshold 500 --reward 1.0
 */

import { parseArgs } from "node:util";
import { createWalletClient, http, parseEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

const competitionAbi = parseAbi([
  "function createRound(uint64 periodStart, uint64 periodEnd, int64 thresholdUsdtX1e8, uint256 rewardPool) external payable returns (uint256)",
]);

async function main() {
  const { values } = parseArgs({
    options: {
      "period-start": { type: "string" },
      "period-end": { type: "string" },
      threshold: { type: "string" },
      reward: { type: "string" },
    },
  });

  const required = ["period-start", "period-end", "threshold", "reward"] as const;
  for (const r of required) {
    if (!values[r]) {
      console.error(`Missing --${r}`);
      process.exit(1);
    }
  }

  const contractAddr = process.env.COMPETITION_ADDRESS as `0x${string}`;
  const pk = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  if (!contractAddr || !pk) {
    console.error("Set COMPETITION_ADDRESS and DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const account = privateKeyToAccount(pk);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL),
  });

  const periodStart = BigInt(values["period-start"]!);
  const periodEnd = BigInt(values["period-end"]!);
  const thresholdUsdt = BigInt(values.threshold!);
  const thresholdX1e8 = thresholdUsdt * 10n ** 8n;
  const rewardPool = parseEther(values.reward!);

  console.log("Creating Round:");
  console.log(`  periodStart:  ${periodStart} (${new Date(Number(periodStart)).toISOString()})`);
  console.log(`  periodEnd:    ${periodEnd} (${new Date(Number(periodEnd)).toISOString()})`);
  console.log(`  threshold:    ${thresholdUsdt} USDT (× 1e8 = ${thresholdX1e8})`);
  console.log(`  rewardPool:   ${values.reward} ETH`);

  const hash = await client.writeContract({
    address: contractAddr,
    abi: competitionAbi,
    functionName: "createRound",
    args: [periodStart, periodEnd, thresholdX1e8, rewardPool],
    value: rewardPool,
  });

  console.log(`tx: ${hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
