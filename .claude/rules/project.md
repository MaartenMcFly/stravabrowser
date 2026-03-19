# Project: Strava Activity Browser

Personal Strava activity browser with performance analytics. Node.js/Express backend,
Vue 3 frontend, SQLite cache, Strava OAuth, optional Whoop integration.
Deployed as two Docker containers (frontend nginx + backend node) via docker-compose.

---

## Codebase Map

```
backend/src/
  app.js              — Express setup: middleware, route mounting, session config
  server.js           — Entry point: starts app on $PORT (default 3000)
  config/
    strava.js         — Strava OAuth endpoints, scopes, credentials from env
    whoop.js          — Whoop OAuth endpoints, scopes, credentials from env
  db/
    database.js       — SQLite init (better-sqlite3), schema creation, migrations
  middleware/
    auth.js           — requireAuth / optionalAuth session guards
    errorHandler.js   — Global error handler + 404 handler
  routes/             — One file per resource (see API surface below)
  services/
    cacheService.js   — All SQLite read/write operations (single source of truth for data access)
    stravaApi.js      — Strava REST client with auto token-refresh on 401
    stravaAuth.js     — OAuth 2.0 flow: generateAuthUrl, exchangeCodeForTokens, refreshAccessToken
    whoopApi.js       — Whoop REST client: syncRecoveries, syncCycles
  utils/
    tokenStorage.js   — In-memory Map of sessionId → tokens (lost on restart)
    workoutName.js    — Strip Zwift/TrainerRoad/WAHOO prefixes from activity names

frontend/src/
  router/index.js     — Vue Router with requiresAuth / requiresGuest meta guards
  stores/auth.js      — Pinia: isAuthenticated, athlete, checkAuthStatus(), logout()
  services/api.js     — Axios client (baseURL=/api, withCredentials); all API helpers
  views/              — Full pages (Dashboard, Equipment, Statistics, SimilarActivities,
                        Fitness, Admin, Home, Callback)
  components/         — ActivityCard, ActivityList, EditActivityModal, LoginButton
  utils/
    polyline.js       — Google-format polyline decode + OSM tile math for map thumbnails
    workoutName.js    — Mirror of backend workoutName.js (keep in sync manually)
```

---

## Key Conventions

- **Primary user key is `athleteId`**, not `sessionId`. Cache keys are `activities:{athleteId}`,
  equipment is stored per athlete. Multiple sessions share the same cache.
- **All timestamps**: activity dates are UTC ISO 8601 (`start_date`). Cache metadata uses
  Unix seconds (`expires_at`, `last_fetched`).
- **ES modules throughout**: `import`/`export default` everywhere — no `require()`.
- **Auth pattern**: session cookie (`strava.sid`, httpOnly). Tokens never reach the frontend.
  The cookie is set for 7 days. `withCredentials: true` on all Axios calls.
- **Error responses**: always `{ error: "message" }` shape. HTTP 401 = not authenticated,
  400 = bad input, 404 = not found, 500 = unexpected.
- **workoutName.js is duplicated** in backend/utils and frontend/utils — changes must be
  applied to both files.

---

## Adding a Backend Route

1. Create `backend/src/routes/<resource>.js` — use the `/new-route` skill or this skeleton:

```js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

const router = express.Router();
router.use(requireAuth);  // always at top level, not inline

/**
 * GET /api/<resource>
 */
router.get('/', async (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

    // implementation

    res.json({ ... });
  } catch (error) {
    next(error);  // always delegate to errorHandler
  }
});

export default router;
```

2. Mount in `backend/src/app.js`:
```js
import <resource>Routes from './routes/<resource>.js';
app.use('/api/<resource>', <resource>Routes);
```

3. Add helper function to `frontend/src/services/api.js`.

---

## Adding a Frontend Page

1. Create `frontend/src/views/<Page>.vue` — follow the header/back-button pattern
   used in Statistics.vue, Equipment.vue, Fitness.vue.
2. Add route to `frontend/src/router/index.js`:
```js
{ path: '/<path>', name: '<Name>', component: <Page>, meta: { requiresAuth: true } }
```
3. Add nav button in `frontend/src/views/Dashboard.vue` (same `.nav-button` class + SVG icon).
4. Add any new API calls to `frontend/src/services/api.js`.

---

## Adding a Field to the Activity Cache

Requires changes in three files:

1. **`backend/src/db/database.js`** — add an `ALTER TABLE activities ADD COLUMN` migration
   to the `migrations` array (try/catch handles existing columns):
```js
'ALTER TABLE activities ADD COLUMN <field> <TYPE>',
```

2. **`backend/src/services/cacheService.js`** — add the field to the INSERT and SELECT
   statements in `saveActivities()` and `getActivities()` / `getAllActivities()`.

3. **`backend/src/services/stravaApi.js`** — confirm the Strava API response includes the
   field; map it in `getActivities()`.

---

## SQLite Schema

Database file: `backend/data/strava_cache.db` (WAL mode, gitignored, persisted via Docker volume)

