// TLSNotary plugin runtime API (provided by the extension's QuickJS sandbox).
// These functions don't need to be imported — they're injected as globals.

declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

declare global {
  // State hooks
  function useState<T>(key: string, initial: T): T;
  function setState<T>(key: string, value: T): void;

  // Side-effect hook
  function useEffect(cb: () => void | (() => void), deps: unknown[]): void;

  // Network header intercept (requires `urls` permission in PluginConfig)
  function useHeaders<T>(
    selector: (headers: Array<{ url: string; requestHeaders: Array<{ name: string; value?: string }> }>) => T
  ): T;

  // DOM building blocks
  function div(opts: object, children?: Array<object | string>): object;
  function button(opts: object, children?: Array<object | string>): object;
  function input(opts: object): object;

  // Open a managed window (for OAuth / login flows)
  function openWindow(url: string): void;

  // Run the proof. Returns the attestation as JSON.
  function prove(
    request: { url: string; method: string; headers: Record<string, string> },
    options: {
      verifierUrl: string;
      proxyUrl?: string;
      maxRecvData: number;
      maxSentData: number;
      handlers: Array<{
        type: 'SENT' | 'RECV';
        part: 'START_LINE' | 'HEADERS' | 'BODY' | 'ALL';
        action: 'REVEAL' | { kind: 'REVEAL' };
        params?: Record<string, unknown>;
      }>;
    }
  ): Promise<unknown>;

  // Signal completion + return result
  function done(result: string): void;
  function doneWithOverlay(result: string): void;
}

export {};
