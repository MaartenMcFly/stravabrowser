import db from '../db/database.js';

/**
 * Cache TTL configuration (in seconds)
 */
const TTL = {
  ACTIVITIES_CHECK: 24 * 60 * 60, // Check for new activities every 24 hours
  EQUIPMENT: 24 * 60 * 60, // 24 hours
};

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Activity
 * @property {number}      id                       - Strava activity ID (integer; stored as TEXT, returned as number)
 * @property {string}      name                     - Raw Strava name (use extractWorkoutName() for display)
 * @property {number|null} distance                 - Metres
 * @property {number|null} moving_time              - Seconds of actual movement
 * @property {number|null} elapsed_time             - Seconds including pauses
 * @property {number|null} total_elevation_gain     - Metres
 * @property {string|null} type                     - Legacy Strava type string
 * @property {string|null} sport_type               - Preferred type: Ride, Run, VirtualRide, etc.
 * @property {string|null} start_date               - UTC ISO 8601
 * @property {string|null} start_date_local         - Local-timezone ISO 8601
 * @property {string|null} timezone                 - IANA timezone string
 * @property {number|null} average_speed            - m/s
 * @property {number|null} max_speed                - m/s
 * @property {number|null} average_cadence          - rpm
 * @property {number|null} average_heartrate        - bpm; null when HR monitor not used
 * @property {number|null} max_heartrate            - bpm; null when HR monitor not used
 * @property {number|null} average_watts            - Average power; null without power meter
 * @property {number|null} weighted_average_watts   - Normalised Power (NP); null without power meter
 * @property {number|null} kilojoules               - Total energy output; null without power meter
 * @property {0|1|null}    device_watts             - 1 = actual power meter, 0 = estimated, null = no power
 * @property {string|null} description              - Athlete-authored activity description
 * @property {string|null} gear_id                  - References equipment.id; null if no gear assigned
 * @property {{summary_polyline: string}|null} map  - Reconstructed map object for polyline rendering
 */

/**
 * @typedef {Object} Equipment
 * @property {string}      id           - Strava gear ID
 * @property {string}      name
 * @property {string}      type         - 'bike' or 'shoes'
 * @property {string|null} brand_name
 * @property {string|null} model_name
 * @property {string|null} description
 * @property {number|null} distance     - Total metres logged on this gear
 * @property {boolean}     primary      - Mapped from primary_gear integer column
 * @property {boolean}     retired      - Mapped from retired integer column
 */

/**
 * @typedef {Object} AthleteProfile
 * @property {number|null} ftp           - Watts; requires profile:read_all Strava scope
 * @property {number|null} max_heartrate - bpm
 * @property {number|null} weight        - kg
 */

/**
 * @typedef {Object} FtpEntry
 * @property {number}      id           - Autoincrement primary key
 * @property {string}      athlete_id
 * @property {number}      ftp          - Watts
 * @property {number|null} lthr         - Lactate Threshold HR in bpm; null → estimated as max_hr × 0.88
 * @property {string}      valid_from   - YYYY-MM-DD
 */

/**
 * @typedef {Object} WhoopTokens
 * @property {string}      athlete_id
 * @property {string}      access_token
 * @property {string|null} refresh_token
 * @property {number|null} expires_at    - Unix seconds
 * @property {number}      updated_at    - Unix seconds
 */

/**
 * @typedef {Object} WhoopRecovery
 * @property {string}      id                  - Whoop recovery ID
 * @property {string}      athlete_id
 * @property {string}      date                - YYYY-MM-DD
 * @property {number|null} score               - Recovery score 0–100
 * @property {number|null} hrv_rmssd           - HRV in ms (RMSSD method)
 * @property {number|null} resting_heart_rate  - bpm
 * @property {number|null} spo2                - Blood oxygen saturation %
 * @property {number|null} skin_temp           - °C
 */

/**
 * @typedef {Object} WhoopCycle
 * @property {string}      id
 * @property {string}      athlete_id
 * @property {string}      date                 - YYYY-MM-DD
 * @property {number|null} strain               - Daily strain score 0–21
 * @property {number|null} kilojoule
 * @property {number|null} average_heart_rate   - bpm
 * @property {number|null} max_heart_rate       - bpm
 */

