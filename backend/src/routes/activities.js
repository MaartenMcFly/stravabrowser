import express from 'express';
import { getActivities as fetchActivities, getActivity, updateActivity } from '../services/stravaApi.js';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';
import { extractWorkoutName } from '../utils/workoutName.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

/**
 * GET /api/activities
 * Get list of athlete's activities (with incremental caching)
 */
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

    // Migration: Migrate any old session-based cache to athlete-based cache
    const migratedCount = cache.migrateActivitiesToAthlete(sessionId, athleteId);
    if (migratedCount > 0) {
      console.log(`🔄 Migrated ${migratedCount} activities from old sessions to athlete ${athleteId}`);
    }

    const hasCache = cache.hasActivitiesCache(athleteId);
    const shouldCheckForNew = !cache.isCacheValid(athleteId, cacheKey);

    if (!hasCache) {
      // INITIAL LOAD: No cache exists, fetch all activities
      console.log(`📥 Initial load: Fetching all activities from Strava API for athlete ${athleteId}`);

      const allActivities = [];
      let fetchPage = 1;

      while (fetchPage <= 10) {
        const batch = await fetchActivities(sessionId, fetchPage, 200);
        if (batch.length === 0) break;
        allActivities.push(...batch);
        fetchPage++;
      }

      // Save to cache with athlete ID
      cache.saveActivities(athleteId, allActivities);
      cache.updateCacheMetadata(athleteId, cacheKey, cache.TTL.ACTIVITIES_CHECK);

      console.log(`💾 Cached ${allActivities.length} activities`);
    } else if (shouldCheckForNew) {
      // INCREMENTAL UPDATE: Check for new activities since last check
      console.log('🔄 Checking for new activities since last update');

      const mostRecentDate = cache.getMostRecentActivityDate(athleteId);
      const mostRecentTimestamp = mostRecentDate ? Math.floor(new Date(mostRecentDate).getTime() / 1000) : null;

      // Fetch only recent activities (first page is enough, sorted by date DESC)
      const recentActivities = await fetchActivities(sessionId, 1, 200);

      // Filter out activities we already have (older than our most recent)
      const newActivities = mostRecentTimestamp
        ? recentActivities.filter(a => {
            const activityTimestamp = Math.floor(new Date(a.start_date).getTime() / 1000);
            return activityTimestamp > mostRecentTimestamp;
          })
        : recentActivities;

      if (newActivities.length > 0) {
        console.log(`📥 Found ${newActivities.length} new activities, adding to cache`);
        cache.saveActivities(athleteId, newActivities);
      } else {
        console.log('✅ No new activities found');
      }

      // Update last check time
      cache.updateCacheMetadata(athleteId, cacheKey, cache.TTL.ACTIVITIES_CHECK);
    } else {
      console.log('✅ Serving activities from cache (no check needed yet)');
    }

    // Always serve from cache
    const activities = cache.getActivities(athleteId, gearId, page, perPage);

    console.log(`📤 Returning ${activities.length} activities for athlete ${athleteId} (page ${page})`);

    res.json({
      activities,
      page,
      perPage,
      cached: hasCache,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/activities/names
 * Get unique activity names that appear more than once, sorted by count descending
 */
router.get('/names', async (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });
    const activities = cache.getAllActivities(athleteId);
    const nameMap = {};
    activities.forEach(a => {
      if (!a.name) return;
      const workoutName = extractWorkoutName(a.name);
      const key = workoutName.toLowerCase().trim();
      if (!nameMap[key]) nameMap[key] = { name: workoutName, count: 0, latestDate: null };
      nameMap[key].count++;
      const date = a.start_date ? new Date(a.start_date) : null;
      if (date && (!nameMap[key].latestDate || date > nameMap[key].latestDate)) {
        nameMap[key].latestDate = date;
      }
    });
    const names = Object.values(nameMap)
      .filter(g => g.count > 1)
      .sort((a, b) => b.latestDate - a.latestDate);
    res.json({ names });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/activities/by-name?name=xxx
 * Get all activities matching a name, sorted newest first
 */
router.get('/by-name', async (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    const name = req.query.name;
    if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });
    if (!name) return res.status(400).json({ error: 'name query parameter required' });
    const all = cache.getAllActivities(athleteId);
    const activities = all
      .filter(a => extractWorkoutName(a.name)?.toLowerCase().trim() === name.toLowerCase().trim())
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    res.json({ activities, name });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/activities/:id
 * Get single activity details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const activityId = req.params.id;

    if (!activityId || isNaN(activityId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid activity ID',
      });
    }

    const activity = await getActivity(sessionId, activityId);

    res.json(activity);
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Activity not found',
      });
    }
    next(error);
  }
});

/**
 * PUT /api/activities/:id
 * Update activity name, description and gear on Strava and sync the cache
 */
router.put('/:id', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const athleteId = req.session.athleteId?.toString();
    const activityId = req.params.id;
    const { name, description, gear_id } = req.body;

    if (!activityId || isNaN(activityId)) {
      return res.status(400).json({ error: 'Invalid activity ID' });
    }

    // Update on Strava
    const updated = await updateActivity(sessionId, activityId, {
      name,
      description,
      gear_id: gear_id || 'none',
    });

    // Keep cache in sync
    cache.updateActivityCache(athleteId, activityId, {
      name: updated.name,
      description: updated.description,
      gear_id: updated.gear_id,
    });

    res.json(updated);
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    next(error);
  }
});

export default router;
