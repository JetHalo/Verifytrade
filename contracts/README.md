# Contracts — Competition

Solidity contracts for the VerifyTrade on-chain leaderboard and reward distribution.

## Layout

```
src/
├── Competition.sol          Main contract: rounds, submissions, claims
├── MockZkVerify.sol         Local mock for testing (do not deploy to mainnet)
└── interfaces/
    └── IZkVerifyAttestor.sol  zkVerify cross-chain attestor interface
test/
└── Competition.t.sol        Foundry tests
script/
└── Deploy.s.sol             Deployment script
```

## Build & test

```bash
# Install dependencies
forge install foundry-rs/forge-std --no-commit

# Build
forge build

# Run tests
forge test -vvv

# Gas report
forge test --gas-report
```

## Deploy to Base Sepolia

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export BASESCAN_API_KEY=...
# Optional: ZK_VERIFY_ATTESTOR=0x... (else MockZkVerify is deployed)

forge script script/Deploy.s.sol \
  --rpc-url base_sepolia \
  --broadcast \
  --verify
```

## Key design decisions

### Multi-round support

The contract holds a `mapping(uint256 => Round)`, allowing unlimited concurrent or sequential competitions with different time windows, thresholds, and reward pools — all served by the same compiled Noir circuit. Public inputs are checked against the Round's stored config at submission time.

### Sybil resistance (limited)

`uidUsedInRound[roundId][uidBindingHash]` ensures one Binance UID per Round. This stops trivial duplicates but doesn't stop a user from creating multiple testnet accounts. Real sybil resistance for production would need KYC or account-age gating (see `docs/development.md` §9.2).

### Reward distribution

`claimReward` currently splits the pool equally among the top 10. Swap in your preferred curve (linear, geometric, etc.) by replacing the `share` calculation in `claimReward`.

### Trust assumptions

- Trust in zkVerify's `verifyAttestation`: the attestor contract must be authentic. Hardcode the production address in your deployment to prevent rug.
- Trust in the Noir circuit: if the circuit is buggy, garbage in → garbage out. Audit the circuit before mainnet.
- Trust in the notary public key: presentations are bound to a specific notary key; if that key is compromised, all presentations from that notary become forgeable.
