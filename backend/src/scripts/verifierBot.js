const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Task = require('../models/Task');
const User = require('../models/User');
const blockchain = require('../services/blockchain');
const logger = require('../utils/logger');
require('dotenv').config();

// Connect to DB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/taskvault')
  .then(() => logger.info('Verifier bot connected to MongoDB'))
  .catch(err => {
    logger.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  });

class VerifierBot {
  constructor() {
    this.running = false;
    this.interval = 30000; // Check every 30 seconds
  }

  async start() {
    this.running = true;
    logger.info('Verifier bot started');

    while (this.running) {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error(`Verifier batch error: ${error.message}`);
      }

      await this.sleep(this.interval);
    }
  }

  async processBatch() {
    // Fetch pending submissions
    const submissions = await Submission.find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(10)
      .populate('taskId');

    if (submissions.length === 0) return;

    logger.info(`Processing ${submissions.length} pending submissions`);

    for (const sub of submissions) {
      try {
        await this.verifySubmission(sub);
      } catch (error) {
        logger.error(`Failed to verify submission ${sub._id}: ${error.message}`);
      }
    }
  }

  async verifySubmission(submission) {
    const task = await Task.findOne({ taskId: submission.taskId });
    if (!task) {
      logger.warn(`Task not found for submission ${submission._id}`);
      return;
    }

    // Determine if correct based on verification type
    let correct = false;
    let score = 0;

    switch (task.verificationType) {
      case 'automated':
        ({ correct, score } = await this.automatedVerify(submission, task));
        break;
      case 'consensus':
        ({ correct, score } = await this.consensusVerify(submission, task));
        break;
      case 'manual':
      case 'peer_review':
      default:
        // Skip — requires human review
        return;
    }

    // Update submission
    submission.status = correct ? 'approved' : 'rejected';
    submission.correct = correct;
    submission.verificationScore = score;
    submission.verifierAddress = process.env.ADMIN_WALLET;
    submission.reviewedAt = new Date();

    // Call blockchain
    const result = await blockchain.verifyTask(
      submission.userAddress,
      submission.taskId,
      task.basePoints,
      correct,
      task.modality
    );

    submission.txHash = result.txHash;
    submission.pointsAwarded = result.pointsAwarded;

    await submission.save();

    // Update user
    await User.updateOne(
      { walletAddress: submission.userAddress },
      {
        $inc: { tasksCompleted: 1, totalPoints: result.pointsAwarded },
        lastActive: new Date()
      }
    );

    logger.info(`Submission ${submission._id} verified. Approved: ${correct}, Points: ${result.pointsAwarded}`);
  }

  async automatedVerify(submission, task) {
    // Placeholder for automated verification logic
    // e.g. check if LLM response matches expected pattern
    // e.g. check if image annotation has required fields

    // For now, auto-approve if answer is not empty and has minimum length
    const answer = JSON.stringify(submission.answer);
    const minLength = task.verificationConfig?.minLength || 10;

    if (answer.length >= minLength) {
      return { correct: true, score: 80 };
    }

    return { correct: false, score: 30 };
  }

  async consensusVerify(submission, task) {
    // Placeholder for consensus verification
    // Would compare against other submissions for same task

    const consensusThreshold = task.verificationConfig?.consensusThreshold || 0.7;
    const requiredReviews = task.verificationConfig?.requiredReviews || 3;

    if (submission.peerReviews.length >= requiredReviews) {
      const avgScore = submission.peerReviews.reduce((a, b) => a + b.score, 0) / submission.peerReviews.length;
      return { correct: avgScore >= (consensusThreshold * 100), score: avgScore };
    }

    // Not enough reviews yet
    return { correct: false, score: 0 };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.running = false;
    logger.info('Verifier bot stopped');
  }
}

// Start if run directly
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
