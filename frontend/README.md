# Frontend — Next.js Web App

User-facing UI for the VerifyTrade competition. Built with Next.js 14 (App Router), wagmi + viem, RainbowKit, and TailwindCSS.

## Status

Functional skeleton with three working pages:
- `/` — homepage with current round state
- `/submit` — proof bundle upload + on-chain submission
- `/leaderboard/[roundId]` — live leaderboard
- `/admin` — round operator controls (skeleton)

## Run locally

```bash
pnpm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_COMPETITION_ADDRESS once the contract is deployed
pnpm dev
```

App opens at http://localhost:3000.

## Architecture

```
app/
├── layout.tsx          Root layout with providers
├── providers.tsx       wagmi + RainbowKit + react-query
├── page.tsx            Homepage
├── submit/page.tsx     Proof submission flow
├── leaderboard/[roundId]/page.tsx  Round leaderboard
└── admin/page.tsx      Operator controls
components/
└── Header.tsx          Top nav + wallet connect
lib/
├── wagmi.ts            wagmi config (Base Sepolia)
├── contracts.ts        ABI + address constants
└── utils.ts            Formatting helpers
```

## Deploy to Vercel

```bash
vercel
# answer the prompts, then in Vercel dashboard set env vars:
#   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
#   NEXT_PUBLIC_COMPETITION_ADDRESS
```

## What's intentionally not built

- Real-time leaderboard updates (currently polls via wagmi's default refetch)
- Wallet-side proof generation (heavy ZK work runs in the Rust CLI, not the browser)
- i18n (the app is English-only for now)
- Server-side admin gating (the `/admin` route is unprotected — add server-side wallet check before production)
