'use strict';

const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Task = require('../models/Task');
const User = require('../models/User');
const blockchain = require('../services/blockchain');
const verification = require('../services/verification');
const { get } = require('../config/env');
const logger = require('../utils/logger');
require('dotenv').config();

/** Give up (and park the submission) after this many failed chain attempts. */
const MAX_CHAIN_ATTEMPTS = 5;

class VerifierBot {
  constructor() {
    this.running = false;
    this.interval = Number(process.env.VERIFIER_INTERVAL_MS) || 30000;
    this.batchSize = Number(process.env.VERIFIER_BATCH_SIZE) || 10;
  }

  async start() {
    if (!blockchain.isConfigured()) {
      logger.error(
        'Verifier bot cannot start: RPC_URL, VAULT_ADDRESS and PRIVATE_KEY must all be set.'
      );
      process.exit(1);
    }

    const mongoUri = get('MONGODB_URI');
    if (!mongoUri) {
      logger.error('Verifier bot cannot start: MONGODB_URI is not set.');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    logger.info('Verifier bot connected to MongoDB');

    this.running = true;
    logger.info(`Verifier bot started (verifier=${blockchain.verifierAddress})`);

    while (this.running) {
      try {
        await this.processBatch();
      } catch (e) {
        logger.error(`Batch error: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, this.interval));
    }
  }

  async processBatch() {
    // Only look at ids first; we claim each one atomically below so that running
    // more than one verifier (or an admin reviewing concurrently) cannot
    // double-process the same submission.
    const candidates = await Submission.find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(this.batchSize)
      .select('_id');

    if (!candidates.length) return;

    for (const { _id } of candidates) {
      await this.processOne(_id);
    }
  }

  async processOne(submissionId) {
    // Atomic claim: only one worker can move pending -> under_review.
    const claimed = await Submission.findOneAndUpdate(
      { _id: submissionId, status: 'pending' },
      { $set: { status: 'under_review', verifierAddress: blockchain.verifierAddress } },
      { new: true }
    );
    if (!claimed) return;

    try {
      const verdict = await verification.verify(claimed);
      const task = await Task.findOne({ taskId: claimed.taskId });
      if (!task) {
        await this.fail(claimed, 'Task no longer exists');
        return;
      }

      claimed.correct = verdict.approved;
      claimed.verificationScore = Math.round(verdict.confidence * 100);
      claimed.verificationNotes = verdict.flags.join(', ');
      claimed.reviewedAt = new Date();

      if (!verdict.approved) {
        claimed.status = 'rejected';
        await claimed.save();
        logger.info(
          `Rejected ${claimed._id} flags=[${verdict.flags.join(',')}] confidence=${verdict.confidence}`
        );
        return;
      }

      // Approved — mint on-chain. The contract is the source of truth for points.
      let result;
      try {
        result = await blockchain.verifyTask(
          claimed.userAddress,
          claimed.taskId,
          task.basePoints,
          true,
          task.modality
        );
      } catch (chainErr) {
        await this.retryOrFail(claimed, chainErr);
        return;
      }

      claimed.status = 'approved';
      claimed.txHash = result.txHash;
      // Authoritative on-chain amount, not the off-chain estimate.
      claimed.pointsAwarded = result.pointsAwarded;
      await claimed.save();

      await User.updateOne(
        { walletAddress: claimed.userAddress },
        {
          $inc: {
            tasksCompleted: 1,
            tasksCorrect: 1,
            totalPoints: result.pointsAwarded,
            weeklyPoints: result.pointsAwarded,
            monthlyPoints: result.pointsAwarded,
          },
          $set: { lastActive: new Date() },
        },
        { upsert: true }
      );

      logger.info(
        `Approved ${claimed._id} points=${result.pointsAwarded} tx=${result.txHash}`
      );
    } catch (e) {
      logger.error(`Failed ${submissionId}: ${e.message}`);
      await this.retryOrFail(claimed, e);
    }
  }

  /** Chain/verification failure: requeue a bounded number of times, then park. */
  async retryOrFail(submission, error) {
    const attempts = (submission.chainAttempts || 0) + 1;
    if (attempts < MAX_CHAIN_ATTEMPTS) {
      await Submission.updateOne(
        { _id: submission._id },
        {
          $set: {
            status: 'pending',
            chainAttempts: attempts,
            verificationNotes: `chain attempt ${attempts} failed: ${error.message}`,
          },
          $unset: { verifierAddress: 1 },
        }
      );
      logger.warn(`Requeued ${submission._id} after chain error (attempt ${attempts})`);
    } else {
      await this.fail(submission, `chain failed ${attempts}x: ${error.message}`);
    }
  }

  async fail(submission, note) {
    await Submission.updateOne(
      { _id: submission._id },
      { $set: { status: 'failed', verificationNotes: note, reviewedAt: new Date() } }
    );
    logger.error(`Submission ${submission._id} marked failed: ${note}`);
  }

  stop() {
    this.running = false;
    logger.info('Verifier bot stopped');
  }
}

if (require.main === module) {
  const bot = new VerifierBot();
  process.on('SIGINT', () => {
    bot.stop();
    mongoose.connection.close();
    process.exit(0);
  });
  bot.start();
}

module.exports = VerifierBot;
