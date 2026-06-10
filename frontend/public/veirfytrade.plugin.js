// src/index.ts
var UI_HOST = "www.binance.com";
var API_HOST = "www.binance.com";
var UI_PATH = "/en/my/orders/futures/tradehistory";
var TRADES_PATH = "/bapi/futures/v1/private/future/user-data/trade-history";
var HEADERS_TO_COPY = [
  "cookie",
  "csrftoken",
  "bnc-uuid",
  "bnc-level",
  "bnc-location",
  "bnc-time-zone",
  "fvideo-id",
  "fvideo-token",
  "device-info",
  "clienttype",
  "lang",
  "x-trace-id",
  "x-ui-request-trace",
  "user-agent"
];
var config = {
  name: "VerifyTrade: Binance Futures PnL",
  description: "Notarize your Binance Futures realized PnL for the VerifyTrade leaderboard",
  requests: [
    {
      method: "POST",
      host: API_HOST,
      pathname: TRADES_PATH,
      verifierUrl: "https://zktlssever-production-f190.up.railway.app"
    }
  ],
  urls: [`https://${UI_HOST}/*`]
};
var onClick = async () => {
  const isRequestPending = useState("isRequestPending", false);
  if (isRequestPending) return;
  setState("isRequestPending", true);
  const allHeaders = useHeaders((headers2) => headers2);
  const allCount = allHeaders ? allHeaders.length : 0;
  const bapiHits = allHeaders ? allHeaders.filter(
    (h) => h.url.indexOf("/bapi/futures/v1/private/future/user-data/trade-history") !== -1
  ) : [];
  const sampleHosts = allHeaders ? Array.from(new Set(allHeaders.map((h) => {
    try {
      return new URL(h.url).host;
    } catch {
      return h.url.slice(0, 40);
    }
  }))).slice(0, 6).join(", ") : "";
  if (bapiHits.length === 0) {
    setState("isRequestPending", false);
    if (allCount === 0) {
      setState(
        "error",
        'Extension intercepted 0 requests total. Likely cause: TLSNotary extension lacks site access. Go to chrome://extensions -> TLSNotary -> Details -> Site access -> "On all sites", then RELOAD the extension and re-open this page.'
      );
    } else {
      setState(
        "error",
        `Saw ${allCount} requests but none to the bapi trade-history endpoint. Hosts seen: [${sampleHosts}]. Open https://www.binance.com/en/my/orders/futures/tradehistory in the opened tab (Trade History page), make sure you are logged in, switch the symbol filter to ZENUSDT once to trigger a fetch, then click Notarize again.`
      );
    }
    return;
  }
  const source = bapiHits[bapiHits.length - 1];
  const sourceHeaders = {};
  for (const h of source.requestHeaders) {
    const k = h.name.toLowerCase();
    if (HEADERS_TO_COPY.indexOf(k) !== -1) sourceHeaders[k] = h.value;
  }
  if (!sourceHeaders["cookie"] || !sourceHeaders["csrftoken"]) {
    setState("isRequestPending", false);
    setState(
      "error",
      "Intercepted bapi request was missing cookie or csrftoken. You are probably not logged in or the session expired. Log in at binance.com and retry."
    );
    return;
  }
  const headers = {
    ...sourceHeaders,
    Host: API_HOST,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "identity",
    Connection: "close",
    Origin: `https://${UI_HOST}`,
    Referer: `https://${UI_HOST}${UI_PATH}`
  };
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1e3;
  const body = JSON.stringify({
    startTime: now - ninetyDays,
    endTime: now,
    page: 1,
    rows: 50
  });
  const resp = await prove(
    {
      url: `https://${API_HOST}${TRADES_PATH}`,
      method: "POST",
      headers,
      body
    },
    {
      verifierUrl: "https://zktlssever-production-f190.up.railway.app",
      proxyUrl: "wss://zktlssever-production-f190.up.railway.app/proxy?token=" + API_HOST,
      maxRecvData: 65536,
      maxSentData: 8192,
      // a bit larger now that we carry many headers + a JSON body
      // Reveal only the request/response start lines + the trade fields we need.
      // Everything else (cookie value, csrftoken, fvideo-token, other JSON keys)
      // stays redacted by the prover.
      handlers: [
        { type: "SENT", part: "START_LINE", action: "REVEAL" },
        { type: "RECV", part: "START_LINE", action: "REVEAL" },
        // tlsn's JSON-path reveal only supports concrete dotted indices
        // (e.g. `items.0.name`), no `*` wildcards. Since we want every
        // trade's PnL/time/volume, the only practical option is to reveal
        // the whole response body and let our backend / Noir circuit
        // parse what it needs.
        //
        // The request side (headers including cookie + csrftoken) still
        // gets redacted -- only the request start-line (method + path) is
        // revealed above.
        { type: "RECV", part: "BODY", action: "REVEAL" }
      ]
    }
  );
  doneWithOverlay(JSON.stringify(resp));
};
var main = () => {
  const isRequestPending = useState("isRequestPending", false);
  const error = useState("error", null);
  useEffect(() => {
    openWindow(`https://${UI_HOST}${UI_PATH}`);
  }, []);
  const children = [
    div(
      { style: { fontSize: "14px", fontWeight: "600", marginBottom: "8px" } },
      ["VerifyTrade: Binance Futures PnL"]
    ),
    div(
      { style: { fontSize: "12px", color: "#475569", marginBottom: "12px" } },
      [
        div({ style: { marginBottom: "4px" } }, ["1. Log in to binance.com in the opened tab"]),
        div({ style: { marginBottom: "4px" } }, ["2. Make sure the Trade History page actually loads your trades"]),
        div({}, ["3. Come back here and click below"])
      ]
    ),
    button(
      {
        style: {
          padding: "8px 14px",
          borderRadius: "8px",
          backgroundColor: isRequestPending ? "#a78bfa" : "#6d28d9",
          color: "white",
          fontWeight: "600",
          border: "none",
          cursor: isRequestPending ? "not-allowed" : "pointer"
        },
        onclick: "onClick",
        disabled: isRequestPending
      },
      [isRequestPending ? "Notarizing..." : "Notarize My Trades"]
    )
  ];
  if (error) {
    children.push(
      div(
        { style: { marginTop: "12px", padding: "8px", backgroundColor: "#fef2f2", borderRadius: "6px", color: "#991b1b", fontSize: "12px" } },
        [error]
      )
    );
  }
  return div({ style: { padding: "16px", fontFamily: "system-ui, sans-serif" } }, children);
};
export default { config, main, onClick };