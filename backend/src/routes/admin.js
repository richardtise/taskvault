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
      .limit(Number(limit))
      .populate('taskId');

    const total = await Submission.countDocuments({ status: 'pending' });

    res.json({ submissions, total, page: Number(page) });
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

    // Call blockchain to verify and mint points
    const result = await blockchain.verifyTask(
      submission.userAddress,
      submission.taskId,
      task.basePoints,
      correct,
      task.modality
    );

    // Update submission
    submission.status = correct ? 'approved' : 'rejected';
    submission.correct = correct;
    submission.verifierAddress = req.user.walletAddress;
    submission.verificationNotes = notes;
    submission.verificationScore = score;
    submission.txHash = result.txHash;
    submission.pointsAwarded = result.pointsAwarded;
    submission.reviewedAt = new Date();

    await submission.save();

    // Update user stats
    await User.updateOne(
      { walletAddress: submission.userAddress },
      { 
        $inc: { 
          tasksCompleted: 1,
          totalPoints: result.pointsAwarded 
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
  const { resolution, overrideStatus } = req.body; // 'upheld' or 'overturned'
  const submission = await Submission.findById(req.params.submissionId);
  
  if (!submission || !submission.disputed) {
    return res.status(404).json({ error: 'No active appeal found' });
  }

  submission.disputeResolution = resolution;
  if (overrideStatus) {
    submission.status = overrideStatus;
    if (overrideStatus === 'approved') {
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
