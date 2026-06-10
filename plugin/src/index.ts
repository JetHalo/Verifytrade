/**
 * VerifyTrade TLSNotary plugin
 *
 * Notarizes the user's realized PnL on Binance Futures by:
 *   1. Detecting an existing logged-in session via intercepted bapi requests
 *      (the Binance web UI fires /bapi/futures/v1/private/future/user-data/trade-history
 *      whenever the user opens their Futures Trade History page)
 *   2. Re-issuing that exact POST through the TLSNotary verifier-server
 *   3. Revealing only the response body's realizedProfit / insertTime /
 *      symbol / totalQuota JSON paths so the rest of the transcript stays
 *      redacted
 *
 * Built to @tlsn/plugin-sdk (QuickJS sandbox).
 *
 * Why this endpoint and not /fapi/v1/userTrades?
 *   /fapi/v1/userTrades requires HMAC-SHA256 signing with an API key + secret
 *   which we cannot ask the user to set up. The /bapi/futures/v1/private path
 *   is what the web UI itself uses with the same session cookie the user is
 *   already logged in with, so the experience is "click one button, no setup".
 */

import './types.d';

const UI_HOST = 'www.binance.com';
const API_HOST = 'www.binance.com'; // same origin as the web UI
const UI_PATH = '/en/my/orders/futures/tradehistory';
const TRADES_PATH = '/bapi/futures/v1/private/future/user-data/trade-history';

// Headers we need to carry over from the user's intercepted bapi request.
// These are the values Binance's web frontend computes per-session/per-device
// (csrftoken, fvideo-token, device fingerprint, etc.) -- the plugin cannot
// fabricate them; it has to copy them from a real authenticated request the
// user's own browser already made.
const HEADERS_TO_COPY = [
  'cookie',
  'csrftoken',
  'bnc-uuid',
  'bnc-level',
  'bnc-location',
  'bnc-time-zone',
  'fvideo-id',
  'fvideo-token',
  'device-info',
  'clienttype',
  'lang',
  'x-trace-id',
  'x-ui-request-trace',
  'user-agent',
];

const config = {
  name: 'VerifyTrade: Binance Futures PnL',
  description: "Notarize your Binance Futures realized PnL for the VerifyTrade leaderboard",
  requests: [
    {
      method: 'POST',
      host: API_HOST,
      pathname: TRADES_PATH,
      verifierUrl: __VERIFIER_URL__,
    },
  ],
  urls: [`https://${UI_HOST}/*`],
};

