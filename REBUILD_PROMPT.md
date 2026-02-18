# Strava Activity Browser — Complete Rebuild Prompt

Use this document to recreate the entire project from scratch. It contains every file, all implementation decisions, and the critical fixes that were discovered during development.

---

## Project Overview

A single-user web application to browse Strava activities with:
- OAuth 2.0 authentication with Strava
- SQLite-backed activity caching (athlete ID-based, survives container restarts)
- Equipment (bikes/shoes) tracking with per-gear activity statistics
- Cumulative distance statistics by year with Chart.js
- Interactive map thumbnails (decoded from polylines) that link to Strava
- Docker deployment: nginx frontend + Node.js backend

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend runtime | Node.js | 20 (18 in backend Dockerfile — see note) |
| Backend framework | Express | ^4.18.2 |
| Session management | express-session | ^1.17.3 |
| HTTP client | axios | ^1.6.5 |
| Database | better-sqlite3 | ^12.6.2 |
| HTTP requests | cors, dotenv | latest |
| Dev server | nodemon | ^3.0.3 |
| Frontend framework | Vue.js | ^3.5.25 |
| Build tool | Vite | ^7.3.1 (requires Node 20) |
| Vue plugin | @vitejs/plugin-vue | ^6.0.2 |
| Router | vue-router | ^4.2.5 |
| State management | pinia | ^2.1.7 |
| Charts | chart.js | ^4.5.1 |
| Frontend HTTP | axios | ^1.6.5 |
| Frontend container | nginx:alpine | latest |
| Backend container | node:18-alpine | 18 |

> **Note on Node versions**: The backend Dockerfile uses `node:18-alpine` (works fine for Express + better-sqlite3). The frontend Dockerfile uses `node:20-alpine` for the build stage because Vite 7 requires Node 20+. Do not use Node 18 to build the frontend.

---

## Project Structure

```
stravabrowser/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── app.js
│   │   ├── config/
│   │   │   └── strava.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── activities.js
│   │   │   ├── equipment.js
│   │   │   └── statistics.js
│   │   ├── services/
│   │   │   ├── stravaAuth.js
│   │   │   ├── stravaApi.js
│   │   │   └── cacheService.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   ├── db/
│   │   │   └── database.js
│   │   └── utils/
│   │       └── tokenStorage.js
│   ├── data/                    # gitignored — SQLite lives here
│   ├── Dockerfile
│   ├── package.json
│   └── .env                     # gitignored — you must create this
├── frontend/
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   ├── components/
│   │   │   ├── ActivityCard.vue
│   │   │   ├── ActivityList.vue
│   │   │   └── LoginButton.vue
│   │   ├── views/
│   │   │   ├── Home.vue
│   │   │   ├── Dashboard.vue
│   │   │   ├── Callback.vue
│   │   │   ├── Equipment.vue
│   │   │   └── Statistics.vue
│   │   ├── router/
│   │   │   └── index.js
│   │   ├── stores/
│   │   │   └── auth.js
│   │   ├── services/
│   │   │   └── api.js
│   │   └── utils/
│   │       └── polyline.js
│   ├── index.html
│   ├── vite.config.js
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── update.sh
├── package.json                 # root workspace config
└── .gitignore
```

---

## Environment Variables

Create `backend/.env` (never commit this file):

```env
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here
STRAVA_REDIRECT_URI=http://localhost:180/auth/callback
SESSION_SECRET=generate_a_random_64_char_hex_string
PORT=3000
FRONTEND_URL=http://localhost:180
NODE_ENV=production
```

For local development, use:
```env
STRAVA_REDIRECT_URI=http://localhost:3000/auth/callback
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Generate SESSION_SECRET with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## OAuth Flow

1. User visits `/` → clicks "Login with Strava"
2. Frontend navigates to backend `/auth/login`
3. Backend redirects to `https://www.strava.com/oauth/authorize` with scopes `read,activity:read_all`
4. User approves on Strava → Strava redirects to `STRAVA_REDIRECT_URI` with `?code=xxx`
5. Backend handler (`GET /auth/callback`):
   - Exchanges code for tokens via POST to `https://www.strava.com/oauth/token`
   - Stores tokens in in-memory `tokenStorage` keyed by session ID
   - Sets `req.session.authenticated = true` and `req.session.athleteId = tokens.athlete.id`
   - **CRITICAL**: calls `req.session.save()` before redirecting — without this, the session is not persisted before the redirect and the frontend's next request arrives with a different session
   - Redirects to `FRONTEND_URL/callback?success=true`
6. Frontend `/callback` page checks auth status → redirects to `/dashboard`
7. Dashboard fetches activities via `/api/activities` — backend serves from SQLite cache

---

## Caching Strategy

**Key design decision**: Cache is keyed by **athlete ID** (not session ID).

Session IDs are ephemeral — they reset on container restart. Athlete IDs are stable Strava user identifiers. Tying cache to athlete IDs means the SQLite database survives container restarts without data loss.

### Cache Tables

```sql
activities     -- all fetched activities, session_id column stores athlete ID
equipment      -- gear details, session_id column stores athlete ID
cache_metadata -- TTL tracking, key = "activities:{athleteId}" or "equipment:{athleteId}"
```

> The column is named `session_id` for historical reasons but stores the athlete ID.

### Activity Fetch Strategy

1. **Initial load** (no cache): fetch all activities in batches of 200, up to 10 pages (2000 activities max)
2. **Incremental update** (cache exists but TTL expired after 24h): fetch only page 1 (200 most recent), filter by most recent cached date
3. **Cache hit** (TTL not expired): serve directly from SQLite, no API call

### Migration

