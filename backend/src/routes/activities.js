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
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 30;
    const gearId = req.query.gear_id || null;

    const cacheKey = `activities:${sessionId}`;
    const hasCache = cache.hasActivitiesCache(sessionId);
    const shouldCheckForNew = !cache.isCacheValid(sessionId, cacheKey);

    if (!hasCache) {
      // INITIAL LOAD: No cache exists, fetch all activities
      console.log('📥 Initial load: Fetching all activities from Strava API');

      const allActivities = [];
      let fetchPage = 1;

      while (fetchPage <= 10) {
        const batch = await fetchActivities(sessionId, fetchPage, 200);
        if (batch.length === 0) break;
        allActivities.push(...batch);
        fetchPage++;
      }

      // Save to cache
      cache.saveActivities(sessionId, allActivities);
      cache.updateCacheMetadata(sessionId, cacheKey, cache.TTL.ACTIVITIES_CHECK);

      console.log(`💾 Cached ${allActivities.length} activities`);
    } else if (shouldCheckForNew) {
      // INCREMENTAL UPDATE: Check for new activities since last check
      console.log('🔄 Checking for new activities since last update');

      const mostRecentDate = cache.getMostRecentActivityDate(sessionId);
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
        cache.saveActivities(sessionId, newActivities);
      } else {
        console.log('✅ No new activities found');
      }

      // Update last check time
      cache.updateCacheMetadata(sessionId, cacheKey, cache.TTL.ACTIVITIES_CHECK);
    } else {
      console.log('✅ Serving activities from cache (no check needed yet)');
    }

    // Always serve from cache
    const activities = cache.getActivities(sessionId, gearId, page, perPage);

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
