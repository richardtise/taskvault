const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
  // Links
  taskId: { type: String, required: true, index: true },
  userAddress: { type: String, required: true, lowercase: true, index: true },

  // Content
  answer: { type: mongoose.Schema.Types.Mixed, required: true }, // Flexible: text, JSON, file refs
  files: [{ 
    cid: String, 
    url: String, 
    filename: String,
    mimetype: String 
  }],

  // Metadata
  timeSpentSeconds: { type: Number },
  ipAddress: { type: String },
  userAgent: { type: String },

  // Review
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'approved', 'rejected', 'disputed'],
    default: 'pending'
  },

  // Verification
  verifierAddress: { type: String, lowercase: true },
  verificationNotes: { type: String },
  verificationScore: { type: Number }, // 0-100 quality score
  correct: { type: Boolean }, // true = approved, false = rejected

  // Consensus (for peer-reviewed tasks)
  peerReviews: [{
    reviewerAddress: String,
    score: Number,
    notes: String,
    createdAt: { type: Date, default: Date.now }
  }],
  consensusScore: { type: Number },

  // On-chain
  txHash: { type: String }, // completeTask transaction hash
  pointsAwarded: { type: Number },

  // Dispute
  disputed: { type: Boolean, default: false },
  disputeReason: { type: String },
  disputeResolution: { type: String },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
});

SubmissionSchema.index({ taskId: 1, userAddress: 1 }, { unique: true }); // One submission per user per task
SubmissionSchema.index({ status: 1, createdAt: 1 });
SubmissionSchema.index({ userAddress: 1, status: 1 });

module.exports = mongoose.model('Submission', SubmissionSchema);
