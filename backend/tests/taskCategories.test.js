'use strict';

const {
  CATEGORIES,
  MODALITIES,
  ALL_CATEGORIES,
  ALL_MODALITIES,
  CATEGORY_TO_MODALITY,
  NO_PASTE_CATEGORIES,
  TEXT_ANALYSIS_CATEGORIES,
  isValidCategory,
  isValidModality,
} = require('../src/constants/taskCategories');

describe('task categories and modalities', () => {
  test('every category maps to a registered modality', () => {
    for (const category of ALL_CATEGORIES) {
      const modality = CATEGORY_TO_MODALITY[category];
      expect(modality).toBeDefined();
      expect(ALL_MODALITIES).toContain(modality);
    }
  });

  test('no mapping points at a non-existent category', () => {
    for (const category of Object.keys(CATEGORY_TO_MODALITY)) {
      expect(ALL_CATEGORIES).toContain(category);
    }
  });

  test('categories are the hyphenated canonical names (not the seed short names)', () => {
    // Regression: the seed used to write "llm" while verification looked up
    // "llm-rank", silently disabling every time/paste/AI-text rule.
    expect(CATEGORIES.LLM_RANK).toBe('llm-rank');
    expect(CATEGORIES.WRITING_EVAL).toBe('writing-eval');
    expect(ALL_CATEGORIES).not.toContain('llm');
    expect(ALL_CATEGORIES).not.toContain('writing');
  });

  test('modalities match the on-chain registry exactly', () => {
    expect(ALL_MODALITIES.sort()).toEqual(
      ['robotics', 'llm', 'vision', 'audio', 'writing', 'safety', 'medical'].sort()
    );
    expect(MODALITIES.ROBOTICS).toBe('robotics');
  });

  test('anti-gaming category lists are subsets of the known categories', () => {
    for (const category of [...NO_PASTE_CATEGORIES, ...TEXT_ANALYSIS_CATEGORIES]) {
      expect(ALL_CATEGORIES).toContain(category);
    }
  });

  test('validators reject unknown values', () => {
    expect(isValidCategory('llm-rank')).toBe(true);
    expect(isValidCategory('llm')).toBe(false);
    expect(isValidModality('llm')).toBe(true);
    expect(isValidModality('llm-rank')).toBe(false);
    expect(isValidModality('Robotics')).toBe(false);
  });
});
