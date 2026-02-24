# Strava Activity Browser

A web application to browse your Strava activities with intelligent caching, performance analytics, equipment tracking, and statistics visualization using secure OAuth 2.0 authentication.

## Features

### 🔐 Authentication
- Secure OAuth 2.0 authentication with Strava
- Server-side token management and automatic refresh
- Session-based authentication with athlete ID tracking

### 📊 Activity Management
- Browse paginated activities (30 per page)
- Interactive map thumbnails using real OpenStreetMap tiles
- Click maps to open activity on Strava
- Edit activity name, description, and gear directly in the app
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

### 🔁 Similar Activities
- Groups repeated workouts by name for side-by-side comparison
- Extracts clean workout names from TrainerRoad, WAHOO SYSTM, and Zwift titles
- Sorted by most recent occurrence
- Per-workout summary: count, avg distance, avg time, avg speed, avg ascent

### 💪 Fitness Tracking (Performance Management Chart)
- Performance Management Chart (PMC) showing CTL, ATL, and TSB over time
- Power-based TSS for rides with a power meter; hrTSS fallback using heart rate
- Manual FTP history table so each historical activity uses the correct FTP
- Training zone distribution: time spent in each of 7 zones (Z1 easy through Z7 neuromuscular)
- Polarization index to assess if training is balanced (easy + hard) or monotonous (too much moderate)
- Optional Whoop integration: HRV and recovery score overlaid on the PMC

### ⚙️ Administration
- Check for new activities and import them immediately (bypasses 24-hour TTL)
- Cache invalidation to force a full reload of all activities from Strava

### 💾 Intelligent Caching
- SQLite database with persistent storage
- Incremental updates (only fetch new activities)
- Athlete ID-based caching (survives container restarts)
- Activities: 24-hour TTL with incremental sync
- Equipment: cached permanently on first fetch (no TTL)
- Automatic migration from old sessions

## Documentation

| File | Contents |
|------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Component diagrams and data flows |
| [SCHEMA.md](SCHEMA.md) | Full SQLite schema with column types and notes |
| [API.md](API.md) | Complete API reference for all endpoints |
| [DOCKER.md](DOCKER.md) | Docker deployment guide |

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

- Node.js 18+ installed
- Strava API credentials (Client ID and Client Secret)

## Getting Your Strava API Credentials

1. Go to https://www.strava.com/settings/api
2. Create a new application
3. Set the Authorization Callback Domain to `localhost`
4. Note your Client ID and Client Secret
5. Ensure your app has the `profile:read_all` scope enabled (required for FTP data)

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

# Optional: Whoop integration
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
WHOOP_REDIRECT_URI=http://localhost:3000/whoop/callback
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
4. Browse your activities, equipment, statistics, and fitness data

## Project Structure

```
stravabrowser/
├── backend/              # Node.js/Express backend
│   ├── src/
│   │   ├── config/       # Strava and Whoop API configuration
│   │   ├── routes/       # API routes (auth, activities, equipment,
│   │   │                 #   statistics, admin, athlete, ftpHistory,
│   │   │                 #   fitness, whoop)
│   │   ├── services/     # Strava API client, Whoop API client, caching service
│   │   ├── middleware/   # Authentication middleware, error handler
│   │   ├── db/           # SQLite database initialization and schema
│   │   └── utils/        # Token storage, workout name extraction
│   ├── data/             # SQLite database files (gitignored)
│   └── package.json
├── frontend/             # Vue.js 3 frontend
│   ├── src/
│   │   ├── components/   # ActivityCard, ActivityList, EditActivityModal
│   │   ├── views/        # Dashboard, Equipment, Statistics,
│   │   │                 #   SimilarActivities, Fitness, Admin
│   │   ├── router/       # Vue Router with auth guards
│   │   ├── stores/       # Pinia auth store
│   │   ├── utils/        # Workout name extraction, polyline/map tile math
│   │   └── services/     # API service layer (api.js)
│   └── package.json
├── .claude/              # Claude Code configuration (hooks, rules, skills)
├── ARCHITECTURE.md       # System architecture documentation
├── SCHEMA.md             # SQLite database schema reference
├── API.md                # REST API reference
├── DOCKER.md             # Docker deployment guide
└── package.json          # Root workspace config
```

## Data Persistence

### SQLite Caching
- **Location**: `backend/data/strava_cache.db`
- **Strategy**: Athlete ID-based (not session-based)
- **TTL**: 24 hours for activities; no TTL for equipment
- **Updates**: Incremental (only fetch new activities)
- **Survival**: Cache survives container restarts and deployments

### Cache Tables
See **[SCHEMA.md](SCHEMA.md)** for the full schema. Summary:

| Table | Contents |
|-------|----------|
| `activities` | All Strava activity data including power, HR, polylines |
| `equipment` | Gear details and totals |
| `cache_metadata` | TTL tracking per athlete |
| `athletes` | FTP and profile data from Strava |
| `ftp_history` | Manual FTP timeline for accurate historical TSS |
| `whoop_tokens` | Whoop OAuth tokens |
| `whoop_recoveries` | Daily Whoop HRV and recovery scores |
| `whoop_cycles` | Daily Whoop strain data |

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
7. Athlete FTP and profile saved from Strava
8. User redirected to dashboard
9. Activities cached with athlete ID (not session ID)
10. Cache survives restarts and future logins

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
- Database may have old session data — try logging out and back in

### "FTP shows as null on Fitness page"
- Log out and log back in to re-authorize with the `profile:read_all` scope
- Verify your Strava app has the scope enabled

### "Activities refetching every restart"
- Fixed. Cache now uses athlete ID instead of session ID
- Activities persist across container restarts

## License

MIT
