'use strict';

const fs = require('fs');
const path = require('path');
const winston = require('winston');

const LOG_DIR = process.env.LOG_DIR || 'logs';
const isTest = process.env.NODE_ENV === 'test';

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }),
];

// File logging is skipped under test and must not crash the process if the log
// directory is missing or unwritable (e.g. a fresh clone or a read-only mount).
if (!isTest) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    transports.push(
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'error.log'),
        level: 'error',
      })
    );
    transports.push(
      new winston.transports.File({ filename: path.join(LOG_DIR, 'combined.log') })
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- logger is not constructed yet.
    console.warn(`File logging disabled: ${err.message}`);
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'taskvault-api' },
  transports,
});

module.exports = logger;
