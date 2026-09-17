'use strict';

const express = require('express');
const { ethers } = require('ethers');
const router = express.Router();
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const User = require('../models/User');
const DailyStats = require('../models/Analytics');
const blockchain = require('../services/blockchain');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const {
  isValidCategory,
  isValidModality,
  CATEGORY_TO_MODALITY,
} = require('../constants/taskCategories');
const { parsePagination } = require('../utils/pagination');
const logger = require('../utils/logger');

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const VERIFICATION_TYPES = ['manual', 'automated', 'peer_review', 'consensus'];

// POST /api/admin/tasks — Create new task
router.post('/tasks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      taskId,
      title,
      description,
      instructions,
      category,
      modality,
      genre,
      basePoints,
      maxCompletions,
      difficulty,
      estimatedTimeMinutes,
      requiredTier,
      requiredBadgeLevel,
      requiredModality,
      verificationType,
      verificationConfig,
      taskData,
      assets,
      tags,
      buyerId,
    } = req.body || {};

    // Explicit validation instead of spreading req.body straight into the model
    // (which allowed mass-assignment of currentCompletions/status/etc).
    const errors = [];
    if (!title) errors.push('title');
    if (!description) errors.push('description');
    if (!instructions) errors.push('instructions');
    if (!category) errors.push('category');
    if (basePoints === undefined || basePoints === null) errors.push('basePoints');
    if (errors.length) {
      return res.status(400).json({ error: `Missing required fields: ${errors.join(', ')}` });
    }

    if (!isValidCategory(category)) {
      return res.status(400).json({ error: `Unknown category: ${category}` });
    }

    const resolvedModality = modality || CATEGORY_TO_MODALITY[category];
    if (!isValidModality(resolvedModality)) {
      return res.status(400).json({ error: `Unknown modality: ${resolvedModality}` });
    }
    if (modality && CATEGORY_TO_MODALITY[category] !== modality) {
      return res.status(400).json({
        error: `modality "${modality}" does not match category "${category}" (expected "${CATEGORY_TO_MODALITY[category]}")`,
      });
    }

    const points = Number(basePoints);
    if (!Number.isFinite(points) || points <= 0) {
      return res.status(400).json({ error: 'basePoints must be a positive number' });
    }

    if (difficulty && !DIFFICULTIES.includes(difficulty)) {
      return res.status(400).json({ error: `difficulty must be one of ${DIFFICULTIES.join(', ')}` });
    }
    if (verificationType && !VERIFICATION_TYPES.includes(verificationType)) {
      return res.status(400).json({ error: `Unknown verificationType: ${verificationType}` });
    }
    if (requiredModality && !isValidModality(requiredModality)) {
      return res.status(400).json({ error: `Unknown requiredModality: ${requiredModality}` });
    }

    const task = new Task({
      taskId: taskId || `${category}-${Date.now()}`,
      title,
      description,
      instructions,
      category,
      modality: resolvedModality,
      genre: genre || resolvedModality,
      basePoints: points,
      maxCompletions: Number.isFinite(Number(maxCompletions)) ? Number(maxCompletions) : 1000,
      difficulty: difficulty || 'Easy',
      estimatedTimeMinutes: Number.isFinite(Number(estimatedTimeMinutes))
        ? Number(estimatedTimeMinutes)
        : undefined,
      requiredTier: Number.isFinite(Number(requiredTier)) ? Number(requiredTier) : 0,
      requiredBadgeLevel: Number.isFinite(Number(requiredBadgeLevel))
        ? Number(requiredBadgeLevel)
        : 0,
      requiredModality: requiredModality || null,
      verificationType: verificationType || 'manual',
      verificationConfig,
      taskData,
      assets,
      tags,
      buyerId,
      createdBy: req.user.walletAddress,
      status: 'draft',
    });

    await task.save();
    logger.info(`Task created: ${task.taskId} by ${req.user.walletAddress}`);

    res.status(201).json({ success: true, task });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: 'A task with that taskId already exists' });
    }
    logger.error(`Create task error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PATCH /api/admin/tasks/:taskId/status — Activate/pause/archive a task
router.patch('/tasks/:taskId/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body || {};
    const allowed = ['draft', 'active', 'paused', 'completed', 'archived'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
    }

    const update = { status, updatedAt: new Date() };
    if (status === 'active') update.activatedAt = new Date();

    const task = await Task.findOneAndUpdate({ taskId: req.params.taskId }, update, {
      new: true,
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    logger.info(`Task ${task.taskId} status -> ${status} by ${req.user.walletAddress}`);
    res.json({ success: true, task });
  } catch (error) {
    logger.error(`Update task status error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// GET /api/admin/submissions/pending — List pending submissions
router.get('/submissions/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 50);

    const [submissions, total] = await Promise.all([
      Submission.find({ status: 'pending' }).sort({ createdAt: 1 }).skip(skip).limit(limit),
      Submission.countDocuments({ status: 'pending' }),
    ]);

    // taskId is a string, not an ObjectId — fetch tasks manually
    const taskIds = [...new Set(submissions.map((s) => s.taskId))];
    const tasks = await Task.find({ taskId: { $in: taskIds } });
    const taskById = new Map(tasks.map((t) => [t.taskId, t]));

    res.json({
      submissions: submissions.map((s) => ({
        ...s.toObject(),
        task: taskById.get(s.taskId) || null,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error(`List pending error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// POST /api/admin/submissions/:id/review — Review a submission
router.post('/submissions/:id/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { correct, notes, score } = req.body || {};

    if (typeof correct !== 'boolean') {
      return res.status(400).json({ error: 'correct must be a boolean' });
    }
    if (!ethers.isHexString(req.params.id, 12) && !/^[a-f0-9]{24}$/i.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid submission id' });
    }

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submission.status !== 'pending') {
      return res.status(400).json({ error: 'Already reviewed' });
    }

    const task = await Task.findOne({ taskId: submission.taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Mark as under review first to prevent double-review races.
    const claimed = await Submission.updateOne(
      { _id: submission._id, status: 'pending' },
      { $set: { status: 'under_review', verifierAddress: req.user.walletAddress } }
    );
    if (claimed.modifiedCount === 0) {
      return res.status(409).json({ error: 'Submission is being reviewed by someone else' });
    }

    // Only successful reviews hit the chain; a rejection never mints.
    let result = null;
    if (correct) {
      try {
        result = await blockchain.verifyTask(
          submission.userAddress,
          submission.taskId,
          task.basePoints,
          true,
          task.modality
        );
      } catch (chainError) {
        // Roll back the claim so the submission can be reviewed again.
        await Submission.updateOne(
          { _id: submission._id },
          { $set: { status: 'pending' }, $unset: { verifierAddress: 1 } }
        );
        throw chainError;
      }
    }

    submission.status = correct ? 'approved' : 'rejected';
    submission.correct = correct;
    submission.verifierAddress = req.user.walletAddress;
    submission.verificationNotes = notes;
    submission.verificationScore = Number.isFinite(Number(score)) ? Number(score) : undefined;
    if (result) {
      submission.txHash = result.txHash;
      submission.pointsAwarded = result.pointsAwarded;
    }
    submission.reviewedAt = new Date();

    try {
      await submission.save();
    } catch (dbError) {
      // Chain succeeded but DB failed — flag for manual reconciliation.
      logger.error(
        `CRITICAL: chain tx ${result?.txHash} succeeded but DB update failed: ${dbError.message}`
      );
      return res.status(500).json({
        error: 'Points issued on-chain but failed to save review. Reconcile manually.',
        txHash: result?.txHash,
        pointsAwarded: result?.pointsAwarded,
      });
    }

    // Update user stats. tasksCompleted/tasksCorrect/totalPoints are authoritative
    // on-chain; these DB counters are for fast queries and are overwritten on sync.
    if (correct) {
      await User.updateOne(
        { walletAddress: submission.userAddress },
        {
          $inc: {
            tasksCompleted: 1,
            tasksCorrect: 1,
            totalPoints: result ? result.pointsAwarded : 0,
            weeklyPoints: result ? result.pointsAwarded : 0,
            monthlyPoints: result ? result.pointsAwarded : 0,
          },
          $set: { lastActive: new Date() },
        },
        { upsert: true }
      );
    } else {
      // A rejected submission is not a completed task, and it releases the
      // completion slot reserved at submit time.
      await Task.updateOne({ taskId: submission.taskId }, { $inc: { currentCompletions: -1 } });
      await User.updateOne(
        { walletAddress: submission.userAddress },
        { $set: { lastActive: new Date() } },
        { upsert: true }
      );
    }

    logger.info(
      `Submission reviewed: ${submission._id}, Approved: ${correct}, Points: ${result?.pointsAwarded ?? 0}`
    );

    res.json({
      success: true,
      submission,
      txHash: result?.txHash || null,
      pointsAwarded: result?.pointsAwarded ?? 0,
    });
  } catch (error) {
    logger.error(`Review submission error: ${error.message}`);
    res.status(500).json({ error: 'Failed to review submission' });
  }
});

// GET /api/admin/analytics — Platform analytics
router.get('/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let days = Number.parseInt(req.query.days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) days = 30;

    const [stats, totals, pendingSubmissions, activeTasks] = await Promise.all([
      DailyStats.find({
        date: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      }).sort({ date: 1 }),
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalPoints: { $sum: '$totalPoints' },
            totalTasks: { $sum: '$tasksCompleted' },
          },
        },
      ]),
      Submission.countDocuments({ status: 'pending' }),
      Task.countDocuments({ status: 'active' }),
    ]);

    res.json({
      dailyStats: stats,
      totals: totals[0] || {},
      pendingSubmissions,
      activeTasks,
    });
  } catch (error) {
    logger.error(`Analytics error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// POST /api/admin/appeals/:submissionId/resolve
router.post('/appeals/:submissionId/resolve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { resolution, overrideStatus } = req.body || {};

    if (!['upheld', 'overturned'].includes(resolution)) {
      return res.status(400).json({ error: "resolution must be 'upheld' or 'overturned'" });
    }
    if (overrideStatus && !['approved', 'rejected'].includes(overrideStatus)) {
      return res.status(400).json({ error: "overrideStatus must be 'approved' or 'rejected'" });
    }

    const submission = await Submission.findById(req.params.submissionId);
    if (!submission || !submission.disputed) {
      return res.status(404).json({ error: 'No active appeal found' });
    }

    submission.disputeResolution = resolution;

    // Overturning a rejection must actually issue the points, otherwise the user
    // is told they won with nothing to show for it.
    if (overrideStatus) {
      if (overrideStatus === 'approved' && submission.status !== 'approved') {
        if (submission.txHash) {
          // Already minted on-chain; do not double-mint.
          submission.status = 'approved';
        } else {
          const task = await Task.findOne({ taskId: submission.taskId });
          if (!task) {
            return res.status(404).json({ error: 'Task not found' });
          }
          const result = await blockchain.verifyTask(
            submission.userAddress,
            submission.taskId,
            task.basePoints,
            true,
            task.modality
          );
          submission.status = 'approved';
          submission.correct = true;
          submission.txHash = result.txHash;
          submission.pointsAwarded = result.pointsAwarded;

          await User.updateOne(
            { walletAddress: submission.userAddress },
            {
              $inc: {
                tasksCompleted: 1,
                tasksCorrect: 1,
                totalPoints: result.pointsAwarded,
                weeklyPoints: result.pointsAwarded,
                monthlyPoints: result.pointsAwarded,
              },
            },
            { upsert: true }
          );
        }
      } else {
        submission.status = overrideStatus;
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
    const { walletAddress } = req.body || {};
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'A valid walletAddress is required' });
    }

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
        lastSynced: new Date(),
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