/**
 * @typedef {Object} CacheStats
 * @property {number}   activities          - Cached activity count
 * @property {number}   equipment           - Cached equipment count
 * @property {string|null} mostRecentActivity - ISO 8601 date of newest cached activity
 * @property {Array<{key: string, lastFetched: string, expiresAt: string}>} cache - Metadata rows
 */

// ---------------------------------------------------------------------------
// Cache metadata
// ---------------------------------------------------------------------------

/**
 * Check if the cache TTL for a given key is still valid.
 * @param {string} sessionId  - Athlete ID (param name is legacy)
 * @param {string} cacheKey   - e.g. `activities:{athleteId}`
 * @returns {boolean}
 */
export function isCacheValid(sessionId, cacheKey) {
  const stmt = db.prepare('SELECT last_fetched, expires_at FROM cache_metadata WHERE key = ? AND session_id = ?');
  const result = stmt.get(cacheKey, sessionId);

  if (!result) return false;

  const now = Math.floor(Date.now() / 1000);
  return result.expires_at > now;
}

/**
 * Upsert a cache_metadata row, setting expires_at = now + ttl.
 * @param {string}      sessionId  - Athlete ID
 * @param {string}      cacheKey   - e.g. `activities:{athleteId}`
 * @param {number}      ttl        - Seconds until expiry (use TTL constants)
 * @param {Object|null} [metadata] - Optional JSON-serialisable metadata blob
 */
export function updateCacheMetadata(sessionId, cacheKey, ttl, metadata = null) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttl;

  const stmt = db.prepare(`
    INSERT INTO cache_metadata (key, session_id, last_fetched, expires_at, metadata)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      session_id = excluded.session_id,
      last_fetched = excluded.last_fetched,
      expires_at = excluded.expires_at,
      metadata = excluded.metadata
  `);

  stmt.run(cacheKey, sessionId, now, expiresAt, metadata ? JSON.stringify(metadata) : null);
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

/**
 * Upsert a batch of Strava activities into the SQLite cache.
 * Runs inside a transaction. Existing rows are updated (all columns except id).
 * Note: `map_summary_polyline` is extracted from `activity.map.summary_polyline`.
 * @param {string}   sessionId  - Athlete ID
 * @param {Object[]} activities - Raw Strava activity objects from the API
 */
export function saveActivities(sessionId, activities) {
  console.log(`💾 Saving ${activities.length} activities for session: ${sessionId}`);

  const insertStmt = db.prepare(`
    INSERT INTO activities (
      id, name, distance, moving_time, elapsed_time, total_elevation_gain,
      type, sport_type, start_date, start_date_local, timezone,
      average_speed, max_speed, average_cadence, average_heartrate, max_heartrate,
      average_watts, weighted_average_watts, description,
      gear_id, map_summary_polyline, session_id,
      kilojoules, device_watts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      average_watts = excluded.average_watts,
      weighted_average_watts = excluded.weighted_average_watts,
      description = excluded.description,
      gear_id = excluded.gear_id,
      map_summary_polyline = excluded.map_summary_polyline,
      session_id = excluded.session_id,
      kilojoules = excluded.kilojoules,
      device_watts = excluded.device_watts,
      updated_at = strftime('%s', 'now')
  `);

  const saveMany = db.transaction((activities) => {
    for (const activity of activities) {
      insertStmt.run(
        activity.id?.toString(),
        activity.name,
        activity.distance,
        activity.moving_time,
        activity.elapsed_time,
        activity.total_elevation_gain,
        activity.type,
        activity.sport_type,
        activity.start_date,
        activity.start_date_local,
        activity.timezone,
        activity.average_speed,
        activity.max_speed,
        activity.average_cadence,
        activity.average_heartrate,
        activity.max_heartrate,
        activity.average_watts ?? null,
        activity.weighted_average_watts ?? null,
        activity.description ?? null,
        activity.gear_id,
        activity.map?.summary_polyline,
        sessionId,
        activity.kilojoules ?? null,
        activity.device_watts ? 1 : 0
      );
    }
  });

  saveMany(activities);

  // Verify what was saved
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM activities WHERE session_id = ?');
  const result = countStmt.get(sessionId);
  console.log(`✅ Cached ${activities.length} activities, total in DB for this session: ${result.count}`);
}

