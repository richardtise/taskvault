const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true, lowercase: true },
  username: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  avatar: { type: String },
  bio: { type: String, maxlength: 500 },

  // Wallet-login nonce (rotated on every successful auth)
  authNonce: { type: String },

  // On-chain sync (cached for fast queries)
  tierIndex: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  lifetimeEarned: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  tasksCorrect: { type: Number, default: 0 },
  accuracy: { type: Number, default: 100 },
  referralCount: { type: Number, default: 0 },

  // Leaderboard periods (maintained on approval; reset by cron)
  weeklyPoints: { type: Number, default: 0 },
  monthlyPoints: { type: Number, default: 0 },
  lastWeeklyReset: { type: Date, default: Date.now },
  lastMonthlyReset: { type: Date, default: Date.now },

  // Modality badges cache
  badges: [{
    modality: String,
    level: { type: Number, default: 0 },
    tasksCompleted: { type: Number, default: 0 },
    lastSynced: { type: Date, default: Date.now }
  }],

  // Profile settings
  notificationPrefs: {
    emailOnTaskComplete: { type: Boolean, default: true },
    emailOnTierUpgrade: { type: Boolean, default: true },
    emailOnPayment: { type: Boolean, default: true },
  },

  // Anti-gaming
  lastIP: { type: String },
  deviceFingerprint: { type: String },
  flagged: { type: Boolean, default: false },
  flagReason: { type: String },
  strikes: { type: Number, default: 0 },
  banned: { type: Boolean, default: false },
  lastFlagged: { type: Date },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  lastSynced: { type: Date, default: Date.now },
});

UserSchema.index({ walletAddress: 1 });
UserSchema.index({ tierIndex: -1, totalPoints: -1 });
UserSchema.index({ lifetimeEarned: -1 });
UserSchema.index({ weeklyPoints: -1 });
UserSchema.index({ monthlyPoints: -1 });
UserSchema.index({ 'badges.modality': 1, 'badges.level': -1 });

module.exports = mongoose.model('User', UserSchema);
