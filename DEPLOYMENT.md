# TaskVault Deployment Guide

Complete step-by-step guide to deploy TaskVault to production.

## Overview

You need to deploy 4 things:
1. **Smart Contracts** to Robinhood Chain
2. **Backend API** (Node.js + MongoDB + Redis)
3. **Verifier Bot** (automated task approval)
4. **Frontend** (React app served via nginx)

## Prerequisites

- Server with Docker + Docker Compose installed
- Domain name (optional but recommended)
- Wallet with ETH on Robinhood Chain
- Blockscout API key
- Infura/Pinata account (for IPFS)

---

## Step 1: Deploy Smart Contracts

### Option A: Foundry (Recommended)

```bash
cd contracts

# Install
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge install OpenZeppelin/openzeppelin-contracts

# Set env
cp .env.example .env
# Edit .env:
# PRIVATE_KEY=0x...
# USDG_ADDRESS=0x... (or deploy mock first)
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

### Option B: Hardhat

```bash
cd contracts/hardhat
npm install
cp .env.example .env
# Edit .env
npx hardhat test
npx hardhat run scripts/deploy.js --network robinhoodTestnet
```

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

# Database (use MongoDB Atlas for production)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/taskvault
REDIS_URL=redis://redis:6379

# Blockchain (use the addresses from Step 1)
RPC_URL=https://rpc.testnet.chain.robinhood.com
PRIVATE_KEY=0x...                    # Backend verifier wallet
VAULT_ADDRESS=0x...                  # From deployment
POINTS_ADDRESS=0x...                 # From deployment
USDG_ADDRESS=0x...                   # Your USDG token

# IPFS
IPFS_PROJECT_ID=your_infura_id
IPFS_PROJECT_SECRET=your_infura_secret

# JWT
JWT_SECRET=generate_a_random_64_char_string
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

---

## Step 4: Deploy with Docker

### On your production server:

```bash
# 1. Clone repo
git clone https://github.com/yourusername/taskavault.git
cd taskavault

# 2. Create .env file for docker-compose
cat > .env << EOF
VAULT_ADDRESS=0x...
POINTS_ADDRESS=0x...
PRIVATE_KEY=0x...
JWT_SECRET=...
ADMIN_WALLET=0x...
EOF

# 3. Build and start
docker-compose up -d --build

# 4. Seed initial tasks
docker-compose exec backend npm run seed

# 5. Start verifier bot
docker-compose up -d verifier
```

### Services will be running:
- Frontend: http://your-server-ip
- API: http://your-server-ip/api
- MongoDB: internal only
- Redis: internal only

---

## Step 5: Post-Deployment

### 5a. Add your first verifier

The deployer wallet already has verifier role. If you want a separate bot wallet:

**Foundry:**
```bash
cast send $VAULT_ADDRESS "addVerifier(address)" 0xBotWallet \
  --rpc-url $ROBINHOOD_TESTNET_RPC --private-key $PRIVATE_KEY
```

**Hardhat:**
```javascript
const vault = await ethers.getContractAt("TaskVault", process.env.VAULT_ADDRESS);
await vault.addVerifier("0xBotWallet");
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
    "category": "llm",
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

On every push to `main`:
1. Tests run (contracts + backend + frontend)
2. If tests pass, auto-deploys to server via SSH
3. Docker containers rebuild and restart

---

## Troubleshooting

### "Cannot connect to MongoDB"
- Check `MONGODB_URI` is correct
- Ensure MongoDB container is running: `docker-compose ps`
- Check logs: `docker-compose logs mongodb`

### "Verifier bot not minting points"
- Check bot wallet has `VERIFIER_ROLE`
- Check bot has ETH for gas
- Check `VAULT_ADDRESS` and `PRIVATE_KEY` are correct
- Check logs: `docker-compose logs verifier`

### "Frontend can't connect to API"
- Check nginx config has correct proxy_pass
- Check CORS settings in backend
- Check `VITE_` env vars are set correctly

### "Tasks not showing"
- Run seed script: `docker-compose exec backend npm run seed`
- Check tasks have `status: "active"` in MongoDB

### "Points not updating after approval"
- Check transaction succeeded on Blockscout
- Check backend logs for blockchain errors
- Verify `MINTER_ROLE` is granted to vault contract

---

## Security Checklist

- [ ] `.env` files never committed to git
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
- Use Redis for session caching
- Add CDN for static assets
- Move IPFS to dedicated node
