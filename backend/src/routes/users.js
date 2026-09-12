const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ethers } = require('ethers');
const User = require('../models/User');
const Submission = require('../models/Submission');
const blockchain = require('../services/blockchain');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

const buildLoginMessage = (walletAddress, nonce) =>
  `TaskVault Login\nWallet: ${walletAddress.toLowerCase()}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;

// POST /api/users/auth/nonce — get a nonce to sign (SIWE-style)
router.post('/auth/nonce', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Valid walletAddress required' });
    }

    const address = walletAddress.toLowerCase();
    const nonce = crypto.randomBytes(16).toString('hex');

    await User.updateOne(
      { walletAddress: address },
      { $set: { authNonce: nonce }, $setOnInsert: { walletAddress: address } },
      { upsert: true }
    );

    res.json({
      nonce,
      message: buildLoginMessage(address, nonce),
    });
  } catch (error) {
    logger.error(`Nonce error: ${error.message}`);
    res.status(500).json({ error: 'Failed to issue nonce' });
  }
});

// POST /api/users/auth — Authenticate with a verified wallet signature
router.post('/auth', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ error: 'walletAddress, signature and message are required' });
    }
    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid walletAddress' });
    }

    const address = walletAddress.toLowerCase();

    // Recover signer from the signed message
    let recovered;
    try {
      recovered = ethers.verifyMessage(message, signature).toLowerCase();
    } catch {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (recovered !== address) {
      return res.status(401).json({ error: 'Signature does not match walletAddress' });
    }

    // The signed message must contain the user's current server nonce (replay protection)
    const user = await User.findOne({ walletAddress: address });
    if (!user || !user.authNonce || !message.includes(user.authNonce)) {
      return res.status(401).json({ error: 'Stale or missing nonce. Request a new one via /auth/nonce.' });
    }

    // Rotate nonce so the same signature can never be replayed
    user.authNonce = crypto.randomBytes(16).toString('hex');

    // Sync with chain
    const chainData = await blockchain.syncUserFromChain(address);
    if (chainData) {
      user.tierIndex = chainData.tierIndex;
      user.totalPoints = chainData.balance;
      user.lifetimeEarned = chainData.lifetimeEarned;
      user.tasksCompleted = chainData.tasksCompleted;
      user.tasksCorrect = chainData.tasksCorrect;
      user.accuracy = chainData.accuracy;
      user.badges = chainData.badges;
      user.lastSynced = new Date();
    }

    user.lastActive = new Date();
    await user.save();

    const token = jwt.sign(
      { walletAddress: user.walletAddress },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
      req.user.tasksCorrect = chainData.tasksCorrect;
      req.user.accuracy = chainData.accuracy;
      req.user.badges = chainData.badges;
      req.user.lastSynced = new Date();
      await req.user.save();
    }

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
      .select('walletAddress username tierIndex totalPoints lifetimeEarned weeklyPoints monthlyPoints tasksCompleted badges');

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
