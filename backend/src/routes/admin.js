import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

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

export default router;
