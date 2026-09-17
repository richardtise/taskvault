# TaskVault Deployment Guide

Complete step-by-step guide to deploy TaskVault to production.

## Overview

You need to deploy 4 things:
1. **Smart Contracts** to Robinhood Chain
2. **Backend API** (Node.js + MongoDB; a Redis 7 container is bundled in Compose but is not yet used by backend code)
3. **Verifier Bot** (automated task approval)
4. **Frontend** (React app served via nginx)

## Prerequisites

- Server with Docker + Docker Compose installed
- Domain name (optional but recommended)
- Wallet with ETH on Robinhood Chain
- Blockscout API key

---

## Step 1: Deploy Smart Contracts

### Option A: Foundry (Recommended)

```bash
# Clone with submodules (contracts/lib holds the pinned OpenZeppelin + forge-std)
git clone --recurse-submodules https://github.com/richardtise/taskvault.git
cd taskvault/contracts

# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# If you cloned without --recurse-submodules:
# git submodule update --init --recursive

# Set env
cp .env.example .env
# Edit .env:
# PRIVATE_KEY=0x...
# USDG_ADDRESS=0x... (or deploy the bundled MockUSDG first)
# TREASURY_ADDRESS=0x...

# Test
forge test

# Deploy to testnet
source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $ROBINHOOD_TESTNET_RPC \
  --broadcast --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api
```

Save the output addresses.

> Foundry is the only supported contract toolchain. A duplicate Hardhat setup was
> removed because Hardhat 2 rejects Solidity sources outside its project root
> (`paths.sources = "../src"` => `HH1007`), and maintaining two toolchains with
> different compiler versions produced different bytecode for the same source.

---

## Step 2: Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```env
# Server
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-domain.example   # CORS origin of the deployed frontend

# Database (consumed by `npm run dev`/non-Docker runs; the bundled Compose
# stack injects its own internal MongoDB URI — see "Environment variables")
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/taskvault

# Blockchain (use the addresses from Step 1)
# Public Robinhood Chain RPCs are rate-limited and are not recommended for
# production — use a dedicated provider key/endpoint here.
RPC_URL=https://rpc.testnet.chain.robinhood.com
PRIVATE_KEY=0x...                    # Backend verifier wallet (needs VERIFIER_ROLE + gas)
VAULT_ADDRESS=0x...                  # TaskVault contract — the only chain address the backend reads

# JWT / admin
JWT_SECRET=generate_a_random_64_char_string
JWT_EXPIRES_IN=7d
ADMIN_WALLET=0x...                   # Your admin wallet
```

---

## Step 3: Configure Frontend

```bash
cd frontend
cp .env.example .env
```

Edit `.env`:
```env
VITE_ROBINHOOD_RPC=https://rpc.mainnet.chain.robinhood.com
VITE_ROBINHOOD_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com
VITE_VAULT_ADDRESS=0x...             # From Step 1
VITE_USDG_ADDRESS=0x...              # Your USDG token
```

> Vite inlines `VITE_*` values at **build time**. `frontend/.env` is gitignored
> and is excluded from the Docker build context, so the container image is built
> with the `VITE_*` build args from the repo-root `.env` instead (Step 4).

---

## Step 4: Deploy with Docker

### On your production server:

```bash
# 1. Clone repo
git clone https://github.com/yourusername/taskavault.git
cd taskavault

# 2. Create the repo-root .env consumed by `docker compose` ${VAR} substitution
#    and the frontend build args. (gitignored)
cat > .env << EOF
# Frontend build args (baked into the Vite bundle)
VITE_VAULT_ADDRESS=0x...
VITE_USDG_ADDRESS=0x...
VITE_ROBINHOOD_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com

# Backend/service overrides
FRONTEND_URL=http://your-server-ip
# Leave MONGODB_URI unset to use the bundled MongoDB container; set it to use Atlas.
# MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/taskvault
EOF

# 3. Create backend/.env — loaded by the backend and verifier via `env_file`.
#    See Step 2 for the full contents (keys, RPC, JWT).
cp backend/.env.example backend/.env
# Edit backend/.env

# 4. Build and start (Compose v2)
docker compose up -d --build

# 5. Seed initial tasks
docker compose exec backend npm run seed

# 6. Start verifier bot
docker compose up -d verifier
```

### Services will be running:
- Frontend: http://your-server-ip (host port 80 → unprivileged nginx on 8080)
- API: http://your-server-ip/api (proxied by nginx; the backend also publishes 3001 directly)
- MongoDB: internal Compose network only — no host port is published
- Redis: internal Compose network only — no host port is published

> TLS is not terminated by this stack. To add HTTPS, mount certificates into the
> frontend service and add a `listen 8443 ssl;` server block to
> `frontend/nginx.conf`, then publish `443:8443` in `docker-compose.yml`.

---

## Step 5: Post-Deployment

### 5a. Add your first verifier

The deployer wallet already has verifier role. If you want a separate bot wallet:

**Foundry:**
```bash
cast send $VAULT_ADDRESS "addVerifier(address)" 0xBotWallet \
  --rpc-url $ROBINHOOD_TESTNET_RPC --private-key $PRIVATE_KEY
```

### 5b. Create your first real task

Use the admin API or directly in MongoDB:

```bash
curl -X POST http://your-server/api/admin/tasks \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Your First Task",
    "description": "Describe what to do",
    "instructions": "Step by step instructions",
    "category": "llm-rank",
    "modality": "llm",
    "genre": "llm",
    "basePoints": 50,
    "difficulty": "Easy",
    "verificationType": "manual"
  }'
