# Strava Activity Browser

A web application to browse your Strava activities with intelligent caching, equipment tracking, and statistics visualization using secure OAuth 2.0 authentication.

## Features

### 🔐 Authentication
- Secure OAuth 2.0 authentication with Strava
- Server-side token management and automatic refresh
- Session-based authentication with athlete ID tracking

### 📊 Activity Management
- Browse paginated activities (50 per page)
- Interactive map thumbnails for each activity
- Click maps to open activity on Strava
- Smart caching with 24-hour TTL
- Athlete ID-based cache (survives restarts)

### 🚴 Equipment Tracking
- View all your bikes and shoes
- Track total distance per equipment
- See activities grouped by equipment
- Activity totals and statistics per gear

### 📈 Statistics & Analytics
- Cumulative distance charts by year
- Toggle multiple years for comparison
- 52-week view (full year progression)
- Chart.js powered visualizations
- Full-width responsive charts

### 🔁 Similar Activities
- Groups repeated workouts by name for side-by-side comparison
- Extracts clean workout names from TrainerRoad, WAHOO SYSTM, and Zwift titles
- Sorted by most recent occurrence
- Per-workout summary: count, avg distance, avg time, avg speed, avg ascent
- Per-occurrence list with normalized power and heart rate

### ⚙️ Administration
- Cache invalidation button to force a full reload of all activities from Strava

### 💾 Intelligent Caching
- SQLite database with persistent storage
- Incremental updates (only fetch new activities)
- Athlete ID-based caching (survives container restarts)
- Activities: 24-hour TTL with incremental sync
- Equipment: cached permanently on first fetch (no TTL)
- Automatic migration from old sessions

## Architecture

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for detailed component diagrams and data flows.

- **Backend**: Node.js 20/Express with SQLite caching
- **Frontend**: Vue.js 3 + Vite with Chart.js
- **Database**: SQLite with athlete ID-based persistence
- **Security**: Session-based auth, tokens never exposed to frontend

## Deployment Options

### 🐳 Docker (Recommended)
The easiest way to run this application is using Docker. See **[DOCKER.md](DOCKER.md)** for complete instructions.

**Quick start:**
```bash
cp .env.docker.example backend/.env
# Edit backend/.env with your Strava credentials
docker compose up -d
# Access at http://localhost:180
```

**Ports:**
- Frontend: http://localhost:180
- Backend API: http://localhost:1300 (internal)

### 💻 Local Development

## Prerequisites

- Node.js 20+ installed
- Strava API credentials (Client ID and Client Secret)

## Getting Your Strava API Credentials

1. Go to https://www.strava.com/settings/api
2. Create a new application
3. Set the Authorization Callback Domain to `localhost`
4. Note your Client ID and Client Secret

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This will install dependencies for both backend and frontend workspaces.

### 2. Configure Backend Environment

Create a `.env` file in the `backend/` directory:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your Strava credentials:

```env
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here
STRAVA_REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=generate_a_random_32_character_string_here
PORT=3000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

**Important**: Generate a secure random string for `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start the Application

From the root directory:

```bash
# Start both servers concurrently
npm run dev

# Or start them separately:
npm run dev:backend    # Backend on http://localhost:3000
npm run dev:frontend   # Frontend on http://localhost:5173
```

### 4. Use the Application

1. Open http://localhost:5173 in your browser
2. Click "Login with Strava"
3. Authorize the application
4. Browse your activities, equipment, and statistics

## Project Structure

```
stravabrowser/
├── backend/              # Node.js/Express backend
│   ├── src/
│   │   ├── config/       # Strava API configuration
│   │   ├── routes/       # API routes (auth, activities, equipment, statistics, admin)
│   │   ├── services/     # Strava API client, caching service
│   │   ├── middleware/   # Authentication middleware
│   │   ├── db/           # SQLite database initialization
│   │   └── utils/        # Token storage, workout name extraction
│   ├── data/             # SQLite database files (gitignored)
│   └── package.json
├── frontend/             # Vue.js 3 frontend
│   ├── src/
│   │   ├── components/   # ActivityCard, ActivityList
│   │   ├── views/        # Dashboard, Equipment, Statistics, SimilarActivities, Admin
│   │   ├── router/       # Vue Router with auth guards
│   │   ├── stores/       # Pinia auth store
│   │   ├── utils/        # Workout name extraction
│   │   └── services/     # API service layer
│   └── package.json
├── .claude/              # Claude Code configuration
├── ARCHITECTURE.md       # System architecture documentation
├── DOCKER.md            # Docker deployment guide
└── package.json         # Root workspace config
```

## Data Persistence

### SQLite Caching
- **Location**: `backend/data/strava_cache.db`
- **Strategy**: Athlete ID-based (not session-based)
- **TTL**: 24 hours for activities and equipment
- **Updates**: Incremental (only fetch new activities)
- **Survival**: Cache survives container restarts and deployments

### Cache Tables
- `activities`: All activity data including power (average_watts, weighted_average_watts) and polylines
- `equipment`: Gear details and totals
- `cache_metadata`: TTL tracking per athlete

## Security Notes

- Access tokens stored server-side only
- Sessions use httpOnly cookies
- CORS restricted to frontend origin
- Never commit `.env` or database files
- Use HTTPS in production
- Settings in `.claude/settings.json` gitignored

## OAuth Flow

1. User clicks "Login with Strava"
2. Backend redirects to Strava OAuth page
3. User authorizes the application
4. Strava redirects back with authorization code
5. Backend exchanges code for tokens
6. Tokens stored with session ID, athlete ID saved in session
7. User redirected to dashboard
8. Activities cached with athlete ID (not session ID)
9. Cache survives restarts and future logins

## Troubleshooting

### "Cannot connect to backend"
- Ensure backend is running on port 3000 (local) or 1300 (Docker)
- Check backend/.env configuration

### "OAuth callback error"
- Verify STRAVA_REDIRECT_URI matches your Strava app settings
- Local: `http://localhost:3000/auth/callback`
- Docker: `http://localhost:180/auth/callback`

### "No activities showing"
- Check browser console for errors
- Verify your Strava account has activities
- Check backend logs: `docker compose logs backend`
- Database may have old session data - try logging out and back in

### "Activities refetching every restart"
- Fixed! Cache now uses athlete ID instead of session ID
- Activities persist across container restarts
- Only refetches after 24-hour TTL expires

### "Statistics page not full width"
- Clear browser cache (Cmd+Shift+R)
- Rebuild Docker containers: `docker compose build --no-cache frontend`

## License

MIT
