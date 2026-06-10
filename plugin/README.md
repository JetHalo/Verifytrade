# VerifyTrade TLSNotary Plugin

The production end-user path. Compiles to WASM and runs inside the official [TLSNotary browser extension](https://chromewebstore.google.com/detail/tlsnotary/gnoglgpcamodhflknhmafmjdahcejcgg).

End users see: install extension → connect wallet → click "Notarize" → extension drives MPC-TLS against Binance → attestation returned to dApp. **No CLI, no terminal, no file upload.**

## Architecture

```
Extension loads plugin (this wasm)
        |
plugin config() declares: allowed hosts, cookies, headers, endpoints
        |
plugin start()        - redirect user to testnet.binancefuture.com if needed
        |
plugin two()          - collect Binance session cookies + CSRF headers
        |
plugin three()        - call host notarize() with the request spec
        |
extension runs MPC-TLS against Binance, with the configured notary
        |
extension calls parseBinanceResp() - which JSON fields stay public vs redacted
        |
attestation returned to dApp via window.tlsn API
```

## Files

| File | Purpose |
| --- | --- |
| `src/index.ts` | The plugin: lifecycle functions (config/start/two/three/parseBinanceResp) |
| `src/utils/hf.js` | Extism host function wrappers (redirect, notarize, etc.) |
| `src/index.d.ts` | TypeScript type declarations for Extism JS-PDK |
| `config.json` | Plugin manifest: name, steps, allowed cookies/headers/URLs |
| `assets/icon.png` | Plugin icon (320x320 PNG) |
| `esbuild.js` | Bundles TS -> CJS, then runs extism-js to produce wasm |

## Build

Install Extism JS-PDK once:

```sh
curl -L https://github.com/extism/js-pdk/releases/download/v1.6.0/extism-js-aarch64-macos-v1.6.0.gz \
  | gunzip > ~/.cargo/bin/extism-js && chmod +x ~/.cargo/bin/extism-js
```

Then:

```sh
pnpm install
pnpm run build
```

Output: `dist/veirfytrade.tlsn.wasm` (about 2.4 MB).

The frontend serves this wasm from `/veirfytrade.tlsn.wasm`; copy `dist/veirfytrade.tlsn.wasm` to `../frontend/public/` whenever you rebuild.

## Selective disclosure rules

The plugin's `parseBinanceResp()` keeps these JSON fields public:

- `symbol` (so we can verify it's BTCUSDT)
- `time` (Unix ms - used for the period filter)
- `realizedPnl` (the headline number)

Everything else in the response (order IDs, exact qty, exact price, commissions) is redacted. The notarized public transcript only contains the three fields above.

## Testing the plugin locally

1. Build the wasm: `pnpm run build`
2. Copy to demo dir + serve: `pnpm run serve-demo`
3. Install the TLSNotary extension from the Chrome Web Store
4. Run a local TLSNotary notary server (see the main TLSNotary repo)
5. Configure extension to point at your local notary
6. Open `http://localhost:8080`
7. The page will prompt the extension to load this plugin

## When to change `config.json`

| You want to | Change |
| --- | --- |
| Target a different Binance endpoint | `requests[0].url` |
| Allow new cookies/headers | `cookies` / `headers` arrays |
| Add a new plugin step | `steps` array + corresponding function in `index.ts` |

## Reference

- [TLSNotary Plugin Boilerplate](https://github.com/tlsnotary/tlsn-plugin-boilerplate)
- [Extism JS-PDK](https://github.com/extism/js-pdk)
- [TLSNotary Browser Extension](https://github.com/tlsnotary/tlsn-extension)
