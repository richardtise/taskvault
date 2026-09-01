# TaskVault Frontend v3

## What's New

### 1. Readable First
- No more blinding Matrix rain. Background is now a subtle, atmospheric grid that doesn't fight the text.
- High contrast text on dark panels. Clean Inter font for UI, JetBrains Mono for data.
- Everything is scannable. No gimmicks that hurt usability.

### 2. No TGE Marketing
- Copy focuses on "points" and "reputation" — vague on token conversion.
- Let users speculate. Don't promise.

### 3. Free Registration
- `register(address referrer)` — completely free, no staking required.
- Tiers unlock by task count + accuracy, not deposits.

### 4. Optional Vault
- Vault deposits are **optional bonuses**, not gates.
- Deposit USDG for point multipliers.
- Withdraw instantly.
- Create Superfluid-style streams (3/6/9/12 month vesting).

### 5. Genre-Specific Task Rooms
When you click a task, the entire UI theme shifts to match the work:

| Genre | Vibe |
|-------|------|
| **Writing** | White/cream editorial. Georgia serif. Clean document feel. |
| **Robotics** | Dark industrial. Amber grid overlay. Technical readouts. |
| **LLM** | Dark purple/blue. Split-screen comparison UI. |
| **Vision** | Dark canvas. Image focus. Annotation tools. |
| **Audio** | Dark green. Waveform visualization. |
| **Safety** | Dark red. Warning stripes. Alert UI. |

### 6. Theme System
- CSS custom properties update dynamically when entering/exiting tasks.
- Smooth 0.5s transitions between themes.
- Background effect changes per genre (subtle, never overwhelming).

## Install

```bash
npm install
```

## Configure

```bash
cp .env.example .env
# Add your contract addresses
```

## Run

```bash
npm run dev
```

## Deploy

```bash
npm run build
```

## Contract Requirements

Your TaskVault.sol needs these functions:

```solidity
function register(address referrer) external;
function depositToVault(uint256 amount) external;
function withdrawFromVault(uint256 amount) external;
function createStream(uint256 amount, uint256 durationSeconds) external;
function getUserInfo(address user) external view returns (
    bool exists,
    uint8 tierIndex,
    uint256 balance,
    uint256 lifetimeEarned,
    uint256 referralEarnings,
    uint256 referralCount,
    uint256 tasksCompleted,
    uint256 vaultBalance,
    uint256 vaultMultiplier,
    uint256 activeStreams
);
```
