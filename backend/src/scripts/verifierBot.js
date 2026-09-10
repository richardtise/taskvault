const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Task = require('../models/Task');
const User = require('../models/User');
const blockchain = require('../services/blockchain');
const verification = require('../services/verification');
const logger = require('../utils/logger');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/taskvault')
  .then(() => logger.info('Verifier bot connected'))
  .catch(err => { logger.error(err.message); process.exit(1); });

class VerifierBot {
  constructor() {
    this.running = false;
    this.interval = 30000;
  }

  async start() {
    this.running = true;
    logger.info('Verifier bot started');
    while (this.running) {
      try { await this.processBatch(); } 
      catch (e) { logger.error(`Batch error: ${e.message}`); }
      await new Promise(r => setTimeout(r, this.interval));
    }
  }

  async processBatch() {
    const subs = await Submission.find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(10);

    if (!subs.length) return;

    for (const sub of subs) {
      try {
        const verdict = await verification.verify(sub);
        const task = await Task.findOne({ taskId: sub.taskId });

        sub.status = verdict.approved ? 'approved' : 'rejected';
        sub.correct = verdict.approved;
        sub.verificationScore = Math.round(verdict.confidence * 100);
        sub.verificationNotes = verdict.flags.join(', ');
        sub.reviewedAt = new Date();

        if (verdict.approved) {
          const result = await blockchain.verifyTask(
            sub.userAddress, sub.taskId, task.basePoints, true, task.modality
          );
          sub.txHash = result.txHash;
          sub.pointsAwarded = verdict.points;
        }

        await sub.save();

        await User.updateOne(
          { walletAddress: sub.userAddress },
          {
            $inc: { tasksCompleted: 1, totalPoints: verdict.points || 0 },
            lastActive: new Date()
          }
        );

        logger.info(`Verified ${sub._id}: ${verdict.approved ? 'APPROVED' : 'REJECTED'} flags=[${verdict.flags.join(',')}]`);
      } catch (e) {
        logger.error(`Failed ${sub._id}: ${e.message}`);
      }
    }
  }

  stop() {
    this.running = false;
    logger.info('Verifier bot stopped');
  }
}

if (require.main === module) {
  const bot = new VerifierBot();
  process.on('SIGINT', () => { bot.stop(); mongoose.connection.close(); process.exit(0); });
  bot.start();
}

module.exports = VerifierBot;
