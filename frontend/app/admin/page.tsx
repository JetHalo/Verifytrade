"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { COMPETITION_ADDRESS, competitionAbi } from "@/lib/contracts";
import { AlertCircle, ShieldAlert, CheckCircle2 } from "lucide-react";

/**
 * Admin page for the round operator. Only visible / actionable to the owner
 * of the Competition contract.
 */
export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, data: txHash, error } = useWriteContract();

  const { data: ownerAddress } = useReadContract({
    address: COMPETITION_ADDRESS,
    abi: competitionAbi,
    functionName: "owner",
  });

  const { data: nextRoundId } = useReadContract({
    address: COMPETITION_ADDRESS,
    abi: competitionAbi,
    functionName: "nextRoundId",
  });

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [thresholdUsdt, setThresholdUsdt] = useState("");
  const [rewardEth, setRewardEth] = useState("");
  const [finalizeRoundId, setFinalizeRoundId] = useState("");

  const isOwner =
    isConnected &&
    address &&
    ownerAddress &&
    (address as string).toLowerCase() === (ownerAddress as string).toLowerCase();

  const handleCreateRound = () => {
    if (!periodStart || !periodEnd || !thresholdUsdt || !rewardEth) return;
    const start = BigInt(periodStart);
    const end = BigInt(periodEnd);
    const thresholdX1e8 = BigInt(thresholdUsdt) * 10n ** 8n;
    const reward = parseEther(rewardEth);

    writeContract({
      address: COMPETITION_ADDRESS,
      abi: competitionAbi,
      functionName: "createRound",
      args: [start, end, thresholdX1e8, reward],
      value: reward,
    });
  };

  const handleFinalize = () => {
    if (!finalizeRoundId) return;
    writeContract({
      address: COMPETITION_ADDRESS,
      abi: competitionAbi,
      functionName: "finalizeRound",
      args: [BigInt(finalizeRoundId)],
    });
  };

  // Helper buttons to set period from human input
  const setPeriodFromDates = () => {
    const now = Date.now();
    setPeriodStart(now.toString());
    setPeriodEnd((now + 7 * 24 * 60 * 60 * 1000).toString());
  };

  if (!isConnected) {
    return (
      <div className="card text-center">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="font-bold text-lg mb-2">Connect Wallet</h2>
        <p className="text-slate-600 text-sm">Use the Connect button to access admin.</p>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="card text-center">
        <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h2 className="font-bold text-lg mb-2">Not Authorized</h2>
        <p className="text-slate-600 text-sm">
          Only the contract owner ({ownerAddress ? (ownerAddress as string).slice(0, 10) + "…" : "?"}) can access admin.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Admin Console</h1>
        <p className="text-sm text-slate-500 mt-1">
          Next roundId: <span className="font-mono">{nextRoundId?.toString() ?? "—"}</span>
        </p>
      </div>

      <section className="card space-y-4">
        <h2 className="font-bold text-lg">Create New Round</h2>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Period Start (Unix ms)" value={periodStart} onChange={setPeriodStart} placeholder="1717200000000" />
          <Input label="Period End (Unix ms)" value={periodEnd} onChange={setPeriodEnd} placeholder="1717804800000" />
          <Input label="Threshold (USDT)" value={thresholdUsdt} onChange={setThresholdUsdt} placeholder="500" />
          <Input label="Reward Pool (ETH)" value={rewardEth} onChange={setRewardEth} placeholder="0.1" />
        </div>
        <button onClick={setPeriodFromDates} className="text-xs text-zkv-700 hover:underline">
          ↳ Quick set: now → 7 days from now
        </button>
        <button
          onClick={handleCreateRound}
          disabled={isPending || !periodStart || !periodEnd || !thresholdUsdt || !rewardEth}
          className="btn-primary w-full"
        >
          {isPending ? "Creating…" : "Create Round"}
        </button>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold text-lg">Finalize Round</h2>
        <p className="text-sm text-slate-600">
          Finalizing closes submissions and lets top-10 participants claim rewards.
        </p>
        <Input label="Round ID" value={finalizeRoundId} onChange={setFinalizeRoundId} placeholder="0" />
        <button
          onClick={handleFinalize}
          disabled={isPending || !finalizeRoundId}
          className="btn-secondary w-full"
        >
          {isPending ? "Finalizing…" : "Finalize Round"}
        </button>
      </section>

      {txHash && (
        <div className="p-3 bg-green-50 rounded-lg flex items-start gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
          <div>
            <div className="font-medium text-green-900">Transaction submitted</div>
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-green-700 font-mono underline"
            >
              {txHash}
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
          <span className="text-red-700">{error.message}</span>
        </div>
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono
                   focus:outline-none focus:ring-2 focus:ring-zkv-500"
      />
    </label>
  );
}
