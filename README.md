# VerifyTrade

> Prove your Binance Futures PnL on-chain with ZK-TLS — without revealing your account, strategy, or individual trades.

[English](./README.md) · [中文](./README.zh-CN.md)

The complete code for the Mu Shang Hai zkVerify Workshop — an end-to-end Verifiable PnL Platform built with TLSNotary + Noir + UltraHonk + zkVerify Volta.

---

## What this does

Participants submit one Binance Futures realized PnL. Behind the scenes the full ZK pipeline runs:

1. **TLSNotary** captures the real `binance.com` response via a browser extension (MPC-TLS mode — the verifier cannot see plaintext)
2. **Noir + UltraHonk** generates a proof inside the browser, asserting that three metrics (trade count / total volume / realized PnL) came from that TLS session
3. **zkVerify Volta** mainnet verifies the proof once and returns an `aggregationId`
4. **Public leaderboard** shows the three numbers — each row links to the on-chain attestation on zkVerify

End-to-end takes about 1-2 minutes per submission.

---

## Two repos work together

This Workshop needs **two repos** running side by side:

| Repo | What it does | Where it runs |
|---|---|---|
| **`Verifytrade`** (this repo) | Frontend + circuit + browser plugin | Local — `pnpm install` and go |
| **[`zktls_sever`](https://github.com/JetHalo/zktls_sever)** | TLSNotary verifier server | Deploy to Railway (Singapore region required) |

**The link**: `frontend/lib/tlsn-provider.ts` opens a WebSocket to the verifier URL deployed from `zktls_sever`, and runs the MPC-TLS handshake through it.

---

## Quick start

### 0 · Prerequisites

| Tool | Version |
|---|---|
| **Node.js** | ≥ 20 |
| **pnpm** | ≥ 9 |
| **TLSNotary browser extension** | **must be 0.1.0.1500** (see [Tips](#tips--common-pitfalls)) |
| **Binance account** | logged into `binance.com` with a Futures account opened |

> You do **not** need Noir, Barretenberg, or Rust. The circuit artifacts (`vk` + `circuit.json`) and plugin build are pre-committed to this repo.

### 1 · Clone the repo

```bash
git clone https://github.com/JetHalo/Verifytrade.git
cd Verifytrade
```

### 2 · Deploy your own TLSNotary verifier

Go to **[JetHalo/zktls_sever](https://github.com/JetHalo/zktls_sever)** and follow its README to deploy on Railway:

1. Fork `JetHalo/zktls_sever` to your own GitHub
2. Railway → "Deploy from GitHub" → pick the forked repo
3. **Region must be Singapore** (US-region IPs get `451` from Binance)
4. After deploy you'll get a URL like `wss://your-verifier.up.railway.app`

### 3 · Configure environment variables

```bash
cd frontend
cp .env.example .env.local
```

Open `.env.local` and fill in **two variables**:

| Variable | Required | What it is | How to get it |
|---|---|---|---|
| `ZKVERIFY_SEED` | ✅ | 12-word mnemonic for your zkVerify Volta testnet account | Register at [docs.zkverify.io/network/testnet](https://docs.zkverify.io/network/testnet) and export the seed phrase |
| `NEXT_PUBLIC_DEFAULT_NOTARY_URL` | ✅ | The Railway verifier URL from step 2 | `wss://your-verifier.up.railway.app` |

⚠ **Never commit `.env.local`** (it's already in `.gitignore`). If your `ZKVERIFY_SEED` ever leaks to GitHub, immediately rotate it for a new Volta account.

### 4 · Install the TLSNotary browser extension

⚠ **Must be version 0.1.0.1500** specifically. Newer versions break the handshake with the alpha.15 verifier.

- Chrome Web Store: [TLSNotary Extension](https://chromewebstore.google.com/detail/tlsnotary/gnoglgpcamodhflknhmafmjdahcejcgg)
- If the store has been auto-updated to a newer version, download `tlsn-extension-0.1.0.1500.zip` from [TLSNotary releases](https://github.com/tlsnotary/tlsn-extension/releases), unzip, then `chrome://extensions` → "Load unpacked"

### 5 · Start the frontend

```bash
cd frontend
pnpm install
pnpm dev -p 3500
```

Open **http://localhost:3500** in your browser.

### 6 · Run one submission end-to-end

1. **Log in to `binance.com`** first (with a real account)
2. Back to `localhost:3500/submit`, open any round
3. Click **Notarize**
4. TLSNotary extension pops up — click Approve
5. MPC-TLS runs for about 1 minute; the browser generates an UltraHonk proof in-page
6. The proof is auto-submitted to zkVerify Volta — wait ~30 seconds for the `aggregationId`
7. The leaderboard refreshes; your entry appears
8. Click the attestation link to jump to the zkVerify Volta explorer and see the on-chain record

---

## The full pipeline

```
Browser extension (Notarize)
    ↓ MPC-TLS
TLSNotary verifier (Railway Singapore)   ← deployed from zktls_sever
    ↓ attestation
In-browser (Noir circuit + UltraHonk prover)
    ↓ proof + vk + publicInputs
zkVerify Volta mainnet
    ↓ aggregationId
Next.js API (data/state.json leaderboard)
    ↓
http://localhost:3500/leaderboard/{roundId}
```

---

## Tips · common pitfalls

### 1 · The TLSNotary extension must be version 0.1.0.1500

Newer versions (0.1.0.1501+) fail to handshake with the alpha.15 verifier protocol. If the Chrome Web Store has updated, download `tlsn-extension-0.1.0.1500.zip` from [TLSNotary releases](https://github.com/tlsnotary/tlsn-extension/releases), unzip it, and load it unpacked via `chrome://extensions`.

### 2 · The verifier must run in an Asian region

Binance returns `451` on many US-region IPs. Railway defaults to us-west2 — you must change it to **asia-southeast1 (Singapore)** in deploy settings. The `railway.toml` in `zktls_sever` already pins this.

### 3 · `pnpm` + Next.js webpack error

If you hit `__webpack_require__.U is not a constructor` when starting the frontend:

```bash
# Flatten pnpm's node_modules so Next.js sees one webpack runtime
cd frontend
echo 'shamefully-hoist=true' > .npmrc
echo 'node-linker=hoisted' >> .npmrc

rm -rf node_modules .next pnpm-lock.yaml
pnpm install
pnpm dev -p 3500
```

---

## Project structure

```
Verifytrade/
├── README.md                English version (you are here)
├── README.zh-CN.md          Chinese version
├── .gitignore
├── circuit/                 Noir UltraHonk circuit
│   ├── src/main.nr          3 metrics + Poseidon commitment
│   ├── Nargo.toml
│   └── target/              ← pre-built artifacts committed (vk + circuit.json)
├── plugin/                  TLSNotary browser-plugin config
│   ├── src/index.ts
│   ├── config.json          declares which binance.com endpoints to intercept
│   └── dist/                ← pre-built bundle committed
└── frontend/                Next.js 14 app (main entry point)
    ├── app/
    │   ├── submit/          submit one PnL
    │   ├── rounds/          round list
    │   ├── leaderboard/     leaderboard
    │   ├── admin/           admin creates rounds
    │   └── api/             JSON-file storage API
    ├── lib/
    │   ├── tlsn-provider.ts     talks to the TLSNotary extension
    │   ├── prover-browser.ts    in-browser Noir + UltraHonk proof generation
    │   ├── zkverify-server.ts   zkverifyjs → Volta
    │   └── storage.ts           JSON-file CRUD
    └── data/
        ├── state.json       all rounds + submissions (runtime · gitignored)
        └── vk               UltraHonk verification key (auto-synced from circuit/)
```

---

## Advanced · modifying the circuit

If you want to edit `circuit/src/main.nr` and add new constraints, install the toolchain:

```bash
# Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v 1.0.0-beta.6

# Barretenberg
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
bbup -v 0.84.0

# Compile and generate a fresh VK
cd circuit
nargo compile
bb write_vk --scheme ultra_honk --oracle_hash keccak \
  -b target/circuit.json -o target/proof_out/
```

⚠ **`bb` must be 0.84.0** — zkVerify Volta currently only supports 0.84.x. `--oracle_hash keccak` is mandatory — zkVerify uses Keccak256, not Poseidon2.

The `predev` hook will automatically copy the new artifacts to `frontend/data/vk` when you run `pnpm dev`.

---

## Related links

- **TLSNotary verifier server**: [JetHalo/zktls_sever](https://github.com/JetHalo/zktls_sever)
- **zkVerify docs**: [docs.zkverify.io](https://docs.zkverify.io)
- **Noir docs**: [noir-lang.org](https://noir-lang.org)
- **TLSNotary docs**: [docs.tlsnotary.org](https://docs.tlsnotary.org)

---

## License

MIT
