/**
 * In-memory token storage
 * Maps session IDs to token objects
 *
 * In production, consider using Redis or a database for persistence
 */
class TokenStorage {
  constructor() {
    this.tokens = new Map();
  }

  /**
   * Save tokens for a session
   */
  saveTokens(sessionId, tokens) {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    this.tokens.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      tokenType: tokens.token_type,
      athlete: tokens.athlete,
      savedAt: Date.now(),
    });
  }

  /**
   * Get tokens for a session
   */
  getTokens(sessionId) {
    if (!sessionId) {
      return null;
    }
    return this.tokens.get(sessionId);
  }

  /**
   * Delete tokens for a session
   */
  deleteTokens(sessionId) {
    if (!sessionId) {
      return false;
    }
    return this.tokens.delete(sessionId);
  }

  /**
   * Check if tokens exist for a session
   */
  hasTokens(sessionId) {
    return this.tokens.has(sessionId);
  }

  /**
   * Clear all tokens (for testing/admin purposes)
   */
  clearAll() {
    this.tokens.clear();
  }
}

// Export singleton instance
export const tokenStorage = new TokenStorage();
