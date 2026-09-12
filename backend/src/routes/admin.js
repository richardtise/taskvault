const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const User = require('../models/User');
const DailyStats = require('../models/Analytics');
const blockchain = require('../services/blockchain');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

// POST /api/admin/tasks — Create new task
router.post('/tasks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const task = new Task({
      ...req.body,
      createdBy: req.user.walletAddress,
      taskId: `${req.body.category}-${Date.now()}`,
    });

    await task.save();
    logger.info(`Task created: ${task.taskId} by ${req.user.walletAddress}`);

    res.json({ success: true, task });
  } catch (error) {
    logger.error(`Create task error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// GET /api/admin/submissions/pending — List pending submissions
router.get('/submissions/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const submissions = await Submission.find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // taskId is a string, not an ObjectId — fetch tasks manually
    const taskIds = [...new Set(submissions.map(s => s.taskId))];
    const tasks = await Task.find({ taskId: { $in: taskIds } });
    const taskById = new Map(tasks.map(t => [t.taskId, t]));

    res.json({
      submissions: submissions.map(s => ({
        ...s.toObject(),
        task: taskById.get(s.taskId) || null,
      })),
      total: await Submission.countDocuments({ status: 'pending' }),
      page: Number(page)
    });
  } catch (error) {
    logger.error(`List pending error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// POST /api/admin/submissions/:id/review — Review a submission
router.post('/submissions/:id/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { correct, notes, score } = req.body;
    const submission = await Submission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.status !== 'pending') {
      return res.status(400).json({ error: 'Already reviewed' });
    }

    // Get task details
    const task = await Task.findOne({ taskId: submission.taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Mark as under review first to prevent double-review races
    const claimed = await Submission.updateOne(
      { _id: submission._id, status: 'pending' },
      { $set: { status: 'under_review', verifierAddress: req.user.walletAddress } }
    );
    if (claimed.modifiedCount === 0) {
      return res.status(409).json({ error: 'Submission is being reviewed by someone else' });
    }

    // Call blockchain to verify and mint points
    let result;
    try {
      result = await blockchain.verifyTask(
        submission.userAddress,
        submission.taskId,
        task.basePoints,
        correct,
        task.modality
      );
    } catch (chainError) {
      // Roll back the claim so the submission can be reviewed again
      await Submission.updateOne(
        { _id: submission._id },
        { $set: { status: 'pending' }, $unset: { verifierAddress: 1 } }
      );
      throw chainError;
    }

    // Update submission
    submission.status = correct ? 'approved' : 'rejected';
    submission.correct = correct;
    submission.verifierAddress = req.user.walletAddress;
    submission.verificationNotes = notes;
    submission.verificationScore = score;
    submission.txHash = result.txHash;
    submission.pointsAwarded = result.pointsAwarded;
    submission.reviewedAt = new Date();

    try {
      await submission.save();
    } catch (dbError) {
      // Chain succeeded but DB failed — flag for manual reconciliation
      logger.error(`CRITICAL: chain tx ${result.txHash} succeeded but DB update failed: ${dbError.message}`);
      return res.status(500).json({
        error: 'Points issued on-chain but failed to save review. Reconcile manually.',
        txHash: result.txHash,
        pointsAwarded: result.pointsAwarded,
      });
    }

    // Update user stats. NOTE: tasksCompleted/tasksCorrect/totalPoints are
    // authoritative on-chain; these DB counters are for fast queries only and
    // are overwritten on chain sync. weeklyPoints/monthlyPoints are DB-only
    // (used for the period leaderboard).
    await User.updateOne(
      { walletAddress: submission.userAddress },
      {
        $inc: {
          tasksCompleted: 1,
          tasksCorrect: correct ? 1 : 0,
          totalPoints: result.pointsAwarded,
          weeklyPoints: correct ? result.pointsAwarded : 0,
          monthlyPoints: correct ? result.pointsAwarded : 0,
        },
        lastActive: new Date()
      }
    );

    logger.info(`Submission reviewed: ${submission._id}, Approved: ${correct}, Points: ${result.pointsAwarded}`);

    res.json({
      success: true,
      submission,
      txHash: result.txHash,
      pointsAwarded: result.pointsAwarded
    });
  } catch (error) {
    logger.error(`Review submission error: ${error.message}`);
    res.status(500).json({ error: 'Failed to review submission' });
  }
});

// GET /api/admin/analytics — Platform analytics
router.get('/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const stats = await DailyStats.find({
      date: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
    }).sort({ date: 1 });

    const totals = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalPoints: { $sum: '$totalPoints' },
          totalTasks: { $sum: '$tasksCompleted' }
        }
      }
    ]);

    const pendingSubmissions = await Submission.countDocuments({ status: 'pending' });
    const activeTasks = await Task.countDocuments({ status: 'active' });

    res.json({
      dailyStats: stats,
      totals: totals[0] || {},
      pendingSubmissions,
      activeTasks
    });
  } catch (error) {
    logger.error(`Analytics error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// POST /api/admin/appeals/:submissionId/resolve
router.post('/appeals/:submissionId/resolve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { resolution, overrideStatus } = req.body; // 'upheld' or 'overturned'
    const submission = await Submission.findById(req.params.submissionId);

    if (!submission || !submission.disputed) {
      return res.status(404).json({ error: 'No active appeal found' });
    }

    submission.disputeResolution = resolution;
    if (overrideStatus) {
      submission.status = overrideStatus;
      if (overrideStatus === 'approved') {
        // TODO: re-issue points on-chain if the original review was rejected.
        // await blockchain.verifyTask(submission.userAddress, submission.taskId, ...);
      }
    }
    await submission.save();

    if (resolution === 'overturned') {
      await User.updateOne(
        { walletAddress: submission.userAddress },
        { $inc: { strikes: -1 } }
      );
    }

    res.json({ success: true, message: `Appeal ${resolution}` });
  } catch (error) {
    logger.error(`Resolve appeal error: ${error.message}`);
    res.status(500).json({ error: 'Failed to resolve appeal' });
  }
});

// POST /api/admin/sync-user — Force sync user from chain
router.post('/sync-user', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { walletAddress } = req.body;
    const chainData = await blockchain.syncUserFromChain(walletAddress);

    if (!chainData) {
      return res.status(404).json({ error: 'User not found on chain' });
    }

    await User.findOneAndUpdate(
      { walletAddress: walletAddress.toLowerCase() },
      {
        tierIndex: chainData.tierIndex,
        totalPoints: chainData.balance,
        lifetimeEarned: chainData.lifetimeEarned,
        tasksCompleted: chainData.tasksCompleted,
        tasksCorrect: chainData.tasksCorrect,
        accuracy: chainData.accuracy,
        badges: chainData.badges,
        lastSynced: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, data: chainData });
  } catch (error) {
    logger.error(`Sync user error: ${error.message}`);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

module.exports = router;
