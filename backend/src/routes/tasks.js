const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const User = require('../models/User');
const blockchain = require('../services/blockchain');
const ipfs = require('../services/ipfs');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

// GET /api/tasks — List available tasks
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      difficulty, 
      status = 'active',
      page = 1, 
      limit = 20,
      walletAddress 
    } = req.query;

    const query = { status };
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;

    // If wallet provided, filter by access level
    if (walletAddress) {
      const user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
      if (user) {
        query.requiredTier = { $lte: user.tierIndex };
      }
    }

    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-taskData'); // Don't send full task data in list

    const total = await Task.countDocuments(query);

    res.json({
      tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
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

    // Check access
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
        requiredModality: task.requiredModality
      });
    }

    // Check if already submitted
    const existingSubmission = await Submission.findOne({
      taskId: req.params.taskId,
      userAddress: req.user.walletAddress
    });

    res.json({
      task,
      hasSubmitted: !!existingSubmission,
      submissionStatus: existingSubmission?.status || null
    });
  } catch (error) {
    logger.error(`Get task error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /api/tasks/:taskId/submit — Submit task work
router.post('/:taskId/submit', authMiddleware, async (req, res) => {
  try {
    const { answer, timeSpentSeconds } = req.body;
    const task = await Task.findOne({ taskId: req.params.taskId });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'active') {
      return res.status(400).json({ error: 'Task is not active' });
    }

    if (task.currentCompletions >= task.maxCompletions) {
      return res.status(400).json({ error: 'Task quota reached' });
    }

    // Check for existing submission
    const existing = await Submission.findOne({
      taskId: req.params.taskId,
      userAddress: req.user.walletAddress
    });

    if (existing) {
      return res.status(400).json({ error: 'Already submitted' });
    }

    // Create submission
    const submission = new Submission({
      taskId: req.params.taskId,
      userAddress: req.user.walletAddress,
      answer,
      timeSpentSeconds,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await submission.save();

    // Update task completion count
    await Task.updateOne(
      { taskId: req.params.taskId },
      { $inc: { currentCompletions: 1 } }
    );

    // Update user last active
    await User.updateOne(
      { walletAddress: req.user.walletAddress },
      { lastActive: new Date() }
    );

    res.json({ 
      success: true, 
      submissionId: submission._id,
      status: 'pending',
      message: 'Submission received. Awaiting review.'
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
      userAddress: req.user.walletAddress
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
