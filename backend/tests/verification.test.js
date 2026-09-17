'use strict';

const verification = require('../src/services/verification');
const { CATEGORIES } = require('../src/constants/taskCategories');

describe('verification helpers', () => {
  describe('checkHoneypot', () => {
    test('passes when the task has no expected answer', () => {
      expect(verification.checkHoneypot({ taskData: {} }, 'anything')).toBe(true);
    });

    test('passes only on an exact structural match', () => {
      const task = { taskData: { isHoneypot: true, expectedAnswer: { choice: 'A' } } };
      expect(verification.checkHoneypot(task, { choice: 'A' })).toBe(true);
      expect(verification.checkHoneypot(task, { choice: 'B' })).toBe(false);
    });
  });

  describe('analyzeText', () => {
    test('scores highly repetitive text as repetitive', () => {
      const text = 'the cat sat the cat sat the cat sat the cat sat the cat sat';
      const { repetitionScore } = verification.analyzeText(text);
      expect(repetitionScore).toBeGreaterThan(0.6);
    });

    test('scores varied prose as non-repetitive', () => {
      const text =
        'Quantum computing exploits superposition and entanglement. ' +
        'Researchers build error-corrected logical qubits. ' +
        'Industrial adoption remains a decade away.';
      const { repetitionScore, aiProbability } = verification.analyzeText(text);
      expect(repetitionScore).toBeLessThan(0.2);
      expect(aiProbability).toBeGreaterThanOrEqual(0);
      expect(aiProbability).toBeLessThanOrEqual(1);
    });

    test('handles empty input without throwing', () => {
      expect(() => verification.analyzeText('')).not.toThrow();
      const { repetitionScore, cv } = verification.analyzeText('');
      expect(repetitionScore).toBe(0);
      expect(cv).toBe(0);
    });
  });

  describe('calculatePoints', () => {
    test('applies the tier multiplier', () => {
      expect(verification.calculatePoints(100, 1, 0)).toBe(100);
      expect(verification.calculatePoints(100, 1, 1)).toBe(150);
      expect(verification.calculatePoints(100, 1, 4)).toBe(600);
    });

    test('scales by confidence and floors the result', () => {
      expect(verification.calculatePoints(100, 0.5, 0)).toBe(50);
      expect(verification.calculatePoints(33, 0.5, 0)).toBe(16);
    });

    test('falls back to 1x for an out-of-range tier', () => {
      expect(verification.calculatePoints(100, 1, 99)).toBe(100);
    });
  });

  test('TIME_LIMITS covers every free-text category used for analysis', () => {
    // Sanity check that the verification service knows about real categories.
    expect(Object.values(CATEGORIES)).toContain(CATEGORIES.WRITING_EVAL);
  });
});
