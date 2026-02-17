import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

/**
 * GET /api/statistics/weekly-distance
 * Get weekly distance aggregated by year
 */
router.get('/weekly-distance', async (req, res, next) => {
  try {
    const sessionId = req.session.id;

    // Get all activities from cache
    const activities = cache.getAllActivities(sessionId);

    if (activities.length === 0) {
      return res.json({ years: [] });
    }

    // Aggregate by year and week
    const yearWeekData = {};

    activities.forEach(activity => {
      if (!activity.start_date || !activity.distance) return;

      const date = new Date(activity.start_date);
      const year = date.getFullYear();
      const week = getWeekNumber(date);

      if (!yearWeekData[year]) {
        yearWeekData[year] = {};
      }

      if (!yearWeekData[year][week]) {
        yearWeekData[year][week] = 0;
      }

      // Add distance in kilometers
      yearWeekData[year][week] += activity.distance / 1000;
    });

    // Format for frontend
    const years = Object.keys(yearWeekData)
      .sort((a, b) => b - a) // Sort descending (newest first)
      .map(year => {
        const weeks = [];
        for (let week = 1; week <= 52; week++) {
          weeks.push({
            week,
            distance: Math.round((yearWeekData[year][week] || 0) * 10) / 10, // Round to 1 decimal
          });
        }

        return {
          year: parseInt(year),
          weeks,
          totalDistance: Math.round(
            Object.values(yearWeekData[year]).reduce((sum, dist) => sum + dist, 0)
          ),
        };
      });

    res.json({ years });
  } catch (error) {
    next(error);
  }
});

export default router;
