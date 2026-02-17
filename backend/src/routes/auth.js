import express from 'express';
import { generateAuthUrl, exchangeCodeForTokens } from '../services/stravaAuth.js';
import { tokenStorage } from '../utils/tokenStorage.js';
import { clearSessionCache } from '../services/cacheService.js';

const router = express.Router();

/**
 * GET /auth/login
 * Redirect user to Strava authorization page
 */
router.get('/login', (req, res) => {
  const authUrl = generateAuthUrl();
  res.redirect(authUrl);
});

/**
 * GET /auth/callback
 * Handle OAuth callback from Strava
 */
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  // Handle authorization denial
  if (error) {
    console.error('OAuth error:', error);
    return res.redirect(`${process.env.FRONTEND_URL}/?error=access_denied`);
  }

  // Validate authorization code
  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}/?error=missing_code`);
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Save tokens to session storage
    const sessionId = req.session.id;
    tokenStorage.saveTokens(sessionId, tokens);

    // Mark session as authenticated
    req.session.authenticated = true;
    req.session.athleteId = tokens.athlete?.id;

    // Save session before redirecting
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect(`${process.env.FRONTEND_URL}/?error=session_save_failed`);
      }
      // Redirect to frontend callback page
      res.redirect(`${process.env.FRONTEND_URL}/callback?success=true`);
    });
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/?error=token_exchange_failed`);
  }
});

/**
 * GET /auth/status
 * Check authentication status
 */
router.get('/status', (req, res) => {
  const sessionId = req.session?.id;
  const isAuthenticated = sessionId && tokenStorage.hasTokens(sessionId);

  if (isAuthenticated) {
    const tokens = tokenStorage.getTokens(sessionId);
    return res.json({
      authenticated: true,
      athlete: tokens.athlete,
    });
  }

  res.json({ authenticated: false });
});

/**
 * POST /auth/logout
 * Clear session and tokens
 */
router.post('/logout', (req, res) => {
  const sessionId = req.session?.id;

  if (sessionId) {
    tokenStorage.deleteTokens(sessionId);
    clearSessionCache(sessionId);
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }

    res.json({ success: true, message: 'Logged out successfully' });
  });
});

export default router;
