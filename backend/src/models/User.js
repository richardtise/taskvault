const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true, lowercase: true },
  username: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  avatar: { type: String }, // IPFS hash
  bio: { type: String, maxlength: 500 },

  // On-chain sync (cached for fast queries)
  tierIndex: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  lifetimeEarned: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  accuracy: { type: Number, default: 100 },
  referralCount: { type: Number, default: 0 },

  // Modality badges cache
  badges: [{
    modality: String,
    level: { type: Number, default: 0 }, // 0=None, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum
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

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  lastSynced: { type: Date, default: Date.now },
});

UserSchema.index({ walletAddress: 1 });
UserSchema.index({ tierIndex: -1, totalPoints: -1 }); // Leaderboard queries
UserSchema.index({ 'badges.modality': 1, 'badges.level': -1 });

module.exports = mongoose.model('User', UserSchema);
