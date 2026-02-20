import express from 'express';
import axios from 'axios';
import { whoopConfig } from '../config/whoop.js';
import * as cache from '../services/cacheService.js';
import { syncRecoveries, syncCycles } from '../services/whoopApi.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /whoop/login
 * Redirect user to Whoop OAuth authorization page
 */
router.get('/login', requireAuth, (req, res) => {
  const params = new URLSearchParams({
    client_id: whoopConfig.clientId,
    redirect_uri: whoopConfig.redirectUri,
    response_type: 'code',
    scope: whoopConfig.scope,
    state: req.session.id,
  });
  res.redirect(`${whoopConfig.authorizeUrl}?${params.toString()}`);
});

/**
 * GET /whoop/callback
 * Exchange authorization code for tokens, sync data, redirect to /fitness
 */
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${process.env.FRONTEND_URL}/fitness?whoop_error=access_denied`);
  }

  // We need a valid session — the state param carries the session id but the
  // browser will have the session cookie, so req.session should be loaded.
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) {
    return res.redirect(`${process.env.FRONTEND_URL}/?error=not_authenticated`);
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const tokenResponse = await axios.post(whoopConfig.tokenUrl, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: whoopConfig.redirectUri,
      client_id: whoopConfig.clientId,
      client_secret: whoopConfig.clientSecret,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    cache.saveWhoopTokens(athleteId, {
      access_token,
      refresh_token: refresh_token || null,
      expires_at: now + (expires_in || 3600),
    });

    // Initial sync
    await Promise.allSettled([syncRecoveries(athleteId), syncCycles(athleteId)]);

    res.redirect(`${process.env.FRONTEND_URL}/fitness`);
  } catch (err) {
    console.error('Whoop callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/fitness?whoop_error=token_exchange_failed`);
  }
});

/**
 * GET /whoop/status
 * Returns { connected, last_sync? }
 */
router.get('/status', requireAuth, (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  const tokens = cache.getWhoopTokens(athleteId);
  if (!tokens) return res.json({ connected: false });

  const recoveries = cache.getWhoopRecoveries(athleteId);
  const lastSync = recoveries.length > 0 ? recoveries[recoveries.length - 1].date : null;
  res.json({ connected: true, last_sync: lastSync });
});

/**
 * POST /whoop/sync
 * Incremental sync of recoveries and cycles
 */
router.post('/sync', requireAuth, async (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  const tokens = cache.getWhoopTokens(athleteId);
  if (!tokens) return res.status(400).json({ error: 'Whoop not connected' });

  try {
    const [recoveryCount, cycleCount] = await Promise.all([
      syncRecoveries(athleteId),
      syncCycles(athleteId),
    ]);
    res.json({ success: true, recoveries_synced: recoveryCount, cycles_synced: cycleCount });
  } catch (err) {
    console.error('Whoop sync error:', err.message);
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

/**
 * POST /whoop/logout
 * Disconnect Whoop — delete stored tokens
 */
router.post('/logout', requireAuth, (req, res) => {
  const athleteId = req.session.athleteId?.toString();
  if (!athleteId) return res.status(401).json({ error: 'Athlete ID not found in session' });

  cache.deleteWhoopTokens(athleteId);
  res.json({ success: true });
});

export default router;
