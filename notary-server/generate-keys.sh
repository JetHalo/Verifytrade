#!/usr/bin/env bash
# Generate a fresh ECDSA P-256 key pair for the notary server.
#
# Usage:
#   ./generate-keys.sh
#
# Outputs:
#   ./keys/notary.key   (private)
#   ./keys/notary.pub   (public)
#
# After generating, upload notary.key to Railway as a secret env var (or mount as a file).
# The public key (notary.pub) is what participants will pin in their prover config.

set -euo pipefail

mkdir -p keys

# Private key (P-256 / secp256r1 — TLSNotary default)
openssl ecparam -name prime256v1 -genkey -noout -out keys/notary.key

# Public key
openssl ec -in keys/notary.key -pubout -out keys/notary.pub

echo "✓ Generated key pair under ./keys/"
echo ""
echo "Private key (KEEP SECRET, upload to Railway as NOTARY_SIGNING_KEY_PEM):"
echo "----------------------------------------"
cat keys/notary.key
echo ""
echo "Public key (share with participants):"
echo "----------------------------------------"
cat keys/notary.pub
