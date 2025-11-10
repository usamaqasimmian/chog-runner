import { put, get, list } from "@vercel/blob";

export default async function handler(req, res) {
  try {
    // List all blobs to see what's in storage
    const blobs = await list();
    
    // Try to get the specific blob
    try {
      const blob = await get('leaderboard/scores.json');
      const data = JSON.parse(blob);
      
      res.status(200).json({ 
        success: true, 
        allBlobs: blobs,
        leaderboardData: data,
        blobContent: blob
      });
    } catch (getError) {
      res.status(200).json({ 
        success: true, 
        allBlobs: blobs,
        error: getError.message
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
