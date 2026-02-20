import express from 'express';
import * as cache from '../services/cacheService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/fitness/pmc
 * Returns Performance Management Chart data: daily TSS, CTL, ATL, TSB
 */
router.get('/pmc', requireAuth, (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  const activities = cache.getAllActivities(athleteId).sort(
    (a, b) => new Date(a.start_date) - new Date(b.start_date)
  );
  const ftpHistory = cache.getFtpHistory(athleteId);

  if (ftpHistory.length === 0) {
    return res.json({ points: [], powerRideCount: 0, hrRideCount: 0 });
  }

  // Compute max HR from all activities
  const maxHr = activities.reduce((m, a) => Math.max(m, a.max_heartrate || 0), 0) || null;

  // Build a daily TSS map
  const dailyTss = {};
  let powerRideCount = 0;
  let hrRideCount = 0;

  for (const activity of activities) {
    if (!activity.start_date) continue;
    const dateStr = activity.start_date.substring(0, 10);

    const ftpEntry = cache.getFtpForDate(athleteId, dateStr);
    if (!ftpEntry) continue;

    const ftp = ftpEntry.ftp;
    let tss = null;

    // Power-based TSS (prefer this)
    if (activity.device_watts === 1 && activity.weighted_average_watts > 0 && ftp > 0) {
      const np = activity.weighted_average_watts;
      const movingTime = activity.moving_time || 0;
      tss = (movingTime * np * np) / (ftp * ftp * 3600) * 100;
      powerRideCount++;
    } else if (activity.average_heartrate && maxHr) {
      // hrTSS fallback
      const lthr = ftpEntry.lthr || maxHr * 0.88;
      const movingTime = activity.moving_time || 0;
      tss = (movingTime / 3600) * Math.pow(activity.average_heartrate / lthr, 2) * 100;
      hrRideCount++;
    }

    if (tss !== null) {
      dailyTss[dateStr] = (dailyTss[dateStr] || 0) + tss;
    }
  }

  // Walk from first activity date to today computing CTL / ATL / TSB
  if (activities.length === 0 || ftpHistory.length === 0) {
    return res.json({ points: [], powerRideCount, hrRideCount });
  }

  const startDate = new Date(activities[0].start_date.substring(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const points = [];
  let ctl = 0;
  let atl = 0;

  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().substring(0, 10);
    const tss = dailyTss[dateStr] || 0;

    ctl = ctl * (1 - 1 / 42) + tss * (1 / 42);
    atl = atl * (1 - 1 / 7) + tss * (1 / 7);
    const tsb = ctl - atl;

    points.push({ date: dateStr, tss, ctl, atl, tsb });
  }

  res.json({ points, powerRideCount, hrRideCount });
});

/**
 * GET /api/fitness/hrv
 * Returns Whoop recovery/HRV data
 */
router.get('/hrv', requireAuth, (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  const recoveries = cache.getWhoopRecoveries(athleteId);
  res.json({ recoveries });
});

export default router;
