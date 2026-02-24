import express from 'express';
import * as cache from '../services/cacheService.js';
import * as stravaApi from '../services/stravaApi.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * Calculate zone distribution from a power curve.
 * Power curve is array of {secs, watts} entries from Strava.
 * Returns distribution of time spent in each zone.
 * @param {Array} powerCurve - [{secs, watts}, ...]
 * @param {number} ftp - Functional Threshold Power in watts
 * @returns {Object} Zone minutes keyed by z1-z7
 */
function calculateZonesFromPowerCurve(powerCurve, ftp) {
  const zones = {
    z1_endurance: 0,
    z2_tempo: 0,
    z3_sweetspot: 0,
    z4_threshold: 0,
    z5_vo2max: 0,
    z6_anaerobic: 0,
    z7_neuromuscular: 0,
  };

  if (!powerCurve || !Array.isArray(powerCurve) || powerCurve.length === 0) {
    return zones;
  }

  // Power curve entries are sorted from longest to shortest duration
  // We estimate time spent at each power level using the curve
  for (let i = 0; i < powerCurve.length; i++) {
    const entry = powerCurve[i];
    const secs = entry.secs || entry.seconds || 0;
    const watts = entry.watts || 0;

    if (!secs || !watts) continue;

    // Get the time range for this power level
    // From this duration to the next duration (or +1 sec for last)
    const prevSecs = i > 0 ? (powerCurve[i - 1].secs || powerCurve[i - 1].seconds || 0) : secs + 1;
    const timeAtThisLevel = Math.max(0, prevSecs - secs);

    const intensityPercent = (watts / ftp) * 100;
    let zone;

    if (intensityPercent < 56) zone = 'z1_endurance';
    else if (intensityPercent < 76) zone = 'z2_tempo';
    else if (intensityPercent < 91) zone = 'z3_sweetspot';
    else if (intensityPercent < 106) zone = 'z4_threshold';
    else if (intensityPercent < 121) zone = 'z5_vo2max';
    else if (intensityPercent < 151) zone = 'z6_anaerobic';
    else zone = 'z7_neuromuscular';

    if (zone) {
      zones[zone] += timeAtThisLevel / 60; // Convert to minutes
    }
  }

  return zones;
}

/**
 * GET /api/fitness/pmc
 * Returns Performance Management Chart data: daily TSS, CTL, ATL, TSB, and training zone distribution
 */