const onClick = async (): Promise<void> => {
  const isRequestPending = useState<boolean>('isRequestPending', false);
  if (isRequestPending) return;
  setState('isRequestPending', true);

  // Look at every request the extension intercepted in the active window(s).
  const allHeaders = useHeaders((headers) => headers);
  const allCount = allHeaders ? allHeaders.length : 0;

  // The Binance UI fires the trade-history POST when the user opens
  // /en/my/orders/futures/tradehistory. We want THAT specific request because
  // it's the only one that carries the right shape of headers (csrftoken etc.)
  // that the bapi endpoint accepts.
  const bapiHits = allHeaders ? allHeaders.filter((h) =>
    h.url.indexOf('/bapi/futures/v1/private/future/user-data/trade-history') !== -1
  ) : [];

  const sampleHosts = allHeaders
    ? Array.from(new Set(allHeaders.map((h) => {
        try { return new URL(h.url).host; } catch { return h.url.slice(0, 40); }
      }))).slice(0, 6).join(', ')
    : '';

  if (bapiHits.length === 0) {
    setState('isRequestPending', false);
    if (allCount === 0) {
      setState(
        'error',
        'Extension intercepted 0 requests total. Likely cause: TLSNotary extension lacks site access. ' +
        'Go to chrome://extensions -> TLSNotary -> Details -> Site access -> "On all sites", then RELOAD the extension and re-open this page.',
      );
    } else {
      setState(
        'error',
        `Saw ${allCount} requests but none to the bapi trade-history endpoint. Hosts seen: [${sampleHosts}]. ` +
        'Open https://www.binance.com/en/my/orders/futures/tradehistory in the opened tab (Trade History page), ' +
        'make sure you are logged in, switch the symbol filter to ZENUSDT once to trigger a fetch, then click Notarize again.',
      );
    }
    return;
  }

  // Take the most recent bapi hit and copy whatever subset of HEADERS_TO_COPY
  // it carries. csrftoken + cookie are the must-have pair; the rest are
  // anti-bot fingerprinting that Binance won't always require but, when
  // present in the original request, must be echoed back consistently.
  const source = bapiHits[bapiHits.length - 1];
  const sourceHeaders: Record<string, string> = {};
  for (const h of source.requestHeaders) {
    const k = h.name.toLowerCase();
    if (HEADERS_TO_COPY.indexOf(k) !== -1) sourceHeaders[k] = h.value;
  }
  if (!sourceHeaders['cookie'] || !sourceHeaders['csrftoken']) {
    setState('isRequestPending', false);
    setState(
      'error',
      'Intercepted bapi request was missing cookie or csrftoken. ' +
      'You are probably not logged in or the session expired. Log in at binance.com and retry.',
    );
    return;
  }

  // Build the outgoing request: same URL, same method, same headers, same
  // body shape. We hardcode a wide time window (last 90 days) to capture all
  // recent activity; the Noir circuit clips down to the round window later.
  const headers: Record<string, string> = {
    ...sourceHeaders,
    Host: API_HOST,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'identity',
    Connection: 'close',
    Origin: `https://${UI_HOST}`,
    Referer: `https://${UI_HOST}${UI_PATH}`,
  };

  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const body = JSON.stringify({
    startTime: now - ninetyDays,
    endTime: now,
    page: 1,
    rows: 50,
  });

  const resp = await prove(
    {
      url: `https://${API_HOST}${TRADES_PATH}`,
      method: 'POST',
      headers,
      body,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + API_HOST,
      maxRecvData: 65536,
      maxSentData: 8192, // a bit larger now that we carry many headers + a JSON body
      // Reveal only the request/response start lines + the trade fields we need.
      // Everything else (cookie value, csrftoken, fvideo-token, other JSON keys)
      // stays redacted by the prover.
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
        // tlsn's JSON-path reveal only supports concrete dotted indices
        // (e.g. `items.0.name`), no `*` wildcards. Since we want every
        // trade's PnL/time/volume, the only practical option is to reveal
        // the whole response body and let our backend / Noir circuit
        // parse what it needs.
        //
        // The request side (headers including cookie + csrftoken) still
        // gets redacted -- only the request start-line (method + path) is
        // revealed above.
        { type: 'RECV', part: 'BODY', action: 'REVEAL' },
      ],
    }
  );

  doneWithOverlay(JSON.stringify(resp));
};

// Minimal UI: a single button. The extension shows it in the sidebar.
const main = () => {
  const isRequestPending = useState<boolean>('isRequestPending', false);
  const error = useState<string | null>('error', null);

  // On plugin load, redirect the user to the Trade History page so the bapi
  // POST gets captured by useHeaders().
  useEffect(() => {
    openWindow(`https://${UI_HOST}${UI_PATH}`);
  }, []);

  const children: Array<object | string> = [
    div(
      { style: { fontSize: '14px', fontWeight: '600', marginBottom: '8px' } },
      ['VerifyTrade: Binance Futures PnL']
    ),
    div(
      { style: { fontSize: '12px', color: '#475569', marginBottom: '12px' } },
      [
        div({ style: { marginBottom: '4px' } }, ['1. Log in to binance.com in the opened tab']),
        div({ style: { marginBottom: '4px' } }, ['2. Make sure the Trade History page actually loads your trades']),
        div({}, ['3. Come back here and click below']),
      ]
    ),
    button(
      {
        style: {
          padding: '8px 14px',
          borderRadius: '8px',
          backgroundColor: isRequestPending ? '#a78bfa' : '#6d28d9',
          color: 'white',
          fontWeight: '600',
          border: 'none',
          cursor: isRequestPending ? 'not-allowed' : 'pointer',
        },
        onclick: 'onClick',
        disabled: isRequestPending,
      },
      [isRequestPending ? 'Notarizing...' : 'Notarize My Trades']
    ),
  ];

  if (error) {
    children.push(
      div(
        { style: { marginTop: '12px', padding: '8px', backgroundColor: '#fef2f2', borderRadius: '6px', color: '#991b1b', fontSize: '12px' } },
        [error]
      )
    );
  }

  return div({ style: { padding: '16px', fontFamily: 'system-ui, sans-serif' } }, children);
};

// The plugin-sdk's preprocessPluginCode looks for a literal `export default { ... }`
// at the end of the bundle (or named inline exports). We use the default-export
// form to match the spotify/twitter plugin pattern.
export default { config, main, onClick };
