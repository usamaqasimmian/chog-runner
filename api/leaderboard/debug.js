import { put, get, list } from "@vercel/blob";

export default async function handler(req, res) {
  try {
    // List all blobs to see what's in storage
    const blobs = await list();
    console.log('All blobs:', blobs);
    
    // Try to get the specific blob
    try {
      const blob = await get('leaderboard/scores.json');
      console.log('Found blob:', blob);
      const data = JSON.parse(blob);
      console.log('Parsed data:', data);
      
      res.status(200).json({ 
        success: true, 
        allBlobs: blobs,
        leaderboardData: data,
        blobContent: blob
      });
    } catch (getError) {
      console.log('Get error:', getError.message);
      res.status(200).json({ 
        success: true, 
        allBlobs: blobs,
        error: getError.message
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
