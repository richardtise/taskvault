'use strict';

const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { requireEnv } = require('../config/env');

// ABI fragments we need.
const VAULT_ABI = [
  'function completeTask(address worker, bytes32 taskId, uint256 basePoints, bool correct) external',
  'function completeTaskWithModality(address worker, bytes32 taskId, uint256 basePoints, bool correct, bytes32 modality) external',
  'function getUserInfo(address user) external view returns (bool exists, uint8 tierIndex, uint256 balance, uint256 lifetimeEarned, uint256 referralEarnings, uint256 referralCount, uint256 tasksCompleted, uint256 tasksCorrect, uint256 vaultBalance, uint256 vaultMultiplier, uint256 activeStreams)',
  'function getBadge(address user, bytes32 modality) external view returns (uint8 level, uint256 tasksCompleted, uint256 tasksCorrect, uint256 lastUpgraded)',
  'function canAccessTask(address user, uint8 requiredTier, bytes32 requiredModality, uint8 requiredBadge) external view returns (bool)',
  'function getRegisteredModalities() external view returns (bytes32[])',
  'event TaskCompleted(address indexed user, bytes32 indexed taskId, uint256 points, bool correct)',
];

// Modality names registered in the TaskVault constructor. The contract stores
// keccak256(name) — NOT a right-padded bytes32 — so we must use ethers.id().
const MODALITY_NAMES = ['robotics', 'llm', 'vision', 'audio', 'writing', 'safety', 'medical'];

/** keccak256 of the lower-cased modality name, matching the contract's registry. */
const modalityHash = (name) => ethers.id(String(name).trim().toLowerCase());

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Accepts either an already-hashed 32-byte modality (0x + 64 hex) or a plain
 * name such as "robotics" / "llm" and returns the on-chain bytes32 hash.
 *
 * This is the fix for the original integration bug: the DB stores human-readable
 * modality names, but the contract keys badges by keccak256(name).
 */
const toBytes32 = (value, fieldName) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (BYTES32_RE.test(trimmed)) return trimmed.toLowerCase();
  return modalityHash(trimmed);
};

class BlockchainService {
  constructor() {
    this._vault = null;
    this._wallet = null;
    this._provider = null;
  }

  /** Lazily build the provider/wallet/contract so a bad env var can't crash boot. */
  _init() {
    if (this._vault) return;

    const rpcUrl = requireEnv('RPC_URL');
    const privateKey = requireEnv('PRIVATE_KEY');
    const vaultAddress = requireEnv('VAULT_ADDRESS');

    if (!ethers.isAddress(vaultAddress)) {
      throw new Error(`VAULT_ADDRESS is not a valid address: ${vaultAddress}`);
    }

    this._provider = new ethers.JsonRpcProvider(rpcUrl);
    this._wallet = new ethers.Wallet(privateKey, this._provider);
    this._vault = new ethers.Contract(vaultAddress, VAULT_ABI, this._wallet);

    logger.info(`Blockchain service initialised. Verifier: ${this._wallet.address}`);
  }

  get vault() {
    this._init();
    return this._vault;
  }

  get verifierAddress() {
    this._init();
    return this._wallet.address;
  }

  /** True when the required chain env vars are present without throwing. */
  isConfigured() {
    try {
      this._init();
      return true;
    } catch {
      return false;
    }
  }

  async verifyTask(worker, taskId, basePoints, correct, modality = null) {
    try {
      const workerAddress = ethers.getAddress(worker);
      const taskHash = ethers.id(String(taskId));
      const points = ethers.parseUnits(String(basePoints), 18);

      let tx;
      if (modality) {
        tx = await this.vault.completeTaskWithModality(
          workerAddress,
          taskHash,
          points,
          correct,
          toBytes32(modality, 'task.modality')
        );
      } else {
        tx = await this.vault.completeTask(workerAddress, taskHash, points, correct);
      }

      const receipt = await tx.wait();
      logger.info(
        `Task verified on-chain. Worker: ${workerAddress}, Task: ${taskId}, Tx: ${tx.hash}`
      );

      // Parse the TaskCompleted event for the authoritative points awarded.
      let pointsAwarded = 0;
      for (const log of receipt.logs) {
        try {
          const parsed = this.vault.interface.parseLog(log);
          if (parsed && parsed.name === 'TaskCompleted') {
            pointsAwarded = Number(ethers.formatUnits(parsed.args.points, 18));
            break;
          }
        } catch {
          // Not one of our events.
        }
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
      const tasksCompleted = Number(info.tasksCompleted);
      return {
        exists: info.exists,
        tierIndex: Number(info.tierIndex),
        balance: Number(ethers.formatUnits(info.balance, 18)),
        lifetimeEarned: Number(ethers.formatUnits(info.lifetimeEarned, 18)),
        referralEarnings: Number(ethers.formatUnits(info.referralEarnings, 18)),
        referralCount: Number(info.referralCount),
        tasksCompleted,
        tasksCorrect: Number(info.tasksCorrect),
        accuracy:
          tasksCompleted > 0
            ? (Number(info.tasksCorrect) / tasksCompleted) * 100
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
      } catch {
        // Badge lookup is best-effort; never fail a sync over it.
      }
    }

    return { ...info, badges };
  }
}

module.exports = new BlockchainService();
module.exports.modalityHash = modalityHash;
module.exports.toBytes32 = toBytes32;
module.exports.MODALITY_NAMES = MODALITY_NAMES;
