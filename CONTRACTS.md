# TaskVault Contract Architecture

## Overview

Two main contracts:
1. **TaskVaultPoints** — Soulbound ERC20 point token
2. **TaskVault** — Core logic for registration, tasks, tiers, badges, referrals, vault, streaming

## TaskVaultPoints.sol

### Purpose
Non-transferable point token. Only the TaskVault contract can mint/burn. Can be made transferable later via `enableTransfers()`.

### Key Functions

| Function | Access | Description |
|----------|--------|-------------|
| `mint(address to, uint256 amount)` | MINTER_ROLE | Mint points to user |
| `burn(address from, uint256 amount)` | BURNER_ROLE | Burn points from user |
| `enableTransfers()` | Admin | Make token transferable (irreversible) |
| `setTransferWhitelist(address, bool)` | Admin | Allow specific addresses to transfer before global enable |

### Constants
- `MAX_SUPPLY = 100,000,000 TVP`

## TaskVault.sol

### Tiers (Vertical Progression)

| # | Name | Min Tasks | Min Accuracy | Multiplier | Weekly Cap |
|---|------|-----------|--------------|------------|------------|
| 0 | Scout | 0 | — | 1.0x | 500 pts |
| 1 | Operator | 50 | 85% | 1.5x | 1,500 pts |
| 2 | Specialist | 200 | 90% | 2.5x | 3,000 pts |
| 3 | Expert | 500 | 95% | 4.0x | 5,000 pts |
| 4 | Architect | Invite | 98% | 6.0x | 10,000 pts |

### Badges (Horizontal Specialization)

| Level | Tasks | Accuracy | Color |
|-------|-------|----------|-------|
| None | 0 | — | Gray |
| Bronze | 20 | 85% | #cd7f32 |
| Silver | 100 | 90% | #c0c0c0 |
| Gold | 250 | 95% | #ffd700 |
| Platinum | 500 | 98% | #e5e4e2 |

**Default Modalities**: Robotics, LLM Evaluation, Computer Vision, Audio Processing, Writing & Research, Safety & Redteam, Medical Imaging.

**Admin can add new modalities** via `registerModality(bytes32 hash, string name)`.

### Vault Bonuses

| Deposit | Bonus Multiplier |
|---------|-----------------|
| 100+ USDG | +0.25x |
| 500+ USDG | +0.5x |
| 2,000+ USDG | +1.0x |
| 5,000+ USDG | +2.0x |

### Key Functions

#### Registration
```solidity
function register(address referrer) external
```
- Free. No deposits.
- Optional referrer (must be registered, not self, max 50 refs)

#### Task Completion (Verifier Only)
```solidity
// Generic task (no badge tracking)
function completeTask(address worker, bytes32 taskId, uint256 basePoints, bool correct) external

// Modality task (tracks badge progress)
function completeTaskWithModality(
    address worker, 
    bytes32 taskId, 
    uint256 basePoints, 
    bool correct,
    bytes32 modality
) external
```
- Only `VERIFIER_ROLE` can call
- Calculates final points with tier + vault multipliers
- Applies weekly caps
- Issues referral bonus (5%)
- Auto-upgrades tier if thresholds met
- Updates modality badge if `completeTaskWithModality` used

#### Badge Queries
```solidity
function getBadge(address user, bytes32 modality) external view returns (Badge memory)
function getAllBadges(address user) external view returns (bytes32[] memory modalities, Badge[] memory badges)
function canAccessTask(address user, uint8 requiredTier, bytes32 requiredModality, BadgeLevel requiredBadge) external view returns (bool)
```

#### Vault
```solidity
function depositToVault(uint256 amount) external
function withdrawFromVault(uint256 amount) external
```

#### Streaming
```solidity
function createStream(uint256 amount, uint256 durationSeconds) external
function claimStream(uint256 streamIndex) external
function cancelStream(uint256 streamIndex) external
```

#### Admin
```solidity
function inviteArchitect(address user) external
function addVerifier(address verifier) external
function registerModality(bytes32 modalityHash, string memory name) external
function setBadgeThresholds(uint256[4] memory tasks, uint256[4] memory accuracy) external
```

### Anti-Gaming

| Mechanic | Implementation |
|----------|---------------|
| Weekly caps | Per-tier limit, resets every 7 days |
| Accuracy penalty | Below 70% → 50% point reduction |
| Referral fraud | 10-task gate before referrer earns (enforced off-chain in UI) |
| Self-referral | Blocked in contract |
| Max referrals | 50 per wallet |

### Events

```solidity
event Registered(address indexed user, address indexed referrer);
event TaskCompleted(address indexed user, bytes32 indexed taskId, uint256 points, bool correct);
event TaskCompletedWithModality(address indexed user, bytes32 indexed taskId, bytes32 indexed modality, uint256 points);
event TierUpgraded(address indexed user, uint8 newTier);
event BadgeUpgraded(address indexed user, bytes32 indexed modality, BadgeLevel newLevel);
event VaultDeposit(address indexed user, uint256 amount);
event VaultWithdraw(address indexed user, uint256 amount);
event StreamCreated(address indexed user, uint256 index, uint256 amount, uint256 duration);
event StreamClaimed(address indexed user, uint256 index, uint256 amount);
event StreamCancelled(address indexed user, uint256 index, uint256 forfeited);
event ArchitectInvited(address indexed user);
event ModalityRegistered(bytes32 indexed modality, string name);
```

## Access Control

| Role | Holders | Powers |
|------|---------|--------|
| DEFAULT_ADMIN_ROLE | Deployer | Everything |
| ADMIN_ROLE | Deployer | Invite architects, set caps/thresholds, register modalities |
| VERIFIER_ROLE | Deployer + bots | Complete tasks, mint points |
| MINTER_ROLE | TaskVault contract | Mint TVP points |
| BURNER_ROLE | TaskVault contract | Burn TVP points |

## Upgrade Path

Current contracts are not upgradeable. For production, consider:
- UUPS proxy pattern (OpenZeppelin)
- Timelock controller for admin actions
- Multisig for admin key
