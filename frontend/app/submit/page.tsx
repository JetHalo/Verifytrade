"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { hasExtension, waitForExtension, runVerifytradePlugin } from "@/lib/tlsn-provider";
import { generateProofBundle } from "@/lib/prover-browser";
import { fieldToHex } from "@/lib/commitment";
import { submitBundle, listRounds, type RoundDTO } from "@/lib/api-client";
import { formatCount, formatPnl, formatVolume } from "@/lib/utils";
import {
  AlertCircle, CheckCircle2, Loader2, ExternalLink, Shield, Sparkles,
  Hash, BarChart3, TrendingUp, ShieldCheck, Zap,
} from "lucide-react";

const ZKV_EXPLORER = "https://zkverify-testnet.subscan.io";

type Stage =
  | "idle"
  | "extension_check"
  | "notarizing"
  | "proving"
  | "submitting"
  | "done"
  | "error";

const STAGE_LABEL: Record<Stage, string> = {
  idle:            "Ready",
  extension_check: "Checking TLSNotary extension",
  notarizing:      "Notarizing Binance trades (MPC-TLS)",
  proving:         "Generating UltraHonk proof in your browser",
  submitting:      "Submitting to zkVerify Volta…",
  done:            "Verified",
  error:           "Failed",
};

export default function SubmitPage() {
  const [round, setRound] = useState<RoundDTO | null>(null);
  const [identity, setIdentity] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ attestationId: string; txHash?: string } | null>(null);
  const [preview, setPreview] = useState<{ pnl: bigint; trades: number; volume: bigint } | null>(null);
  const [extensionReady, setExtensionReady] = useState(false);

  // Target round is determined ONLY by `?round=N` in the URL. We deliberately
  // do NOT silently fall back to "latest active" because that's the bug that
  // bit us: navigating from a stale link (or the global nav) would land you
  // on /submit and notarize into whatever round happened to be newest,
  // ignoring the round the user was actually looking at.
  const searchParams = useSearchParams();
  const roundIdParam = searchParams.get("round");
  const [availableRounds, setAvailableRounds] = useState<RoundDTO[]>([]);

  useEffect(() => {
    listRounds()
      .then((all) => {
        const sorted = [...all].sort((a, b) => b.id - a.id);
        setAvailableRounds(sorted);
        if (!roundIdParam) {
          setRound(null);
          return;
        }
        const id = Number(roundIdParam);
        if (!Number.isFinite(id)) {
          setRound(null);
          return;
        }
        setRound(sorted.find((r) => r.id === id) ?? null);
      })
      .catch(() => {
        setAvailableRounds([]);
        setRound(null);
      });
  }, [roundIdParam]);

  // Extension probe + listener
  useEffect(() => {
    setExtensionReady(hasExtension());
    const onLoad = () => setExtensionReady(true);
    window.addEventListener("tlsn_loaded", onLoad);
    return () => window.removeEventListener("tlsn_loaded", onLoad);
  }, []);

  async function handleOneClick() {
    if (!round) {
      setError("no active round — open one in /admin first");
      setStage("error");
      return;
    }

    setError(null);
    setResult(null);
    setPreview(null);

    try {
      // ---- Step 1: confirm extension (async wait + 8 s timeout) ----
      // The extension content-script injects `window.tlsn` asynchronously after
      // page load, so a synchronous check can lose the race against a fast
      // click. waitForExtension() resolves immediately if it's already up, or
      // listens for the `tlsn_loaded` event up to 8 s otherwise.
      setStage("extension_check");
      try {
        await waitForExtension();
      } catch {
        throw new Error("TLSNotary extension not detected. Install it from the Chrome Web Store and refresh the page.");
      }

      // ---- Step 2: notarize via the TLSNotary plugin ----
      setStage("notarizing");
      const pluginUrl = `${window.location.origin}/veirfytrade.plugin.js`;
      const attestation = await runVerifytradePlugin(pluginUrl);

      // ---- Step 3: generate the Noir proof in-browser ----
      setStage("proving");
      const circuitResp = await fetch("/verifytrade_circuit.json");
      if (!circuitResp.ok) {
        throw new Error("circuit JSON not found in /public — copy verifytrade_circuit.json there");
      }
      const circuitJson = await circuitResp.json();

      const bundle = await generateProofBundle({
        attestationResult: attestation,
        // The proof uses a 0x address. If user typed an alias, we still need
        // *some* address for the proof; use a deterministic placeholder so the
        // identity field can override at display time.
        walletAddress: identity.startsWith("0x")
          ? (identity as `0x${string}`)
          : "0x0000000000000000000000000000000000000000",
        // UID input is intentionally NOT exposed in the UI. ZK is supposed to
        // hide identifiers like this -- asking the user to type their UID would
        // defeat the privacy premise. Sybil protection still applies at the
        // wallet/alias level (one identity per round, see storage.ts).
        binanceUid: 0n,
        periodStartMs: BigInt(round.periodStart),
        periodEndMs:   BigInt(round.periodEnd),
        circuitJson,
      });

      setPreview({
        pnl:    bundle.claimedPnlUsdtX1e8,
        trades: Number(bundle.claimedTradeCount),
        volume: bundle.claimedVolumeX1e8,
      });

      // ---- Step 4: POST bundle to backend -> zkVerify ----
      setStage("submitting");
      const proofBase64 = btoa(String.fromCharCode(...bundle.proof));
      const submitted = {
        round_id: round.id,
        tlsn_presentation: bundle.attestation,
        ultrahonk_proof: proofBase64,
        public_inputs: {
          period_start:        bundle.publicInputs.periodStart.toString(),
          period_end:          bundle.publicInputs.periodEnd.toString(),
          user_wallet:         bundle.publicInputs.userWallet.toString(),
          uid_binding_hash:    fieldToHex(bundle.publicInputs.uidBindingHash),
          disclosed_commitment: fieldToHex(bundle.publicInputs.disclosedCommitment),
          claimed_pnl_encoded: bundle.publicInputs.claimedPnlEncoded.toString(),
          claimed_trade_count: bundle.publicInputs.claimedTradeCount.toString(),
          claimed_volume:      bundle.publicInputs.claimedVolume.toString(),
        },
        identity: identity.trim() || undefined,
      };
      const verified = await submitBundle(round.id, submitted);

      setResult({ attestationId: verified.attestationId, txHash: verified.txHash });
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  const busy = stage === "extension_check" || stage === "notarizing" || stage === "proving" || stage === "submitting";

  // Has user explicitly picked a round (?round=N)? If not, we refuse to
  // silently pick one. Without this gate users would click /submit from the
  // global nav and silently overwrite whatever round happened to be newest.
  const needRoundPicker = !round;
  const activeRounds = availableRounds.filter((r) => r.active && !r.finalized);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="space-y-2">
        <span className="pill-cyan"><Zap className="w-3 h-3" />one click · all in your browser</span>
        <h1 className="text-3xl font-bold tracking-tight text-white">Submit Your Proof</h1>
        <p className="text-sm text-slate-400">
          Click one button. Your browser notarizes Binance, generates a ZK proof, and the server
          submits it to zkVerify Volta. Total time: <span className="text-white font-medium">~1–2 minutes</span>.
        </p>
      </header>

      {/* Round target indicator -- always visible so the user knows where
          their proof is going. Doubles as a "wrong round?" escape hatch. */}
      {round ? (
        <div className="card flex items-center justify-between gap-3 bg-violet-500/[0.06] ring-violet-400/30">
          <div className="text-sm">
            <div className="text-slate-400 text-xs uppercase tracking-wider">Submitting to</div>
            <div className="text-white font-semibold">
              Round #{round.id}{" "}
              <span className={round.finalized ? "pill-rose" : round.active ? "pill-green" : "pill-violet"}>
                {round.finalized ? "FINAL" : round.active ? "LIVE" : "CLOSED"}
              </span>
            </div>
          </div>
          <Link href="/rounds" className="text-xs text-violet-300 hover:underline">
            wrong round? pick another →
          </Link>
        </div>
      ) : (
        <div className="card space-y-3">
          <div className="text-base font-semibold text-white">Which round?</div>
          <p className="text-sm text-slate-400">
            {roundIdParam
              ? <>No round with id <span className="font-mono">{roundIdParam}</span> exists. Pick one of the live rounds below.</>
              : <>You opened /submit without a round id. Pick a live round to target:</>}
          </p>
          {activeRounds.length === 0 ? (
            <div className="text-sm text-slate-500">
              No live rounds.{" "}
              <Link href="/admin" className="text-violet-300 hover:underline">Open one →</Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeRounds.map((r) => (
                <Link
                  key={r.id}
                  href={`/submit?round=${r.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30 hover:bg-violet-500/25 text-sm font-medium"
                >
                  Round #{r.id}
                </Link>
              ))}
              <Link
                href="/rounds"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
              >
                all rounds →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Inputs + button hidden when no round picked yet -- a hard gate prevents
          accidental submits into the wrong (silently auto-picked) round. */}
      {!needRoundPicker && (
        <>
          <section className="card space-y-4">
            <h2 className="text-base font-semibold text-white">Before you click</h2>

            <label className="block">
              <span className="stat-label">Display name (optional)</span>
              <input
                type="text"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="jet"
                className="input"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Shows on the leaderboard. Leave empty to use the wallet from your proof.
              </span>
            </label>
          </section>

          {/* The ONE button */}
          <section className="card relative overflow-hidden">
            {busy && (
              <div className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-cyan-500/10 animate-pulse" />
            )}
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Generate &amp; Submit</h2>
                <ExtensionPill ready={extensionReady} />
              </div>

              <button
                onClick={handleOneClick}
                disabled={busy || !round}
                className="btn-primary w-full text-base py-3"
              >
                {busy
                  ? <><Loader2 className="w-5 h-5 animate-spin" /><span>{STAGE_LABEL[stage]}…</span></>
                  : stage === "done"
                    ? <><CheckCircle2 className="w-5 h-5" /><span>Verified — submit another</span></>
                    : <><Shield className="w-5 h-5" /><span>Generate Proof &amp; Submit to zkVerify</span></>
                }
              </button>

              {/* progress timeline */}
              <Timeline stage={stage} />
            </div>
          </section>
        </>
      )}

      {preview && (
        <section className="card">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Your three numbers</div>
          <div className="grid grid-cols-3 gap-2">
            <PreviewTile icon={<Hash className="w-3.5 h-3.5" />}      label="Trades" value={formatCount(preview.trades)} tone="default" />
            <PreviewTile icon={<BarChart3 className="w-3.5 h-3.5" />} label="Volume" value={formatVolume(preview.volume)} tone="cyan" />
            <PreviewTile icon={<TrendingUp className="w-3.5 h-3.5" />} label="PnL"  value={formatPnl(preview.pnl)} tone={preview.pnl >= 0n ? "green" : "rose"} />
          </div>
        </section>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-emerald-200 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            zkVerify verified — your row is on the leaderboard
          </div>
          <div className="text-xs font-mono text-emerald-300 break-all">
            attestationId: {result.attestationId}
          </div>
          {result.txHash && (
            <a
              href={`${ZKV_EXPLORER}/extrinsic/${result.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-200 underline"
            >
              view on zkVerify explorer <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <a
            href={`/leaderboard/${round?.id ?? 0}`}
            className="block text-xs text-emerald-300 underline mt-1"
          >
            open the leaderboard →
          </a>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm">
          <AlertCircle className="w-4 h-4 text-rose-300 mt-0.5" />
          <span className="text-rose-200 break-all">{error}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function ExtensionPill({ ready }: { ready: boolean }) {
  if (ready) {
    return (
      <span className="pill-green">
        <ShieldCheck className="w-3 h-3" />TLSNotary ready
      </span>
    );
  }
  return (
    <a
      href="https://chromewebstore.google.com/detail/tlsnotary/gnoglgpcamodhflknhmafmjdahcejcgg"
      target="_blank"
      rel="noreferrer"
      className="pill-amber"
    >
      <AlertCircle className="w-3 h-3" />Install TLSNotary
    </a>
  );
}

function Timeline({ stage }: { stage: Stage }) {
  const steps: { id: Stage; label: string; icon: React.ReactNode }[] = [
    { id: "notarizing", label: "TLSNotary MPC", icon: <Shield className="w-3.5 h-3.5" /> },
    { id: "proving",    label: "Noir UltraHonk", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "submitting", label: "zkVerify Volta", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: "done",       label: "On the board",   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  ];

  const idx = (s: Stage) => {
    switch (s) {
      case "extension_check":
      case "idle":
      case "error":      return -1;
      case "notarizing": return 0;
      case "proving":    return 1;
      case "submitting": return 2;
      case "done":       return 3;
    }
  };
  const current = idx(stage);

  return (
    <div className="grid grid-cols-4 gap-1 pt-2">
      {steps.map((s, i) => {
        const passed = current > i || stage === "done";
        const active = current === i && stage !== "done";
        return (
          <div key={s.id} className="flex flex-col items-center gap-1.5 text-center">
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs ring-1 transition ${
                passed
                  ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                  : active
                    ? "bg-violet-500/20 text-violet-200 ring-violet-400/40 animate-pulse"
                    : "bg-white/[0.04] text-slate-500 ring-white/10"
              }`}
            >
              {s.icon}
            </span>
            <span className={`text-[10px] uppercase tracking-wider ${
              passed ? "text-emerald-300" : active ? "text-violet-200" : "text-slate-500"
            }`}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PreviewTile({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "default" | "cyan" | "green" | "rose";
}) {
  const color =
    tone === "cyan"  ? "text-cyan-200"     :
    tone === "green" ? "text-emerald-300"  :
    tone === "rose"  ? "text-rose-300"     : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}<span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`mt-1 font-mono text-sm font-semibold truncate ${color}`}>{value}</div>
    </div>
  );
}
