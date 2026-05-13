import { parseAbi } from "viem";

export const COMPETITION_ADDRESS = (process.env.NEXT_PUBLIC_COMPETITION_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const competitionAbi = parseAbi([
  // read
  "function owner() view returns (address)",
  "function nextRoundId() view returns (uint256)",
  "function getRound(uint256 roundId) view returns (tuple(uint64 periodStart, uint64 periodEnd, int64 thresholdUsdtX1e8, uint256 rewardPool, bool active, bool finalized))",
  "function getSubmissionCount(uint256 roundId) view returns (uint256)",
  "function getLeaderboard(uint256 roundId, uint256 topN) view returns (address[] wallets, int64[] pnls)",
  "function submissions(uint256 roundId, address wallet) view returns (tuple(address wallet, int64 pnlUsdtX1e8, bytes32 binanceUidHash, uint64 submittedAt))",
  // write
  "function createRound(uint64 periodStart, uint64 periodEnd, int64 thresholdUsdtX1e8, uint256 rewardPool) payable returns (uint256)",
  "function finalizeRound(uint256 roundId)",
  "function submitProof(uint256 roundId, bytes32 attestationId, uint256 thresholdEncoded, uint64 periodStart, uint64 periodEnd, address userWallet, bytes32 uidBindingHash, bytes32 disclosedCommitment, int64 pnlUsdtX1e8)",
  "function claimReward(uint256 roundId)",
  // events
  "event RoundCreated(uint256 indexed roundId, uint64 periodStart, uint64 periodEnd, int64 thresholdUsdtX1e8, uint256 rewardPool)",
  "event ProofSubmitted(uint256 indexed roundId, address indexed wallet, int64 pnlUsdtX1e8, bytes32 binanceUidHash)",
  "event RoundFinalized(uint256 indexed roundId)",
  "event RewardClaimed(uint256 indexed roundId, address indexed wallet, uint256 amount)",
]);

export interface Round {
  periodStart: bigint;
  periodEnd: bigint;
  thresholdUsdtX1e8: bigint;
  rewardPool: bigint;
  active: boolean;
  finalized: boolean;
}
