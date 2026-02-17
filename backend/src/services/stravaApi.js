import axios from 'axios';
import { stravaConfig } from '../config/strava.js';
import { tokenStorage } from '../utils/tokenStorage.js';
import { refreshAccessToken, isTokenExpired } from './stravaAuth.js';

/**
 * Create Strava API client for a specific session
 */
export function createStravaClient(sessionId) {
  const client = axios.create({
    baseURL: stravaConfig.apiBaseUrl,
  });

  // Request interceptor: add access token and handle refresh
  client.interceptors.request.use(
    async (config) => {
      let tokens = tokenStorage.getTokens(sessionId);

      if (!tokens) {
        throw new Error('No tokens found for session');
      }

      // Check if token is expired and refresh if needed
      if (isTokenExpired(tokens.expiresAt)) {
        console.log('Access token expired, refreshing...');
        try {
          const newTokens = await refreshAccessToken(tokens.refreshToken);
          tokenStorage.saveTokens(sessionId, newTokens);
          tokens = tokenStorage.getTokens(sessionId);
        } catch (error) {
          console.error('Token refresh failed:', error);
          throw error;
        }
      }

      // Add access token to request
      config.headers.Authorization = `Bearer ${tokens.accessToken}`;
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor: handle 401 errors
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      // If 401 and we haven't already retried, try to refresh token
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          const tokens = tokenStorage.getTokens(sessionId);
          if (tokens && tokens.refreshToken) {
            const newTokens = await refreshAccessToken(tokens.refreshToken);
            tokenStorage.saveTokens(sessionId, newTokens);

            // Retry original request with new token
            const freshTokens = tokenStorage.getTokens(sessionId);
            originalRequest.headers.Authorization = `Bearer ${freshTokens.accessToken}`;
            return client(originalRequest);
          }
        } catch (refreshError) {
          console.error('Token refresh failed on 401:', refreshError);
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Get athlete's activities
 */
export async function getActivities(sessionId, page = 1, perPage = 30, gearId = null) {
  const client = createStravaClient(sessionId);

  try {
    const params = {
      page,
      per_page: perPage,
    };

    const response = await client.get('/athlete/activities', { params });

    let data = response.data;

    // Filter by gear_id if provided (Strava API doesn't support gear_id param)
    if (gearId) {
      data = data.filter(activity => activity.gear_id === gearId);
    }

    return data;
  } catch (error) {
    console.error('Get activities error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get single activity details
 */
export async function getActivity(sessionId, activityId) {
  const client = createStravaClient(sessionId);

  try {
    const response = await client.get(`/activities/${activityId}`);
    return response.data;
  } catch (error) {
    console.error('Get activity error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get athlete profile
 */
export async function getAthlete(sessionId) {
  const client = createStravaClient(sessionId);

  try {
    const response = await client.get('/athlete');
    return response.data;
  } catch (error) {
    console.error('Get athlete error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get athlete's gear (bikes and shoes)
 */
export async function getGear(sessionId) {
  const client = createStravaClient(sessionId);

  try {
    console.log('Fetching activities to extract gear...');

    // Get multiple pages of activities to find all gear
    const allActivities = [];
    let page = 1;
    const perPage = 200;

    // Fetch up to 10 pages (2000 activities) to capture all gear
    while (page <= 10) {
      const activitiesResponse = await client.get('/athlete/activities', {
        params: { page, per_page: perPage },
      });

      const activities = activitiesResponse.data;
      if (activities.length === 0) break;

      allActivities.push(...activities);
      page++;

      // Stop early if we already found many unique gear IDs
      const currentGearIds = new Set();
      allActivities.forEach(a => { if (a.gear_id) currentGearIds.add(a.gear_id); });
      if (currentGearIds.size >= 10 && page > 5) break;
    }

    console.log(`Fetched ${allActivities.length} activities across ${page - 1} pages`);
    const activities = allActivities;

    // Extract unique gear IDs
    const gearIds = new Set();
    activities.forEach(activity => {
      if (activity.gear_id) {
        gearIds.add(activity.gear_id);
      }
    });

    console.log(`Found ${gearIds.size} unique gear IDs in activities`);

    // Fetch details for each gear
    const gearPromises = Array.from(gearIds).map(async (gearId) => {
      try {
        const gearResponse = await client.get(`/gear/${gearId}`);
        const gearData = gearResponse.data;

        // Determine type based on resource_state or name
        const isShoe = gearData.name?.toLowerCase().includes('shoe') ||
                      gearData.name?.toLowerCase().includes('run');

        return {
          id: gearData.id,
          name: gearData.name,
          primary: gearData.primary || false,
          distance: gearData.distance || 0,
          brand_name: gearData.brand_name,
          model_name: gearData.model_name,
          description: gearData.description,
          retired: gearData.retired || false,
          type: isShoe ? 'shoe' : 'bike',
        };
      } catch (error) {
        console.error(`Failed to fetch gear ${gearId}:`, error.message);
        return null;
      }
    });

    const gearDetails = await Promise.all(gearPromises);
    const gear = gearDetails.filter(g => g !== null);

    console.log(`Successfully fetched details for ${gear.length} pieces of equipment`);
    gear.forEach(g => console.log(`- ${g.name} (${g.type})`));

    return gear;
  } catch (error) {
    console.error('Get gear error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get detailed gear information
 */
export async function getGearDetails(sessionId, gearId) {
  const client = createStravaClient(sessionId);

  try {
    const response = await client.get(`/gear/${gearId}`);
    return response.data;
  } catch (error) {
    console.error('Get gear details error:', error.response?.data || error.message);
    throw error;
  }
}
