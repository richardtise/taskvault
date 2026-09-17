'use strict';

const { ethers } = require('ethers');
const {
  toBytes32,
  modalityHash,
  MODALITY_NAMES,
} = require('../src/services/blockchain');

/**
 * Regression tests for the modality encoding that previously broke every
 * on-chain mint: the DB stores plain names ("robotics") while the contract keys
 * badges by keccak256("robotics").
 */
describe('modality encoding', () => {
  test('hashes a plain modality name to keccak256(name)', () => {
    expect(toBytes32('robotics', 'modality')).toBe(ethers.id('robotics'));
    expect(toBytes32('llm', 'modality')).toBe(ethers.id('llm'));
  });

  test('is case- and whitespace-insensitive for plain names', () => {
    expect(toBytes32('  Robotics ', 'modality')).toBe(ethers.id('robotics'));
  });

  test('passes through an already-hashed bytes32 value (lower-cased)', () => {
    const hash = ethers.id('vision').toUpperCase().replace('0X', '0x');
    expect(toBytes32(hash, 'modality')).toBe(ethers.id('vision'));
  });

  test('a padded bytes32 name is NOT treated as a plain name', () => {
    // encodeBytes32String("robotics") is the old, wrong convention.
    const padded = ethers.encodeBytes32String('robotics');
    expect(toBytes32(padded, 'modality')).toBe(padded.toLowerCase());
    expect(toBytes32(padded, 'modality')).not.toBe(ethers.id('robotics'));
  });

  test('rejects empty / non-string input', () => {
    expect(() => toBytes32('', 'modality')).toThrow();
    expect(() => toBytes32(undefined, 'modality')).toThrow();
    expect(() => toBytes32(42, 'modality')).toThrow();
  });

  test('modality list matches the contract constructor registry', () => {
    // contracts/src/TaskVault.sol registers keccak256 of exactly these names.
    expect(MODALITY_NAMES).toEqual([
      'robotics',
      'llm',
      'vision',
      'audio',
      'writing',
      'safety',
      'medical',
    ]);
    for (const name of MODALITY_NAMES) {
      expect(modalityHash(name)).toBe(ethers.id(name));
    }
  });
});
