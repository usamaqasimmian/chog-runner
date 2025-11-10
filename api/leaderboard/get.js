import { get } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Try to get leaderboard data from blob storage
    try {
      const blob = await get('leaderboard/scores.json');
      const data = JSON.parse(blob);
      
      res.status(200).json({ 
        success: true, 
        leaderboard: data.leaderboard || []
      });
    } catch (blobError) {
      // If blob doesn't exist, return empty leaderboard
      res.status(200).json({ 
        success: true, 
        leaderboard: []
      });
    }

  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve leaderboard' });
  }
}
