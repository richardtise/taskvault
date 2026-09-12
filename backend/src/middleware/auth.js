const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const getAdminWallets = () =>
  (process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET || '')
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ walletAddress: decoded.walletAddress });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'Account banned' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error(`Auth error: ${error.message}`);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const adminMiddleware = async (req, res, next) => {
  const admins = getAdminWallets();
  if (admins.length === 0) {
    logger.error('ADMIN_WALLET(S) not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (!admins.includes(req.user.walletAddress.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware, getAdminWallets };
