"use client";

import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { COMPETITION_ADDRESS, competitionAbi } from "@/lib/contracts";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";

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

export default function SubmitPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, data: txHash } = useWriteContract();

  const [bundle, setBundle] = useState<ProofBundle | null>(null);
  const [attestationId, setAttestationId] = useState("");
  const [pnlInput, setPnlInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ProofBundle;
      // Basic sanity checks
      if (!parsed.public_inputs || !parsed.tlsn_presentation) {
        throw new Error("Bundle missing expected fields");
      }
      if (address && parsed.public_inputs.user_wallet.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          `Bundle was generated for wallet ${parsed.public_inputs.user_wallet}, but you're connected as ${address}`
        );
      }
      setBundle(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid bundle file");
    }
  };

  const handleSubmit = () => {
    if (!bundle || !attestationId) return;
    const pi = bundle.public_inputs;
    writeContract({
      address: COMPETITION_ADDRESS,
      abi: competitionAbi,
      functionName: "submitProof",
      args: [
        BigInt(bundle.round_id),
        attestationId as `0x${string}`,
        BigInt(pi.threshold_encoded),
        BigInt(pi.period_start),
        BigInt(pi.period_end),
        pi.user_wallet as `0x${string}`,
        pi.uid_binding_hash as `0x${string}`,
        pi.disclosed_commitment as `0x${string}`,
        BigInt(Math.round(parseFloat(pnlInput) * 1e8)),
      ],
    });
  };

  if (!isConnected) {
    return (
      <div className="card text-center">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="font-bold text-lg mb-2">Connect your wallet</h2>
        <p className="text-slate-600 text-sm">Use the Connect button in the header to get started.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Submit Proof</h1>

      <ol className="space-y-4">
        <Step n={1} title="Generate proof locally">
          <p className="text-sm text-slate-600">
            Run the Prover CLI on your machine. See{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">prover/README.md</code> for instructions.
            It produces a <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">proof-bundle.json</code> file.
          </p>
        </Step>

        <Step n={2} title="Upload proof bundle">
          <input
            type="file"
            accept="application/json"
            onChange={handleFileUpload}
            className="block text-sm text-slate-600 file:mr-4 file:py-2 file:px-3
                       file:rounded-lg file:border-0 file:text-sm file:font-medium
                       file:bg-zkv-100 file:text-zkv-800 hover:file:bg-zkv-200"
          />
          {bundle && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <div className="font-medium text-green-900">Bundle loaded</div>
                <div className="text-green-700 font-mono text-xs">
                  Round {bundle.round_id} · commitment{" "}
                  {bundle.public_inputs.disclosed_commitment.slice(0, 10)}…
                </div>
              </div>
            </div>
          )}
        </Step>

        <Step n={3} title="Get zkVerify attestation ID">
          <p className="text-sm text-slate-600">
            Run{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">
              pnpm submit -- --bundle ./proof-bundle.json
            </code>{" "}
            in the <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">scripts/</code> directory.
            Paste the returned attestation ID here:
          </p>
          <input
            type="text"
            value={attestationId}
            onChange={(e) => setAttestationId(e.target.value)}
            placeholder="0x..."
            className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg
                       text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zkv-500"
          />
        </Step>

        <Step n={4} title="Claim your PnL">
          <p className="text-sm text-slate-600 mb-2">
            Enter the PnL value you're claiming (must match the proof):
          </p>
          <input
            type="number"
            step="0.01"
            value={pnlInput}
            onChange={(e) => setPnlInput(e.target.value)}
            placeholder="1234.56"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg
                       text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zkv-500"
          />
          <span className="text-xs text-slate-500">USDT</span>
        </Step>
      </ol>

      {error && (
        <div className="p-3 bg-red-50 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!bundle || !attestationId || !pnlInput || isPending}
        className="btn-primary w-full"
      >
        {isPending ? "Submitting…" : "Submit Proof On-chain"}
      </button>

      {txHash && (
        <div className="p-3 bg-green-50 rounded-lg text-sm">
          <div className="font-medium text-green-900">Transaction submitted!</div>
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-green-700 font-mono underline"
          >
            {txHash}
          </a>
        </div>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="card">
      <div className="flex items-start gap-3 mb-2">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zkv-700 text-white text-xs font-bold flex items-center justify-center">
          {n}
        </span>
        <h3 className="font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="ml-9">{children}</div>
    </li>
  );
}
