/**
 * Read the on-chain leaderboard for a given Round.
 *
 * Usage:
 *   pnpm leaderboard -- --round 0
 */

import { parseArgs } from "node:util";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

const abi = parseAbi([
  "function getLeaderboard(uint256 roundId, uint256 topN) external view returns (address[] wallets, int64[] pnls)",
  "function getRound(uint256 roundId) external view returns (tuple(uint64 periodStart, uint64 periodEnd, int64 thresholdUsdtX1e8, uint256 rewardPool, bool active, bool finalized))",
  "function getSubmissionCount(uint256 roundId) external view returns (uint256)",
]);

async function main() {
  const { values } = parseArgs({
    options: {
      round: { type: "string", default: "0" },
      top: { type: "string", default: "10" },
    },
  });

  const roundId = BigInt(values.round!);
  const topN = BigInt(values.top!);

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL),
  });
  const addr = process.env.COMPETITION_ADDRESS as `0x${string}`;

  const round = await client.readContract({
    address: addr,
    abi,
    functionName: "getRound",
    args: [roundId],
  });
  console.log(`Round ${roundId}:`, round);

  const count = await client.readContract({
    address: addr,
    abi,
    functionName: "getSubmissionCount",
    args: [roundId],
  });
  console.log(`Submissions: ${count}`);

  const [wallets, pnls] = await client.readContract({
    address: addr,
    abi,
    functionName: "getLeaderboard",
    args: [roundId, topN],
  });

  console.log("\nLeaderboard:");
  console.log("Rank  Wallet                                       PnL (USDT)");
  console.log("---   -----------------------------------------    ----------");
  wallets.forEach((w, i) => {
    const pnl = Number(pnls[i]) / 1e8;
    console.log(`${(i + 1).toString().padStart(3)}   ${w}    ${pnl.toFixed(2)}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
