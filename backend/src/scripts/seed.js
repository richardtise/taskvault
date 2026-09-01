const mongoose = require('mongoose');
const Task = require('../models/Task');
const logger = require('../utils/logger');
require('dotenv').config();

const sampleTasks = [
  {
    taskId: 'llm-rank-001',
    title: 'LLM Response Ranking',
    description: 'Compare two AI responses and pick the better one.',
    instructions: 'Read both responses carefully. Select the one that is more accurate, helpful, and safe.',
    category: 'llm',
    modality: 'llm',
    genre: 'llm',
    basePoints: 15,
    maxCompletions: 1000,
    difficulty: 'Easy',
    estimatedTimeMinutes: 2,
    verificationType: 'automated',
    verificationConfig: { minLength: 1 },
    taskData: {
      prompt: 'Explain quantum computing in one sentence.',
      responseA: 'Quantum computing uses quantum bits to perform calculations faster than classical computers.',
      responseB: 'Quantum computing is a type of computing that uses quantum mechanics.'
    }
  },
  {
    taskId: 'robot-phase-001',
    title: 'Robot Video Phase Labeling',
    description: 'Mark timestamps where robot actions begin and end.',
    instructions: 'Watch the video and click to mark when each phase starts: Approach, Grasp, Lift, Transport, Place.',
    category: 'robotics',
    modality: 'robotics',
    genre: 'robotics',
    basePoints: 80,
    maxCompletions: 500,
    difficulty: 'Medium',
    estimatedTimeMinutes: 5,
    verificationType: 'manual',
    requiredTier: 1,
    requiredBadgeLevel: 1,
    taskData: {
      videoUrl: 'ipfs://...',
      phases: ['Approach', 'Grasp', 'Lift', 'Transport', 'Place']
    }
  },
  {
    taskId: 'vision-label-001',
    title: 'Industrial Visual Inspection',
    description: 'Mark defects on circuit board images.',
    instructions: 'Draw bounding boxes around any defects you see: cracks, solder bridges, discoloration.',
    category: 'vision',
    modality: 'vision',
    genre: 'vision',
    basePoints: 25,
    maxCompletions: 2000,
    difficulty: 'Easy',
    estimatedTimeMinutes: 3,
    verificationType: 'consensus',
    verificationConfig: { consensusThreshold: 0.8, requiredReviews: 3 },
    taskData: {
      imageUrl: 'ipfs://...',
      defectTypes: ['Crack', 'Solder Bridge', 'Discoloration', 'Contamination']
    }
  },
  {
    taskId: 'writing-eval-001',
    title: 'Technical Writing Review',
    description: 'Review and improve a technical document excerpt.',
    instructions: 'Read the provided text. Fix grammar, improve clarity, and suggest structural improvements.',
    category: 'writing',
    modality: 'writing',
    genre: 'writing',
    basePoints: 35,
    maxCompletions: 800,
    difficulty: 'Easy',
    estimatedTimeMinutes: 8,
    verificationType: 'peer_review',
    taskData: {
      text: 'The system utilize advanced algorithms for data processing.',
      wordCount: 500
    }
  },
  {
    taskId: 'safety-redteam-001',
    title: 'Safety Red-Teaming',
    description: 'Find prompts that make AI models produce unsafe outputs.',
    instructions: 'Craft prompts designed to test the safety boundaries of AI systems. Document your findings.',
    category: 'safety',
    modality: 'safety',
    genre: 'safety',
    basePoints: 200,
    maxCompletions: 100,
    difficulty: 'Hard',
    estimatedTimeMinutes: 15,
    verificationType: 'manual',
    requiredTier: 2,
    requiredBadgeLevel: 2,
    taskData: {
      safetyCategories: ['Harmful Instructions', 'Misinformation', 'Privacy Violations', 'Bias']
    }
  }
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/taskvault');
  logger.info('Connected to MongoDB for seeding');

  // Clear existing tasks
  await Task.deleteMany({});
  logger.info('Cleared existing tasks');

  // Insert sample tasks
  for (const taskData of sampleTasks) {
    const task = new Task({ ...taskData, status: 'active', activatedAt: new Date() });
    await task.save();
    logger.info(`Created task: ${task.taskId}`);
  }

  logger.info('Seeding complete');
  mongoose.connection.close();
}

seed().catch(err => {
  logger.error(`Seed error: ${err.message}`);
  process.exit(1);
});
