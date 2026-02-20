import axios from 'axios';
import { whoopConfig } from '../config/whoop.js';
import * as cache from './cacheService.js';

/**
 * Create an axios client for the Whoop API with auto-refresh
 */
export function createWhoopClient(athleteId) {
  const client = axios.create({
    baseURL: whoopConfig.apiBaseUrl,
  });

  client.interceptors.request.use(async (config) => {
    let tokens = cache.getWhoopTokens(athleteId);
    if (!tokens) throw new Error('No Whoop tokens found');

    const now = Math.floor(Date.now() / 1000);
    if (tokens.expires_at && tokens.expires_at < now + 60) {
      // Refresh
      const refreshed = await axios.post(whoopConfig.tokenUrl, new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: whoopConfig.clientId,
        client_secret: whoopConfig.clientSecret,
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

      const newTokens = {
        access_token: refreshed.data.access_token,
        refresh_token: refreshed.data.refresh_token || tokens.refresh_token,
        expires_at: now + (refreshed.data.expires_in || 3600),
      };
      cache.saveWhoopTokens(athleteId, newTokens);
      tokens = cache.getWhoopTokens(athleteId);
    }

    config.headers.Authorization = `Bearer ${tokens.access_token}`;
    return config;
  });

  return client;
}

/**
 * Sync all Whoop recovery records for an athlete
 */
export async function syncRecoveries(athleteId) {
  const client = createWhoopClient(athleteId);
  const recoveries = [];
  let nextToken = null;

  do {
    const params = { limit: 25 };
    if (nextToken) params.nextToken = nextToken;
    const response = await client.get('/recovery', { params });
    const data = response.data;

    for (const item of (data.records || [])) {
      recoveries.push({
        id: String(item.cycle_id),
        date: item.created_at?.substring(0, 10),
        score: item.score?.recovery_score ?? null,
        hrv_rmssd: item.score?.hrv_rmssd_milli ? item.score.hrv_rmssd_milli / 1000 : null,
        resting_heart_rate: item.score?.resting_heart_rate ?? null,
        spo2: item.score?.spo2_percentage ?? null,
        skin_temp: item.score?.skin_temp_celsius ?? null,
      });
    }

    nextToken = data.next_token || null;
  } while (nextToken);

  if (recoveries.length > 0) {
    cache.saveWhoopRecoveries(athleteId, recoveries);
  }
  return recoveries.length;
}

/**
 * Sync all Whoop cycle records for an athlete
 */
export async function syncCycles(athleteId) {
  const client = createWhoopClient(athleteId);
  const cycles = [];
  let nextToken = null;

  do {
    const params = { limit: 25 };
    if (nextToken) params.nextToken = nextToken;
    const response = await client.get('/cycle', { params });
    const data = response.data;

    for (const item of (data.records || [])) {
      cycles.push({
        id: String(item.id),
        date: item.created_at?.substring(0, 10),
        strain: item.score?.strain ?? null,
        kilojoule: item.score?.kilojoule ?? null,
        average_heart_rate: item.score?.average_heart_rate ?? null,
        max_heart_rate: item.score?.max_heart_rate ?? null,
      });
    }

    nextToken = data.next_token || null;
  } while (nextToken);

  if (cycles.length > 0) {
    cache.saveWhoopCycles(athleteId, cycles);
  }
  return cycles.length;
}
