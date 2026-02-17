<template>
  <div class="equipment">
    <header class="header">
      <div class="header-content">
        <h1 class="title">My Equipment</h1>
        <button @click="goToDashboard" class="back-button">
          ← Back to Activities
        </button>
      </div>
    </header>

    <main class="main">
      <div v-if="isLoading" class="loading">
        <div class="spinner"></div>
        <p>Loading equipment...</p>
      </div>

      <div v-else-if="error" class="error">
        <p>{{ error }}</p>
        <button @click="fetchEquipment" class="retry-button">Retry</button>
      </div>

      <div v-else class="equipment-container">
        <!-- Equipment List -->
        <div class="equipment-list">
          <h2 class="section-title">Select Equipment</h2>

          <div v-if="equipment.length === 0" class="empty">
            <p>No equipment found.</p>
            <p class="empty-subtitle">Add your bikes or shoes on Strava!</p>
          </div>

          <div v-else class="gear-grid">
            <div
              v-for="gear in equipment"
              :key="gear.id"
              class="gear-card"
              :class="{ active: selectedGear?.id === gear.id }"
              @click="selectGear(gear)"
            >
              <div class="gear-icon">
                <svg v-if="gear.type === 'bike'" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 20.5A3.5 3.5 0 0 1 1.5 17 3.5 3.5 0 0 1 5 13.5 3.5 3.5 0 0 1 8.5 17 3.5 3.5 0 0 1 5 20.5M5 12a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5m9.8-2h-1.8l-1.5 2h2.3l-.5.7-2.5-1.2V13H9.3l-1.5 3.5H6.2L8 11.8l-2.1-3.3H7l1 1.5h2.3L9.6 9H7.2L6.7 7.5h2.3L7.8 5.9l1.4-.7L11 8h3l1.4-2.3c-.5-.3-.8-.8-.8-1.4 0-.6.2-1.1.6-1.5.4-.4.9-.6 1.5-.6s1.1.2 1.5.6c.4.4.6.9.6 1.5s-.2 1.1-.6 1.5c-.4.4-.9.6-1.5.6l-1.4 2.3h2.8l-.6.8-1.8-.8h-1.4L15 10.2l1.4 1.1zm3.2 2A3.5 3.5 0 0 1 22.5 17a3.5 3.5 0 0 1-3.5 3.5A3.5 3.5 0 0 1 15.5 17a3.5 3.5 0 0 1 3.5-3.5m0-1.5a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5z"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.2 8.3c-.3-.9-1.1-1.6-2.1-1.8-1.5-.3-3 .4-3.8 1.7.3.7.5 1.5.5 2.3s-.2 1.6-.5 2.3c1.2 2 4.1 2.5 6 1 1-.8 1.6-2 1.6-3.3 0-.8-.3-1.5-.7-2.2m-8.6-.2C10 6.5 8.4 5.3 6.5 5c-1.9-.2-3.7.6-4.8 2.1-.7 1-1 2.3-.7 3.5.3.9 1 1.6 1.9 2 1 .4 2.2.3 3.2-.2 1.2-.6 2-1.7 2.2-3 .2-.6.2-1.2.1-1.8m-.8 6c-.3-.8-.8-1.4-1.4-2L6 13.7c-.6.5-1.4.8-2.3.8-.6 0-1.2-.1-1.7-.4l-1.5 1.6c-1.3 1.4-1.2 3.6.1 4.9.8.7 1.8 1.1 2.9 1.1h7c.8 0 1.5-.3 2.1-.7 1.3-1 1.8-2.8 1.2-4.3-.5-1.2-1.5-2.2-2.8-2.6l-.2-.1z"/>
                </svg>
              </div>
              <div class="gear-info">
                <h3 class="gear-name">{{ gear.name }}</h3>
                <p class="gear-type">{{ gear.type === 'bike' ? 'Bike' : 'Shoes' }}</p>
                <div class="gear-stats">
                  <span class="stat">{{ formatDistance(gear.distance) }}</span>
                  <span v-if="gear.primary" class="primary-badge">Primary</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Equipment Details and Activities -->
        <div v-if="selectedGear" class="equipment-details">
          <div class="details-header">
            <h2 class="section-title">{{ selectedGear.name }}</h2>
          </div>

          <div v-if="loadingDetails" class="loading-details">
            <div class="spinner-small"></div>
            <p>Loading activities...</p>
          </div>

          <div v-else-if="gearActivities" class="activities-summary">
            <div class="summary-cards">
              <div class="summary-card">
                <div class="summary-icon">📊</div>
                <div class="summary-info">
                  <span class="summary-label">Total Activities</span>
                  <span class="summary-value">{{ gearActivities.length }}</span>
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-icon">📏</div>
                <div class="summary-info">
                  <span class="summary-label">Total Distance</span>
                  <span class="summary-value">{{ formatDistance(totalDistance) }}</span>
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-icon">⏱️</div>
                <div class="summary-info">
                  <span class="summary-label">Total Time</span>
                  <span class="summary-value">{{ formatTotalTime(totalTime) }}</span>
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-icon">⛰️</div>
                <div class="summary-info">
                  <span class="summary-label">Total Elevation</span>
                  <span class="summary-value">{{ Math.round(totalElevation) }}m</span>
                </div>
              </div>
            </div>

            <div class="activities-list-section">
              <h3 class="subsection-title">Recent Activities</h3>
              <div v-if="gearActivities.length === 0" class="empty-activities">
                <p>No activities found for this equipment.</p>
              </div>
              <div v-else class="activities-simple-list">
                <div
                  v-for="activity in gearActivities.slice(0, 10)"
                  :key="activity.id"
                  class="activity-item"
                >
                  <div class="activity-item-info">
                    <span class="activity-item-name">{{ activity.name }}</span>
                    <span class="activity-item-date">{{ formatDate(activity.start_date) }}</span>
                  </div>
                  <div class="activity-item-stats">
                    <span>{{ formatDistance(activity.distance) }}</span>
                    <span>{{ formatDuration(activity.moving_time) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-selection">
          <div class="no-selection-content">
            <svg viewBox="0 0 24 24" fill="currentColor" class="no-selection-icon">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <p>Select equipment to view details</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getEquipment, getEquipmentActivities } from '../services/api';

const router = useRouter();

const equipment = ref([]);
const selectedGear = ref(null);
const gearActivities = ref(null);
const isLoading = ref(true);
const loadingDetails = ref(false);
const error = ref('');

const totalDistance = computed(() => {
  if (!gearActivities.value) return 0;
  return gearActivities.value.reduce((sum, activity) => sum + activity.distance, 0);
});

const totalTime = computed(() => {
  if (!gearActivities.value) return 0;
  return gearActivities.value.reduce((sum, activity) => sum + activity.moving_time, 0);
});

const totalElevation = computed(() => {
  if (!gearActivities.value) return 0;
  return gearActivities.value.reduce((sum, activity) => sum + (activity.total_elevation_gain || 0), 0);
});

async function fetchEquipment() {
  try {
    isLoading.value = true;
    error.value = '';

    const response = await getEquipment();
    equipment.value = response.gear;
  } catch (err) {
    console.error('Failed to fetch equipment:', err);
    error.value = 'Failed to load equipment. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

async function selectGear(gear) {
  selectedGear.value = gear;
  loadingDetails.value = true;

  try {
    const response = await getEquipmentActivities(gear.id);
    gearActivities.value = response.activities;
  } catch (err) {
    console.error('Failed to fetch gear activities:', err);
    error.value = 'Failed to load activities for this equipment.';
  } finally {
    loadingDetails.value = false;
  }
}

function formatDistance(meters) {
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTotalTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) {
    return `${hours}h`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function goToDashboard() {
  router.push('/dashboard');
}

onMounted(() => {
  fetchEquipment();
});
</script>

<style scoped>
.equipment {
  min-height: 100vh;
  background: #f5f7fa;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.header-content {
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 3rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0;
}

.back-button {
  padding: 0.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.back-button:hover {
  background: white;
  color: #667eea;
}

.main {
  max-width: 1600px;
  margin: 0 auto;
  padding: 3rem;
}

.loading,
.error {
  text-align: center;
  padding: 3rem 1rem;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  color: #c33;
}

.retry-button {
  margin-top: 1rem;
  padding: 0.75rem 2rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.3s;
}

.retry-button:hover {
  background: #5568d3;
}

.equipment-container {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 2.5rem;
}

.equipment-list,
.equipment-details {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1.5rem 0;
  color: #333;
}

.empty {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.empty-subtitle {
  color: #999;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

.gear-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.gear-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.gear-card:hover {
  border-color: #667eea;
  background: #f9fafb;
}

.gear-card.active {
  border-color: #667eea;
  background: #eef2ff;
}

.gear-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 8px;
  color: #667eea;
}

.gear-icon svg {
  width: 32px;
  height: 32px;
}

.gear-info {
  flex: 1;
}

.gear-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 0.25rem 0;
}

.gear-type {
  font-size: 0.875rem;
  color: #666;
  margin: 0 0 0.5rem 0;
}

.gear-stats {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.stat {
  font-size: 0.875rem;
  color: #667eea;
  font-weight: 600;
}

.primary-badge {
  padding: 0.125rem 0.5rem;
  background: #667eea;
  color: white;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.loading-details {
  text-align: center;
  padding: 3rem;
}

.spinner-small {
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.summary-icon {
  font-size: 2rem;
}

.summary-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-label {
  font-size: 0.875rem;
  color: #666;
}

.summary-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
}

.activities-list-section {
  margin-top: 2rem;
}

.subsection-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: #333;
}

.activities-simple-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.activity-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.activity-item-name {
  font-weight: 600;
  color: #333;
}

.activity-item-date {
  font-size: 0.875rem;
  color: #666;
}

.activity-item-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: #667eea;
  font-weight: 600;
}

.empty-activities {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.no-selection-content {
  text-align: center;
  color: #999;
}

.no-selection-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 1rem;
  opacity: 0.5;
}
</style>
