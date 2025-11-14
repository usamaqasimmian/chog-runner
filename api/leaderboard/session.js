import { createClient } from 'redis';
import crypto from 'crypto';

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getSessionTtlMs() {
  const provided = Number.parseInt(process.env.LEADERBOARD_SESSION_TTL_MS || '', 10);
  if (Number.isFinite(provided) && provided > 10_000) {
    return Math.min(provided, 30 * 60 * 1000); // clamp to 30 minutes
  }
  return DEFAULT_SESSION_TTL_MS;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.REDIS_URL) {
    return res.status(500).json({ error: 'Leaderboard storage not configured' });
  }

  let body = {};
  try {
    if (typeof req.body === 'string') {
      body = req.body ? JSON.parse(req.body) : {};
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    }
  } catch (error) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const fingerprintInput = typeof body.fingerprint === 'string' ? body.fingerprint.slice(0, 1024) : '';
  const fingerprintHash = fingerprintInput
    ? crypto.createHash('sha256').update(fingerprintInput, 'utf8').digest('hex')
    : null;

  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : (forwarded || '');
  const directIp = typeof forwardedIp === 'string' && forwardedIp.length > 0
    ? forwardedIp.split(',')[0].trim()
    : (req.headers['x-real-ip'] || req.socket?.remoteAddress || '');
  const ip = typeof directIp === 'string' ? directIp : '';
  const ipHash = ip ? crypto.createHash('sha256').update(ip, 'utf8').digest('hex') : null;

  const ttlMs = getSessionTtlMs();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlMs;
  const sessionId = crypto.randomUUID();
  const powerSeed = crypto.randomInt(0, 0xFFFFFFFF);
  const sessionRecord = {
    id: sessionId,
    issuedAt,
    expiresAt,
    used: false,
    powerSeed,
    fingerprintHash,
    ipHash
  };

  let client;
  try {
    client = createClient({ url: process.env.REDIS_URL });
    await client.connect();

    if (fingerprintHash) {
      const fpRateKey = `leaderboard:sessionrate:f:${fingerprintHash}`;
      const fpRateCount = await client.incr(fpRateKey);
      if (fpRateCount === 1) {
        await client.pexpire(fpRateKey, 60 * 1000);
      }
      if (fpRateCount > 20) {
        await client.disconnect();
        return res.status(429).json({ error: 'Too many session requests' });
      }
    }

    if (ipHash) {
      const ipRateKey = `leaderboard:sessionrate:ip:${ipHash}`;
      const ipRateCount = await client.incr(ipRateKey);
      if (ipRateCount === 1) {
        await client.pexpire(ipRateKey, 60 * 1000);
      }
      if (ipRateCount > 40) {
        await client.disconnect();
        return res.status(429).json({ error: 'Too many session requests' });
      }
    }

    await client.set(`leaderboard:session:${sessionId}`, JSON.stringify(sessionRecord), {
      PX: ttlMs
    });
  } catch (error) {
    if (client) {
      try {
        await client.disconnect();
      } catch (disconnectErr) {}
    }
    const isConnectionError = error && (
      error.message?.includes('connect') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ETIMEDOUT') ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT'
    );
    const errorMessage = isConnectionError
      ? 'Unable to connect to leaderboard service. Please try again in a moment.'
      : 'Failed to create session. Please try again.';
    return res.status(500).json({ error: errorMessage });
  }

  try {
    await client.disconnect();
  } catch (error) {}

  return res.status(200).json({
    sessionId,
    issuedAt,
    expiresAt,
    powerSeed,
    fingerprintHash,
    ipHash
  });
}


