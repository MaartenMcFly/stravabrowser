import express from 'express';
import * as cache from '../services/cacheService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/ftp-history
 * Returns FTP history for the authenticated athlete, newest first
 */
router.get('/', requireAuth, (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  const history = cache.getFtpHistory(athleteId);
  res.json({ history });
});

/**
 * POST /api/ftp-history
 * Add a new FTP entry { ftp, lthr?, valid_from }
 */
router.post('/', requireAuth, (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  const { ftp, lthr, valid_from } = req.body;
  if (!ftp || !valid_from) {
    return res.status(400).json({ error: 'ftp and valid_from are required' });
  }

  const id = cache.addFtpEntry(athleteId, { ftp: parseInt(ftp), lthr: lthr ? parseInt(lthr) : null, valid_from });
  res.status(201).json({ id, athlete_id: athleteId, ftp, lthr: lthr ?? null, valid_from });
});

/**
 * DELETE /api/ftp-history/:id
 * Delete a specific FTP entry
 */
router.delete('/:id', requireAuth, (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  cache.deleteFtpEntry(parseInt(req.params.id), athleteId);
  res.json({ success: true });
});

export default router;
