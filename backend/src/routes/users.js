'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ethers } = require('ethers');
const User = require('../models/User');
const Submission = require('../models/Submission');
const blockchain = require('../services/blockchain');
const { authMiddleware } = require('../middleware/auth');
const { requireEnv } = require('../config/env');
const { parsePagination } = require('../utils/pagination');
const logger = require('../utils/logger');

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const buildLoginMessage = (walletAddress, nonce, expiresAt) =>
  [
    'TaskVault Login',
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
  ].join('\n');

// POST /api/users/auth/nonce — get a nonce to sign (SIWE-style)
router.post('/auth/nonce', async (req, res) => {
  try {
    const { walletAddress } = req.body || {};
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Valid walletAddress required' });
    }

    const address = walletAddress.toLowerCase();
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

    await User.updateOne(
      { walletAddress: address },
      { $set: { authNonce: nonce, authNonceExpiresAt: expiresAt }, $setOnInsert: { walletAddress: address } },
      { upsert: true }
    );

    res.json({
      nonce,
      expiresAt: expiresAt.toISOString(),
      message: buildLoginMessage(address, nonce, expiresAt),
    });
  } catch (error) {
    logger.error(`Nonce error: ${error.message}`);
    res.status(500).json({ error: 'Failed to issue nonce' });
  }
});

// POST /api/users/auth — Authenticate with a verified wallet signature
router.post('/auth', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body || {};

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

    // The signed message must contain the user's current, unexpired server nonce.
    const user = await User.findOne({ walletAddress: address });
    if (!user || !user.authNonce || !message.includes(user.authNonce)) {
      return res.status(401).json({ error: 'Stale or missing nonce. Request a new one via /auth/nonce.' });
    }
    if (user.authNonceExpiresAt && user.authNonceExpiresAt.getTime() < Date.now()) {
      return res.status(401).json({ error: 'Nonce expired. Request a new one via /auth/nonce.' });
    }

    // Rotate nonce so the same signature can never be replayed.
    user.authNonce = crypto.randomBytes(16).toString('hex');
    user.authNonceExpiresAt = new Date(Date.now() + NONCE_TTL_MS);

    // Sync with chain (best-effort; returns null when chain env is absent).
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

    const token = jwt.sign({ walletAddress: user.walletAddress }, requireEnv('JWT_SECRET'), {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

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
      userAddress: req.user.walletAddress,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('taskId status pointsAwarded createdAt');

    res.json({ user: req.user, recentSubmissions });
  } catch (error) {
    logger.error(`Get user error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /api/users/leaderboard — Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    const { page, limit, skip } = parsePagination(req.query, 50);

    let sortField = 'lifetimeEarned';
    if (period === 'week') sortField = 'weeklyPoints';
    if (period === 'month') sortField = 'monthlyPoints';

    const [users, total] = await Promise.all([
      User.find()
        .sort({ [sortField]: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          'walletAddress username tierIndex totalPoints lifetimeEarned weeklyPoints monthlyPoints tasksCompleted badges'
        ),
      User.countDocuments(),
    ]);

    res.json({
      leaderboard: users.map((u, i) => ({
        rank: (page - 1) * limit + i + 1,
        ...u.toObject(),
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error(`Leaderboard error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// PATCH /api/users/profile — Update profile
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, email, bio, avatar, notificationPrefs } = req.body || {};

    const updates = {};
    if (username !== undefined) {
      if (typeof username !== 'string' || username.length < 3 || username.length > 32) {
        return res.status(400).json({ error: 'username must be 3-32 characters' });
      }
      updates.username = username;
    }
    if (email !== undefined) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      updates.email = email.toLowerCase();
    }
    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 500) {
        return res.status(400).json({ error: 'bio must be at most 500 characters' });
      }
      updates.bio = bio;
    }
    if (avatar !== undefined) updates.avatar = avatar;
    if (notificationPrefs !== undefined) updates.notificationPrefs = notificationPrefs;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const user = await User.findOneAndUpdate(
      { walletAddress: req.user.walletAddress },
      updates,
      { new: true }
    );

    res.json(user);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: 'That username or email is already taken' });
    }
    logger.error(`Update profile error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
