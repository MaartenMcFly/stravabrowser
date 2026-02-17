import express from 'express';
import { getActivities as fetchActivities, getActivity } from '../services/stravaApi.js';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

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

export default router;