On every activities request, call `migrateActivitiesToAthlete(sessionId, athleteId)` to update any rows still keyed by old session IDs. This is a no-op once migrated.

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  distance REAL,
  moving_time INTEGER,
  elapsed_time INTEGER,
  total_elevation_gain REAL,
  type TEXT,
  sport_type TEXT,
  start_date TEXT,
  start_date_local TEXT,
  timezone TEXT,
  average_speed REAL,
  max_speed REAL,
  average_cadence REAL,
  average_heartrate REAL,
  max_heartrate REAL,
  gear_id TEXT,
  map_summary_polyline TEXT,
  session_id TEXT,              -- stores athlete ID
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  brand_name TEXT,
  model_name TEXT,
  description TEXT,
  distance REAL,
  primary_gear INTEGER DEFAULT 0,
  retired INTEGER DEFAULT 0,
  session_id TEXT,              -- stores athlete ID
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS cache_metadata (
  key TEXT PRIMARY KEY,
  session_id TEXT,              -- stores athlete ID
  last_fetched INTEGER NOT NULL,
  expires_at INTEGER,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_activities_gear_id ON activities(gear_id);
CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_session_gear ON activities(session_id, gear_id);
CREATE INDEX IF NOT EXISTS idx_equipment_session ON equipment(session_id);
CREATE INDEX IF NOT EXISTS idx_cache_session ON cache_metadata(session_id);
```

**CRITICAL**: The `ON CONFLICT` clause in `INSERT INTO activities` must include `session_id = excluded.session_id`. Without this, updating an existing activity will not update the session_id column and the migration will silently fail.

---

## Critical Implementation Notes

### 1. `req.session.save()` before redirect (auth/callback)

```js
req.session.save((err) => {
  if (err) return res.redirect(`${FRONTEND_URL}/?error=session_save_failed`);
  res.redirect(`${FRONTEND_URL}/callback?success=true`);
});
```

Without the explicit `save()`, the session write races with the redirect. The browser receives the redirect and immediately fires the next request before the session is written to the store, resulting in a new session ID and a lost authentication state.

### 2. `app.set('trust proxy', 1)` in Express

Required when Express runs behind nginx. Without it, `req.secure` and IP headers are wrong, and session cookie `secure` handling may misbehave.

### 3. Session cookie settings for nginx proxy

```js
cookie: {
  secure: false,        // true only when using HTTPS end-to-end
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  sameSite: 'lax',
  path: '/',
  domain: undefined,    // do NOT set domain — let the browser handle it
}
```

### 4. Frontend CSS: override Vite default template width

Vite's default template generates a global `app { max-width: 1280px; ... }` rule in `style.css`. This constrains page width. In `App.vue`, override it:

```css
app {
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
}
```

Also reset html/body:
```css
html, body {
  width: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}
#app {
  min-height: 100vh;
  width: 100%;
  margin: 0;
  padding: 0;
}
```

### 5. nginx cookie pass-through

The nginx config must explicitly pass cookies to/from the backend:

```nginx
proxy_set_header Cookie $http_cookie;
proxy_pass_header Set-Cookie;
```

Without this, the session cookie is not forwarded through the proxy and every request gets a new session.

### 6. Equipment gear type detection

The Strava API `/gear/{id}` endpoint does not return a `type` field differentiating bikes from shoes. Determine type heuristically:

```js
const isShoe = gearData.name?.toLowerCase().includes('shoe') ||
               gearData.name?.toLowerCase().includes('run');
return isShoe ? 'shoe' : 'bike';
```

### 7. Statistics: cumulative distance

The statistics endpoint returns cumulative distance per week (not per-week distance). Accumulate as you iterate:

```js
let cumulativeDistance = 0;
for (let week = 1; week <= 52; week++) {
  cumulativeDistance += yearWeekData[year][week] || 0;
  weeks.push({ week, distance: Math.round(cumulativeDistance * 10) / 10 });
}
```

### 8. ISO week number calculation

```js
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
```

---

## All Source Files

### `package.json` (root)

```json
{
  "name": "stravabrowser",
  "version": "1.0.0",
  "description": "A web application to browse Strava activities with OAuth 2.0 authentication",
  "private": true,
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "install:all": "npm install && npm install --workspace=backend && npm install --workspace=frontend",
    "dev:backend": "npm run dev --workspace=backend",
    "dev:frontend": "npm run dev --workspace=frontend",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\""
  },
  "keywords": ["strava", "oauth", "vue", "express"],
  "license": "MIT",
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

### `backend/package.json`

```json
{
  "name": "stravabrowser-backend",
  "version": "1.0.0",
  "main": "src/server.js",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.5",
    "better-sqlite3": "^12.6.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-session": "^1.17.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  }
}
```

### `backend/src/server.js`

```js
import app from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});
```

### `backend/src/app.js`

```js
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import activitiesRoutes from './routes/activities.js';
import equipmentRoutes from './routes/equipment.js';
import statisticsRoutes from './routes/statistics.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

// Required when behind nginx
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-this',
  resave: false,
  saveUninitialized: false,
  name: 'strava.sid',
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
    path: '/',
    domain: undefined,
  },
}));

// Debug logging
app.use((req, res, next) => {
  console.log(`📋 ${req.method} ${req.path} - Session ID: ${req.session?.id || 'NONE'}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/statistics', statisticsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

### `backend/src/config/strava.js`

```js
import dotenv from 'dotenv';
dotenv.config();

export const stravaConfig = {
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
  redirectUri: process.env.STRAVA_REDIRECT_URI,
  authorizeUrl: 'https://www.strava.com/oauth/authorize',
  tokenUrl: 'https://www.strava.com/oauth/token',
  apiBaseUrl: 'https://www.strava.com/api/v3',
  scope: 'read,activity:read_all',
};

const requiredVars = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REDIRECT_URI'];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
```

### `backend/src/utils/tokenStorage.js`

```js
class TokenStorage {
  constructor() {
    this.tokens = new Map();
  }

  saveTokens(sessionId, tokens) {
    if (!sessionId) throw new Error('Session ID is required');
    this.tokens.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      tokenType: tokens.token_type,
      athlete: tokens.athlete,
      savedAt: Date.now(),
    });
  }

  getTokens(sessionId) {
    if (!sessionId) return null;
    return this.tokens.get(sessionId);
  }

  deleteTokens(sessionId) {
    if (!sessionId) return false;
    return this.tokens.delete(sessionId);
  }

  hasTokens(sessionId) {
    return this.tokens.has(sessionId);
  }

  clearAll() {
    this.tokens.clear();
  }
}

export const tokenStorage = new TokenStorage();
```

### `backend/src/services/stravaAuth.js`

```js
import axios from 'axios';
import { stravaConfig } from '../config/strava.js';

export function generateAuthUrl() {
  const params = new URLSearchParams({
    client_id: stravaConfig.clientId,
    redirect_uri: stravaConfig.redirectUri,
    response_type: 'code',
    scope: stravaConfig.scope,
    approval_prompt: 'auto',
  });
  return `${stravaConfig.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  try {
    const response = await axios.post(stravaConfig.tokenUrl, {
      client_id: stravaConfig.clientId,
      client_secret: stravaConfig.clientSecret,
      code,
      grant_type: 'authorization_code',
    });
    return response.data;
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    throw new Error('Failed to exchange authorization code for tokens');
  }
}

