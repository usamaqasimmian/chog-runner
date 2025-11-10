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

  const ttlMs = getSessionTtlMs();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlMs;
  const sessionId = crypto.randomUUID();
  const sessionRecord = {
    id: sessionId,
    issuedAt,
    expiresAt,
    used: false
  };

  let client;
  try {
    client = createClient({ url: process.env.REDIS_URL });
    await client.connect();

    await client.set(`leaderboard:session:${sessionId}`, JSON.stringify(sessionRecord), {
      PX: ttlMs
    });
  } catch (error) {
    console.error('Failed to create leaderboard session', error);
    if (client) {
      try {
        await client.disconnect();
      } catch (disconnectErr) {
        console.error('Error disconnecting from Redis after failure', disconnectErr);
      }
    }
    return res.status(500).json({ error: 'Failed to create session' });
  }

  try {
    await client.disconnect();
  } catch (error) {
    console.error('Error disconnecting Redis after session creation', error);
  }

  return res.status(200).json({
    sessionId,
    issuedAt,
    expiresAt
  });
}


