const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();

const logger = require('./utils/logger');
const taskRoutes = require('./routes/tasks');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const appealRoutes = require('./routes/appeals');
const verification = require('./services/verification');
const DailyStats = require('./models/Analytics');
const User = require('./models/User');
const Task = require('./models/Task');
const Submission = require('./models/Submission');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many auth attempts, please try again later.' }
});
app.use('/api/users/auth', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes — MUST be before 404 handler
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/appeals', appealRoutes);

// 404 handler — MUST be last
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/taskvault')
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error(`MongoDB connection error: ${err.message}`));

// Daily stats cron job (runs at midnight)
cron.schedule('0 0 * * *', async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = new DailyStats({
      date: today,
      newUsers: await User.countDocuments({ createdAt: { $gte: today } }),
      activeUsers: await User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      tasksCreated: await Task.countDocuments({ createdAt: { $gte: today } }),
      tasksCompleted: await Submission.countDocuments({ status: 'approved', reviewedAt: { $gte: today } }),
      submissionsPending: await Submission.countDocuments({ status: 'pending' }),
      submissionsApproved: await Submission.countDocuments({ status: 'approved', reviewedAt: { $gte: today } }),
      submissionsRejected: await Submission.countDocuments({ status: 'rejected', reviewedAt: { $gte: today } }),
    });

    await stats.save();
    logger.info('Daily stats computed and saved');
  } catch (error) {
    logger.error(`Daily stats cron error: ${error.message}`);
  }
});

// Reset weekly/monthly leaderboard counters (runs at 00:30)
cron.schedule('30 0 * * *', async () => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const weekRes = await User.updateMany(
      { lastWeeklyReset: { $lt: startOfWeek } },
      { $set: { weeklyPoints: 0, lastWeeklyReset: now } }
    );
    const monthRes = await User.updateMany(
      { lastMonthlyReset: { $lt: startOfMonth } },
      { $set: { monthlyPoints: 0, lastMonthlyReset: now } }
    );

    if (weekRes.modifiedCount > 0 || monthRes.modifiedCount > 0) {
      logger.info(`Leaderboard counters reset: ${weekRes.modifiedCount} weekly, ${monthRes.modifiedCount} monthly`);
    }
  } catch (error) {
    logger.error(`Leaderboard reset cron error: ${error.message}`);
  }
});

// Reputation cron (runs at 2am)
cron.schedule('0 2 * * *', async () => {
  try {
    const users = await User.find({ banned: false, tasksCompleted: { $gt: 0 } });
    logger.info(`Recalculating reputation for ${users.length} users`);

    for (const user of users) {
      const rep = await verification.calculateReputation(user.walletAddress);
      await User.updateOne(
        { walletAddress: user.walletAddress },
        {
          $set: {
            accuracy: rep.accuracy,
            // tierIndex: rep.tier // uncomment when ready to auto-promote
          }
        }
      );
    }
    logger.info('Reputation recalculation complete');
  } catch (error) {
    logger.error(`Reputation cron error: ${error.message}`);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`TaskVault API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
