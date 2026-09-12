const Submission = require('../models/Submission');
const Task = require('../models/Task');
const User = require('../models/User');
const logger = require('../utils/logger');
const { CATEGORIES, NO_PASTE_CATEGORIES, TEXT_ANALYSIS_CATEGORIES } = require('../constants/taskCategories');

const TIME_LIMITS = {
  [CATEGORIES.LLM_RANK]: { min: 8000, max: 300000 },
  [CATEGORIES.ROBOT_PHASE]: { min: 45000, max: 600000 },
  [CATEGORIES.GRASP_ANNOTATE]: { min: 15000, max: 300000 },
  [CATEGORIES.SAFETY_REDTEAM]: { min: 30000, max: 600000 },
  [CATEGORIES.HUMAN_DEMO]: { min: 120000, max: 900000 },
  [CATEGORIES.VISION_LABEL]: { min: 10000, max: 300000 },
  [CATEGORIES.WRITING_EVAL]: { min: 20000, max: 600000 },
  [CATEGORIES.AUDIO_TRANSCRIBE]: { min: 30000, max: 600000 },
};

class VerificationService {
  async verify(submission) {
    const task = await Task.findOne({ taskId: submission.taskId });
    if (!task) throw new Error('Task not found');

    const flags = [];
    let confidence = 1.0;

    // 1. HONEYPOT CHECK
    if (task.taskData?.isHoneypot) {
      const passed = this.checkHoneypot(task, submission.answer);
      if (!passed) {
        flags.push('HONEYPOT_FAIL');
        confidence = 0;
      }
    }

    // 2. TIME ON TASK (look up by the task's actual category)
    const m = submission.metrics || {};
    const limits = TIME_LIMITS[task.category];
    if (limits && m.timeSpentMs) {
      if (m.timeSpentMs < limits.min) {
        flags.push('TOO_FAST');
        confidence *= 0.2;
      }
      if (m.timeSpentMs > limits.max) {
        flags.push('TOO_SLOW');
        confidence *= 0.8;
      }
    }

    // 3. BEHAVIORAL BIOMETRICS
    if (m.pasteEvents > 0 && NO_PASTE_CATEGORIES.includes(task.category)) {
      flags.push('PASTE_DETECTED');
      confidence *= 0.3;
    }
    if (m.tabSwitches > 5) {
      flags.push('EXCESSIVE_TAB_SWITCH');
      confidence *= 0.7;
    }
    if (m.mouseEvents < 10 && m.timeSpentMs > 30000) {
      flags.push('NO_MOUSE_ACTIVITY');
      confidence *= 0.4;
    }
    if (m.activeMs && m.timeSpentMs && (m.activeMs / m.timeSpentMs) < 0.3) {
      flags.push('MOSTLY_IDLE');
      confidence *= 0.5;
    }

    // 4. TEXT FINGERPRINTING
    if (TEXT_ANALYSIS_CATEGORIES.includes(task.category)) {
      const text = JSON.stringify(submission.answer);
      const textScore = this.analyzeText(text);
      if (textScore.aiProbability > 0.85) {
        flags.push('AI_GENERATED_TEXT');
        confidence *= 0.2;
      }
      if (textScore.repetitionScore > 0.6) {
        flags.push('REPETITIVE_TEXT');
        confidence *= 0.6;
      }
    }

    // 5. CONSENSUS
    const consensus = await this.checkConsensus(submission.taskId, submission.answer);
    if (consensus.hasConsensus && !consensus.agreesWithMajority) {
      flags.push('CONSENSUS_OUTLIER');
      confidence *= 0.4;
    }

    // 6. STRIKES + BAN LOGIC
    const user = await User.findOne({ walletAddress: submission.userAddress });
    let strikes = user?.strikes || 0;
    let banned = user?.banned || false;

    if (confidence < 0.3 || flags.includes('HONEYPOT_FAIL')) {
      strikes += 1;
      if (strikes >= 3) banned = true;
    }

    await User.updateOne(
      { walletAddress: submission.userAddress },
      { $set: { strikes, banned, lastFlagged: new Date() } },
      { upsert: true }
    );

    return {
      approved: confidence >= 0.5 && !banned,
      confidence,
      flags,
      strikes,
      banned,
      points: this.calculatePoints(task.basePoints, confidence, user?.tierIndex || 0),
    };
  }

  checkHoneypot(task, answer) {
    const expected = task.taskData?.expectedAnswer;
    if (!expected) return true;
    return JSON.stringify(answer) === JSON.stringify(expected);
  }

