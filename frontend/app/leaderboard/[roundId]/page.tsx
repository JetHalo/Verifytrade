"use client";

import { useReadContract } from "wagmi";
import { COMPETITION_ADDRESS, competitionAbi, type Round } from "@/lib/contracts";
import { formatAddress, formatPnl, formatTimestamp } from "@/lib/utils";
import { Trophy } from "lucide-react";

export default function LeaderboardPage({
  params,
}: {
  params: { roundId: string };
}) {
  const roundId = BigInt(params.roundId);

  const { data: round } = useReadContract({
    address: COMPETITION_ADDRESS,
    abi: competitionAbi,
    functionName: "getRound",
    args: [roundId],
  });

  const { data: leaderboard, isLoading } = useReadContract({
    address: COMPETITION_ADDRESS,
    abi: competitionAbi,
    functionName: "getLeaderboard",
    args: [roundId, 50n],
  });

  const wallets = (leaderboard as [`0x${string}`[], bigint[]] | undefined)?.[0] ?? [];
  const pnls = (leaderboard as [`0x${string}`[], bigint[]] | undefined)?.[1] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="w-7 h-7 text-zkv-700" />
        <h1 className="text-3xl font-bold text-slate-900">Round {params.roundId} Leaderboard</h1>
      </div>

      {round && (round as Round).periodStart > 0n && (
        <div className="card">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="Period" value={`${formatTimestamp((round as Round).periodStart)} → ${formatTimestamp((round as Round).periodEnd)}`} />
            <Field label="Threshold" value={formatPnl((round as Round).thresholdUsdtX1e8)} />
            <Field label="Reward Pool" value={`${Number((round as Round).rewardPool) / 1e18} ETH`} />
            <Field label="Status" value={(round as Round).finalized ? "Finalized" : (round as Round).active ? "Live" : "Closed"} />
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Rank</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Wallet</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">PnL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">Loading…</td>
              </tr>
            ) : wallets.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">No submissions yet</td>
              </tr>
            ) : (
              wallets.map((w, i) => (
                <tr key={w} className={i < 10 ? "bg-zkv-50/30" : ""}>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      i === 0 ? "bg-amber-100 text-amber-800" :
                      i === 1 ? "bg-slate-200 text-slate-700" :
                      i === 2 ? "bg-orange-100 text-orange-800" :
                      "bg-slate-100 text-slate-500"
                    }`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{formatAddress(w)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-slate-900">
                    {formatPnl(pnls[i])}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 text-center">
        Top 10 share the reward pool when the round is finalized.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className="text-sm font-mono text-slate-900 mt-1">{value}</div>
    </div>
  );
}
