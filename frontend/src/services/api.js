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

export default apiClient;
