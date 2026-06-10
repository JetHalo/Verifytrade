/**
 * Bridge between our dApp and the TLSNotary browser extension.
 *
 * The extension injects a global `window.tlsn` with a single method:
 *
 *   window.tlsn.execCode(code, options) => Promise<string>
 *
 * Where `code` is the bundled plugin JavaScript (a string). The extension
 * runs it in a QuickJS sandbox, drives the MPC-TLS notarization, and returns
 * the result JSON-encoded.
 *
 * Reference: tlsnotary/tlsn-extension packages/extension/src/entries/Content/content.ts
 */

export interface TlsnGlobal {
  version?: string;
  execCode(
    code: string,
    options?: { requestId?: string; sessionData?: Record<string, string> }
  ): Promise<string>;
}

declare global {
  interface Window {
    tlsn?: TlsnGlobal;
  }
}

/** Synchronous detection (relies on the extension having loaded already). */
export function hasExtension(): boolean {
  return typeof window !== "undefined" && typeof window.tlsn?.execCode === "function";
}

/** Wait for the extension's `tlsn_loaded` event, with timeout. */
export async function waitForExtension(timeoutMs = 8000): Promise<TlsnGlobal> {
  if (typeof window === "undefined") {
    throw new Error("TLSNotary provider only available in the browser");
  }
  if (hasExtension()) return window.tlsn!;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("tlsn_loaded", onLoad);
      reject(
        new Error(
          "TLSNotary extension not detected. Install it: https://chromewebstore.google.com/detail/tlsnotary/gnoglgpcamodhflknhmafmjdahcejcgg"
        )
      );
    }, timeoutMs);

    function onLoad() {
      clearTimeout(timer);
      window.removeEventListener("tlsn_loaded", onLoad);
      if (hasExtension()) resolve(window.tlsn!);
      else reject(new Error("tlsn_loaded fired but window.tlsn.execCode missing"));
    }
    window.addEventListener("tlsn_loaded", onLoad);
  });
}

export interface TlsnResult {
  /** The raw JSON result returned by the plugin (what the plugin's `done()`/`doneWithOverlay()` passed). */
  raw: string;
  /** Convenience: pre-parsed JSON if the raw was valid JSON. */
  parsed?: unknown;
}

/**
 * Fetch our compiled plugin bundle and run it via the TLSNotary extension.
 *
 * `mode` is forwarded to the extension via `sessionData.mode` and selects the
 * underlying tlsn protocol variant:
 *
 *  - "Proxy" (default): the verifier server connects to the target host on
 *    behalf of the prover. Lightweight back-and-forth, works through
 *    cloud-edge HTTP/2 proxies (Railway, Fly, Cloudflare). Recommended for
 *    self-hosted verifiers.
 *  - "Mpc": full multi-party-computation TLS handshake between prover and
 *    verifier. Stronger trust model -- the verifier can't see plaintext --
 *    but the high-frequency small-frame exchanges deadlock when run through
 *    edge proxies that buffer or batch frames.
 *
 * See upstream demo for reference: packages/demo/src/App.tsx forwards the
 * same value as `sessionData: { mode }`.
 */
export async function runVerifytradePlugin(
  pluginUrl: string,
  mode: "Mpc" | "Proxy" = "Proxy",
): Promise<TlsnResult> {
  const tlsn = await waitForExtension();

  // Listen for progress events from the extension (optional)
  const requestId = `veirfytrade-${Date.now()}`;
  const progressHandler = (event: MessageEvent) => {
    if (event.data?.type === "TLSN_PROVE_PROGRESS" && event.data?.requestId === requestId) {
      // eslint-disable-next-line no-console
      console.log("[VerifyTrade] prove progress:", event.data.step, event.data.progress, event.data.message);
    }
  };
  window.addEventListener("message", progressHandler);

  try {
    const resp = await fetch(pluginUrl);
    if (!resp.ok) {
      throw new Error(`failed to fetch plugin bundle (${resp.status}): ${pluginUrl}`);
    }
    const pluginCode = await resp.text();

    const raw = await tlsn.execCode(pluginCode, {
      requestId,
      sessionData: {
        mode,
        // Skip the per-reveal approval popup. For the workshop demo the user
        // already consented when they clicked "Generate Proof" once, no need
        // to re-prompt for each disclosed JSON path.
        _approvalMode: "all-session",
      },
    });

    let parsed: unknown = undefined;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // raw is not JSON; the plugin returned an opaque string
    }
    return { raw, parsed };
  } finally {
    window.removeEventListener("message", progressHandler);
  }
}
