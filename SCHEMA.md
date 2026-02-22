# Database Schema

SQLite database at `backend/data/strava_cache.db`.
Managed by `backend/src/db/database.js` (schema init) and `backend/src/services/cacheService.js` (all read/write).
WAL mode is enabled — this creates companion `.db-wal` and `.db-shm` files alongside the database.

---

## Tables

### activities

Cached copy of the athlete's Strava activities. Keyed by Strava activity ID.
Populated on first dashboard visit (full fetch), then incrementally updated.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | TEXT | NO | Primary key — Strava activity ID |
| name | TEXT | NO | Raw Strava name; use `extractWorkoutName()` for display |
| distance | REAL | YES | Metres |
| moving_time | INTEGER | YES | Seconds of actual movement |
| elapsed_time | INTEGER | YES | Seconds including pauses |
| total_elevation_gain | REAL | YES | Metres |
| type | TEXT | YES | Legacy Strava type string |
| sport_type | TEXT | YES | Preferred type: Ride, Run, VirtualRide, etc. |
| start_date | TEXT | YES | UTC ISO 8601 — used as the canonical activity timestamp |
| start_date_local | TEXT | YES | Local-timezone ISO 8601 |
| timezone | TEXT | YES | IANA timezone string |
| average_speed | REAL | YES | m/s |
| max_speed | REAL | YES | m/s |
| average_cadence | REAL | YES | rpm |
| average_heartrate | REAL | YES | bpm; null when HR monitor not used |
| max_heartrate | REAL | YES | bpm; null when HR monitor not used |
| average_watts | REAL | YES | Average power; null without power meter |
| weighted_average_watts | REAL | YES | Normalised Power (NP); null without power meter |
| kilojoules | REAL | YES | Total energy output; null without power meter |
| device_watts | INTEGER | YES | 1 = actual power meter, 0 = estimated, null = no power |
| description | TEXT | YES | Athlete-authored activity description |
| gear_id | TEXT | YES | References equipment.id; null if no gear assigned |
| map_summary_polyline | TEXT | YES | Google-format encoded polyline for route thumbnail |
| session_id | TEXT | YES | **Deprecated** — originally session-scoped; migrated to athlete-scoped on first access |
| created_at | INTEGER | YES | Unix seconds — when the row was inserted |
| updated_at | INTEGER | YES | Unix seconds — when the row was last modified |

**Indexes**
- `idx_activities_gear_id` on `(gear_id)`
- `idx_activities_start_date` on `(start_date DESC)`
- `idx_activities_session_gear` on `(session_id, gear_id)` — legacy, retained for migration

---

### equipment

Cached copy of the athlete's Strava gear (bikes and shoes).
Fetched once on first equipment page visit; never automatically re-fetched.
Use **Admin → Invalidate Cache** to force a refresh.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | TEXT | NO | Primary key — Strava gear ID |
| name | TEXT | NO | Display name |
| type | TEXT | NO | `bike` or `shoes` |
| brand_name | TEXT | YES | |
| model_name | TEXT | YES | |
| description | TEXT | YES | |
| distance | REAL | YES | Total metres logged on this gear |
| primary_gear | INTEGER | YES | 0/1 boolean |
| retired | INTEGER | YES | 0/1 boolean |
| session_id | TEXT | YES | Athlete-scoped after migration (same pattern as activities) |
| created_at | INTEGER | YES | Unix seconds |
| updated_at | INTEGER | YES | Unix seconds |

**Indexes**
- `idx_equipment_session` on `(session_id)`

---

### cache_metadata

Tracks when each data set was last fetched and when it next needs refreshing.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| key | TEXT | NO | Primary key — e.g. `activities:{athleteId}` |
| session_id | TEXT | YES | Athlete ID (column name is legacy) |
| last_fetched | INTEGER | NO | Unix seconds |
| expires_at | INTEGER | YES | Unix seconds; null = never expires |
| metadata | TEXT | YES | Reserved JSON blob; currently unused |

**TTL constants** (defined in `cacheService.js`):
- `ACTIVITIES_CHECK`: 24 hours — how often new activities are checked on dashboard load
- Equipment has no TTL; it is considered immutable after first fetch

**Indexes**
- `idx_cache_session` on `(session_id)`

---

### athletes

