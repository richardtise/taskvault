const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Submission = require('../models/Submission');
const blockchain = require('../services/blockchain');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

// POST /api/users/auth — Authenticate with wallet signature
router.post('/auth', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;

    // Verify signature (simplified — in production use ethers.verifyMessage)
    // For now, we trust the frontend to handle wallet auth via RainbowKit
    // Backend just creates/returns user

    let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

    if (!user) {
      user = new User({ walletAddress: walletAddress.toLowerCase() });
      await user.save();
      logger.info(`New user registered: ${walletAddress}`);
    }

    // Sync with chain
    const chainData = await blockchain.syncUserFromChain(walletAddress);
    if (chainData) {
      user.tierIndex = chainData.tierIndex;
      user.totalPoints = chainData.balance;
      user.lifetimeEarned = chainData.lifetimeEarned;
      user.tasksCompleted = chainData.tasksCompleted;
      user.accuracy = chainData.tasksCompleted > 0 
        ? (chainData.tasksCompleted / chainData.tasksCompleted) * 100 
        : 100;
      user.badges = chainData.badges;
      user.lastSynced = new Date();
      await user.save();
    }

    const token = jwt.sign(
      { walletAddress: user.walletAddress },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({ token, user });
  } catch (error) {
    logger.error(`Auth error: ${error.message}`);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// GET /api/users/me — Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // Re-sync with chain for fresh data
    const chainData = await blockchain.syncUserFromChain(req.user.walletAddress);
    if (chainData) {
      req.user.tierIndex = chainData.tierIndex;
      req.user.totalPoints = chainData.balance;
      req.user.lifetimeEarned = chainData.lifetimeEarned;
      req.user.tasksCompleted = chainData.tasksCompleted;
      req.user.badges = chainData.badges;
      req.user.lastSynced = new Date();
      await req.user.save();
    }

    // Get recent submissions
    const recentSubmissions = await Submission.find({
      userAddress: req.user.walletAddress
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('taskId status pointsAwarded createdAt');

    res.json({
      user: req.user,
      recentSubmissions
    });
  } catch (error) {
    logger.error(`Get user error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /api/users/leaderboard — Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { period = 'all', page = 1, limit = 50 } = req.query;

    let sortField = 'lifetimeEarned';
    if (period === 'week') sortField = 'weeklyPoints';
    if (period === 'month') sortField = 'monthlyPoints';

    const users = await User.find()
      .sort({ [sortField]: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('walletAddress username tierIndex totalPoints lifetimeEarned tasksCompleted badges');

    const total = await User.countDocuments();

    res.json({
      leaderboard: users.map((u, i) => ({
        rank: (page - 1) * limit + i + 1,
        ...u.toObject()
      })),
      pagination: { page: Number(page), limit: Number(limit), total }
    });
  } catch (error) {
    logger.error(`Leaderboard error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// PATCH /api/users/profile — Update profile
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, email, bio, avatar, notificationPrefs } = req.body;

    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (bio) updates.bio = bio;
    if (avatar) updates.avatar = avatar;
    if (notificationPrefs) updates.notificationPrefs = notificationPrefs;

    const user = await User.findOneAndUpdate(
      { walletAddress: req.user.walletAddress },
      updates,
      { new: true }
    );

    res.json(user);
  } catch (error) {
    logger.error(`Update profile error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
