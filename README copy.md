# Chog Runner Game with Leaderboard

A runner game featuring Chog chasing Monad coins, now with Vercel-powered leaderboard functionality!

## Features

- **Endless Runner Gameplay**: Jump over obstacles, collect coins, and survive as long as possible
- **Power-ups**: Collect special coins for invincibility and score multipliers
- **Global Leaderboard**: Save your high scores to a shared leaderboard using Vercel Blob storage
- **Player Names**: Enter your name to appear on the leaderboard
- **Real-time Updates**: See the leaderboard update immediately after saving your score

## Setup Instructions

### Prerequisites

1. **Node.js** (version 18 or higher) - [Download from nodejs.org](https://nodejs.org/)
2. **Vercel CLI** installed globally
3. **Vercel Account** with Blob storage enabled

#### Installing Node.js

**macOS**: 
- Download from [nodejs.org](https://nodejs.org/) or use Homebrew: `brew install node`

**Windows**: 
- Download installer from [nodejs.org](https://nodejs.org/)

**Linux**: 
- Use your package manager or download from [nodejs.org](https://nodejs.org/)

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

3. **Login to Vercel**:
   ```bash
   vercel login
   ```

4. **Deploy to Vercel**:
   ```bash
   vercel
   ```

5. **Enable Blob Storage**:
   - Go to your Vercel dashboard
   - Navigate to your project
   - Go to Storage tab
   - Create a new Blob store
   - Note the environment variable name (usually `BLOB_READ_WRITE_TOKEN`)

### Environment Variables

Make sure your Vercel project has the following environment variable:
- `BLOB_READ_WRITE_TOKEN`: Your Vercel Blob storage token

### Local Development

To run the game locally with leaderboard functionality:

```bash
vercel dev
```

This will start the development server with API routes enabled.

## How It Works

### Leaderboard Storage

The leaderboard uses Vercel's Blob storage to persist data:

- **Save Endpoint**: `/api/leaderboard/save` - Saves player scores
- **Get Endpoint**: `/api/leaderboard/get` - Retrieves current leaderboard
- **Data Format**: JSON stored in `leaderboard/scores.json` blob
- **Top 10**: Only the top 10 scores are kept

### Game Integration

1. **Game Over**: When the game ends, players can enter their name
2. **Score Saving**: Click "Save Score" to submit to the leaderboard
3. **Leaderboard Display**: Shows top 10 players with medals and dates
4. **Real-time Updates**: Leaderboard refreshes immediately after saving

## API Endpoints

### POST `/api/leaderboard/save`
Saves a new score to the leaderboard.

**Request Body**:
```json
{
  "playerName": "Player Name",
  "score": 12345,
  "timestamp": 1234567890
}
```

**Response**:
```json
{
  "success": true,
  "leaderboard": [...],
  "blobUrl": "https://..."
}
```

### GET `/api/leaderboard/get`
Retrieves the current leaderboard.

**Response**:
```json
{
  "success": true,
  "leaderboard": [
    {
      "playerName": "Player Name",
      "score": 12345,
      "timestamp": 1234567890,
      "id": "unique-id"
    }
  ]
}
```

## Game Controls

- **Space/↑**: Jump
- **↓**: Duck (while on ground)
- **R**: Restart game
- **Tap**: Jump (mobile)

## File Structure

```
├── api/
│   └── leaderboard/
│       ├── save.js          # Save score endpoint
│       └── get.js           # Get leaderboard endpoint
├── Cursor-darwin-x64.dmg/
│   ├── assets/
│   │   ├── chog.png         # Player sprite
│   │   └── monad.png        # Coin sprite
│   ├── chog-runner.js       # Main game logic
│   └── index.html           # Game HTML
├── package.json             # Dependencies
├── vercel.json             # Vercel configuration
└── README.md               # This file
```

## Troubleshooting

### Common Issues

1. **API Routes Not Working**: Make sure you're running `vercel dev` for local development
2. **Blob Storage Errors**: Verify your `BLOB_READ_WRITE_TOKEN` environment variable
3. **CORS Issues**: The API routes should handle CORS automatically in Vercel

### Debug Mode

Check the browser console for any error messages. The game logs leaderboard operations for debugging.

## Contributing

Feel free to submit issues and enhancement requests!

## License

See LICENSE file for details.