/**
 * Return a paginated page of cached activities, sorted newest first.
 * The `map` object is reconstructed from the stored `map_summary_polyline` column.
 * @param {string}      sessionId        - Athlete ID
 * @param {string|null} [gearId=null]    - Filter to activities with this gear_id
 * @param {number}      [page=1]         - 1-based page number
 * @param {number}      [perPage=30]     - Page size
 * @returns {Activity[]}
 */
export function getActivities(sessionId, gearId = null, page = 1, perPage = 30) {
  let query = 'SELECT * FROM activities WHERE session_id = ?';
  const params = [sessionId];

  if (gearId) {
    query += ' AND gear_id = ?';
    params.push(gearId);
  }

  query += ' ORDER BY start_date DESC LIMIT ? OFFSET ?';
  params.push(perPage, (page - 1) * perPage);

  const stmt = db.prepare(query);
  const activities = stmt.all(...params);

  // Reconstruct map object if polyline exists
  return activities.map(activity => ({
    ...activity,
    id: parseInt(activity.id),
    map: activity.map_summary_polyline ? { summary_polyline: activity.map_summary_polyline } : null,
  }));
}

/**
 * Return all cached activities for an athlete, sorted newest first.
 * Used by routes that need the full set (statistics, similar activities, PMC, gear filtering).
 * @param {string} sessionId - Athlete ID
 * @returns {Activity[]}
 */
export function getAllActivities(sessionId) {
  const stmt = db.prepare('SELECT * FROM activities WHERE session_id = ? ORDER BY start_date DESC');
  const activities = stmt.all(sessionId);

  return activities.map(activity => ({
    ...activity,
    id: parseInt(activity.id),
    map: activity.map_summary_polyline ? { summary_polyline: activity.map_summary_polyline } : null,
  }));
}

/**
 * Update the editable fields of a cached activity after a successful Strava PUT.
 * Only name, description, and gear_id are mutable via the app.
 * @param {string}      athleteId   - Athlete ID
 * @param {string}      activityId  - Strava activity ID
 * @param {Object}      fields
 * @param {string}      fields.name
 * @param {string|null} fields.description
 * @param {string|null} fields.gear_id
 */
export function updateActivityCache(athleteId, activityId, { name, description, gear_id }) {
  db.prepare(`
    UPDATE activities
    SET name = ?, description = ?, gear_id = ?, updated_at = strftime('%s', 'now')
    WHERE id = ? AND session_id = ?
  `).run(name, description ?? null, gear_id ?? null, activityId.toString(), athleteId);
}

/**
 * Delete all cached activities and the associated cache_metadata row for an athlete.
 * The next dashboard visit will trigger a full re-fetch from Strava.
 * Equipment cache is NOT affected.
 * @param {string} athleteId
 */
export function clearActivitiesCache(athleteId) {
  db.prepare('DELETE FROM activities WHERE session_id = ?').run(athleteId);
  db.prepare('DELETE FROM cache_metadata WHERE key = ? AND session_id = ?').run(`activities:${athleteId}`, athleteId);
  console.log(`🗑️  Cleared activities cache for athlete ${athleteId}`);
}

/**
 * Delete all cached data for a session (activities, equipment, metadata).
 * Used on logout to clean up stale data.
 * @param {string} sessionId
 */
export function clearSessionCache(sessionId) {
  db.prepare('DELETE FROM activities WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM equipment WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM cache_metadata WHERE session_id = ?').run(sessionId);
  console.log(`🗑️  Cleared cache for session ${sessionId}`);
}

/**
 * Return the `start_date` of the most recently cached activity.
 * Used by incremental sync to determine the cutoff timestamp.
 * @param {string} sessionId - Athlete ID
 * @returns {string|null} UTC ISO 8601 string, or null if no activities cached
 */
export function getMostRecentActivityDate(sessionId) {
  const stmt = db.prepare('SELECT start_date FROM activities WHERE session_id = ? ORDER BY start_date DESC LIMIT 1');
  const result = stmt.get(sessionId);
  return result ? result.start_date : null;
}

/**
 * Return true if at least one activity exists in the cache for this athlete.
 * @param {string} sessionId - Athlete ID
 * @returns {boolean}
 */
export function hasActivitiesCache(sessionId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM activities WHERE session_id = ?');
  const result = stmt.get(sessionId);
  return result.count > 0;
}

