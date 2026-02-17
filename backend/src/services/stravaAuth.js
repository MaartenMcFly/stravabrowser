import axios from 'axios';
import { stravaConfig } from '../config/strava.js';

/**
 * Generate Strava OAuth authorization URL
 */
export function generateAuthUrl() {
  const params = new URLSearchParams({
    client_id: stravaConfig.clientId,
    redirect_uri: stravaConfig.redirectUri,
    response_type: 'code',
    scope: stravaConfig.scope,
    approval_prompt: 'auto',
  });

  return `${stravaConfig.authorizeUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(code) {
  try {
    const response = await axios.post(stravaConfig.tokenUrl, {
      client_id: stravaConfig.clientId,
      client_secret: stravaConfig.clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    return response.data;
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    throw new Error('Failed to exchange authorization code for tokens');
  }
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken) {
  try {
    const response = await axios.post(stravaConfig.tokenUrl, {
      client_id: stravaConfig.clientId,
      client_secret: stravaConfig.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    return response.data;
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
  }
}

/**
 * Check if access token is expired or about to expire
 */
export function isTokenExpired(expiresAt) {
  // Add 5 minute buffer
  const bufferSeconds = 300;
  const expiryTime = expiresAt - bufferSeconds;
  const currentTime = Math.floor(Date.now() / 1000);

  return currentTime >= expiryTime;
}