  analyzeText(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const trigrams = [];
    for (let i = 0; i < words.length - 2; i++) {
      trigrams.push(words.slice(i, i + 3).join(' ').toLowerCase());
    }
    const unique = new Set(trigrams);
    const repetitionScore = trigrams.length > 0 ? 1 - (unique.size / trigrams.length) : 0;
    const lengths = sentences.map(s => s.split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avg, 2), 0) / (lengths.length || 1);
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
    const aiProbability = Math.min(1, Math.max(0, (repetitionScore * 0.5) + ((1 - cv) * 0.5)));
    return { aiProbability, repetitionScore, cv };
  }

  async checkConsensus(taskId, answer) {
    const recent = await Submission.find({
      taskId,
      status: 'approved',
      createdAt: { $gt: new Date(Date.now() - 7 * 86400000) }
    }).limit(20);
    if (recent.length < 2) return { hasConsensus: false };
    const hashes = recent.map(r => JSON.stringify(r.answer));
    const counts = {};
    hashes.forEach(h => { counts[h] = (counts[h] || 0) + 1; });
    const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const myHash = JSON.stringify(answer);
    return {
      hasConsensus: true,
      agreesWithMajority: myHash === majority[0],
      consensusSize: majority[1],
      totalReviews: recent.length,
    };
  }

  calculatePoints(base, confidence, tierIndex) {
    const multipliers = [1, 1.5, 2.5, 4, 6];
    return Math.floor(base * confidence * (multipliers[tierIndex] || 1));
  }

  // ===== REPUTATION + TIME DECAY =====
  async calculateReputation(walletAddress) {
    const now = Date.now();
    const thirtyDays = 30 * 86400000;
    const ninetyDays = 90 * 86400000;

    const history = await Submission.find({
      userAddress: walletAddress.toLowerCase(),
      status: { $in: ['approved', 'rejected'] }
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

    if (history.length === 0) return { score: 0, tier: 0, accuracy: 0 };

    let weightedAccuracy = 0;
    let accuracyValues = [];
    let weightedBehavior = 0;
    let totalWeight = 0;
    let tasksCompleted = 0;

    history.forEach(sub => {
      const age = now - new Date(sub.createdAt).getTime();
      let decay = 0.2;
      if (age < thirtyDays) decay = 1.0;
      else if (age < ninetyDays) decay = 0.6;

      let accuracy = 0;
      if (sub.status === 'approved') {
        accuracy = sub.verificationScore || 80;
      } else {
        accuracy = sub.verificationScore ? sub.verificationScore * 0.3 : 10;
      }

      const behavior = Math.max(0, 100 - ((sub.metrics?.pasteEvents || 0) * 25) - ((sub.metrics?.tabSwitches || 0) * 5));

      weightedAccuracy += accuracy * decay;
      weightedBehavior += behavior * decay;
      accuracyValues.push(accuracy);
      totalWeight += decay;
      tasksCompleted += 1;
    });

    const avgAccuracy = totalWeight > 0 ? weightedAccuracy / totalWeight : 0;
    const avgBehavior = totalWeight > 0 ? weightedBehavior / totalWeight : 0;

    const mean = accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length;
    const variance = accuracyValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / accuracyValues.length;
    const stdDev = Math.sqrt(variance);
    const consistency = Math.max(0, Math.min(100, 100 - (stdDev * 1.5)));

    const volume = Math.min(100, Math.log10(tasksCompleted + 1) * 35);

    const reputation = Math.round(
      avgAccuracy * 0.50 +
      consistency * 0.25 +
      avgBehavior * 0.15 +
      volume * 0.10
    );

    const user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
    const strikes = user?.strikes || 0;
    const banned = user?.banned || false;

    let tier = 0;
    if (!banned && reputation >= 90 && tasksCompleted >= 1000 && strikes === 0) tier = 4;
    else if (!banned && reputation >= 82 && tasksCompleted >= 500 && strikes === 0) tier = 3;
    else if (!banned && reputation >= 70 && tasksCompleted >= 200 && strikes <= 1) tier = 2;
    else if (!banned && reputation >= 55 && tasksCompleted >= 50 && strikes <= 1) tier = 1;

    return {
      score: reputation,
      tier,
      tasksCompleted,
      strikes,
      banned,
      accuracy: Math.round(avgAccuracy),
      consistency: Math.round(consistency),
      behavior: Math.round(avgBehavior),
      volume: Math.round(volume),
    };
  }

  async syncReputationToChain(walletAddress) {
    const rep = await this.calculateReputation(walletAddress);
    // await blockchain.updateTier(walletAddress, rep.tier);
    return rep;
  }
}

module.exports = new VerificationService();
