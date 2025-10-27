// Simple working leaderboard without external dependencies
let leaderboard = [];

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      res.status(200).json({ 
        success: true, 
        leaderboard: leaderboard.sort((a, b) => b.score - a.score).slice(0, 10)
      });
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const { playerName, score, timestamp } = req.body;

      if (!playerName || typeof score !== 'number') {
        return res.status(400).json({ error: 'Missing required fields: playerName and score' });
      }

      // Add new entry
      const leaderboardEntry = {
        playerName: playerName.trim(),
        score,
        timestamp: timestamp || Date.now(),
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };

      leaderboard.push(leaderboardEntry);

      // Sort by score (highest first) and keep top 10
      leaderboard = leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);

      res.status(200).json({ 
        success: true, 
        leaderboard
      });
    } catch (error) {
      console.error('Error saving leaderboard:', error);
      res.status(500).json({ error: 'Failed to save leaderboard' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
