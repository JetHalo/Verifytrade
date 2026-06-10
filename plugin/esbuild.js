#!/usr/bin/env node
/**
 * Build the VerifyTrade TLSNotary plugin as an ESM JavaScript bundle.
 *
 * Output: dist/veirfytrade.plugin.js
 *
 * The plugin-sdk's `preprocessPluginCode` matches either:
 *   (a) inline exports: `export function|const|let|var|class NAME`, OR
 *   (b) a literal trailing `export default { ... };`
 *
 * esbuild's default ESM output for `export default { ... }` is a 2-statement
 * form `var X_default = {...}; export { X_default as default };` which matches
 * NEITHER pattern. So we post-process the bundle to rewrite it to the literal
 * `export default { ... };` form that the preprocessor recognizes.
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'dist/veirfytrade.plugin.js');

// Default URLs are placeholders only. PSE's public notary at notary.pse.dev has
// been deprecated since alpha.13 -- you MUST override VERIFIER_URL / PROXY_URL
// to point at your own notary-server deployment (we use Railway). Wire protocol
// is pinned to v0.1.0-alpha.12 (see ../../verifytrade-notary/Dockerfile).
const VERIFIER_URL = process.env.VERIFIER_URL || 'https://notary.pse.dev/v0.1.0-alpha.12';
const PROXY_URL = process.env.PROXY_URL || 'wss://notary.pse.dev/proxy?token=';

fs.mkdirSync(path.dirname(OUT), { recursive: true });

await esbuild.build({
  entryPoints: [path.resolve(__dirname, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  outfile: OUT,
  define: {
    __VERIFIER_URL__: JSON.stringify(VERIFIER_URL),
    __PROXY_URL__: JSON.stringify(PROXY_URL),
  },
});

// --- Post-process: rewrite esbuild's `var X_default = {...}; export { X_default as default };`
//     into a literal `export default {...};` so plugin-sdk's preprocessor regex matches.
let code = fs.readFileSync(OUT, 'utf-8');
const m = code.match(
  /var\s+(\w+)\s*=\s*(\{[\s\S]*?\});\s*export\s*\{\s*\1\s+as\s+default\s*\}\s*;?\s*$/
);
if (!m) {
  console.error('Post-process: could not find esbuild default-export pattern. Output left as-is.');
  process.exit(1);
}
const objectLiteral = m[2];
code = code.replace(m[0], `export default ${objectLiteral};`);
fs.writeFileSync(OUT, code);

console.log('OK dist/veirfytrade.plugin.js');
console.log(`   VERIFIER_URL: ${VERIFIER_URL}`);
console.log(`   PROXY_URL:    ${PROXY_URL}`);
console.log(`   epilogue:     ${objectLiteral.trim().slice(0, 60)}...`);