export async function refreshAccessToken(refreshToken) {
  try {
    const response = await axios.post(stravaConfig.tokenUrl, {
      client_id: stravaConfig.clientId,
      client_secret: stravaConfig.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return response.data;
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
  }
}

export function isTokenExpired(expiresAt) {
  const bufferSeconds = 300; // 5 minute buffer
  return Math.floor(Date.now() / 1000) >= (expiresAt - bufferSeconds);
}
```

### `backend/src/services/stravaApi.js`

```js
import axios from 'axios';
import { stravaConfig } from '../config/strava.js';
import { tokenStorage } from '../utils/tokenStorage.js';
import { refreshAccessToken, isTokenExpired } from './stravaAuth.js';

export function createStravaClient(sessionId) {
  const client = axios.create({ baseURL: stravaConfig.apiBaseUrl });

  client.interceptors.request.use(async (config) => {
    let tokens = tokenStorage.getTokens(sessionId);
    if (!tokens) throw new Error('No tokens found for session');

    if (isTokenExpired(tokens.expiresAt)) {
      console.log('Access token expired, refreshing...');
      const newTokens = await refreshAccessToken(tokens.refreshToken);
      tokenStorage.saveTokens(sessionId, newTokens);
      tokens = tokenStorage.getTokens(sessionId);
    }

    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        const tokens = tokenStorage.getTokens(sessionId);
        if (tokens?.refreshToken) {
          const newTokens = await refreshAccessToken(tokens.refreshToken);
          tokenStorage.saveTokens(sessionId, newTokens);
          const freshTokens = tokenStorage.getTokens(sessionId);
          originalRequest.headers.Authorization = `Bearer ${freshTokens.accessToken}`;
          return client(originalRequest);
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export async function getActivities(sessionId, page = 1, perPage = 30) {
  const client = createStravaClient(sessionId);
  const response = await client.get('/athlete/activities', {
    params: { page, per_page: perPage },
  });
  return response.data;
}

export async function getActivity(sessionId, activityId) {
  const client = createStravaClient(sessionId);
  const response = await client.get(`/activities/${activityId}`);
  return response.data;
}

export async function getAthlete(sessionId) {
  const client = createStravaClient(sessionId);
  const response = await client.get('/athlete');
  return response.data;
}

export async function getGear(sessionId) {
  const client = createStravaClient(sessionId);

  // Fetch up to 2000 activities to discover all gear IDs
  const allActivities = [];
  let page = 1;
  while (page <= 10) {
    const response = await client.get('/athlete/activities', {
      params: { page, per_page: 200 },
    });
    if (response.data.length === 0) break;
    allActivities.push(...response.data);
    page++;
    const gearIds = new Set(allActivities.filter(a => a.gear_id).map(a => a.gear_id));
    if (gearIds.size >= 10 && page > 5) break;
  }

  const gearIds = new Set(allActivities.filter(a => a.gear_id).map(a => a.gear_id));
  console.log(`Found ${gearIds.size} unique gear IDs`);

  const gearPromises = Array.from(gearIds).map(async (gearId) => {
    try {
      const response = await client.get(`/gear/${gearId}`);
      const g = response.data;
      const isShoe = g.name?.toLowerCase().includes('shoe') ||
                     g.name?.toLowerCase().includes('run');
      return {
        id: g.id,
        name: g.name,
        primary: g.primary || false,
        distance: g.distance || 0,
        brand_name: g.brand_name,
        model_name: g.model_name,
        description: g.description,
        retired: g.retired || false,
        type: isShoe ? 'shoe' : 'bike',
      };
    } catch (err) {
      console.error(`Failed to fetch gear ${gearId}:`, err.message);
      return null;
    }
  });

  return (await Promise.all(gearPromises)).filter(Boolean);
}

export async function getGearDetails(sessionId, gearId) {
  const client = createStravaClient(sessionId);
  const response = await client.get(`/gear/${gearId}`);
  return response.data;
}
```

### `backend/src/db/database.js`

```js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'strava_cache.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    distance REAL,
    moving_time INTEGER,
    elapsed_time INTEGER,
    total_elevation_gain REAL,
    type TEXT,
    sport_type TEXT,
    start_date TEXT,
    start_date_local TEXT,
    timezone TEXT,
    average_speed REAL,
    max_speed REAL,
    average_cadence REAL,
    average_heartrate REAL,
    max_heartrate REAL,
    gear_id TEXT,
    map_summary_polyline TEXT,
    session_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    brand_name TEXT,
    model_name TEXT,
    description TEXT,
    distance REAL,
    primary_gear INTEGER DEFAULT 0,
    retired INTEGER DEFAULT 0,
    session_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS cache_metadata (
    key TEXT PRIMARY KEY,
    session_id TEXT,
    last_fetched INTEGER NOT NULL,
    expires_at INTEGER,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_activities_gear_id ON activities(gear_id);
  CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date DESC);
  CREATE INDEX IF NOT EXISTS idx_activities_session_gear ON activities(session_id, gear_id);
  CREATE INDEX IF NOT EXISTS idx_equipment_session ON equipment(session_id);
  CREATE INDEX IF NOT EXISTS idx_cache_session ON cache_metadata(session_id);
`);

console.log('✅ Database initialized at:', dbPath);

export default db;
```

### `backend/src/services/cacheService.js`

```js
import db from '../db/database.js';

export const TTL = {
  ACTIVITIES_CHECK: 24 * 60 * 60, // 24 hours
  EQUIPMENT: 24 * 60 * 60,
};

export function isCacheValid(sessionId, cacheKey) {
  const result = db.prepare(
    'SELECT expires_at FROM cache_metadata WHERE key = ? AND session_id = ?'
  ).get(cacheKey, sessionId);
  if (!result) return false;
  return result.expires_at > Math.floor(Date.now() / 1000);
}

export function updateCacheMetadata(sessionId, cacheKey, ttl, metadata = null) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO cache_metadata (key, session_id, last_fetched, expires_at, metadata)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      session_id = excluded.session_id,
      last_fetched = excluded.last_fetched,
      expires_at = excluded.expires_at,
      metadata = excluded.metadata
  `).run(cacheKey, sessionId, now, now + ttl, metadata ? JSON.stringify(metadata) : null);
}

export function saveActivities(sessionId, activities) {
  console.log(`💾 Saving ${activities.length} activities for session: ${sessionId}`);

  const stmt = db.prepare(`
    INSERT INTO activities (
      id, name, distance, moving_time, elapsed_time, total_elevation_gain,
      type, sport_type, start_date, start_date_local, timezone,
      average_speed, max_speed, average_cadence, average_heartrate, max_heartrate,
      gear_id, map_summary_polyline, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      distance = excluded.distance,
      moving_time = excluded.moving_time,
      elapsed_time = excluded.elapsed_time,
      total_elevation_gain = excluded.total_elevation_gain,
      type = excluded.type,
      sport_type = excluded.sport_type,
      average_speed = excluded.average_speed,
      max_speed = excluded.max_speed,
      average_cadence = excluded.average_cadence,
      average_heartrate = excluded.average_heartrate,
      max_heartrate = excluded.max_heartrate,
      gear_id = excluded.gear_id,
      map_summary_polyline = excluded.map_summary_polyline,
      session_id = excluded.session_id,
      updated_at = strftime('%s', 'now')
  `);
  // NOTE: session_id = excluded.session_id is REQUIRED in the ON CONFLICT clause
  // Without it, migration from old session IDs silently fails

  db.transaction((acts) => {
    for (const a of acts) {
      stmt.run(
        a.id?.toString(), a.name, a.distance, a.moving_time, a.elapsed_time,
        a.total_elevation_gain, a.type, a.sport_type, a.start_date,
        a.start_date_local, a.timezone, a.average_speed, a.max_speed,
        a.average_cadence, a.average_heartrate, a.max_heartrate,
        a.gear_id, a.map?.summary_polyline, sessionId
      );
    }
  })(activities);
}

export function getActivities(sessionId, gearId = null, page = 1, perPage = 30) {
  let query = 'SELECT * FROM activities WHERE session_id = ?';
  const params = [sessionId];
  if (gearId) {
    query += ' AND gear_id = ?';
    params.push(gearId);
  }
  query += ' ORDER BY start_date DESC LIMIT ? OFFSET ?';
  params.push(perPage, (page - 1) * perPage);

  return db.prepare(query).all(...params).map(a => ({
    ...a,
    id: parseInt(a.id),
    map: a.map_summary_polyline ? { summary_polyline: a.map_summary_polyline } : null,
  }));
}

export function getAllActivities(sessionId) {
  return db.prepare(
    'SELECT * FROM activities WHERE session_id = ? ORDER BY start_date DESC'
  ).all(sessionId).map(a => ({
    ...a,
    id: parseInt(a.id),
    map: a.map_summary_polyline ? { summary_polyline: a.map_summary_polyline } : null,
  }));
}

export function hasActivitiesCache(sessionId) {
  return db.prepare(
    'SELECT COUNT(*) as count FROM activities WHERE session_id = ?'
  ).get(sessionId).count > 0;
}

export function getMostRecentActivityDate(sessionId) {
  const result = db.prepare(
    'SELECT start_date FROM activities WHERE session_id = ? ORDER BY start_date DESC LIMIT 1'
  ).get(sessionId);
  return result?.start_date || null;
}

export function saveEquipment(sessionId, equipment) {
  const stmt = db.prepare(`
    INSERT INTO equipment (id, name, type, brand_name, model_name, description,
      distance, primary_gear, retired, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, type = excluded.type, brand_name = excluded.brand_name,
      model_name = excluded.model_name, description = excluded.description,
      distance = excluded.distance, primary_gear = excluded.primary_gear,
      retired = excluded.retired, updated_at = strftime('%s', 'now')
  `);

  db.transaction((gear) => {
    for (const g of gear) {
      stmt.run(g.id, g.name, g.type, g.brand_name, g.model_name, g.description,
               g.distance, g.primary ? 1 : 0, g.retired ? 1 : 0, sessionId);
    }
  })(equipment);
}

export function getEquipment(sessionId) {
  return db.prepare(
    'SELECT * FROM equipment WHERE session_id = ? ORDER BY primary_gear DESC, name ASC'
  ).all(sessionId).map(g => ({ ...g, primary: g.primary_gear === 1, retired: g.retired === 1 }));
}

export function getEquipmentById(sessionId, equipmentId) {
  const g = db.prepare(
    'SELECT * FROM equipment WHERE id = ? AND session_id = ?'
  ).get(equipmentId, sessionId);
  if (!g) return null;
  return { ...g, primary: g.primary_gear === 1, retired: g.retired === 1 };
}

export function clearSessionCache(sessionId) {
  db.prepare('DELETE FROM activities WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM equipment WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM cache_metadata WHERE session_id = ?').run(sessionId);
}

/**
 * Migrate all rows from old session-based IDs to athlete ID.
 * Safe to call on every request — no-op if nothing to migrate.
 */
export function migrateActivitiesToAthlete(oldSessionId, athleteId) {
  const total = db.prepare('SELECT COUNT(*) as count FROM activities').get();
  if (total.count === 0) return 0;

  const result = db.prepare(
    'UPDATE activities SET session_id = ? WHERE session_id != ?'
  ).run(athleteId, athleteId);

  db.prepare('UPDATE cache_metadata SET session_id = ? WHERE session_id != ?').run(athleteId, athleteId);
  db.prepare('UPDATE equipment SET session_id = ? WHERE session_id != ?').run(athleteId, athleteId);

  return result.changes;
}

export function getCacheStats(sessionId) {
  return {
    activities: db.prepare('SELECT COUNT(*) as count FROM activities WHERE session_id = ?').get(sessionId).count,
    equipment: db.prepare('SELECT COUNT(*) as count FROM equipment WHERE session_id = ?').get(sessionId).count,
    mostRecentActivity: getMostRecentActivityDate(sessionId),
    cache: db.prepare('SELECT * FROM cache_metadata WHERE session_id = ?').all(sessionId).map(m => ({
      key: m.key,
      lastFetched: new Date(m.last_fetched * 1000).toISOString(),
      expiresAt: new Date(m.expires_at * 1000).toISOString(),
    })),
  };
}
```

### `backend/src/middleware/auth.js`

```js
import { tokenStorage } from '../utils/tokenStorage.js';

export function requireAuth(req, res, next) {
  const sessionId = req.session?.id;
  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
  }
  const tokens = tokenStorage.getTokens(sessionId);
  if (!tokens) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
  }
  req.tokens = tokens;
  next();
}

export function optionalAuth(req, res, next) {
  const sessionId = req.session?.id;
  if (sessionId) {
    const tokens = tokenStorage.getTokens(sessionId);
    if (tokens) req.tokens = tokens;
  }
  next();
}
```

### `backend/src/middleware/errorHandler.js`

```js
export function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  res.status(statusCode).json({
    error: err.name || 'Error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
  });
}
```

### `backend/src/routes/auth.js`

```js
import express from 'express';
import { generateAuthUrl, exchangeCodeForTokens } from '../services/stravaAuth.js';
import { tokenStorage } from '../utils/tokenStorage.js';

const router = express.Router();

router.get('/login', (req, res) => {
  res.redirect(generateAuthUrl());
});

router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/?error=access_denied`);
  }
  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}/?error=missing_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const sessionId = req.session.id;
    tokenStorage.saveTokens(sessionId, tokens);
    req.session.authenticated = true;
    req.session.athleteId = tokens.athlete?.id;

    // CRITICAL: explicit save before redirect to prevent session race condition
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect(`${process.env.FRONTEND_URL}/?error=session_save_failed`);
      }
      res.redirect(`${process.env.FRONTEND_URL}/callback?success=true`);
    });
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/?error=token_exchange_failed`);
  }
});