### activities
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Strava activity ID |
| name | TEXT NOT NULL | Raw Strava name (use extractWorkoutName() to display) |
| distance | REAL | Metres |
| moving_time | INTEGER | Seconds |
| elapsed_time | INTEGER | Seconds |
| total_elevation_gain | REAL | Metres |
| type | TEXT | Legacy type string |
| sport_type | TEXT | Preferred type (Ride, Run, etc.) |
| start_date | TEXT | UTC ISO 8601 |
| start_date_local | TEXT | Local time ISO 8601 |
| timezone | TEXT | |
| average_speed | REAL | m/s |
| max_speed | REAL | m/s |
| average_cadence | REAL | rpm |
| average_heartrate | REAL | bpm; null if HR not recorded |
| max_heartrate | REAL | bpm; null if HR not recorded |
| average_watts | REAL | null if no power |
| weighted_average_watts | REAL | NP; null if no power |
| kilojoules | REAL | Total energy; null if no power |
| device_watts | INTEGER | 1 = actual power meter, 0 = estimated |
| description | TEXT | |
| gear_id | TEXT | FK-style ref to equipment.id; nullable |
| map_summary_polyline | TEXT | Google-format encoded polyline |
| session_id | TEXT | **Deprecated** — use athlete_id logic in cacheService |
| created_at | INTEGER | Unix seconds |
| updated_at | INTEGER | Unix seconds |

Indexes: `gear_id`, `start_date DESC`, `(session_id, gear_id)`

### equipment
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Strava gear ID |
| name | TEXT NOT NULL | |
| type | TEXT NOT NULL | bike / shoes |
| brand_name | TEXT | |
| model_name | TEXT | |
| description | TEXT | |
| distance | REAL | Total metres logged |
| primary_gear | INTEGER | 0/1 boolean |
| retired | INTEGER | 0/1 boolean |
| session_id | TEXT | Athlete-scoped (same migration as activities) |
| created_at / updated_at | INTEGER | Unix seconds |

### cache_metadata
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | e.g. `activities:{athleteId}` |
| session_id | TEXT | |
| last_fetched | INTEGER | Unix seconds |
| expires_at | INTEGER | Unix seconds; null = never expires |
| metadata | TEXT | JSON blob; currently unused |

TTL constants (in cacheService.js): `ACTIVITIES_CHECK = 24h`, equipment has no TTL (never re-fetched).

### athletes
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Strava athlete ID |
| ftp | INTEGER | Watts; pulled from Strava profile on login |
| max_heartrate | INTEGER | |
| weight | REAL | kg |
| updated_at | INTEGER | Unix seconds |

### ftp_history
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| athlete_id | TEXT NOT NULL | |
| ftp | INTEGER NOT NULL | Watts |
| lthr | INTEGER | Lactate threshold HR; null → estimated as max_hr × 0.88 in PMC calc |
| valid_from | TEXT NOT NULL | YYYY-MM-DD; "FTP was this value from this date onward" |

Index: `(athlete_id, valid_from DESC)`

### whoop_tokens
| Column | Type | Notes |
|--------|------|-------|
| athlete_id | TEXT PK | |
| access_token | TEXT NOT NULL | |
| refresh_token | TEXT | |
| expires_at | INTEGER | Unix seconds |
| updated_at | INTEGER | Unix seconds |

### whoop_recoveries
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Whoop recovery ID |
| athlete_id | TEXT NOT NULL | |
| date | TEXT NOT NULL | YYYY-MM-DD |
| score | REAL | 0–100 recovery score |
| hrv_rmssd | REAL | HRV in ms |
| resting_heart_rate | REAL | bpm |
| spo2 | REAL | % |
| skin_temp | REAL | °C |

Index: `(athlete_id, date ASC)`

### whoop_cycles
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Whoop cycle ID |
| athlete_id | TEXT NOT NULL | |
| date | TEXT NOT NULL | YYYY-MM-DD |
| strain | REAL | 0–21 Whoop strain score |
| kilojoule | REAL | |
| average_heart_rate | REAL | bpm |
| max_heart_rate | REAL | bpm |

Index: `(athlete_id, date ASC)`

---

## API Surface

All routes require session auth (`strava.sid` cookie) unless marked **public**.
Auth routes are mounted at `/auth`, Whoop at `/whoop`, all others at `/api/...`.