Strava profile data for each authenticated athlete. Written on OAuth login.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | TEXT | NO | Primary key — Strava athlete ID |
| ftp | INTEGER | YES | Functional Threshold Power in watts; from Strava profile (`profile:read_all` scope required) |
| max_heartrate | INTEGER | YES | If null, derived at runtime as `MAX(max_heartrate)` across all activities |
| weight | REAL | YES | kg |
| updated_at | INTEGER | YES | Unix seconds |

---

### ftp_history

Manually maintained FTP timeline. Used by the PMC calculation to apply the correct FTP
to each historical activity rather than using only the current value.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | INTEGER | NO | Primary key — autoincrement |
| athlete_id | TEXT | NO | References athletes.id |
| ftp | INTEGER | NO | Watts |
| lthr | INTEGER | YES | Lactate Threshold Heart Rate in bpm; when null the PMC calculation estimates it as `max_hr × 0.88` |
| valid_from | TEXT | NO | `YYYY-MM-DD` — this FTP value was active from this date onward |

To find the FTP for a given activity date: select the entry with the latest `valid_from` that is still ≤ the activity date. Activities before the earliest `valid_from` entry are excluded from PMC calculations.

**Indexes**
- `idx_ftp_history_athlete` on `(athlete_id, valid_from DESC)`

---

### whoop_tokens

OAuth tokens for the Whoop integration. One row per athlete.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| athlete_id | TEXT | NO | Primary key — Strava athlete ID (not a Whoop ID) |
| access_token | TEXT | NO | |
| refresh_token | TEXT | YES | |
| expires_at | INTEGER | YES | Unix seconds |
| updated_at | INTEGER | YES | Unix seconds |

Row presence indicates the athlete has connected their Whoop account.
Delete the row (via `POST /whoop/logout`) to disconnect.

---

### whoop_recoveries

Daily Whoop recovery scores and HRV data. Synced on Whoop connect and via `POST /whoop/sync`.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | TEXT | NO | Primary key — Whoop recovery ID |
| athlete_id | TEXT | NO | Strava athlete ID |
| date | TEXT | NO | `YYYY-MM-DD` — used to correlate with activity `start_date` |
| score | REAL | YES | Recovery score 0–100 |
| hrv_rmssd | REAL | YES | Heart Rate Variability in ms (RMSSD method) |
| resting_heart_rate | REAL | YES | bpm |
| spo2 | REAL | YES | Blood oxygen saturation % |
| skin_temp | REAL | YES | °C |

**Indexes**
- `idx_whoop_recoveries_athlete` on `(athlete_id, date ASC)`

---

### whoop_cycles

Daily Whoop strain and energy data.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | TEXT | NO | Primary key — Whoop cycle ID |
| athlete_id | TEXT | NO | Strava athlete ID |
| date | TEXT | NO | `YYYY-MM-DD` |
| strain | REAL | YES | Daily strain score 0–21 |
| kilojoule | REAL | YES | Energy expended |
| average_heart_rate | REAL | YES | bpm |
| max_heart_rate | REAL | YES | bpm |

**Indexes**
- `idx_whoop_cycles_athlete` on `(athlete_id, date ASC)`

---

## Migrations

New columns are added via a try/catch migration array in `database.js`. Adding a column that
already exists throws — the exception is silently swallowed. This means migrations are
**additive only**: dropping or renaming columns requires a manual migration strategy.

Columns added via migration (not in the original `CREATE TABLE`):

| Table | Column | Reason |
|-------|--------|--------|
| activities | average_watts | Power data added post-launch |
| activities | weighted_average_watts | Normalised Power for TSS calculation |
| activities | description | Activity editing feature |
| activities | kilojoules | PMC energy data |
| activities | device_watts | Distinguish real vs estimated power |

---

## Relationships

```
athletes ──< ftp_history        (athlete_id)
athletes ──< whoop_tokens       (athlete_id, 1:1)
athletes ──< whoop_recoveries   (athlete_id)
athletes ──< whoop_cycles       (athlete_id)
activities >── equipment        (gear_id → equipment.id, soft reference — no FK constraint)
```

SQLite foreign key constraints are **not enforced** (not enabled in this app).
All relationship integrity is maintained in application code.

---

## Backup Notes

WAL mode produces three files that must be backed up together:
- `strava_cache.db`
- `strava_cache.db-wal`
- `strava_cache.db-shm`

In Docker, the database lives in the named volume `strava_data` mounted at `/app/data`.