router.get('/status', (req, res) => {
  const sessionId = req.session?.id;
  const isAuthenticated = sessionId && tokenStorage.hasTokens(sessionId);

  if (isAuthenticated) {
    const tokens = tokenStorage.getTokens(sessionId);
    return res.json({ authenticated: true, athlete: tokens.athlete });
  }
  res.json({ authenticated: false });
});

router.post('/logout', (req, res) => {
  const sessionId = req.session?.id;
  if (sessionId) {
    tokenStorage.deleteTokens(sessionId);
    // Activity cache is NOT cleared — it's keyed by athleteId and persists
  }
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

export default router;
```

### `backend/src/routes/activities.js`

```js
import express from 'express';
import { getActivities as fetchActivities, getActivity } from '../services/stravaApi.js';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const athleteId = req.session.athleteId?.toString();
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 30;
    const gearId = req.query.gear_id || null;

    if (!athleteId) {
      return res.status(401).json({ error: 'Athlete ID not found in session' });
    }

    const cacheKey = `activities:${athleteId}`;

    // Migrate old session-based records to athlete ID (no-op once done)
    const migrated = cache.migrateActivitiesToAthlete(sessionId, athleteId);
    if (migrated > 0) {
      console.log(`🔄 Migrated ${migrated} activities to athlete ${athleteId}`);
    }

    const hasCache = cache.hasActivitiesCache(athleteId);
    const shouldCheckForNew = !cache.isCacheValid(athleteId, cacheKey);

    if (!hasCache) {
      // Initial load: fetch all activities (up to 10 pages × 200)
      console.log(`📥 Initial load for athlete ${athleteId}`);
      const allActivities = [];
      let fetchPage = 1;
      while (fetchPage <= 10) {
        const batch = await fetchActivities(sessionId, fetchPage, 200);
        if (batch.length === 0) break;
        allActivities.push(...batch);
        fetchPage++;
      }
      cache.saveActivities(athleteId, allActivities);
      cache.updateCacheMetadata(athleteId, cacheKey, cache.TTL.ACTIVITIES_CHECK);
      console.log(`💾 Cached ${allActivities.length} activities`);
    } else if (shouldCheckForNew) {
      // Incremental: fetch only recent activities
      console.log('🔄 Checking for new activities');
      const mostRecentDate = cache.getMostRecentActivityDate(athleteId);
      const mostRecentTs = mostRecentDate
        ? Math.floor(new Date(mostRecentDate).getTime() / 1000)
        : null;
      const recent = await fetchActivities(sessionId, 1, 200);
      const newActivities = mostRecentTs
        ? recent.filter(a => Math.floor(new Date(a.start_date).getTime() / 1000) > mostRecentTs)
        : recent;
      if (newActivities.length > 0) {
        console.log(`📥 Found ${newActivities.length} new activities`);
        cache.saveActivities(athleteId, newActivities);
      }
      cache.updateCacheMetadata(athleteId, cacheKey, cache.TTL.ACTIVITIES_CHECK);
    }

    const activities = cache.getActivities(athleteId, gearId, page, perPage);
    console.log(`📤 Returning ${activities.length} activities (page ${page})`);
    res.json({ activities, page, perPage, cached: hasCache });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const activityId = req.params.id;
    if (!activityId || isNaN(activityId)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid activity ID' });
    }
    const activity = await getActivity(sessionId, activityId);
    res.json(activity);
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Not Found', message: 'Activity not found' });
    }
    next(error);
  }
});