/**
 * Migrate activities, equipment, and cache_metadata rows that use a legacy session ID
 * to the current athlete ID. Safe to call on every request — no-ops when already migrated.
 * This is a single-user system: all rows not already keyed to athleteId are re-attributed.
 * @param {string} oldSessionId - Legacy session ID (may equal athleteId if already migrated)
 * @param {string} athleteId    - Strava athlete ID to migrate rows to
 * @returns {number} Number of activity rows updated
 */
export function migrateActivitiesToAthlete(oldSessionId, athleteId) {
  // Check if we have any activities at all in the database
  const totalActivities = db.prepare('SELECT COUNT(*) as count FROM activities').get();

  if (totalActivities.count === 0) {
    return 0; // No activities to migrate
  }

  // Update all activities to use the athlete ID (works for single-user systems)
  const stmt = db.prepare('UPDATE activities SET session_id = ? WHERE session_id != ?');
  const result = stmt.run(athleteId, athleteId);

  // Also migrate metadata
  db.prepare('UPDATE cache_metadata SET session_id = ? WHERE session_id != ?').run(athleteId, athleteId);

  // Also migrate equipment
  db.prepare('UPDATE equipment SET session_id = ? WHERE session_id != ?').run(athleteId, athleteId);

  return result.changes;
}

/**
 * Return a diagnostic summary of the cache state for an athlete.
 * @param {string} sessionId - Athlete ID
 * @returns {CacheStats}
 */
