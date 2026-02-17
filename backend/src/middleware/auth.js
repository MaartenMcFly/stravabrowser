import { tokenStorage } from '../utils/tokenStorage.js';

/**
 * Middleware to verify user is authenticated
 * Checks that session exists and has valid tokens
 */
export function requireAuth(req, res, next) {
  const sessionId = req.session?.id;

  if (!sessionId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No active session',
    });
  }

  const tokens = tokenStorage.getTokens(sessionId);

  if (!tokens) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Not authenticated',
    });
  }

  // Attach tokens to request for use in routes
  req.tokens = tokens;
  next();
}

/**
 * Optional auth middleware - doesn't block if not authenticated
 */
export function optionalAuth(req, res, next) {
  const sessionId = req.session?.id;

  if (sessionId) {
    const tokens = tokenStorage.getTokens(sessionId);
    if (tokens) {
      req.tokens = tokens;
    }
  }

  next();
}
