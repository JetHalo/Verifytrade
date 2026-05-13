# Notary Server

TLSNotary notary server, configured for one-click Railway deployment.

## What this does

Runs the [TLSNotary](https://github.com/tlsnotary/tlsn) notary server, which co-signs TLS sessions in MPC with the Prover. Each user in the VerifyTrade workshop deploys their own notary so they fully own their ZK-TLS infrastructure.

## Deploy to Railway (3 minutes)

1. Fork this repo (or the parent `veirfytrade` repo) to your own GitHub account
2. Sign in to [Railway](https://railway.app) (free trial gives $5 credit, more than enough for the workshop)
3. Click `New Project → Deploy from GitHub repo → veirfytrade`
4. In project settings, set **Root Directory** to `notary-server`
5. Generate a signing key locally:
   ```bash
   chmod +x generate-keys.sh
   ./generate-keys.sh
   ```
6. In Railway, add an environment variable `NOTARY_SIGNING_KEY_PEM` with the contents of `keys/notary.key`
7. Railway will auto-build the Dockerfile, deploy, and give you a public URL like `https://verifytrade-notary-production.up.railway.app`

## Connect from the Prover CLI

```bash
veirfytrade-prover \
  --notary  wss://verifytrade-notary-production.up.railway.app \
  --notary-pubkey ./keys/notary.pub \
  ...
```

## Local testing

```bash
docker build -t verifytrade-notary .
./generate-keys.sh
docker run -p 7047:7047 \
  -v "$(pwd)/keys:/app/keys" \
  verifytrade-notary
```

Test with curl:
```bash
curl http://localhost:7047/info
```

## Configuration reference

See `notary-config.yaml`. Key knobs:

- `max_sent_data` / `max_recv_data` — limits on TLS payload size
- `authorization.enabled` — set to `true` and add API keys for private deployment
- `tls.enabled` — keep `false` on Railway (Railway's proxy handles TLS termination)

## Cost on Railway

- Notary uses ~256-512 MB RAM, low CPU when idle
- ~$0.005-0.01/hour at idle
- Free trial credit ($5) lasts roughly 3-6 weeks of continuous running
- Hobby plan ($5/month) for permanent hosting

## Reference

- [TLSNotary docs](https://tlsnotary.github.io/docs-mdbook/)
- [TLSNotary GitHub](https://github.com/tlsnotary/tlsn)
- [Railway docs](https://docs.railway.app/)