export default router;
```

### `backend/src/routes/equipment.js`

```js
import express from 'express';
import { getGear, getGearDetails } from '../services/stravaApi.js';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const athleteId = req.session.athleteId?.toString();

    if (!athleteId) {
      return res.status(401).json({ error: 'Athlete ID not found in session' });
    }

    cache.migrateActivitiesToAthlete(sessionId, athleteId);

    const cacheKey = `equipment:${athleteId}`;
    const isCacheValid = cache.isCacheValid(athleteId, cacheKey);

    let gear;
    if (isCacheValid) {
      console.log('✅ Serving equipment from cache');
      gear = cache.getEquipment(athleteId);
    } else {
      console.log('🔄 Fetching equipment from Strava API');
      gear = await getGear(sessionId);
      cache.saveEquipment(athleteId, gear);
      cache.updateCacheMetadata(athleteId, cacheKey, cache.TTL.EQUIPMENT);
    }

    res.json({ gear, cached: isCacheValid });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const gearId = req.params.id;
    if (!gearId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid gear ID' });
    }
    const gearDetails = await getGearDetails(sessionId, gearId);
    res.json(gearDetails);
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Not Found', message: 'Gear not found' });
    }
    next(error);
  }
});

router.get('/:id/activities', async (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    const gearId = req.params.id;
    if (!athleteId) {
      return res.status(401).json({ error: 'Athlete ID not found in session' });
    }
    // Uses cached activities — no Strava API call needed
    const activities = cache.getAllActivities(athleteId).filter(a => a.gear_id === gearId);
    res.json({ activities, gear_id: gearId });
  } catch (error) {
    next(error);
  }
});

export default router;
```

### `backend/src/routes/statistics.js`

```js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

const router = express.Router();
router.use(requireAuth);

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

router.get('/weekly-distance', async (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    if (!athleteId) {
      return res.status(401).json({ error: 'Athlete ID not found in session' });
    }

    const activities = cache.getAllActivities(athleteId);
    if (activities.length === 0) return res.json({ years: [] });

    const yearWeekData = {};
    activities.forEach(activity => {
      if (!activity.start_date || !activity.distance) return;
      const date = new Date(activity.start_date);
      const year = date.getFullYear();
      const week = getWeekNumber(date);
      if (!yearWeekData[year]) yearWeekData[year] = {};
      yearWeekData[year][week] = (yearWeekData[year][week] || 0) + activity.distance / 1000;
    });

    const years = Object.keys(yearWeekData)
      .sort((a, b) => b - a)
      .map(year => {
        const weeks = [];
        let cumulativeDistance = 0;
        for (let week = 1; week <= 52; week++) {
          cumulativeDistance += yearWeekData[year][week] || 0;
          weeks.push({ week, distance: Math.round(cumulativeDistance * 10) / 10 });
        }
        return { year: parseInt(year), weeks, totalDistance: Math.round(cumulativeDistance) };
      });

    res.json({ years });
  } catch (error) {
    next(error);
  }
});

export default router;
```

### `backend/Dockerfile`

```dockerfile
FROM node:18-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json ./
RUN npm install --only=production
COPY . .
RUN mkdir -p data

EXPOSE 3000
CMD ["npm", "start"]
```

---

### `frontend/package.json`

```json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.6.5",
    "chart.js": "^4.5.1",
    "pinia": "^2.1.7",
    "vue": "^3.5.25",
    "vue-router": "^4.2.5"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.2",
    "vite": "^7.3.1"
  }
}
```

### `frontend/vite.config.js`

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: { output: { manualChunks: undefined } },
  },
  define: { global: 'globalThis' },
});
```

### `frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
        proxy_pass_header Set-Cookie;
    }

    location /auth/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
        proxy_pass_header Set-Cookie;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### `frontend/src/main.js`

```js
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
```

### `frontend/src/App.vue`

```vue
<script setup>
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();
onMounted(async () => { await authStore.checkAuthStatus(); });
</script>

<template>
  <div id="app">
    <router-view />
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
}

#app {
  min-height: 100vh;
  width: 100%;
  margin: 0;
  padding: 0;
}

/* Override Vite default template CSS that constrains width to 1280px */
app {
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
}
</style>
```

### `frontend/src/router/index.js`