| Method | Path | Response shape | Notes |
|--------|------|----------------|-------|
| GET | /health | `{ status, timestamp }` | public; no auth |
| GET | /auth/login | redirect | public; starts Strava OAuth |
| GET | /auth/callback | redirect | public; exchanges code, sets session |
| GET | /auth/status | `{ authenticated, athlete? }` | public |
| POST | /auth/logout | `{ success }` | clears session + tokens |
| GET | /api/activities | `{ activities[], page, perPage, cached }` | `?page=1&per_page=30&gear_id=` |
| GET | /api/activities/names | `{ names[{ name, count, latestDate }] }` | only names with count > 1 |
| GET | /api/activities/by-name | `{ activities[], name }` | `?name=<string>`; newest first |
| GET | /api/activities/:id | Strava activity object | fetches live from Strava |
| PUT | /api/activities/:id | updated activity | body: `{ name, description, gear_id }` |
| GET | /api/equipment | `{ gear[], cached }` | cached permanently after first fetch |
| GET | /api/equipment/:id | gear details | fetches live from Strava |
| GET | /api/equipment/:id/activities | `{ activities[], gear_id }` | served from activity cache |
| GET | /api/statistics/weekly-distance | `{ years[{ year, weeks[{ week, distance }], totalDistance }] }` | cumulative km by ISO week |
| GET | /api/athlete | `{ ftp, max_heartrate, weight, ftp_history[] }` | |
| GET | /api/ftp-history | `{ history[] }` | newest first |
| POST | /api/ftp-history | `{ id, athlete_id, ftp, lthr, valid_from }` | body: `{ ftp, lthr?, valid_from }` |
| DELETE | /api/ftp-history/:id | `{ success }` | scoped to authenticated athlete |
| GET | /api/fitness/pmc | `{ points[{ date, tss, ctl, atl, tsb }], powerRideCount, hrRideCount }` | returns `[]` if no FTP history |
| GET | /api/fitness/hrv | `{ recoveries[] }` | empty array if Whoop not connected |
| GET | /api/admin/invalidate-cache | — | |
| POST | /api/admin/invalidate-cache | `{ success, message }` | clears activity cache only |
| POST | /api/admin/sync-activities | `{ imported, activities[], message }` | fetches new activities from Strava |
| POST | /api/admin/invalidate-equipment-cache | `{ success, message }` | clears equipment cache; next Equipment visit re-fetches from Strava |
| GET | /whoop/login | redirect | starts Whoop OAuth |
| GET | /whoop/callback | redirect → /fitness | exchanges code, initial sync |
| GET | /whoop/status | `{ connected, last_sync? }` | |
| POST | /whoop/sync | `{ success, recoveries_synced, cycles_synced }` | incremental sync |
| POST | /whoop/logout | `{ success }` | deletes whoop_tokens row |

---

## PMC / TSS Calculation (fitness.js)

Do not "simplify" these — the constants are sport-science standards.

- **Power TSS** (used when `device_watts === 1` AND `weighted_average_watts > 0`):
  `TSS = (moving_time × NP²) / (FTP² × 3600) × 100`

- **hrTSS fallback** (used when no power data but `average_heartrate` exists):
  `LTHR = entry.lthr || max_hr × 0.88`
  `hrTSS = (moving_time / 3600) × (avg_hr / LTHR)² × 100`

- **CTL** (Chronic Training Load, 42-day fitness): `CTL_t = CTL_{t-1} × (1 − 1/42) + TSS_t × (1/42)`
- **ATL** (Acute Training Load, 7-day fatigue): `ATL_t = ATL_{t-1} × (1 − 1/7) + TSS_t × (1/7)`
- **TSB** (Training Stress Balance, form): `TSB_t = CTL_t − ATL_t`

`getFtpForDate(athleteId, dateStr)` returns the FTP entry with the latest `valid_from` that is
still ≤ the activity date. Activities before the earliest FTP entry are skipped.

---

## Frontend Routes

| Path | Component | Guard |
|------|-----------|-------|
| / | Home.vue | requiresGuest (redirects to /dashboard if logged in) |
| /dashboard | Dashboard.vue | requiresAuth |
| /equipment | Equipment.vue | requiresAuth |
| /statistics | Statistics.vue | requiresAuth |
| /similar | SimilarActivities.vue | requiresAuth |
| /admin | Admin.vue | requiresAuth |
| /fitness | Fitness.vue | requiresAuth |
| /callback | Callback.vue | none |

---

## Deployment

```
./update.sh frontend   — rebuild + restart frontend container only
./update.sh backend    — rebuild + restart backend container only
./update.sh all        — rebuild + restart both
./update.sh            — restart only (no rebuild); use when only .env changed
```

Use the `/rebuild` skill — it inspects `git diff` and picks the right argument automatically.

Backend source changes always require a rebuild (code is COPYed into the image).
Equipment data is never re-fetched from Strava after the first successful load.

---

## What NOT to Do

- Do not use `session.id` as a cache key — the codebase migrated to `athleteId` as the
  cache key. There is migration code in `cacheService.js` for old data; don't reintroduce
  session-scoped caching.
- Do not add inline `requireAuth` to individual routes if the router already has
  `router.use(requireAuth)` at the top — check the file first.
- Do not place new routes after `GET /:id` in `activities.js` — Express will match string
  paths like `names` or `by-name` as an activity ID. New static routes must come before `/:id`.
- Do not change the CTL/ATL decay constants (42 and 7) — these are the TrainingPeaks standard.
- Do not modify files in `.claude/hooks/` — these are security guardrails.
