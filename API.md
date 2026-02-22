# API Reference

All endpoints are served by the Express backend on port 3000 (proxied through nginx in Docker).

**Authentication**: session cookie `strava.sid` (httpOnly, 7-day expiry). Set automatically
after Strava OAuth. All endpoints require the cookie unless marked **public**.
The frontend sends `withCredentials: true` on every request.

**Error shape**: `{ "error": "message" }` — HTTP 400 bad input, 401 unauthenticated,
404 not found, 500 unexpected.

---

## Health

### GET /health
**Public.** Returns server status.

```json
{ "status": "ok", "timestamp": "2026-02-22T10:00:00.000Z" }
```

---

## Auth — `/auth`

### GET /auth/login
**Public.** Redirects the browser to the Strava OAuth authorization page.
After the user authorizes, Strava redirects to `/auth/callback`.

### GET /auth/callback
**Public.** Exchanges the Strava authorization code for tokens. Saves tokens in memory
and writes the athlete profile to the database. Redirects to `{FRONTEND_URL}/callback`.

Query params: `code` (Strava auth code), `error` (present on denial).

### GET /auth/status
**Public.** Returns whether the session is authenticated.

```json
{ "authenticated": true, "athlete": { "id": 12345, "firstname": "Jan", "lastname": "de Vries", "profile": "https://..." } }
{ "authenticated": false }
```

### POST /auth/logout
Clears the session and deletes tokens from memory.

```json
{ "success": true }
```

---

## Activities — `/api/activities`

### GET /api/activities
Returns a paginated page of activities. On the first call for an athlete, all activities
are fetched from Strava (up to 10 pages × 200 = 2000 activities) and cached in SQLite.
Subsequent calls are served from cache; Strava is re-checked at most once per 24 hours.

Query params:
| Param | Default | Notes |
|-------|---------|-------|
| page | 1 | 1-based page number |
| per_page | 30 | Items per page |
| gear_id | — | Filter to activities using this gear ID |

```json
{
  "activities": [ { "id": "...", "name": "...", "distance": 42195, "moving_time": 7200, ... } ],
  "page": 1,
  "perPage": 30,
  "cached": true
}
```

Activity object fields match the `activities` table columns (see `SCHEMA.md`).

### GET /api/activities/names
Returns workout names that appear more than once, sorted by most recently used.
Names are normalised via `extractWorkoutName()` (strips Zwift/TrainerRoad/WAHOO prefixes).

```json
{
  "names": [
    { "name": "Alpe du Zwift", "count": 12, "latestDate": "2026-02-15T..." },
    { "name": "SST (Mid)", "count": 8, "latestDate": "2026-01-20T..." }
  ]
}
```

**Must be placed before `GET /:id` in the route file** — Express would otherwise match
the string `"names"` as an activity ID.

### GET /api/activities/by-name
Returns all activities whose normalised name matches the query parameter, sorted newest first.

Query params: `name` (required)

```json
{
  "activities": [ { "id": "...", "name": "Zwift - Alpe du Zwift", ... } ],
  "name": "Alpe du Zwift"
}
```

### GET /api/activities/:id
Fetches a single activity **live from Strava** (not from cache). Used when full detail
is needed (e.g. segment data, split times).

```json
{ /* full Strava activity object */ }
```

### PUT /api/activities/:id
Updates activity name, description, and/or gear on Strava and syncs the change to the
local cache.

Request body:
```json
{ "name": "New name", "description": "Optional", "gear_id": "b123456" }
```

Pass `gear_id: null` or omit to leave gear unchanged. Pass `""` to remove gear
(internally sent to Strava as `"none"`).

Response: the updated Strava activity object.

---

## Equipment — `/api/equipment`

### GET /api/equipment
Returns all gear for the athlete. Fetched from Strava once on first call; served
from cache on all subsequent calls (no TTL — equipment rarely changes).
Use Admin → Invalidate Cache to force a refresh.

```json
{
  "gear": [
    { "id": "b123456", "name": "Canyon Aeroad", "type": "bike", "distance": 12500000, "primary_gear": 1, "retired": 0, ... }
  ],
  "cached": true
}
```

### GET /api/equipment/:id
Fetches detailed gear information live from Strava.

```json
{ /* full Strava gear object */ }
```

### GET /api/equipment/:id/activities
Returns all cached activities that have `gear_id` matching the given ID.

```json
{
  "activities": [ { "id": "...", "name": "...", ... } ],
  "gear_id": "b123456"
}
```

---

## Statistics — `/api/statistics`

### GET /api/statistics/weekly-distance
Returns cumulative distance per ISO week, grouped by year, for all cached activities.
All activity types are included; distance is in kilometres.

```json
{
  "years": [
    {
      "year": 2026,
      "totalDistance": 3240,
      "weeks": [
        { "week": 1, "distance": 65.2 },
        { "week": 2, "distance": 128.7 },
        ...
      ]
    }
  ]
}
```

`weeks` contains cumulative distance at the end of each week (not weekly delta).
52 entries per year; weeks with no activity have the same value as the previous week.

---

## Athlete — `/api/athlete`

### GET /api/athlete
Returns the cached athlete profile. `max_heartrate` falls back to
`MAX(max_heartrate)` across all activities when not stored in the athletes table.

```json
{
  "ftp": 316,
  "max_heartrate": 188,
  "weight": 72.5,
  "ftp_history": [
    { "id": 17, "athlete_id": "12345", "ftp": 316, "lthr": null, "valid_from": "2026-02-18" },
    ...
  ]
}
```

