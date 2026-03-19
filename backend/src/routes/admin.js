import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';
import { getActivities as fetchActivities } from '../services/stravaApi.js';

const router = express.Router();

router.use(requireAuth);

/**
 * POST /api/admin/invalidate-cache
 * Clears all cached activities and metadata, forcing a full reload on next request
 */
router.post('/invalidate-cache', (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

    cache.clearActivitiesCache(athleteId);

    res.json({ success: true, message: 'Activity cache cleared. All activities will be reloaded on next visit to the dashboard.' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/sync-activities
 * Checks Strava for activities newer than the most recently cached one and imports them.
 * Always runs regardless of the 24-hour TTL.
 */
router.post('/sync-activities', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const athleteId = req.session.athleteId?.toString();
    if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

    if (!cache.hasActivitiesCache(athleteId)) {
      return res.json({
        imported: 0,
        activities: [],
        message: 'No local cache yet — visit the dashboard first to do an initial load.',
      });
    }

    const mostRecentDate = cache.getMostRecentActivityDate(athleteId);
    const mostRecentTimestamp = mostRecentDate
      ? Math.floor(new Date(mostRecentDate).getTime() / 1000)
      : null;

    const recentActivities = await fetchActivities(sessionId, 1, 200);

    const newActivities = mostRecentTimestamp
      ? recentActivities.filter(a => {
          const ts = Math.floor(new Date(a.start_date).getTime() / 1000);
          return ts > mostRecentTimestamp;
        })
      : recentActivities;

    if (newActivities.length > 0) {
      cache.saveActivities(athleteId, newActivities);
    }

    // Reset TTL so the dashboard won't re-check immediately after a manual sync
    cache.updateCacheMetadata(athleteId, `activities:${athleteId}`, cache.TTL.ACTIVITIES_CHECK);

    const n = newActivities.length;
    res.json({
      imported: n,
      activities: newActivities.map(a => ({ name: a.name, start_date: a.start_date })),
      message: n === 0
        ? 'No new activities found. Your cache is already up to date.'
        : `Imported ${n} new ${n === 1 ? 'activity' : 'activities'}.`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/invalidate-equipment-cache
 * Clears cached equipment so the next visit to Equipment will re-fetch from Strava.
 */
router.post('/invalidate-equipment-cache', (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

    cache.clearEquipmentCache(athleteId);

    res.json({ success: true, message: 'Equipment cache cleared. Your gear will be reloaded from Strava on the next visit to Equipment.' });
  } catch (error) {
    next(error);
  }
});

export default router;