```js
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import Home from '../views/Home.vue';
import Dashboard from '../views/Dashboard.vue';
import Callback from '../views/Callback.vue';
import Equipment from '../views/Equipment.vue';
import Statistics from '../views/Statistics.vue';

const routes = [
  { path: '/', name: 'Home', component: Home, meta: { requiresGuest: true } },
  { path: '/dashboard', name: 'Dashboard', component: Dashboard, meta: { requiresAuth: true } },
  { path: '/equipment', name: 'Equipment', component: Equipment, meta: { requiresAuth: true } },
  { path: '/statistics', name: 'Statistics', component: Statistics, meta: { requiresAuth: true } },
  { path: '/callback', name: 'Callback', component: Callback },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  if (authStore.isLoading) {
    await new Promise((resolve) => {
      const unwatch = authStore.$subscribe(() => {
        if (!authStore.isLoading) { unwatch(); resolve(); }
      });
    });
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'Home' });
  } else if (to.meta.requiresGuest && authStore.isAuthenticated) {
    next({ name: 'Dashboard' });
  } else {
    next();
  }
});

export default router;
```

### `frontend/src/stores/auth.js`

```js
import { defineStore } from 'pinia';
import axios from 'axios';

export const useAuthStore = defineStore('auth', {
  state: () => ({ isAuthenticated: false, isLoading: true, athlete: null }),
  actions: {
    async checkAuthStatus() {
      this.isLoading = true;
      try {
        const response = await axios.get('/auth/status', { withCredentials: true });
        this.isAuthenticated = response.data.authenticated;
        this.athlete = response.data.athlete || null;
      } catch (error) {
        this.isAuthenticated = false;
        this.athlete = null;
      } finally {
        this.isLoading = false;
      }
    },
    async logout() {
      await axios.post('/auth/logout', {}, { withCredentials: true });
      this.isAuthenticated = false;
      this.athlete = null;
    },
  },
});
```

### `frontend/src/services/api.js`

```js
import axios from 'axios';

const apiClient = axios.create({ baseURL: '/api', withCredentials: true });

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) window.location.href = '/';
    return Promise.reject(error);
  }
);

export async function getActivities(page = 1, perPage = 30) {
  const response = await apiClient.get('/activities', { params: { page, per_page: perPage } });
  return response.data;
}

export async function getActivity(activityId) {
  const response = await apiClient.get(`/activities/${activityId}`);
  return response.data;
}

export async function getEquipment() {
  const response = await apiClient.get('/equipment');
  return response.data;
}

export async function getEquipmentDetails(equipmentId) {
  const response = await apiClient.get(`/equipment/${equipmentId}`);
  return response.data;
}

export async function getEquipmentActivities(equipmentId) {
  const response = await apiClient.get(`/equipment/${equipmentId}/activities`);
  return response.data;
}

export default apiClient;
```

### `frontend/src/utils/polyline.js`

