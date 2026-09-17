'use strict';

const MAX_PAGE_LIMIT = 100;

/**
 * Clamp untrusted page/limit query params.
 *
 * Without this, `limit=0` produced `Math.ceil(total / 0) === Infinity` and a
 * large `limit` was a cheap way to make the database dump an entire collection.
 */
function parsePagination(query = {}, defaultLimit = 20, maxLimit = MAX_PAGE_LIMIT) {
  let page = Number.parseInt(query.page, 10);
  let limit = Number.parseInt(query.limit, 10);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { parsePagination, MAX_PAGE_LIMIT };
