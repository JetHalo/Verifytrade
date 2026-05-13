# VerifyTrade

> ZK-TLS verified trading competition · TLSNotary + zkVerify + Base

Prove your Binance Futures PnL on-chain without revealing your trades.

## What this is

End-to-end demo of ZK-TLS for verifiable web2 data on-chain:

- **TLSNotary** captures Binance Futures Testnet trade history through MPC-TLS
- **Noir circuit** (UltraHonk) asserts PnL over a time window exceeds a threshold
- **zkVerify** verifies the proof and emits a cross-chain attestation
- **Solidity contract** on Base Sepolia runs the leaderboard and reward payout
- **Next.js web app** orchestrates the user flow

## Repo layout

```
veirfytrade/
├── docs/                Architecture diagram + dev doc
├── notary-server/       TLSNotary notary, one-click Railway deploy
├── prover/              Rust CLI: MPC-TLS + presentation + UltraHonk prove
├── circuit/             Noir business assertion circuit
├── contracts/           Solidity Competition contract + Foundry setup
├── scripts/             TypeScript ops scripts (zkVerify submit, deploy helpers)
└── frontend/            Next.js 14 web app
```

Each subdirectory has its own `README.md` with specific instructions.

## Module status

| Module | What's done | What's intentionally still pending |
| --- | --- | --- |
| `docs/` | Full dev doc + architecture HTML | — |
| `circuit/` | Full circuit (PnL filter + commitments) + unit tests + cross-consistency test | The cross-consistency anchor needs running once and the asserted values plugged in |
| `contracts/` | Full Competition.sol + MockZkVerify + 5 Foundry tests + deploy script | — |
| `notary-server/` | Dockerfile + Railway config + key generator | Generate notary signing key on first run |
| `prover/` | Full CLI; commitment encoding (real Poseidon via light-poseidon); UID lookup; mock-mode HTTPS path; nargo+bb shell-out for proof generation; tlsn-feature MPC integration skeleton | `ws_stream_tungstenite` adapter line in `tlsn.rs` (one-line drop-in) + TLSNotary tag verification |
| `scripts/` | Full zkverifyjs submission, round creation, leaderboard read, mock data generator | Verify zkverifyjs's UltrahonkVersion is current |
| `frontend/` | All pages functional (home, submit, leaderboard, admin with owner gate) | Wire up real contract address via env |

## Quick start

### 1. Local sanity checks (no deployment required)

```bash
# Circuit
cd circuit && nargo check && nargo test

# Contracts
cd ../contracts && forge install foundry-rs/forge-std --no-commit && forge test -vv

# Prover (mock mode — no notary needed)
cd ../prover && cargo build --release && cargo test

# Frontend
cd ../frontend && pnpm install && pnpm dev
```

### 2. Cross-check Poseidon alignment (DO THIS FIRST)

The commitment binding only works if Rust and Noir produce identical Poseidon hashes.

```bash
cd prover && cargo test cross_consistency_test -- --nocapture
# Note the printed hex values, then:
cd ../circuit && nargo test test_poseidon_canonical
# If outputs match → safe to proceed.
# If they don't → swap Poseidon crate (see prover/README.md).
```

### 3. Deploy

Full deployment (notary on Railway, contracts on Base Sepolia, frontend on Vercel) — see `docs/development.md` §7.

## Workshop

This repo is the source for a 90-minute workshop where participants:

1. Fork the repo + one-click deploy their own Notary to Railway
2. Register on Binance Futures Testnet (GitHub login, 30 sec)
3. Place a few trades
4. Run the Prover CLI to generate a ZK-TLS proof of their PnL
5. Submit on-chain, land on the leaderboard

Full agenda in `docs/development.md` §8.

## Key technical decisions

See `docs/development.md` for the full rationale on:

- Why TLSNotary instead of zkPass / Primus (open source, no vendor lock-in, fills the zkVerify verification gap)
- Why Binance Futures Testnet (`realizedPnl` field, no KYC, no real money)
- How time windows are parameterized (compile circuit once, run any number of competitions)
- How TLSNotary commitment binds to the Noir proof (the trust closure)

## License

MIT (TODO: add LICENSE file before publishing)
