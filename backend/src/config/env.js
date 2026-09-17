'use strict';

/**
 * Centralised environment access.
 *
 * Why this exists: previously the blockchain service read `process.env.PRIVATE_KEY`
 * eagerly at import time, so a missing/placeholder key crashed the entire API with
 * an opaque ethers error. Now:
 *   - base config is validated at boot with an aggregated, readable message;
 *   - chain config is validated lazily, so read-only endpoints still work without
 *     a funded verifier wallet.
 */

require('dotenv').config();

const PLACEHOLDERS = new Set([
  '',
  '0x...',
  'your_super_secret_jwt_key_change_this_in_production',
  'your_infura_project_id',
  'your_infura_secret',
  'changeme',
]);

function isSet(value) {
  return value !== undefined && value !== null && !PLACEHOLDERS.has(String(value).trim());
}

function get(name, fallback = undefined) {
  const value = process.env[name];
  return isSet(value) ? String(value).trim() : fallback;
}

function requireEnv(name) {
  const value = get(name);
  if (value === undefined) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        'Copy backend/.env.example to backend/.env and fill it in.'
    );
  }
  return value;
}

/** Validate the variables needed for the API to boot at all. */
function validateBaseEnv() {
  const missing = [];
  if (!isSet(process.env.MONGODB_URI)) missing.push('MONGODB_URI');
  if (!isSet(process.env.JWT_SECRET)) missing.push('JWT_SECRET');

  if (isSet(process.env.JWT_SECRET) && String(process.env.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy backend/.env.example to backend/.env and fill it in.'
    );
  }
}

/** Validate the variables needed specifically for on-chain writes. */
function validateChainEnv() {
  const missing = [];
  for (const name of ['RPC_URL', 'VAULT_ADDRESS', 'PRIVATE_KEY']) {
    if (!isSet(process.env[name])) missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(
      `Chain configuration incomplete: ${missing.join(', ')}. ` +
        'On-chain features are disabled until these are set.'
    );
  }
}

module.exports = {
  get,
  requireEnv,
  isSet,
  validateBaseEnv,
  validateChainEnv,
};
