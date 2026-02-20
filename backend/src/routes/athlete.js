import express from 'express';
import * as cache from '../services/cacheService.js';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/athlete
 * Returns athlete profile (FTP, weight, max_heartrate) plus FTP history
 */
router.get('/', requireAuth, (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  const profile = cache.getAthleteProfile(athleteId) || {};

  // Derive max_heartrate from activity data if not stored
  let maxHr = profile.max_heartrate;
  if (!maxHr) {
    const row = db.prepare('SELECT MAX(max_heartrate) as max_hr FROM activities WHERE session_id = ?').get(athleteId);
    maxHr = row?.max_hr ?? null;
  }

  const ftpHistory = cache.getFtpHistory(athleteId);

  res.json({
    ftp: profile.ftp ?? null,
    max_heartrate: maxHr,
    weight: profile.weight ?? null,
    ftp_history: ftpHistory,
  });
});

export default router;
