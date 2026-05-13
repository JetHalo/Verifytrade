# Scripts — Operator & Integration Tools

TypeScript scripts for the activity operator and integration plumbing.

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in: BASE_SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, COMPETITION_ADDRESS, ZKVERIFY_SEED
```

## Commands

| Command | What it does | Status |
| --- | --- | --- |
| `pnpm submit -- --bundle ./proof-bundle.json [--vk <path>]` | Submit a proof bundle to zkVerify Volta testnet via zkverifyjs, return attestationId | ✅ implemented |
| `pnpm create-round -- --period-start ... --period-end ... --threshold 500 --reward 0.1` | Open a new competition Round on the deployed Competition contract | ✅ implemented |
| `pnpm leaderboard -- --round 0` | Read the current leaderboard for a Round | ✅ implemented |
| `pnpm mock-data -- --count 20 --period-start ... --period-end ... --out ./mock.json` | Generate fake trades for circuit testing without real Binance interaction | ✅ implemented |
| `pnpm typecheck` | Run TypeScript type checking | — |

## How `submit-to-zkverify.ts` works

1. Reads the bundle file produced by the Rust Prover CLI
2. Loads the circuit's verification key (`../circuit/target/vk`)
3. Starts a zkVerify Volta testnet session using `ZKVERIFY_SEED`
4. Submits the UltraHonk proof via `session.verify().ultrahonk(...)`
5. Subscribes to `IncludedInBlock` + `Finalized` events
6. Returns the `attestationId` you paste into the contract's `submitProof`

To generate the verification key once your circuit is finalized:

```bash
cd ../circuit
nargo compile
bb write_vk_ultra_honk -b ./target/verifytrade_circuit.json -o ./target/vk
```

## Notes on the zkverifyjs API surface

The script uses `UltrahonkVersion.V3_0` and `UltrahonkVariant.Plain`. zkVerify's supported versions/variants may change — check `zkverifyjs`'s latest docs before relying on a specific combination. If `ultrahonk()` is unavailable in the version of `zkverifyjs` pinned in `package.json`, you may need to upgrade the package or fall back to `ultraplonk()` while UltraHonk support catches up.
