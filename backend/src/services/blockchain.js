const { ethers } = require('ethers');
const logger = require('../utils/logger');

// ABI fragments we need
const VAULT_ABI = [
  "function completeTask(address worker, bytes32 taskId, uint256 basePoints, bool correct) external",
  "function completeTaskWithModality(address worker, bytes32 taskId, uint256 basePoints, bool correct, bytes32 modality) external",
  "function getUserInfo(address user) external view returns (bool exists, uint8 tierIndex, uint256 balance, uint256 lifetimeEarned, uint256 referralEarnings, uint256 referralCount, uint256 tasksCompleted, uint256 tasksCorrect, uint256 vaultBalance, uint256 vaultMultiplier, uint256 activeStreams)",
  "function getBadge(address user, bytes32 modality) external view returns (uint8 level, uint256 tasksCompleted, uint256 tasksCorrect, uint256 lastUpgraded)",
  "function canAccessTask(address user, uint8 requiredTier, bytes32 requiredModality, uint8 requiredBadge) external view returns (bool)",
  "event TaskCompleted(address indexed user, bytes32 indexed taskId, uint256 points, bool correct)",
];

// Modality names registered in the contract constructor.
// The contract stores keccak256(name); we must use ethers.id(name) — NOT encodeBytes32String.
const MODALITY_NAMES = ['robotics', 'llm', 'vision', 'audio', 'writing', 'safety', 'medical'];

const modalityHash = (name) => ethers.id(name); // keccak256(name)

const toBytes32 = (value, fieldName) => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${fieldName} must be a 0x-prefixed 32-byte hex string`);
  }
  return value.toLowerCase();
};

class BlockchainService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
    this.vault = new ethers.Contract(process.env.VAULT_ADDRESS, VAULT_ABI, this.wallet);

    logger.info(`Blockchain service initialized. Verifier: ${this.wallet.address}`);
  }

  async verifyTask(worker, taskId, basePoints, correct, modality = null) {
    try {
      let tx;
      if (modality) {
        tx = await this.vault.completeTaskWithModality(
          worker,
          ethers.id(taskId),
          ethers.parseUnits(basePoints.toString(), 18),
          correct,
          toBytes32(modality, 'task.modality')
        );
      } else {
        tx = await this.vault.completeTask(
          worker,
          ethers.id(taskId),
          ethers.parseUnits(basePoints.toString(), 18),
          correct
        );
      }

      const receipt = await tx.wait();
      logger.info(`Task verified on-chain. Worker: ${worker}, Task: ${taskId}, Tx: ${tx.hash}`);

      // Parse event for points awarded
      const event = receipt.logs.find(log => {
        try {
          const parsed = this.vault.interface.parseLog(log);
          return parsed && parsed.name === 'TaskCompleted';
        } catch { return false; }
      });

      let pointsAwarded = 0;
      if (event) {
        const parsed = this.vault.interface.parseLog(event);
        pointsAwarded = Number(ethers.formatUnits(parsed.args.points, 18));
      }

      return { success: true, txHash: tx.hash, pointsAwarded };
    } catch (error) {
      logger.error(`Failed to verify task: ${error.message}`);
      throw error;
    }
  }

  async getUserInfo(address) {
    try {
      const info = await this.vault.getUserInfo(address);
      return {
        exists: info.exists,
        tierIndex: Number(info.tierIndex),
        balance: Number(ethers.formatUnits(info.balance, 18)),
        lifetimeEarned: Number(ethers.formatUnits(info.lifetimeEarned, 18)),
        referralEarnings: Number(ethers.formatUnits(info.referralEarnings, 18)),
        referralCount: Number(info.referralCount),
        tasksCompleted: Number(info.tasksCompleted),
        tasksCorrect: Number(info.tasksCorrect),
        accuracy: Number(info.tasksCompleted) > 0
          ? (Number(info.tasksCorrect) / Number(info.tasksCompleted)) * 100
          : 100,
        vaultBalance: Number(ethers.formatUnits(info.vaultBalance, 6)),
        vaultMultiplier: Number(info.vaultMultiplier) / 10000,
        activeStreams: Number(info.activeStreams),
      };
    } catch (error) {
      logger.error(`Failed to get user info: ${error.message}`);
      return null;
    }
  }

  async canAccessTask(address, requiredTier, requiredModality, requiredBadge) {
    try {
      return await this.vault.canAccessTask(
        address,
        requiredTier,
        requiredModality ? toBytes32(requiredModality, 'requiredModality') : ethers.ZeroHash,
        requiredBadge
      );
    } catch (error) {
      logger.error(`canAccessTask failed: ${error.message}`);
      return false;
    }
  }

  async syncUserFromChain(address) {
    const info = await this.getUserInfo(address);
    if (!info) return null;

    // Fetch all badges
    const badges = [];

    for (const mod of MODALITY_NAMES) {
      try {
        const badge = await this.vault.getBadge(address, modalityHash(mod));
        if (badge.level > 0) {
          badges.push({
            modality: mod,
            level: Number(badge.level),
            tasksCompleted: Number(badge.tasksCompleted),
          });
        }
      } catch { /* ignore */ }
    }

    return { ...info, badges };
  }
}

module.exports = new BlockchainService();
