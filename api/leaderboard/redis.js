import { createClient } from 'redis';
import { parseSessionRecord, verifyScorePayload } from './verifyScore.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // Create Redis client
      const client = createClient({
        url: process.env.REDIS_URL
      });

      await client.connect();

      // Get leaderboard from Redis
      const leaderboardData = await client.get('leaderboard');
      const leaderboard = leaderboardData ? JSON.parse(leaderboardData) : [];

      await client.disconnect();

      res.status(200).json({ 
        success: true, 
        leaderboard: leaderboard.sort((a, b) => b.score - a.score).slice(0, 10)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const { playerName, score, timestamp, sessionId, summary } = req.body || {};

      if (!playerName || typeof playerName !== 'string') {
        return res.status(400).json({ error: 'Missing player name' });
      }

      if (typeof score !== 'number' || !Number.isFinite(score)) {
        return res.status(400).json({ error: 'Missing or invalid score' });
      }

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Missing session identifier' });
      }

      // Create Redis client
      const client = createClient({
        url: process.env.REDIS_URL
      });

      await client.connect();

      const sessionKey = `leaderboard:session:${sessionId}`;
      const rawSession = await client.get(sessionKey);
      if (!rawSession) {
        await client.disconnect();
        return res.status(400).json({ error: 'Session not found or expired' });
      }

      const session = parseSessionRecord(rawSession);

      if (session.used) {
        await client.disconnect();
        return res.status(409).json({ error: 'Session already used' });
      }

      const now = Date.now();

      let verificationResult;
      try {
        verificationResult = verifyScorePayload({
          reportedScore: score,
          rawSummary: summary,
          sessionRecord: session,
          now
        });
      } catch (validationError) {
        await client.disconnect();
        return res.status(400).json({ error: validationError.message || 'Invalid run submission' });
      }

      // Get existing leaderboard
      const leaderboardData = await client.get('leaderboard');
      let leaderboard = leaderboardData ? JSON.parse(leaderboardData) : [];

      // Add new entry
      const leaderboardEntry = {
        playerName: playerName.trim(),
        score,
        timestamp: timestamp || Date.now(),
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        summary: verificationResult.summary
      };

      leaderboard.push(leaderboardEntry);

      // Sort by score (highest first) and keep top 10
      leaderboard = leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);

      // Save back to Redis
      await client.set('leaderboard', JSON.stringify(leaderboard));
      await client.set(sessionKey, JSON.stringify({ ...session, used: true, usedAt: now }), {
        PX: 60 * 1000
      });

      await client.disconnect();

      res.status(200).json({
        success: true,
        leaderboard
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save leaderboard' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

