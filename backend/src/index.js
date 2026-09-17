'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cron = require('node-cron');

const { get, validateBaseEnv } = require('./config/env');
const logger = require('./utils/logger');
const taskRoutes = require('./routes/tasks');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const appealRoutes = require('./routes/appeals');
const blockchain = require('./services/blockchain');
const verification = require('./services/verification');
const DailyStats = require('./models/Analytics');
const User = require('./models/User');
const Task = require('./models/Task');
const Submission = require('./models/Submission');

const app = express();
const PORT = Number(get('PORT', 3001));

// Behind nginx/ingress we must trust the proxy or every request appears to come
// from the proxy IP and rate limiting becomes useless.
app.set('trust proxy', Number(get('TRUST_PROXY', 1)));
app.disable('x-powered-by');

app.use(helmet());
app.use(
  cors({
    origin: get('FRONTEND_URL', 'http://localhost:5173').split(',').map((o) => o.trim()),
    credentials: true,
  })
);

const limiter = rateLimit({
  windowMs: Number(get('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000)),
  max: Number(get('RATE_LIMIT_MAX', 100)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});
app.use('/api/users/auth', authLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 === connected
  res.status(dbState === 1 ? 200 : 503).json({
    status: dbState === 1 ? 'ok' : 'degraded',
    db: dbState === 1 ? 'connected' : 'disconnected',
    chain: blockchain.isConfigured() ? 'configured' : 'unconfigured',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/appeals', appealRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

/** Daily stats snapshot. */
async function computeDailyStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = new DailyStats({
    date: today,
    newUsers: await User.countDocuments({ createdAt: { $gte: today } }),
    activeUsers: await User.countDocuments({
      lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
    tasksCreated: await Task.countDocuments({ createdAt: { $gte: today } }),
    tasksCompleted: await Submission.countDocuments({
      status: 'approved',
      reviewedAt: { $gte: today },
    }),
    submissionsPending: await Submission.countDocuments({ status: 'pending' }),
    submissionsApproved: await Submission.countDocuments({
      status: 'approved',
      reviewedAt: { $gte: today },
    }),
    submissionsRejected: await Submission.countDocuments({
      status: 'rejected',
      reviewedAt: { $gte: today },
    }),
  });

  await stats.save();
  logger.info('Daily stats computed and saved');
}

/** Reset weekly/monthly leaderboard counters. */
async function resetLeaderboardCounters() {
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
    logger.info(
      `Leaderboard counters reset: ${weekRes.modifiedCount} weekly, ${monthRes.modifiedCount} monthly`
    );
  }
}

/** Recalculate off-chain reputation scores. */
async function recalculateReputation() {
  const users = await User.find({ banned: false, tasksCompleted: { $gt: 0 } });
  logger.info(`Recalculating reputation for ${users.length} users`);

  for (const user of users) {
    const rep = await verification.calculateReputation(user.walletAddress);
    await User.updateOne(
      { walletAddress: user.walletAddress },
      { $set: { accuracy: rep.accuracy } }
    );
  }
  logger.info('Reputation recalculation complete');
}

function startCronJobs() {
  cron.schedule('0 0 * * *', () =>
    computeDailyStats().catch((e) => logger.error(`Daily stats cron error: ${e.message}`))
  );
  cron.schedule('30 0 * * *', () =>
    resetLeaderboardCounters().catch((e) =>
      logger.error(`Leaderboard reset cron error: ${e.message}`)
    )
  );
  cron.schedule('0 2 * * *', () =>
    recalculateReputation().catch((e) => logger.error(`Reputation cron error: ${e.message}`))
  );
}

async function start() {
  try {
    validateBaseEnv();

    await mongoose.connect(get('MONGODB_URI'));
    logger.info('Connected to MongoDB');

    if (!blockchain.isConfigured()) {
      logger.warn(
        'Chain configuration incomplete (RPC_URL/VAULT_ADDRESS/PRIVATE_KEY). ' +
          'Read-only endpoints will work; on-chain actions will fail until it is set.'
      );
    }

    startCronJobs();

    app.listen(PORT, () => {
      logger.info(`TaskVault API running on port ${PORT}`);
      logger.info(`Environment: ${get('NODE_ENV', 'development')}`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
