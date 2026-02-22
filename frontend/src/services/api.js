import axios from 'axios';

/**
 * API client for backend communication
 */
const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to home on authentication error
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

/**
 * Get list of activities
 */
export async function getActivities(page = 1, perPage = 30) {
  try {
    const response = await apiClient.get('/activities', {
      params: { page, per_page: perPage },
    });
    return response.data;
  } catch (error) {
    console.error('Get activities failed:', error);
    throw error;
  }
}

/**
 * Get single activity details
 */
export async function getActivity(activityId) {
  try {
    const response = await apiClient.get(`/activities/${activityId}`);
    return response.data;
  } catch (error) {
    console.error('Get activity failed:', error);
    throw error;
  }
}

/**
 * Get list of athlete's equipment (bikes and shoes)
 */
export async function getEquipment() {
  try {
    const response = await apiClient.get('/equipment');
    return response.data;
  } catch (error) {
    console.error('Get equipment failed:', error);
    throw error;
  }
}

/**
 * Get detailed equipment information
 */
export async function getEquipmentDetails(equipmentId) {
  try {
    const response = await apiClient.get(`/equipment/${equipmentId}`);
    return response.data;
  } catch (error) {
    console.error('Get equipment details failed:', error);
    throw error;
  }
}

/**
 * Get activities for specific equipment
 */
export async function getEquipmentActivities(equipmentId) {
  try {
    const response = await apiClient.get(`/equipment/${equipmentId}/activities`);
    return response.data;
  } catch (error) {
    console.error('Get equipment activities failed:', error);
    throw error;
  }
}

/**
 * Update activity name, description and gear on Strava
 */
export async function updateActivity(activityId, data) {
  const response = await apiClient.put(`/activities/${activityId}`, data);
  return response.data;
}

/**
 * Invalidate the activity cache, forcing a full reload on next dashboard visit
 */
export async function invalidateCache() {
  const response = await apiClient.post('/admin/invalidate-cache');
  return response.data;
}

/**
 * Check Strava for new activities and import any that aren't cached yet.
 * Returns { imported, activities, message }.
 */
export async function syncActivities() {
  const response = await apiClient.post('/admin/sync-activities');
  return response.data;
}

/**
 * Get unique activity names that appear more than once
 */
export async function getActivityNames() {
  const response = await apiClient.get('/activities/names');
  return response.data;
}

/**
 * Get all activities matching a given name
 */
export async function getActivitiesByName(name) {
  const response = await apiClient.get('/activities/by-name', { params: { name } });
  return response.data;
}

/**
 * Get athlete profile (FTP, weight, max_heartrate, ftp_history)
 */
export async function getAthleteProfile() {
  const response = await apiClient.get('/athlete');
  return response.data;
}

/**
 * Get FTP history entries
 */
export async function getFtpHistory() {
  const response = await apiClient.get('/ftp-history');
  return response.data;
}

/**
 * Add a new FTP history entry
 */
export async function addFtpEntry({ ftp, lthr, valid_from }) {
  const response = await apiClient.post('/ftp-history', { ftp, lthr, valid_from });
  return response.data;
}

/**
 * Delete a FTP history entry
 */
export async function deleteFtpEntry(id) {
  const response = await apiClient.delete(`/ftp-history/${id}`);
  return response.data;
}

/**
 * Get Performance Management Chart data (CTL/ATL/TSB)
 */
export async function getPmc() {
  const response = await apiClient.get('/fitness/pmc');
  return response.data;
}

/**
 * Get HRV / Whoop recovery data
 */
export async function getHrv() {
  const response = await apiClient.get('/fitness/hrv');
  return response.data;
}

/**
 * Get Whoop connection status
 */
export async function getWhoopStatus() {
  const response = await axios.get('/whoop/status', { withCredentials: true });
  return response.data;
}

/**
 * Trigger a Whoop data sync
 */
export async function syncWhoop() {
  const response = await axios.post('/whoop/sync', {}, { withCredentials: true });
  return response.data;
}

/**
 * Disconnect Whoop
 */
export async function disconnectWhoop() {
  const response = await axios.post('/whoop/logout', {}, { withCredentials: true });
  return response.data;
}

export default apiClient;