router.get('/pmc', requireAuth, async (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();
    if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

    const activities = cache.getAllActivities(athleteId).sort(
      (a, b) => new Date(a.start_date) - new Date(b.start_date)
    );
    const ftpHistory = cache.getFtpHistory(athleteId);

    if (ftpHistory.length === 0) {
      return res.json({ points: [], powerRideCount: 0, hrRideCount: 0, zoneDistribution: null });
    }

    // Compute max HR from all activities
    const maxHr = activities.reduce((m, a) => Math.max(m, a.max_heartrate || 0), 0) || null;

    // Build a daily TSS map and track zones
    const dailyTss = {};
    let powerRideCount = 0;
    let hrRideCount = 0;
    const zoneMinutes = {
      // Power zones (by percent of FTP)
      z1_endurance: 0,      // < 56% FTP
      z2_tempo: 0,          // 56-75% FTP
      z3_sweetspot: 0,      // 76-90% FTP
      z4_threshold: 0,      // 91-105% FTP
      z5_vo2max: 0,         // 106-120% FTP
      z6_anaerobic: 0,      // 121-150% FTP
      z7_neuromuscular: 0,  // > 150% FTP
    };

    // Only fetch detailed activity data for activities in the last year to avoid rate limits
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().substring(0, 10);

    for (const activity of activities) {
      if (!activity.start_date) continue;
      const dateStr = activity.start_date.substring(0, 10);

      const ftpEntry = cache.getFtpForDate(athleteId, dateStr);
      if (!ftpEntry) continue;

      const ftp = ftpEntry.ftp;
      let tss = null;
      const movingTime = activity.moving_time || 0;

      // Try to use power curve for interval-based zone classification
      // Only fetch detailed data for activities in the last year (to avoid rate limits and timeouts)
      let powerCurveData = cache.getPowerCurve(activity.id);
      if (!powerCurveData && activity.weighted_average_watts > 0 && dateStr >= oneYearAgoStr) {
        // If no cached power curve and activity is recent, fetch it from Strava
        try {
          const sessionId = req.session.id;
          powerCurveData = await stravaApi.getActivityPowerCurve(sessionId, activity.id);
          if (powerCurveData) {
            cache.savePowerCurve(activity.id, powerCurveData);
          }
        } catch (err) {
          console.warn(`Could not fetch power curve for activity ${activity.id}:`, err.message);
        }
      }

      // Power-based TSS (prefer this if we have NP data)
      if (activity.weighted_average_watts > 0 && ftp > 0) {
        const np = activity.weighted_average_watts;
        tss = (movingTime * np * np) / (ftp * ftp * 3600) * 100;
        if (activity.device_watts === 1) powerRideCount++;

        // Use power curve zones if available, otherwise fall back to average NP
        if (powerCurveData && powerCurveData.length > 0) {
          const curveZones = calculateZonesFromPowerCurve(powerCurveData, ftp);
          Object.keys(curveZones).forEach(key => {
            zoneMinutes[key] += curveZones[key];
          });
        } else {
          // Fallback: classify by average NP
          const intensityPercent = (np / ftp) * 100;
          if (intensityPercent < 56) zoneMinutes.z1_endurance += movingTime / 60;
          else if (intensityPercent < 76) zoneMinutes.z2_tempo += movingTime / 60;
          else if (intensityPercent < 91) zoneMinutes.z3_sweetspot += movingTime / 60;
          else if (intensityPercent < 106) zoneMinutes.z4_threshold += movingTime / 60;
          else if (intensityPercent < 121) zoneMinutes.z5_vo2max += movingTime / 60;
          else if (intensityPercent < 151) zoneMinutes.z6_anaerobic += movingTime / 60;
          else zoneMinutes.z7_neuromuscular += movingTime / 60;
        }
      } else if (activity.average_heartrate && maxHr) {
        // hrTSS fallback
        const lthr = ftpEntry.lthr || maxHr * 0.88;
        tss = (movingTime / 3600) * Math.pow(activity.average_heartrate / lthr, 2) * 100;
        hrRideCount++;

        // Classify into HR-based zones (Karvonen method)
        const hrReserve = maxHr - 60; // Assume 60 bpm resting HR
        const intensityPercent = ((activity.average_heartrate - 60) / hrReserve) * 100;
        if (intensityPercent < 50) zoneMinutes.z1_endurance += movingTime / 60;
        else if (intensityPercent < 60) zoneMinutes.z2_tempo += movingTime / 60;
        else if (intensityPercent < 70) zoneMinutes.z3_sweetspot += movingTime / 60;
        else if (intensityPercent < 80) zoneMinutes.z4_threshold += movingTime / 60;
        else if (intensityPercent < 90) zoneMinutes.z5_vo2max += movingTime / 60;
        else if (intensityPercent < 100) zoneMinutes.z6_anaerobic += movingTime / 60;
        else zoneMinutes.z7_neuromuscular += movingTime / 60;
      }

      if (tss !== null) {
        dailyTss[dateStr] = (dailyTss[dateStr] || 0) + tss;
      }
    }

    // Walk from first activity date to today computing CTL / ATL / TSB
    if (activities.length === 0 || ftpHistory.length === 0) {
      return res.json({ points: [], powerRideCount, hrRideCount, zoneDistribution: zoneMinutes });
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

    // Return activities with zone info so frontend can filter by timeframe
    // Use power curves when available for more accurate interval-based classification
    const activitiesWithZones = activities.map(a => {
      if (!a.start_date) return null;
      const dateStr = a.start_date.substring(0, 10);
      const ftpEntry = cache.getFtpForDate(athleteId, dateStr);
      if (!ftpEntry) return null;

      const ftp = ftpEntry.ftp;
      let zone = null;
      let movingTime = a.moving_time || 0;

      // Try to get power curve zones
      const powerCurveData = cache.getPowerCurve(a.id);
      if (powerCurveData && powerCurveData.length > 0 && a.weighted_average_watts > 0) {
        // Calculate weighted zone from power curve
        const curveZones = calculateZonesFromPowerCurve(powerCurveData, ftp);
        let maxZoneTime = 0;
        Object.entries(curveZones).forEach(([z, time]) => {
          if (time > maxZoneTime) {
            maxZoneTime = time;
            zone = z;
          }
        });
      } else if (a.weighted_average_watts > 0 && ftp > 0) {
        // Fallback: classify by average NP
        const intensityPercent = (a.weighted_average_watts / ftp) * 100;
        if (intensityPercent < 56) zone = 'z1_endurance';
        else if (intensityPercent < 76) zone = 'z2_tempo';
        else if (intensityPercent < 91) zone = 'z3_sweetspot';
        else if (intensityPercent < 106) zone = 'z4_threshold';
        else if (intensityPercent < 121) zone = 'z5_vo2max';
        else if (intensityPercent < 151) zone = 'z6_anaerobic';
        else zone = 'z7_neuromuscular';
      } else if (a.average_heartrate && maxHr) {
        const hrReserve = maxHr - 60;
        const intensityPercent = ((a.average_heartrate - 60) / hrReserve) * 100;
        if (intensityPercent < 50) zone = 'z1_endurance';
        else if (intensityPercent < 60) zone = 'z2_tempo';
        else if (intensityPercent < 70) zone = 'z3_sweetspot';
        else if (intensityPercent < 80) zone = 'z4_threshold';
        else if (intensityPercent < 90) zone = 'z5_vo2max';
        else if (intensityPercent < 100) zone = 'z6_anaerobic';
        else zone = 'z7_neuromuscular';
      }

      return {
        date: dateStr,
        moving_time: movingTime,
        zone,
      };
    }).filter(a => a !== null);

    res.json({
      points,
      powerRideCount,
      hrRideCount,
      zoneDistribution: zoneMinutes,
      activitiesWithZones,
    });
  } catch (error) {
    // Handle rate limiting and timeouts gracefully
    if (error.code === 'ECONNABORTED' || error.response?.status === 429) {
      console.warn('PMC calculation limited by Strava API rate limits:', error.message);
      return res.status(200).json({
        points: [],
        powerRideCount: 0,
        hrRideCount: 0,
        zoneDistribution: null,
        warning: 'PMC data temporarily unavailable due to API rate limiting. Please try again in a few moments.',
      });
    }
    next(error);
  }
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