export function getCacheStats(sessionId) {
  const activityCount = db.prepare('SELECT COUNT(*) as count FROM activities WHERE session_id = ?').get(sessionId);
  const equipmentCount = db.prepare('SELECT COUNT(*) as count FROM equipment WHERE session_id = ?').get(sessionId);
  const cacheMetadata = db.prepare('SELECT * FROM cache_metadata WHERE session_id = ?').all(sessionId);
  const mostRecentActivity = getMostRecentActivityDate(sessionId);

  return {
    activities: activityCount.count,
    equipment: equipmentCount.count,
    mostRecentActivity,
    cache: cacheMetadata.map(m => ({
      key: m.key,
      lastFetched: new Date(m.last_fetched * 1000).toISOString(),
      expiresAt: new Date(m.expires_at * 1000).toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/**
 * Upsert a batch of Strava gear items into the SQLite cache.
 * Equipment is considered immutable after first fetch — no TTL.
 * @param {string}   sessionId  - Athlete ID
 * @param {Object[]} equipment  - Raw Strava gear objects from the API
 */
export function saveEquipment(sessionId, equipment) {
  const insertStmt = db.prepare(`
    INSERT INTO equipment (
      id, name, type, brand_name, model_name, description, distance, primary_gear, retired, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      brand_name = excluded.brand_name,
      model_name = excluded.model_name,
      description = excluded.description,
      distance = excluded.distance,
      primary_gear = excluded.primary_gear,
      retired = excluded.retired,
      updated_at = strftime('%s', 'now')
  `);

  const saveMany = db.transaction((equipment) => {
    for (const gear of equipment) {
      insertStmt.run(
        gear.id,
        gear.name,
        gear.type,
        gear.brand_name,
        gear.model_name,
        gear.description,
        gear.distance,
        gear.primary ? 1 : 0,
        gear.retired ? 1 : 0,
        sessionId
      );
    }
  });

  saveMany(equipment);
  console.log(`💾 Cached ${equipment.length} pieces of equipment`);
}

/**
 * Return all cached equipment for an athlete, primary gear first then alphabetical.
 * Integer `primary_gear` and `retired` columns are mapped to booleans.
 * @param {string} sessionId - Athlete ID
 * @returns {Equipment[]}
 */
export function getEquipment(sessionId) {
  const stmt = db.prepare('SELECT * FROM equipment WHERE session_id = ? ORDER BY primary_gear DESC, name ASC');
  const equipment = stmt.all(sessionId);

  return equipment.map(gear => ({
    ...gear,
    primary: gear.primary_gear === 1,
    retired: gear.retired === 1,
  }));
}

/**
 * Return a single cached gear item by ID.
 * @param {string} sessionId   - Athlete ID
 * @param {string} equipmentId - Strava gear ID
 * @returns {Equipment|null}
 */
export function getEquipmentById(sessionId, equipmentId) {
  const stmt = db.prepare('SELECT * FROM equipment WHERE id = ? AND session_id = ?');
  const gear = stmt.get(equipmentId, sessionId);

  if (!gear) return null;

  return {
    ...gear,
    primary: gear.primary_gear === 1,
    retired: gear.retired === 1,
  };
}

// ---------------------------------------------------------------------------
// Athlete profile
// ---------------------------------------------------------------------------

/**
 * Upsert athlete profile fields. Uses COALESCE so passing null for a field
 * leaves the existing value intact.
 * @param {string}      athleteId
 * @param {Object}      profile
 * @param {number|null} profile.ftp           - Watts
 * @param {number|null} [profile.max_heartrate]
 * @param {number|null} [profile.weight]      - kg
 */
export function saveAthlete(athleteId, { ftp, max_heartrate, weight }) {
  db.prepare(`
    INSERT INTO athletes (id, ftp, max_heartrate, weight, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(id) DO UPDATE SET
      ftp = COALESCE(excluded.ftp, ftp),
      max_heartrate = COALESCE(excluded.max_heartrate, max_heartrate),
      weight = COALESCE(excluded.weight, weight),
      updated_at = strftime('%s', 'now')
  `).run(athleteId, ftp ?? null, max_heartrate ?? null, weight ?? null);
}

/**
 * Return the stored athlete profile, or null if not yet populated.
 * @param {string} athleteId
 * @returns {AthleteProfile|null}
 */
export function getAthleteProfile(athleteId) {
  return db.prepare('SELECT ftp, max_heartrate, weight FROM athletes WHERE id = ?').get(athleteId) || null;
}

// ---------------------------------------------------------------------------
// FTP history
// ---------------------------------------------------------------------------

/**
 * Return all FTP history entries for an athlete, newest first.
 * @param {string} athleteId
 * @returns {FtpEntry[]}
 */
export function getFtpHistory(athleteId) {
  return db.prepare('SELECT * FROM ftp_history WHERE athlete_id = ? ORDER BY valid_from DESC').all(athleteId);
}

/**
 * Insert a new FTP history entry.
 * @param {string} athleteId
 * @param {Object}      entry
 * @param {number}      entry.ftp        - Watts
 * @param {number|null} entry.lthr       - Lactate Threshold HR; null = estimate from max_hr
 * @param {string}      entry.valid_from - YYYY-MM-DD
 * @returns {number} The new row's autoincrement ID
 */
export function addFtpEntry(athleteId, { ftp, lthr, valid_from }) {
  const result = db.prepare(
    'INSERT INTO ftp_history (athlete_id, ftp, lthr, valid_from) VALUES (?, ?, ?, ?)'
  ).run(athleteId, ftp, lthr ?? null, valid_from);
  return result.lastInsertRowid;
}

/**
 * Delete an FTP history entry. Scoped to the athlete to prevent cross-user deletion.
 * @param {number} id         - Row ID
 * @param {string} athleteId
 */
export function deleteFtpEntry(id, athleteId) {
  db.prepare('DELETE FROM ftp_history WHERE id = ? AND athlete_id = ?').run(id, athleteId);
}

/**
 * Return the FTP entry that was active on a given date:
 * the entry with the latest `valid_from` that is still ≤ dateStr.
 * Returns null if no entry covers that date (activity predates all FTP records).
 * @param {string} athleteId
 * @param {string} dateStr   - YYYY-MM-DD
 * @returns {FtpEntry|null}
 */
export function getFtpForDate(athleteId, dateStr) {
  return db.prepare(
    'SELECT * FROM ftp_history WHERE athlete_id = ? AND valid_from <= ? ORDER BY valid_from DESC LIMIT 1'
  ).get(athleteId, dateStr) || null;
}

// ---------------------------------------------------------------------------
// Power curve data (for interval-based zone calculation)
// ---------------------------------------------------------------------------

/**
 * Save power curve data for an activity.
 * @param {string} activityId
 * @param {Array} powerCurve - Array of {secs, watts} objects from Strava API
 */
export function savePowerCurve(activityId, powerCurve) {
  db.prepare(`
    INSERT INTO activity_power_curves (activity_id, power_curve, updated_at)
    VALUES (?, ?, strftime('%s', 'now'))
    ON CONFLICT(activity_id) DO UPDATE SET
      power_curve = excluded.power_curve,
      updated_at = strftime('%s', 'now')
  `).run(activityId, JSON.stringify(powerCurve || []));
}

/**
 * Get power curve data for an activity.
 * @param {string} activityId
 * @returns {Array|null} Array of {secs, watts} objects, or null if not found
 */
export function getPowerCurve(activityId) {
  const row = db.prepare('SELECT power_curve FROM activity_power_curves WHERE activity_id = ?').get(activityId);
  if (!row) return null;
  try {
    return JSON.parse(row.power_curve);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Whoop integration
// ---------------------------------------------------------------------------

/**
 * Upsert Whoop OAuth tokens for an athlete.
 * @param {string} athleteId
 * @param {Object}      tokens
 * @param {string}      tokens.access_token
 * @param {string|null} tokens.refresh_token
 * @param {number|null} tokens.expires_at - Unix seconds
 */
export function saveWhoopTokens(athleteId, { access_token, refresh_token, expires_at }) {
  db.prepare(`
    INSERT INTO whoop_tokens (athlete_id, access_token, refresh_token, expires_at, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(athlete_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = strftime('%s', 'now')
  `).run(athleteId, access_token, refresh_token ?? null, expires_at ?? null);
}

/**
 * Return stored Whoop tokens, or null if not connected.
 * @param {string} athleteId
 * @returns {WhoopTokens|null}
 */
export function getWhoopTokens(athleteId) {
  return db.prepare('SELECT * FROM whoop_tokens WHERE athlete_id = ?').get(athleteId) || null;
}

/**
 * Delete Whoop tokens to disconnect the integration.
 * Recovery and cycle data are retained.
 * @param {string} athleteId
 */
export function deleteWhoopTokens(athleteId) {
  db.prepare('DELETE FROM whoop_tokens WHERE athlete_id = ?').run(athleteId);
}

/**
 * Upsert Whoop recovery records. Existing rows are updated (score fields only).
 * @param {string}          athleteId
 * @param {WhoopRecovery[]} recoveries
 */
export function saveWhoopRecoveries(athleteId, recoveries) {
  const stmt = db.prepare(`
    INSERT INTO whoop_recoveries (id, athlete_id, date, score, hrv_rmssd, resting_heart_rate, spo2, skin_temp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      score = excluded.score,
      hrv_rmssd = excluded.hrv_rmssd,
      resting_heart_rate = excluded.resting_heart_rate,
      spo2 = excluded.spo2,
      skin_temp = excluded.skin_temp
  `);
  const insert = db.transaction((rows) => {
    for (const r of rows) {
      stmt.run(r.id, athleteId, r.date, r.score ?? null, r.hrv_rmssd ?? null,
        r.resting_heart_rate ?? null, r.spo2 ?? null, r.skin_temp ?? null);
    }
  });
  insert(recoveries);
}

/**
 * Upsert Whoop cycle (daily strain) records.
 * @param {string}        athleteId
 * @param {WhoopCycle[]}  cycles
 */
export function saveWhoopCycles(athleteId, cycles) {
  const stmt = db.prepare(`
    INSERT INTO whoop_cycles (id, athlete_id, date, strain, kilojoule, average_heart_rate, max_heart_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      strain = excluded.strain,
      kilojoule = excluded.kilojoule,
      average_heart_rate = excluded.average_heart_rate,
      max_heart_rate = excluded.max_heart_rate
  `);
  const insert = db.transaction((rows) => {
    for (const r of rows) {
      stmt.run(r.id, athleteId, r.date, r.strain ?? null, r.kilojoule ?? null,
        r.average_heart_rate ?? null, r.max_heart_rate ?? null);
    }
  });
  insert(cycles);
}

/**
 * Return all Whoop recovery records for an athlete, oldest first.
 * Returns an empty array if Whoop is not connected or no data has been synced.
 * @param {string} athleteId
 * @returns {WhoopRecovery[]}
 */
export function getWhoopRecoveries(athleteId) {
  return db.prepare('SELECT * FROM whoop_recoveries WHERE athlete_id = ? ORDER BY date ASC').all(athleteId);
}

export { TTL };