`ftp` requires the `profile:read_all` Strava scope. If the scope is missing it will be `null`.

---

## FTP History — `/api/ftp-history`

### GET /api/ftp-history
Returns all FTP entries for the authenticated athlete, newest first.

```json
{
  "history": [
    { "id": 17, "athlete_id": "12345", "ftp": 316, "lthr": null, "valid_from": "2026-02-18" }
  ]
}
```

### POST /api/ftp-history
Adds a new FTP entry.

Request body:
```json
{ "ftp": 316, "lthr": 168, "valid_from": "2026-02-18" }
```

`lthr` is optional. When omitted, the PMC calculation estimates LTHR as `max_hr × 0.88`.

Response (HTTP 201):
```json
{ "id": 17, "athlete_id": "12345", "ftp": 316, "lthr": null, "valid_from": "2026-02-18" }
```

### DELETE /api/ftp-history/:id
Deletes the specified FTP entry. Scoped to the authenticated athlete — cannot delete
another athlete's entries.

```json
{ "success": true }
```

---

## Fitness — `/api/fitness`

### GET /api/fitness/pmc
Returns Performance Management Chart data from the earliest cached activity to today.

Returns `{ points: [], powerRideCount: 0, hrRideCount: 0 }` when no FTP history exists.
Activities before the earliest `ftp_history.valid_from` date are excluded.

**TSS calculation** (see `SCHEMA.md` → ftp_history for detail):
- Power TSS used when `device_watts = 1` and `weighted_average_watts > 0`
- hrTSS fallback used otherwise when `average_heartrate` is available
- Activities with neither are excluded

```json
{
  "points": [
    { "date": "2019-11-19", "tss": 0,   "ctl": 0.0,  "atl": 0.0,  "tsb": 0.0 },
    { "date": "2019-11-20", "tss": 78.4, "ctl": 1.87, "atl": 11.2, "tsb": -9.3 },
    ...
  ],
  "powerRideCount": 842,
  "hrRideCount": 115
}
```

One point per calendar day from first activity to today (including rest days with `tss: 0`).

### GET /api/fitness/hrv
Returns all cached Whoop recovery records for the athlete, in date order.

```json
{
  "recoveries": [
    { "id": "rec_abc", "athlete_id": "12345", "date": "2026-02-22", "score": 74, "hrv_rmssd": 62.3, "resting_heart_rate": 48, "spo2": 97.5, "skin_temp": 35.1 }
  ]
}
```

Returns `{ "recoveries": [] }` when Whoop is not connected.

---

## Admin — `/api/admin`

### POST /api/admin/invalidate-cache
Clears all cached activities for the athlete. The next dashboard visit triggers a full
reload from Strava. Equipment cache is **not** cleared.

```json
{ "success": true, "message": "Activity cache cleared. All activities will be reloaded on next visit to the dashboard." }
```

### POST /api/admin/sync-activities
Checks Strava for activities recorded since the most recently cached activity and imports
any new ones immediately. Bypasses the 24-hour TTL. Resets the TTL after completion so
the dashboard does not re-check immediately.

Returns an error message (not HTTP error) when no local cache exists yet:
```json
{ "imported": 0, "activities": [], "message": "No local cache yet — visit the dashboard first to do an initial load." }
```

Normal response:
```json
{
  "imported": 2,
  "activities": [
    { "name": "Morning Ride", "start_date": "2026-02-22T07:30:00Z" }
  ],
  "message": "Imported 2 new activities."
}
```

---

## Whoop — `/whoop`

The Whoop routes are mounted at `/whoop` (not `/api/whoop`) because the OAuth callback
must be a registered redirect URI in the Whoop developer portal.

### GET /whoop/login
Redirects the browser to the Whoop OAuth authorization page.
Requires an active Strava session (athlete must be logged in first).

### GET /whoop/callback
**No session required on the route itself**, but the browser must carry a valid `strava.sid`
cookie (set during Strava login). Exchanges the authorization code for Whoop tokens, stores
them, runs an initial sync of recoveries and cycles, then redirects to `{FRONTEND_URL}/fitness`.

On error: redirects to `/fitness?whoop_error=access_denied` or `?whoop_error=token_exchange_failed`.

### GET /whoop/status
Returns connection state.

```json
{ "connected": true, "last_sync": "2026-02-21" }
{ "connected": false }
```

`last_sync` is the date of the most recently synced recovery record.

### POST /whoop/sync
Runs an incremental sync of recoveries and cycles (fetches only records newer than the
most recently cached entry).

```json
{ "success": true, "recoveries_synced": 3, "cycles_synced": 3 }
```

Returns HTTP 400 if Whoop is not connected.

### POST /whoop/logout
Deletes the stored Whoop tokens. The athlete remains logged in to Strava.
Whoop recovery data is retained in the database.

```json
{ "success": true }
```

---

## Environment Variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `STRAVA_CLIENT_ID` | backend | Strava app credential |
| `STRAVA_CLIENT_SECRET` | backend | Strava app credential |
| `STRAVA_REDIRECT_URI` | backend | Must match Strava app settings |
| `SESSION_SECRET` | backend | Random string ≥ 32 chars |
| `FRONTEND_URL` | backend | Used for OAuth redirects (e.g. `http://localhost:180`) |
| `PORT` | backend | Default 3000 |
| `WHOOP_CLIENT_ID` | backend | Optional; only needed for Whoop integration |
| `WHOOP_CLIENT_SECRET` | backend | Optional |
| `WHOOP_REDIRECT_URI` | backend | Must match Whoop developer portal |
