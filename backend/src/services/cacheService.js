import db from '../db/database.js';

/**
 * Cache TTL configuration (in seconds)
 */
const TTL = {
  ACTIVITIES_CHECK: 24 * 60 * 60, // Check for new activities every 24 hours
  EQUIPMENT: 24 * 60 * 60, // 24 hours
};

/**
 * Check if cache is valid for a given key
 */
export function isCacheValid(sessionId, cacheKey) {
  const stmt = db.prepare('SELECT last_fetched, expires_at FROM cache_metadata WHERE key = ? AND session_id = ?');
  const result = stmt.get(cacheKey, sessionId);

  if (!result) return false;

  const now = Math.floor(Date.now() / 1000);
  return result.expires_at > now;
}

/**
 * Update cache metadata
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

/**
 * Save activities to cache
 */
export function saveActivities(sessionId, activities) {
  console.log(`💾 Saving ${activities.length} activities for session: ${sessionId}`);

  const insertStmt = db.prepare(`
    INSERT INTO activities (
      id, name, distance, moving_time, elapsed_time, total_elevation_gain,
      type, sport_type, start_date, start_date_local, timezone,
      average_speed, max_speed, average_cadence, average_heartrate, max_heartrate,
      average_watts, weighted_average_watts,
      gear_id, map_summary_polyline, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      gear_id = excluded.gear_id,
      map_summary_polyline = excluded.map_summary_polyline,
      session_id = excluded.session_id,
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
        activity.gear_id,
        activity.map?.summary_polyline,
        sessionId
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
 * Get activities from cache
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
 * Get all activities from cache (for gear extraction)
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
 * Save equipment to cache
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
 * Get equipment from cache
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
 * Get single equipment details from cache
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

/**
 * Clear only the activities cache for an athlete, forcing a full reload on next request
 */
export function clearActivitiesCache(athleteId) {
  db.prepare('DELETE FROM activities WHERE session_id = ?').run(athleteId);
  db.prepare('DELETE FROM cache_metadata WHERE key = ? AND session_id = ?').run(`activities:${athleteId}`, athleteId);
  console.log(`🗑️  Cleared activities cache for athlete ${athleteId}`);
}

/**
 * Clear cache for a session (useful for logout)
 */
export function clearSessionCache(sessionId) {
  db.prepare('DELETE FROM activities WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM equipment WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM cache_metadata WHERE session_id = ?').run(sessionId);
  console.log(`🗑️  Cleared cache for session ${sessionId}`);
}

/**
 * Get the most recent activity date from cache
 */
export function getMostRecentActivityDate(sessionId) {
  const stmt = db.prepare('SELECT start_date FROM activities WHERE session_id = ? ORDER BY start_date DESC LIMIT 1');
  const result = stmt.get(sessionId);
  return result ? result.start_date : null;
}

/**
 * Check if we have any activities cached
 */
export function hasActivitiesCache(sessionId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM activities WHERE session_id = ?');
  const result = stmt.get(sessionId);
  return result.count > 0;
}

/**
 * Migrate activities from old session IDs to athlete ID
 * For single-user systems: updates all activities to the current athlete ID
 * Returns number of activities migrated
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
 * Get cache statistics
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

export { TTL };
