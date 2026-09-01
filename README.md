# TaskVault — Complete Platform

Decentralized AI data marketplace. Contributors complete tasks, earn points, level up through tiers and modality badges. Optional vault deposits for bonuses with streaming withdrawals.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend API    │────▶│   Blockchain    │
│  (React/Vite)   │     │  (Node/Express)  │     │ (Robinhood Chain)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Database       │
                        │  (MongoDB)       │
                        └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Verifier Bot   │
                        │  (Auto/Manual)   │
                        └──────────────────┘
```

## What's Included

```
taskavault-fullstack/
├── frontend/              # React + Vite + RainbowKit + wagmi v2
│   ├── src/
│   │   ├── themes.js              # 7 genre-specific UI themes
│   │   ├── components/
│   │   │   ├── ThemeProvider.jsx  # Dynamic CSS variable injection
│   │   │   ├── BackgroundEffect.jsx
│   │   │   └── TaskInterface.jsx  # Genre-specific task workspaces
│   │   ├── TaskVaultDashboard.jsx # Main dashboard + vault tab + badges
│   │   ├── Landing.jsx
│   │   ├── hooks.js               # All contract hooks (incl. badges)
│   │   ├── abi.js
│   │   └── wagmi-config.js        # Robinhood Chain config
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
├── backend/               # Node.js + Express + MongoDB
│   ├── src/
│   │   ├── models/
│   │   │   ├── User.js            # User profiles + badge cache
│   │   │   ├── Task.js            # Task metadata + requirements
│   │   │   ├── Submission.js      # Task submissions + review status
│   │   │   └── Analytics.js       # Daily platform stats
│   │   ├── routes/
│   │   │   ├── tasks.js           # Task listing, detail, submit
│   │   │   ├── users.js           # Auth, profile, leaderboard
│   │   │   └── admin.js           # Task creation, review, analytics
│   │   ├── services/
│   │   │   ├── blockchain.js      # Ethers.js contract interaction
│   │   │   └── ipfs.js            # File upload to IPFS
│   │   ├── middleware/
│   │   │   └── auth.js            # JWT + admin verification
│   │   ├── utils/
│   │   │   └── logger.js          # Winston logging
│   │   ├── scripts/
│   │   │   ├── verifierBot.js     # Automated task verification
│   │   │   └── seed.js            # Sample task seeding
│   │   └── index.js               # Express server
│   ├── package.json
│   ├── Dockerfile
│   ├── Dockerfile.verifier
│   └── .env.example
│
├── contracts/             # Foundry + Hardhat (both included)
│   ├── src/
│   │   ├── TaskVaultPoints.sol    # Soulbound ERC20 point token
│   │   └── TaskVault.sol          # Main contract (tiers + badges + vault)
│   ├── script/
│   │   └── Deploy.s.sol           # Foundry deployment
│   ├── test/
│   │   └── TaskVault.t.sol        # Foundry tests (20+ tests)
│   ├── hardhat/                   # Alternative Hardhat setup
│   │   ├── hardhat.config.js
│   │   ├── package.json
│   │   ├── scripts/deploy.js
│   │   ├── test/TaskVault.js
│   │   └── .env.example
│   ├── foundry.toml
│   └── .env.example
│
├── nginx/                 # Reverse proxy config
│   └── nginx.conf
│
├── .github/workflows/     # CI/CD
│   ├── ci.yml             # Run tests on PR
│   └── deploy.yml         # Auto-deploy on merge
│
├── docker-compose.yml     # One-command local stack
├── DEPLOYMENT.md          # Step-by-step deploy guide
├── CONTRACTS.md           # Contract architecture & functions
└── README.md              # This file
```

## Quick Start

### Local Development (Docker)

```bash
# 1. Clone and enter
cd taskavault-fullstack

# 2. Set environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp contracts/.env.example contracts/.env
# Edit all three .env files

# 3. Spin up everything
docker-compose up -d

# 4. Seed sample tasks
docker-compose exec backend npm run seed

