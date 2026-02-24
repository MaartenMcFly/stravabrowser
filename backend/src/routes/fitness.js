import express from 'express';
import * as cache from '../services/cacheService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/fitness/pmc
 * Returns Performance Management Chart data: daily TSS, CTL, ATL, TSB, and training zone distribution
 */
router.get('/pmc', requireAuth, (req, res) => {
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

  for (const activity of activities) {
    if (!activity.start_date) continue;
    const dateStr = activity.start_date.substring(0, 10);

    const ftpEntry = cache.getFtpForDate(athleteId, dateStr);
    if (!ftpEntry) continue;

    const ftp = ftpEntry.ftp;
    let tss = null;
    const movingTime = activity.moving_time || 0;

    // Power-based TSS (prefer this if we have NP data)
    if (activity.weighted_average_watts > 0 && ftp > 0) {
      const np = activity.weighted_average_watts;
      tss = (movingTime * np * np) / (ftp * ftp * 3600) * 100;
      if (activity.device_watts === 1) powerRideCount++;

      // Classify into power zones
      const intensityPercent = (np / ftp) * 100;
      if (intensityPercent < 56) zoneMinutes.z1_endurance += movingTime / 60;
      else if (intensityPercent < 76) zoneMinutes.z2_tempo += movingTime / 60;
      else if (intensityPercent < 91) zoneMinutes.z3_sweetspot += movingTime / 60;
      else if (intensityPercent < 106) zoneMinutes.z4_threshold += movingTime / 60;
      else if (intensityPercent < 121) zoneMinutes.z5_vo2max += movingTime / 60;
      else if (intensityPercent < 151) zoneMinutes.z6_anaerobic += movingTime / 60;
      else zoneMinutes.z7_neuromuscular += movingTime / 60;
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
  const activitiesWithZones = activities.map(a => {
    if (!a.start_date) return null;
    const dateStr = a.start_date.substring(0, 10);
    const ftpEntry = cache.getFtpForDate(athleteId, dateStr);
    if (!ftpEntry) return null;

    const ftp = ftpEntry.ftp;
    let zone = null;

    if (a.weighted_average_watts > 0 && ftp > 0) {
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
      moving_time: a.moving_time || 0,
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
