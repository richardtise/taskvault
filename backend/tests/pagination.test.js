'use strict';

const { parsePagination, MAX_PAGE_LIMIT } = require('../src/utils/pagination');

describe('parsePagination', () => {
  test('applies defaults for missing values', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  test('parses valid values', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
    });
  });

  test('clamps limit to the maximum', () => {
    expect(parsePagination({ limit: '100000' }).limit).toBe(MAX_PAGE_LIMIT);
  });

  test('never produces limit 0 (which made pages Infinity)', () => {
    const { limit, pages } = { ...parsePagination({ limit: '0' }) };
    expect(limit).toBe(20);
    const total = 100;
    expect(Math.ceil(total / limit)).toBe(5);
    expect(pages).toBeUndefined();
  });

  test('falls back on non-numeric and negative input', () => {
    expect(parsePagination({ page: 'abc', limit: 'abc' })).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
    });
    expect(parsePagination({ page: '-5', limit: '-5' })).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
    });
  });

  test('honours a custom default limit', () => {
    expect(parsePagination({}, 50).limit).toBe(50);
  });
});
