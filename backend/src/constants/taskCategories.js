// Single source of truth for task category / modality names.
// If you add a category, add it here AND register keccak256(name) on-chain.
const CATEGORIES = {
  LLM_RANK: 'llm-rank',
  ROBOT_PHASE: 'robot-phase',
  GRASP_ANNOTATE: 'grasp-annotate',
  SAFETY_REDTEAM: 'safety-redteam',
  HUMAN_DEMO: 'human-demo',
  VISION_LABEL: 'vision-label',
  WRITING_EVAL: 'writing-eval',
  AUDIO_TRANSCRIBE: 'audio-transcribe',
};

// Categories where pasting answers is not allowed (free-text work)
const NO_PASTE_CATEGORIES = [
  CATEGORIES.WRITING_EVAL,
  CATEGORIES.SAFETY_REDTEAM,
  CATEGORIES.AUDIO_TRANSCRIBE,
];

// Categories that produce free text (AI/repetition analysis applies)
const TEXT_ANALYSIS_CATEGORIES = [
  CATEGORIES.WRITING_EVAL,
  CATEGORIES.SAFETY_REDTEAM,
  CATEGORIES.AUDIO_TRANSCRIBE,
];

module.exports = { CATEGORIES, NO_PASTE_CATEGORIES, TEXT_ANALYSIS_CATEGORIES };
