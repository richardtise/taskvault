const mongoose = require('mongoose');

const DailyStatsSchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },

  // Users
  newUsers: { type: Number, default: 0 },
  activeUsers: { type: Number, default: 0 },

  // Tasks
  tasksCreated: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  submissionsPending: { type: Number, default: 0 },
  submissionsApproved: { type: Number, default: 0 },
  submissionsRejected: { type: Number, default: 0 },

  // Points
  pointsIssued: { type: Number, default: 0 },
  pointsFromReferrals: { type: Number, default: 0 },

  // Vault
  vaultDeposits: { type: Number, default: 0 },
  vaultWithdrawals: { type: Number, default: 0 },

  // Revenue (when you have buyers)
  revenueUSD: { type: Number, default: 0 },

  // By modality
  modalityBreakdown: { type: Map, of: Number },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DailyStats', DailyStatsSchema);
