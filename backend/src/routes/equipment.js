import express from 'express';
import { getGear, getGearDetails } from '../services/stravaApi.js';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

/**
 * GET /api/equipment
 * Get list of athlete's gear (bikes and shoes) with caching
 */
router.get('/', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const athleteId = req.session.athleteId?.toString();

    if (!athleteId) {
      return res.status(401).json({ error: 'Athlete ID not found in session' });
    }

    // Migrate any old equipment cache to athlete-based
    cache.migrateActivitiesToAthlete(sessionId, athleteId);

    // Check if we have cached equipment
    const cacheKey = `equipment:${athleteId}`;
    const isCacheValid = cache.isCacheValid(athleteId, cacheKey);

    let gear;

    if (isCacheValid) {
      console.log('✅ Serving equipment from cache');
      gear = cache.getEquipment(athleteId);
    } else {
      console.log('🔄 Fetching equipment from Strava API (cached for 24h)');

      // Fetch equipment from Strava
      gear = await getGear(sessionId);

      // Save to cache
      cache.saveEquipment(athleteId, gear);
      cache.updateCacheMetadata(athleteId, cacheKey, cache.TTL.EQUIPMENT);
    }

    console.log(`Found ${gear.length} piece(s) of equipment`);
    res.json({ gear, cached: isCacheValid });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/equipment/:id
 * Get detailed information about specific gear
 */
router.get('/:id', async (req, res, next) => {
  try {
    const sessionId = req.session.id;
    const gearId = req.params.id;

    if (!gearId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid gear ID',
      });
    }

    const gearDetails = await getGearDetails(sessionId, gearId);

    res.json(gearDetails);
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Gear not found',
      });
    }
    next(error);
  }
});

/**
 * GET /api/equipment/:id/activities
 * Get activities for specific gear (from cache)
 */
router.get('/:id/activities', async (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    const sessionId = req.session.id;
    const gearId = req.params.id;

    if (!athleteId) {
      return res.status(401).json({ error: 'Athlete ID not found in session' });
    }

    if (!gearId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid gear ID',
      });
    }

    // Get all activities from cache (they should be cached from /api/activities call)
    const activities = cache.getAllActivities(athleteId).filter(a => a.gear_id === gearId);

    console.log(`Found ${activities.length} activities for gear ${gearId}`);

    res.json({
      activities,
      gear_id: gearId,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