```js
/**
 * Decode Google's encoded polyline format
 */
export function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/**
 * Convert decoded polyline points to an SVG path string (200×150 viewBox)
 */
export function polylineToSvgPath(points) {
  if (!points?.length) return '';

  let minLat = points[0][0], maxLat = points[0][0];
  let minLng = points[0][1], maxLng = points[0][1];
  points.forEach(([lat, lng]) => {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  });

  const padding = 0.1;
  const latRange = maxLat - minLat, lngRange = maxLng - minLng;
  minLat -= latRange * padding; maxLat += latRange * padding;
  minLng -= lngRange * padding; maxLng += lngRange * padding;

  const width = 200, height = 150;
  const scale = Math.min(width / (maxLng - minLng), height / (maxLat - minLat));
  const offsetX = (width - (maxLng - minLng) * scale) / 2;
  const offsetY = (height - (maxLat - minLat) * scale) / 2;

  const toX = (lng) => offsetX + (lng - minLng) * scale;
  const toY = (lat) => height - (offsetY + (lat - minLat) * scale);

  return points.map(([lat, lng], i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(lng)} ${toY(lat)}`
  ).join(' ');
}
```

### `frontend/src/views/Home.vue`

```vue
<template>
  <div class="home">
    <div class="container">
      <h1 class="title">Strava Activity Browser</h1>
      <p class="subtitle">View and browse your Strava activities</p>
      <LoginButton />
      <div v-if="errorMessage" class="error">{{ errorMessage }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import LoginButton from '../components/LoginButton.vue';

const errorMessage = ref('');

onMounted(() => {
  const error = new URLSearchParams(window.location.search).get('error');
  if (error) {
    const messages = {
      access_denied: 'You denied access to the application.',
      missing_code: 'Authorization code was missing.',
      token_exchange_failed: 'Failed to exchange authorization code for tokens.',
    };
    errorMessage.value = messages[error] || 'An error occurred during login.';
  }
});
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.container {
  text-align: center;
  padding: 3rem;
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  max-width: 500px;
}
.title { font-size: 2.5rem; font-weight: 700; color: #333; margin-bottom: 1rem; }
.subtitle { font-size: 1.1rem; color: #666; margin-bottom: 2rem; }
.error {
  margin-top: 1.5rem; padding: 1rem;
  background: #fee; border: 1px solid #fcc; border-radius: 8px; color: #c33;
}
</style>
```

### `frontend/src/components/LoginButton.vue`

```vue
<template>
  <button @click="login" class="login-button" :disabled="isLoading">
    {{ isLoading ? 'Connecting...' : 'Login with Strava' }}
  </button>
</template>

<script setup>
import { ref } from 'vue';

const isLoading = ref(false);

function login() {
  isLoading.value = true;
  window.location.href = '/auth/login';
}
</script>

<style scoped>
.login-button {
  padding: 1rem 2.5rem;
  font-size: 1.1rem;
  font-weight: 600;
  background: #fc4c02;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}
.login-button:hover:not(:disabled) {
  background: #e04400;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(252, 76, 2, 0.4);
}
.login-button:disabled { background: #ccc; cursor: not-allowed; }
</style>
```

### `frontend/src/views/Callback.vue`

```vue
<template>
  <div class="callback">
    <div class="container">
      <div v-if="isLoading" class="loading">
        <div class="spinner"></div>
        <p>Completing authentication...</p>
      </div>
      <div v-if="error" class="error">
        <h2>Authentication Failed</h2>
        <p>{{ error }}</p>
        <button @click="router.push('/')" class="button">Return to Home</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();
const isLoading = ref(true);
const error = ref('');

onMounted(async () => {
  const success = new URLSearchParams(window.location.search).get('success');
  if (success === 'true') {
    await authStore.checkAuthStatus();
    if (authStore.isAuthenticated) {
      router.push('/dashboard');
    } else {
      error.value = 'Authentication failed. Please try again.';
      isLoading.value = false;
    }
  } else {
    error.value = 'Invalid callback. Please try logging in again.';
    isLoading.value = false;
  }
});
</script>

<style scoped>
.callback {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.container {
  text-align: center; padding: 3rem; background: white;
  border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 500px;
}
.spinner {
  border: 4px solid #f3f3f3; border-top: 4px solid #667eea;
  border-radius: 50%; width: 50px; height: 50px;
  animation: spin 1s linear infinite; margin: 0 auto 1.5rem;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.error h2 { color: #c33; margin-bottom: 1rem; }
.error p { color: #666; margin-bottom: 1.5rem; }
.button {
  padding: 0.75rem 2rem; background: #667eea; color: white;
  border: none; border-radius: 8px; cursor: pointer;
}
</style>
```

### `frontend/src/views/Dashboard.vue`

```vue
<template>
  <div class="dashboard">
    <header class="header">
      <div class="header-content">
        <h1 class="title">My Strava Activities</h1>
        <div class="user-section">
          <button @click="router.push('/statistics')" class="nav-button">
            <svg viewBox="0 0 24 24" fill="currentColor" class="button-icon">
              <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z"/>
            </svg>
            Statistics
          </button>
          <button @click="router.push('/equipment')" class="nav-button">
            <svg viewBox="0 0 24 24" fill="currentColor" class="button-icon">
              <path d="M5 20.5A3.5 3.5 0 0 1 1.5 17 3.5 3.5 0 0 1 5 13.5 3.5 3.5 0 0 1 8.5 17 3.5 3.5 0 0 1 5 20.5M5 12a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5m9.8-2h-1.8l-1.5 2h2.3l-.5.7-2.5-1.2V13H9.3l-1.5 3.5H6.2L8 11.8l-2.1-3.3H7l1 1.5h2.3L9.6 9H7.2L6.7 7.5h2.3L7.8 5.9l1.4-.7L11 8h3l1.4-2.3c-.5-.3-.8-.8-.8-1.4 0-.6.2-1.1.6-1.5.4-.4.9-.6 1.5-.6s1.1.2 1.5.6c.4.4.6.9.6 1.5s-.2 1.1-.6 1.5c-.4.4-.9.6-1.5.6l-1.4 2.3h2.8l-.6.8-1.8-.8h-1.4L15 10.2l1.4 1.1zm3.2 2A3.5 3.5 0 0 1 22.5 17a3.5 3.5 0 0 1-3.5 3.5A3.5 3.5 0 0 1 15.5 17a3.5 3.5 0 0 1 3.5-3.5m0-1.5a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5z"/>
            </svg>
            Equipment
          </button>
          <span v-if="authStore.athlete" class="user-name">
            {{ authStore.athlete.firstname }} {{ authStore.athlete.lastname }}
          </span>
          <button @click="handleLogout" class="logout-button">Logout</button>
        </div>
      </div>
    </header>
    <main class="main">
      <ActivityList />
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import ActivityList from '../components/ActivityList.vue';

const router = useRouter();
const authStore = useAuthStore();

async function handleLogout() {
  await authStore.logout();
  router.push('/');
}
</script>

<style scoped>
.dashboard { min-height: 100vh; background: #f5f7fa; }
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white; padding: 2rem 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}
.header-content {
  max-width: 1600px; margin: 0 auto; padding: 0 3rem;
  display: flex; justify-content: space-between; align-items: center;
}
.title { font-size: 2.5rem; font-weight: 700; margin: 0; }
.user-section { display: flex; align-items: center; gap: 1rem; }
.user-name { font-size: 1rem; font-weight: 500; }
.nav-button, .logout-button {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1.5rem; background: rgba(255,255,255,0.2);
  color: white; border: 2px solid white; border-radius: 8px;
  cursor: pointer; font-weight: 600; transition: all 0.3s;
}
.nav-button:hover, .logout-button:hover { background: white; color: #667eea; }
.button-icon { width: 20px; height: 20px; }
.main { max-width: 1600px; margin: 0 auto; padding: 3rem; }
</style>
```

### `frontend/src/components/ActivityList.vue`

```vue
<template>
  <div class="activity-list">
    <div v-if="isLoading" class="loading">
      <div class="spinner"></div>
      <p>Loading activities...</p>
    </div>
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="fetchActivities()" class="retry-button">Retry</button>
    </div>
    <div v-else-if="activities.length === 0" class="empty">
      <p>No activities found.</p>
      <p class="empty-subtitle">Start tracking your workouts on Strava!</p>
    </div>
    <div v-else class="activities-grid">
      <ActivityCard v-for="activity in activities" :key="activity.id" :activity="activity" />
    </div>
    <div v-if="activities.length > 0" class="pagination">
      <button @click="loadMore" :disabled="isLoadingMore" class="load-more-button">
        {{ isLoadingMore ? 'Loading...' : 'Load More' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getActivities } from '../services/api';
import ActivityCard from './ActivityCard.vue';

const activities = ref([]);
const isLoading = ref(true);
const isLoadingMore = ref(false);
const error = ref('');
const currentPage = ref(1);

async function fetchActivities(append = false) {
  try {
    if (!append) isLoading.value = true;
    else isLoadingMore.value = true;
    error.value = '';
    const response = await getActivities(currentPage.value, 50);
    activities.value = append
      ? [...activities.value, ...response.activities]
      : response.activities;
  } catch (err) {
    error.value = 'Failed to load activities. Please try again.';
  } finally {
    isLoading.value = false;
    isLoadingMore.value = false;
  }
}

async function loadMore() {
  currentPage.value++;
  await fetchActivities(true);
}

onMounted(() => fetchActivities());
</script>

<style scoped>
.activity-list { width: 100%; }
.loading, .empty, .error { text-align: center; padding: 3rem 1rem; }
.spinner {
  border: 4px solid #f3f3f3; border-top: 4px solid #667eea;
  border-radius: 50%; width: 50px; height: 50px;
  animation: spin 1s linear infinite; margin: 0 auto 1rem;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.loading p, .empty p { color: #666; font-size: 1.1rem; }
.empty-subtitle { color: #999; font-size: 0.95rem; margin-top: 0.5rem; }
.error { color: #c33; }
.retry-button, .load-more-button {
  margin-top: 1rem; padding: 0.75rem 2rem; background: #667eea;
  color: white; border: none; border-radius: 8px; cursor: pointer;
  font-weight: 600; font-size: 1rem; transition: all 0.3s;
}
.retry-button:hover, .load-more-button:hover:not(:disabled) {
  background: #5568d3; transform: translateY(-2px);
}
.load-more-button:disabled { background: #ccc; cursor: not-allowed; }
.activities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 2rem; margin-bottom: 2rem;
}
.pagination { text-align: center; margin-top: 2rem; }
</style>
```

### `frontend/src/components/ActivityCard.vue`

```vue
<template>
  <div class="activity-card">
    <div class="activity-header">
      <div class="header-text">
        <h3 class="activity-name">{{ activity.name }}</h3>
        <span class="activity-type" :class="`type-${activity.sport_type?.toLowerCase() || 'other'}`">
          {{ activity.sport_type || activity.type }}
        </span>
      </div>
      <a v-if="hasMap" :href="stravaUrl" target="_blank" rel="noopener noreferrer"
         class="map-thumbnail" title="View on Strava">
        <svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="150" fill="#f0f0f0"/>
          <path :d="svgPath" fill="none" stroke="#667eea" stroke-width="3"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="map-overlay">
          <svg class="external-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z"/>
          </svg>
        </div>
      </a>
    </div>
    <div class="activity-details">
      <div class="detail-item">
        <span class="detail-label">Distance</span>
        <span class="detail-value">{{ formatDistance(activity.distance) }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Duration</span>
        <span class="detail-value">{{ formatDuration(activity.moving_time) }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Elevation</span>
        <span class="detail-value">{{ Math.round(activity.total_elevation_gain) }}m</span>
      </div>
      <div class="detail-item" v-if="activity.average_speed">
        <span class="detail-label">Avg Speed</span>
        <span class="detail-value">{{ formatSpeed(activity.average_speed) }}</span>
      </div>
    </div>
    <div class="activity-footer">
      <span class="activity-date">{{ formatDate(activity.start_date) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { decodePolyline, polylineToSvgPath } from '../utils/polyline.js';

const props = defineProps({ activity: { type: Object, required: true } });

const hasMap = computed(() => !!props.activity.map?.summary_polyline);
const svgPath = computed(() => {
  if (!hasMap.value) return '';
  return polylineToSvgPath(decodePolyline(props.activity.map.summary_polyline));
});
const stravaUrl = computed(() => `https://www.strava.com/activities/${props.activity.id}`);

const formatDistance = (m) => `${(m / 1000).toFixed(2)} km`;
const formatSpeed = (mps) => `${(mps * 3.6).toFixed(1)} km/h`;

function formatDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
}

function formatDate(ds) {
  return new Date(ds).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
</script>

<style scoped>
.activity-card {
  background: white; border-radius: 12px; padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s;
}
.activity-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.15); transform: translateY(-2px); }
.activity-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem; gap: 1rem; }
.header-text { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }
.activity-name { font-size: 1.25rem; font-weight: 600; color: #333; margin: 0; }
.activity-type {
  padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.875rem;
  font-weight: 600; text-transform: capitalize; align-self: flex-start;
}
.type-run { background: #fef3c7; color: #92400e; }
.type-ride { background: #dbeafe; color: #1e40af; }
.type-swim { background: #ccfbf1; color: #115e59; }
.type-other { background: #f3f4f6; color: #374151; }
.map-thumbnail {
  position: relative; flex-shrink: 0; width: 150px; height: 100px;
  border-radius: 8px; overflow: hidden; cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.3s; display: block;
}
.map-thumbnail:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.2); transform: scale(1.05); }
.map-thumbnail svg { width: 100%; height: 100%; display: block; }
.map-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0);
  display: flex; align-items: center; justify-content: center; transition: background 0.3s;
}
.map-thumbnail:hover .map-overlay { background: rgba(0,0,0,0.1); }
.external-icon { width: 24px; height: 24px; color: white; opacity: 0; transition: opacity 0.3s; }
.map-thumbnail:hover .external-icon { opacity: 1; }
.activity-details {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem; padding: 1rem 0; margin-bottom: 1rem;
  border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;
}
.detail-item { display: flex; flex-direction: column; gap: 0.25rem; }
.detail-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
.detail-value { font-size: 1rem; font-weight: 600; color: #111827; }
.activity-date { font-size: 0.875rem; color: #6b7280; }
</style>
```

### `frontend/src/views/Statistics.vue`

See the full implementation in the repository. Key points:
- Uses `Chart.js` with manual component registration (not auto-import)
- Fetches from `GET /api/statistics/weekly-distance`
- Layout: flexbox with `flex: 0 0 300px` year-selector column + `flex: 1; min-width: 0` chart column
- Chart height: 700px canvas
- Auto-selects most recent year on load
- Tooltip label: `${year}: ${value} km (cumulative)`

### `frontend/src/views/Equipment.vue`

See full implementation in repository. Key points:
- Layout: `grid-template-columns: 400px 1fr`
- Left column: scrollable gear list with bike/shoe SVG icons
- Right column: summary stats (activities count, total distance/time/elevation) + last 10 activities
- Gear activities fetched from `GET /api/equipment/:id/activities` (uses cached data, no Strava API call)

---

## Docker Setup

### `docker-compose.yml`

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: stravabrowser-backend
    restart: unless-stopped
    ports:
      - "1300:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - ./backend/.env
    volumes:
      - strava-data:/app/data
    networks:
      - strava-network
    extra_hosts:
      - "host.docker.internal:host-gateway"
    dns:
      - 8.8.8.8
      - 1.1.1.1
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: stravabrowser-frontend
    restart: unless-stopped
    ports:
      - "180:80"
    depends_on:
      - backend
    networks:
      - strava-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  strava-network:
    driver: bridge

volumes:
  strava-data:
    driver: local
```

### `update.sh`

```bash
#!/bin/bash
# Usage:
#   ./update.sh           - Pull code and restart (no rebuild)
#   ./update.sh frontend  - Pull + rebuild frontend
#   ./update.sh backend   - Pull + rebuild backend
#   ./update.sh all       - Pull + rebuild all
set -e
MODE="${1:-none}"
case "$MODE" in
  none|frontend|backend|all) ;;
  *)
    echo "Usage: ./update.sh [none|frontend|backend|all]"; exit 1 ;;
esac

docker compose down
git pull origin main

if [ "$MODE" != "none" ]; then
  case "$MODE" in
    frontend) docker compose build --no-cache frontend ;;
    backend)  docker compose build --no-cache backend ;;
    all)      docker compose build --no-cache ;;
  esac
fi

docker compose up -d
sleep 5
docker compose ps
echo "✅ Done. Database preserved in 'strava-data' volume."
echo "Access at: http://localhost:180"
```

---

## `.gitignore`

```
node_modules/
backend/.env
backend/data/
.DS_Store
dist/
.claude/settings.json
```

---

## Strava API Setup

1. Go to `https://www.strava.com/settings/api`
2. Create application
3. Set **Authorization Callback Domain** to `localhost`
4. Copy Client ID and Client Secret into `backend/.env`

The redirect URI for Docker deployment is `http://localhost:180/auth/callback`.
For local development it is `http://localhost:3000/auth/callback`.

---

## Local Development

```bash
npm install
cd backend && cp .env.example .env   # fill in credentials
cd ..
npm run dev          # starts backend on :3000 and frontend on :5173
```

Open `http://localhost:5173`.

## Docker Deployment

```bash
cp .env.docker.example backend/.env  # fill in credentials, set REDIRECT_URI to :180
docker compose up -d
```

Open `http://localhost:180`.

---

## Known Pitfalls Summary

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Session lost after OAuth redirect | `req.session.save()` not called before `res.redirect()` | Wrap redirect in `session.save()` callback |
| Cache always empty despite data in DB | `ON CONFLICT` clause missing `session_id = excluded.session_id` | Add that line to all `ON CONFLICT DO UPDATE` blocks |
| Activities refetch on every container restart | Cache keyed by ephemeral session ID | Use athlete ID as cache key; call `migrateActivitiesToAthlete()` |
| Statistics page not full width | Vite default template `app { max-width: 1280px }` in `style.css` | Override with `!important` in `App.vue` |
| Session cookie not forwarded through nginx | Missing proxy cookie headers | Add `proxy_set_header Cookie` and `proxy_pass_header Set-Cookie` |
| Frontend build fails with Node 18 | Vite 7 requires Node 20 | Use `node:20-alpine` in frontend Dockerfile build stage |
