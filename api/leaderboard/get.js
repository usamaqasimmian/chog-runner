import { get } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Try to get leaderboard data from blob storage
    try {
      console.log('Attempting to get blob: leaderboard/scores.json');
      const blob = await get('leaderboard/scores.json');
      console.log('Blob retrieved:', blob);
      const data = JSON.parse(blob);
      console.log('Parsed data:', data);
      
      res.status(200).json({ 
        success: true, 
        leaderboard: data.leaderboard || []
      });
    } catch (blobError) {
      // If blob doesn't exist, return empty leaderboard
      console.log('Blob error:', blobError.message);
      console.log('No leaderboard blob found, returning empty leaderboard');
      res.status(200).json({ 
        success: true, 
        leaderboard: []
      });
    }

  } catch (error) {
    console.error('Error retrieving leaderboard:', error);
    res.status(500).json({ error: 'Failed to retrieve leaderboard' });
  }
}