# 5. Start verifier bot
docker-compose exec backend npm run verifier
```

Services will be available at:
- Frontend: http://localhost
- API: http://localhost/api
- MongoDB: localhost:27017
- Redis: localhost:6379

### Manual Development

**Contracts:**
```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
forge test
cp .env.example .env
# Edit .env
forge script script/Deploy.s.sol:Deploy --rpc-url $ROBINHOOD_TESTNET_RPC --broadcast --verify
```

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env (add contract addresses from deployment)
npm run seed
npm run dev          # API on :3001
npm run verifier     # Bot in separate terminal
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env (add contract addresses)
npm run dev          # Dev server on :5173
```

## Backend API Endpoints

### Tasks
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tasks` | No | List available tasks (filtered by tier) |
| GET | `/api/tasks/:taskId` | Yes | Get task detail + check access |
| POST | `/api/tasks/:taskId/submit` | Yes | Submit task work |
| GET | `/api/tasks/:taskId/submissions/my` | Yes | Get my submission |

### Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/users/auth` | No | Authenticate wallet, sync from chain |
| GET | `/api/users/me` | Yes | Get profile + recent submissions |
| GET | `/api/users/leaderboard` | No | Get leaderboard (all/week/month) |
| PATCH | `/api/users/profile` | Yes | Update profile |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/admin/tasks` | Admin | Create new task |
| GET | `/api/admin/submissions/pending` | Admin | List pending reviews |
| POST | `/api/admin/submissions/:id/review` | Admin | Approve/reject + mint points |
| GET | `/api/admin/analytics` | Admin | Platform metrics |
| POST | `/api/admin/sync-user` | Admin | Force sync user from chain |

## Key Features

- **Free registration** — no staking required
- **5 vertical tiers** — Scout → Operator → Specialist → Expert → Architect
- **Horizontal modality badges** — Bronze/Silver/Gold/Platinum per domain
- **Task gating** — tasks can require specific tier + badge level
- **Referrals** — 5% of referee points to referrer
- **Optional vault** — deposit USDG for point multipliers, instant withdraw
- **Streaming** — Superfluid-style vesting (3/6/9/12 months)
- **Genre themes** — each task category has its own UI skin
- **Weekly caps** — prevents point inflation
- **Accuracy penalties** — stops bot farms
- **Verifier bot** — automated approval for simple tasks
- **IPFS storage** — task assets stored decentrally
- **Admin dashboard** — analytics, task creation, review queue

## Rank System

### Vertical: Platform Tiers
| Tier | Requirement | Multiplier | Weekly Cap |
|------|-------------|------------|------------|
| Scout | Sign up | 1.0x | 500 pts |
| Operator | 50 tasks, 85% accuracy | 1.5x | 1,500 pts |
| Specialist | 200 tasks, 90% accuracy | 2.5x | 3,000 pts |
| Expert | 500 tasks, 95% accuracy | 4.0x | 5,000 pts |
| Architect | Invite only | 6.0x | 10,000 pts |

### Horizontal: Modality Badges
| Badge | Tasks | Accuracy | Unlocks |
|-------|-------|----------|---------|
| Bronze | 20 | 85% | Tier 1-2 tasks in modality |
| Silver | 100 | 90% | Tier 3 tasks in modality |
| Gold | 250 | 95% | Tier 4 tasks + review rights |
| Platinum | 500 | 98% | Tier 5 tasks + governance |

**Example**: A user can be **Tier 3 Specialist** overall but hold **Gold Robotics Badge** + **Silver Vision Badge**. They can do Tier 3 robotics tasks and Tier 3 vision tasks, but NOT Tier 3 medical tasks (no Medical Badge).

## Tech Stack

| Layer | Tech |
|-------|------|
| Blockchain | Robinhood Chain (EVM, ID 4663/46630) |
| Smart Contracts | Solidity 0.8.20, OpenZeppelin, Foundry/Hardhat |
| Frontend | React 18, Vite, RainbowKit, wagmi v2, TanStack Query |
| Backend | Node.js 20, Express 4, MongoDB 7, Redis 7 |
| File Storage | IPFS (Infura/Pinata) |
| Deployment | Docker, Docker Compose, GitHub Actions |
| Reverse Proxy | nginx |

## License

MIT
