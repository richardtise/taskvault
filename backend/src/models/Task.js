const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  // Identity
  taskId: { type: String, required: true, unique: true }, // e.g. "llm-rank-001"
  title: { type: String, required: true },
  description: { type: String, required: true },
  instructions: { type: String, required: true },

  // Categorization
  category: { type: String, required: true }, // "llm", "robotics", "vision", etc.
  modality: { type: String, required: true }, // keccak256 hash as string
  genre: { type: String, required: true }, // matches frontend theme name

  // Requirements
  requiredTier: { type: Number, default: 0 }, // 0=Scout, 4=Architect
  requiredBadgeLevel: { type: Number, default: 0 }, // 0=None, 1=Bronze...
  requiredModality: { type: String, default: null },

  // Economics
  basePoints: { type: Number, required: true },
  maxCompletions: { type: Number, default: 1000 },
  currentCompletions: { type: Number, default: 0 },
  deadline: { type: Date },

  // Content
  assets: [{ 
    type: { type: String, enum: ['image', 'video', 'audio', 'text', 'json'] },
    url: String, // IPFS or S3 URL
    cid: String, // IPFS CID
    metadata: mongoose.Schema.Types.Mixed
  }],

  // Task-specific data
  taskData: { type: mongoose.Schema.Types.Mixed }, // e.g. LLM prompt pairs, video URLs, etc.

  // Verification
  verificationType: { 
    type: String, 
    enum: ['manual', 'automated', 'peer_review', 'consensus'],
    default: 'manual'
  },
  verificationConfig: { type: mongoose.Schema.Types.Mixed }, // threshold, consensus count, etc.

  // Status
  status: { 
    type: String, 
    enum: ['draft', 'active', 'paused', 'completed', 'archived'],
    default: 'draft'
  },

  // Metadata
  createdBy: { type: String }, // admin wallet
  buyerId: { type: String }, // who commissioned this task (for B2B sales)
  tags: [String],
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy' },
  estimatedTimeMinutes: { type: Number },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  activatedAt: { type: Date },
});

TaskSchema.index({ status: 1, category: 1, requiredTier: 1 });
TaskSchema.index({ modality: 1, requiredBadgeLevel: 1 });
TaskSchema.index({ buyerId: 1 });

module.exports = mongoose.model('Task', TaskSchema);
