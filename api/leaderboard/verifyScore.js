import crypto from 'crypto';

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SESSION_TTL_MS = Number.parseInt(process.env.LEADERBOARD_SESSION_TTL_MS || '', 10) || DEFAULT_SESSION_TTL_MS;

const MAX_FPS = 70;
const MAX_BASE_POINTS_PER_FRAME = 6; // generous upper bound
const MULTIPLIER_FACTOR = 50;
const MAX_MULTIPLIER_BONUS_PER_FRAME = MAX_BASE_POINTS_PER_FRAME * (MULTIPLIER_FACTOR - 1);
const MAX_COINS_PER_FRAME_RATIO = 0.2; // generous cap: 1 coin per 5 frames

const REQUIRED_FIELDS = [
  'frames',
  'baseScore',
  'multiplierFrames',
  'multiplierBonus',
  'coinsCollected',
  'powerCoinsCollected'
];

function ensureNumber(value, label) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Invalid ${label}`);
}

function sanitiseSummary(rawSummary) {
  if (!rawSummary || typeof rawSummary !== 'object') {
    throw new Error('Missing run summary');
  }

  const summary = {};

  for (const field of REQUIRED_FIELDS) {
    if (!(field in rawSummary)) {
      throw new Error(`Missing summary field ${field}`);
    }
    summary[field] = ensureNumber(rawSummary[field], field);
  }

  for (const key of Object.keys(summary)) {
    if (summary[key] < 0) {
      throw new Error(`Summary field ${key} must be >= 0`);
    }
    if (!Number.isInteger(summary[key])) {
      // store as integer
      summary[key] = Math.floor(summary[key]);
    }
  }

  return summary;
}

export function computeScoreFromSummary(summary) {
  return summary.baseScore + summary.multiplierBonus + summary.coinsCollected * 100;
}

export function verifyScorePayload({ reportedScore, rawSummary, sessionRecord, now = Date.now() }) {
  if (typeof reportedScore !== 'number' || !Number.isFinite(reportedScore) || reportedScore < 0) {
    throw new Error('Invalid score value');
  }

  if (!sessionRecord) {
    throw new Error('Missing session');
  }

  const summary = sanitiseSummary(rawSummary);
  const expectedScore = computeScoreFromSummary(summary);

  if (expectedScore !== reportedScore) {
    throw new Error('Score mismatch');
  }

  if (summary.frames === 0) {
    throw new Error('Run must contain frames');
  }

  const issuedAt = ensureNumber(sessionRecord.issuedAt, 'session issuedAt');
  const expiresAt = ensureNumber(sessionRecord.expiresAt, 'session expiresAt');
  const sessionTtl = Math.min(expiresAt - issuedAt, MAX_SESSION_TTL_MS);

  if (now < issuedAt - 2000) {
    throw new Error('Session starts in the future');
  }

  if (now > expiresAt + 2000) {
    throw new Error('Session expired');
  }

  const runDurationMs = Math.min(Math.max(now - issuedAt, 0), sessionTtl);
  const maxFramesAllowed = Math.ceil((runDurationMs / 1000) * MAX_FPS);

  if (summary.frames > maxFramesAllowed) {
    throw new Error('Reported frames exceed maximum allowed for session duration');
  }

  if (summary.baseScore > summary.frames * MAX_BASE_POINTS_PER_FRAME) {
    throw new Error('Base score exceeds per-frame limit');
  }

  if (summary.multiplierFrames > summary.frames) {
    throw new Error('Multiplier frames exceed total frames');
  }

  if (summary.multiplierBonus > summary.multiplierFrames * MAX_MULTIPLIER_BONUS_PER_FRAME) {
    throw new Error('Multiplier bonus exceeds per-frame limit');
  }

  const maxCoins = Math.ceil(summary.frames * MAX_COINS_PER_FRAME_RATIO);
  if (summary.coinsCollected > maxCoins) {
    throw new Error('Coin collection rate exceeds threshold');
  }

  if (summary.powerCoinsCollected > summary.coinsCollected + summary.multiplierFrames) {
    throw new Error('Power coin count inconsistent with other metrics');
  }

  return {
    summary,
    expectedScore
  };
}

export function parseSessionRecord(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    throw new Error('Invalid session record');
  }
}

export function withRunHash(summary, sessionId) {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(summary))
    .update(':')
    .update(sessionId)
    .digest('hex');

  return hash;
}