```

### 5c. Test end-to-end

1. Open frontend in browser
2. Connect wallet
3. Register (free)
4. Browse tasks
5. Submit work
6. Admin approves via dashboard
7. Points minted on-chain
8. Check balance updated

---

## Step 6: CI/CD Setup

### GitHub Secrets

Add these to your GitHub repo settings:

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | Your server IP/domain |
| `SERVER_USER` | SSH username |
| `SSH_PRIVATE_KEY` | Private key for server access |

### Auto-deploy

Deployment is gated on CI. `.github/workflows/deploy.yml` triggers on the
`workflow_run` event for the **CI** workflow, so it only runs after `ci.yml`
completes successfully on `main`:

1. A push to `main` runs the CI workflow (contracts + backend + frontend).
2. When CI succeeds on `main`, the Deploy workflow starts.
3. It SSHes into the server, syncs the checkout (`git fetch` + `git reset --hard
   origin/main`, so local untracked `.env` files survive), rebuilds the images
   with `docker compose build` and recreates the containers with `docker compose
   up -d --remove-orphans`.

Pushes to `develop` and pull requests run CI but do not deploy: the deploy job
is restricted to `main`. `needs:` cannot reference jobs from another workflow
file, which is why Deploy listens to the CI result instead of listing the CI
jobs by name.

---

## Environment variables

Two `.env` files are in play. Both are **gitignored** and must be created on the
host; only the `.env.example` templates are committed.

### Repo-root `.env` (read by `docker compose` for `${VAR}` substitution)

| Variable | Consumed by | Notes |
|----------|-------------|-------|
| `VITE_VAULT_ADDRESS` | frontend build arg | Baked into the Vite bundle at image build time |
| `VITE_USDG_ADDRESS` | frontend build arg | Baked into the Vite bundle at image build time |
| `VITE_ROBINHOOD_TESTNET_RPC` | frontend build arg | Defaults to the public testnet RPC |
| `FRONTEND_URL` | backend / verifier | CORS origin; defaults to `http://localhost` |
| `MONGODB_URI` | backend / verifier | Optional; defaults to the bundled MongoDB container |
| `REDIS_URL` | backend / verifier | Optional; defaults to the bundled Redis container |

### `backend/.env` (loaded by the backend and verifier via `env_file`)

| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` | no | Default `3001`; Compose pins `3001` |
| `NODE_ENV` | no | Compose forces `production` |
| `MONGODB_URI` / `REDIS_URL` | no | Overridden by Compose root `.env`/defaults |
| `RPC_URL` | yes | Robinhood Chain RPC — use a dedicated provider in production |
| `PRIVATE_KEY` | yes | Verifier bot wallet key (needs `VERIFIER_ROLE` + gas) |
| `VAULT_ADDRESS` | yes | TaskVault contract address |
| `JWT_SECRET` | yes | 32+ random characters (enforced at boot) |
| `JWT_EXPIRES_IN` | no | Default `7d` |
| `ADMIN_WALLET` / `ADMIN_WALLETS` | yes | Wallet(s) allowed to call `/api/admin/*` |
| `FRONTEND_URL` | no | CORS origin(s), comma-separated (Compose supplies it from the root `.env`) |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | no | API rate limiting |
| `TRUST_PROXY` | no | Proxy hops to trust for client IPs; default `1` behind the bundled nginx |
| `LOG_LEVEL`, `LOG_DIR` | no | Winston log level / directory |
| `VERIFIER_INTERVAL_MS`, `VERIFIER_BATCH_SIZE` | no | Verifier bot polling knobs |

> `environment:` entries in `docker-compose.yml` take precedence over `env_file`
> values, which is why service-internal values (`MONGODB_URI`, `REDIS_URL`,
> `NODE_ENV`, `PORT`, `FRONTEND_URL`) are supplied there and should be overridden
> from the repo-root `.env`.

---

## Troubleshooting

### "Cannot connect to MongoDB"
- Check `MONGODB_URI` is correct
- Ensure MongoDB container is running: `docker compose ps`
- Check logs: `docker compose logs mongodb`

### "Verifier bot not minting points"
- Check bot wallet has `VERIFIER_ROLE`
- Check bot has ETH for gas
- Check `VAULT_ADDRESS` and `PRIVATE_KEY` are correct
- Check logs: `docker compose logs verifier`

### "Frontend can't connect to API"
- Check `frontend/nginx.conf` has `proxy_pass http://backend:3001;` (no trailing slash)
- Check CORS settings in backend (`FRONTEND_URL`)
- Check `VITE_` build args were set before the image was built

### "Tasks not showing"
- Run seed script: `docker compose exec backend npm run seed`
- Check tasks have `status: "active"` in MongoDB

### "Points not updating after approval"
- Check transaction succeeded on Blockscout
- Check backend logs for blockchain errors
- Verify `MINTER_ROLE` is granted to vault contract

---

## Security Checklist

- [ ] `.env` files are not committed to git (they are covered by the root `.gitignore`)
- [ ] `PRIVATE_KEY` is for a dedicated bot wallet (not your main wallet)
- [ ] Admin wallet is a multisig or hardware wallet
- [ ] JWT_SECRET is 64+ random characters
- [ ] Rate limiting enabled
- [ ] HTTPS enabled (use Let's Encrypt with nginx)
- [ ] MongoDB auth enabled
- [ ] Firewall rules set (only 80/443 exposed)
- [ ] Regular backups of MongoDB data

## Scaling

When you grow:
- Move MongoDB to Atlas or dedicated server
- Add load balancer (nginx or cloud LB)
- Run multiple backend instances
- Introduce Redis for session caching (the Redis 7 container is already bundled in Compose)
- Add CDN for static assets
