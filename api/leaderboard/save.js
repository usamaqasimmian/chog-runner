import { put, get } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerName, score, timestamp } = req.body;

    if (!playerName || typeof score !== 'number') {
      return res.status(400).json({ error: 'Missing required fields: playerName and score' });
    }

    // Create leaderboard entry
    const leaderboardEntry = {
      playerName: playerName.trim(),
      score,
      timestamp: timestamp || Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    // Get existing leaderboard data
    let leaderboard = [];
    try {
      // Try to get existing leaderboard from blob storage directly
      const blob = await get('leaderboard/scores.json');
      const data = JSON.parse(blob);
      leaderboard = data.leaderboard || [];
    } catch (error) {
      console.log('No existing leaderboard found, starting fresh');
    }

    // Add new entry
    leaderboard.push(leaderboardEntry);

    // Sort by score (highest first) and keep top 10
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 10);

    // Save to blob storage
    const blobData = JSON.stringify({ leaderboard }, null, 2);
    const { url } = await put('leaderboard/scores.json', blobData, { 
      access: 'public',
      addRandomSuffix: false
    });

    res.status(200).json({ 
      success: true, 
      leaderboard,
      blobUrl: url 
    });

  } catch (error) {
    console.error('Error saving leaderboard:', error);
    res.status(500).json({ error: 'Failed to save leaderboard' });
  }
}
