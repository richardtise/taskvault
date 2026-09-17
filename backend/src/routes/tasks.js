'use strict';

const express = require('express');
const { ethers } = require('ethers');
const router = express.Router();
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const User = require('../models/User');
const blockchain = require('../services/blockchain');
const { authMiddleware } = require('../middleware/auth');
const {
  NO_PASTE_CATEGORIES,
  isValidCategory,
} = require('../constants/taskCategories');
const { parsePagination } = require('../utils/pagination');
const logger = require('../utils/logger');

// GET /api/tasks — List available tasks
router.get('/', async (req, res) => {
  try {
    const { category, difficulty, status = 'active', walletAddress } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const query = { status };
    if (category) {
      if (!isValidCategory(category)) {
        return res.status(400).json({ error: `Unknown category: ${category}` });
      }
      query.category = category;
    }
    if (difficulty) {
      if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) {
        return res.status(400).json({ error: `Unknown difficulty: ${difficulty}` });
      }
      query.difficulty = difficulty;
    }

    if (walletAddress) {
      if (!ethers.isAddress(walletAddress)) {
        return res.status(400).json({ error: 'Invalid walletAddress' });
      }
      const user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
      if (user) {
        query.requiredTier = { $lte: user.tierIndex };
      }
    }

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        // taskData can be large and is only revealed on the authenticated detail route.
        .select('-taskData'),
      Task.countDocuments(query),
    ]);

    res.json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`List tasks error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/:taskId — Get single task detail
router.get('/:taskId', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({ taskId: req.params.taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const canAccess = await blockchain.canAccessTask(
      req.user.walletAddress,
      task.requiredTier,
      task.requiredModality,
      task.requiredBadgeLevel
    );

    if (!canAccess) {
      return res.status(403).json({
        error: 'Task locked',
        requiredTier: task.requiredTier,
        requiredBadge: task.requiredBadgeLevel,
        requiredModality: task.requiredModality,
      });
    }

    const existingSubmission = await Submission.findOne({
      taskId: req.params.taskId,
      userAddress: req.user.walletAddress,
    });

    res.json({
      task,
      hasSubmitted: !!existingSubmission,
      submissionStatus: existingSubmission?.status || null,
    });
  } catch (error) {
    logger.error(`Get task error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /api/tasks/:taskId/submit — Submit task work
router.post('/:taskId/submit', authMiddleware, async (req, res) => {
  try {
    const { answer, timeSpentSeconds, metrics } = req.body;
    const { taskId } = req.params;

    if (answer === undefined || answer === null || answer === '') {
      return res.status(400).json({ error: 'answer is required' });
    }

    const task = await Task.findOne({ taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.status !== 'active') {
      return res.status(400).json({ error: 'Task is not active' });
    }

    // Cheap pre-check; the authoritative quota reservation is atomic below.
    if (task.currentCompletions >= task.maxCompletions) {
      return res.status(400).json({ error: 'Task quota reached' });
    }

    const existing = await Submission.findOne({
      taskId,
      userAddress: req.user.walletAddress,
    });
    if (existing) {
      return res.status(400).json({ error: 'Already submitted' });
    }

    // Anti-gaming: reject before touching the DB.
    if (metrics && typeof metrics === 'object') {
      const minTime = task.estimatedTimeMinutes
        ? task.estimatedTimeMinutes * 0.3 * 60000
        : 5000;
      const timeSpentMs = Number(metrics.timeSpentMs);
      if (Number.isFinite(timeSpentMs) && timeSpentMs < minTime) {
        return res.status(400).json({ error: 'Submission too fast. Please take your time.' });
      }
      if (Number(metrics.pasteEvents) > 0 && NO_PASTE_CATEGORIES.includes(task.category)) {
        return res.status(400).json({ error: 'Paste detected. Type your own response.' });
      }
    }

    // Atomically reserve a completion slot so concurrent submissions cannot
    // oversubscribe the task. Released again if the submission is rejected or
    // fails to save.
    const reserved = await Task.updateOne(
      {
        taskId,
        status: 'active',
        $expr: { $lt: ['$currentCompletions', '$maxCompletions'] },
      },
      { $inc: { currentCompletions: 1 } }
    );
    if (reserved.modifiedCount === 0) {
      return res.status(400).json({ error: 'Task quota reached' });
    }

    let submission;
    try {
      submission = await Submission.create({
        taskId,
        userAddress: req.user.walletAddress,
        answer,
        timeSpentSeconds: Number.isFinite(Number(timeSpentSeconds))
          ? Number(timeSpentSeconds)
          : undefined,
        metrics: metrics && typeof metrics === 'object' ? metrics : {},
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    } catch (saveError) {
      // Release the reserved slot — e.g. duplicate key from a concurrent request.
      await Task.updateOne({ taskId }, { $inc: { currentCompletions: -1 } });
      if (saveError && saveError.code === 11000) {
        return res.status(400).json({ error: 'Already submitted' });
      }
      throw saveError;
    }

    await User.updateOne(
      { walletAddress: req.user.walletAddress },
      { $set: { lastActive: new Date() } }
    );

    res.json({
      success: true,
      submissionId: submission._id,
      status: 'pending',
      message: 'Submission received. Awaiting review.',
    });
  } catch (error) {
    logger.error(`Submit task error: ${error.message}`);
    res.status(500).json({ error: 'Failed to submit task' });
  }
});

// GET /api/tasks/:taskId/submissions/my — Get my submission
router.get('/:taskId/submissions/my', authMiddleware, async (req, res) => {
  try {
    const submission = await Submission.findOne({
      taskId: req.params.taskId,
      userAddress: req.user.walletAddress,
    });

    if (!submission) {
      return res.status(404).json({ error: 'No submission found' });
    }

    res.json(submission);
  } catch (error) {
    logger.error(`Get submission error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

module.exports = router;
