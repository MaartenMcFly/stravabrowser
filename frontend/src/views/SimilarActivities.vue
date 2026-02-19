<template>
  <div class="similar-activities">
    <header class="header">
      <div class="header-content">
        <h1 class="title">Similar Activities</h1>
        <button @click="goToDashboard" class="back-button">
          ← Back to Activities
        </button>
      </div>
    </header>

    <main class="main">
      <div v-if="isLoading" class="loading">
        <div class="spinner"></div>
        <p>Loading workout names...</p>
      </div>

      <div v-else-if="error" class="error">
        <p>{{ error }}</p>
        <button @click="fetchNames" class="retry-button">Retry</button>
      </div>

      <div v-else class="equipment-container">
        <!-- Names list -->
        <div class="equipment-list">
          <h2 class="section-title">Repeated Workouts</h2>

          <div v-if="names.length === 0" class="empty">
            <p>No repeated workout names found.</p>
            <p class="empty-subtitle">Activities with the same name will appear here.</p>
          </div>

          <div v-else class="gear-grid">
            <div
              v-for="item in names"
              :key="item.name"
              class="gear-card"
              :class="{ active: selectedName === item.name.toLowerCase().trim() }"
              @click="selectName(item.name)"
            >
              <div class="gear-info">
                <h3 class="gear-name">{{ item.name }}</h3>
                <div class="gear-stats">
                  <span class="stat">{{ item.count }} activities</span>
                </div>
              </div>
              <div class="count-badge">{{ item.count }}</div>
            </div>
          </div>
        </div>

        <!-- Activities for selected name -->
        <div v-if="selectedName" class="equipment-details">
          <div class="details-header">
            <h2 class="section-title">{{ selectedDisplayName }}</h2>
          </div>

          <div v-if="loadingActivities" class="loading-details">
            <div class="spinner-small"></div>
            <p>Loading activities...</p>
          </div>

          <div v-else-if="selectedActivities" class="activities-summary">
            <div class="summary-cards">
              <div class="summary-card">
                <div class="summary-icon">📊</div>
                <div class="summary-info">
                  <span class="summary-label">Count</span>
                  <span class="summary-value">{{ selectedActivities.length }}</span>
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-icon">📏</div>
                <div class="summary-info">
                  <span class="summary-label">Avg Distance</span>
                  <span class="summary-value">{{ formatDistance(avgDistance) }}</span>
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-icon">⏱️</div>
                <div class="summary-info">
                  <span class="summary-label">Avg Moving Time</span>
                  <span class="summary-value">{{ formatDuration(avgMovingTime) }}</span>
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-icon">⚡</div>
                <div class="summary-info">
                  <span class="summary-label">Avg Speed</span>
                  <span class="summary-value">{{ formatSpeed(avgSpeed) }}</span>
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-icon">⛰️</div>
                <div class="summary-info">
                  <span class="summary-label">Avg Ascent</span>
                  <span class="summary-value">{{ Math.round(avgElevation) }}m</span>
                </div>
              </div>
            </div>

            <div class="activities-list-section">
              <h3 class="subsection-title">All Occurrences (newest first)</h3>
              <div v-if="selectedActivities.length === 0" class="empty-activities">
                <p>No activities found.</p>
              </div>
              <div v-else class="activities-simple-list">
                <div
                  v-for="activity in selectedActivities"
                  :key="activity.id"
                  class="activity-item"
                >
                  <div class="activity-item-info">
                    <span class="activity-item-date">{{ formatDate(activity.start_date) }}</span>
                  </div>
                  <div class="activity-item-stats">
                    <span>{{ formatDistance(activity.distance) }}</span>
                    <span>{{ formatDuration(activity.moving_time) }}</span>
                    <span>{{ formatSpeed(activity.average_speed) }}</span>
                    <span v-if="activity.weighted_average_watts">NP {{ activity.weighted_average_watts }}W</span>
                    <span v-if="activity.average_heartrate">♥ {{ Math.round(activity.average_heartrate) }} bpm</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-selection">
          <div class="no-selection-content">
            <svg viewBox="0 0 24 24" fill="currentColor" class="no-selection-icon">
              <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
            </svg>
            <p>Select a workout to compare occurrences</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getActivities, getActivityNames, getActivitiesByName } from '../services/api';

const router = useRouter();

const names = ref([]);
const selectedName = ref(null);
const selectedDisplayName = ref('');
const selectedActivities = ref(null);
const isLoading = ref(true);
const loadingActivities = ref(false);
const error = ref('');

const avgDistance = computed(() => {
  if (!selectedActivities.value || selectedActivities.value.length === 0) return 0;
  return selectedActivities.value.reduce((sum, a) => sum + a.distance, 0) / selectedActivities.value.length;
});

const avgMovingTime = computed(() => {
  if (!selectedActivities.value || selectedActivities.value.length === 0) return 0;
  return selectedActivities.value.reduce((sum, a) => sum + a.moving_time, 0) / selectedActivities.value.length;
});

const avgSpeed = computed(() => {
  if (!selectedActivities.value || selectedActivities.value.length === 0) return 0;
  return selectedActivities.value.reduce((sum, a) => sum + (a.average_speed || 0), 0) / selectedActivities.value.length;
});

const avgElevation = computed(() => {
  if (!selectedActivities.value || selectedActivities.value.length === 0) return 0;
  return selectedActivities.value.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0) / selectedActivities.value.length;
});

async function fetchNames() {
  try {
    isLoading.value = true;
    error.value = '';
    // Trigger the same cache check/incremental update that the dashboard does
    await getActivities(1, 1);
    const response = await getActivityNames();
    names.value = response.names;
  } catch (err) {
    console.error('Failed to fetch activity names:', err);
    error.value = 'Failed to load workout names. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

async function selectName(name) {
  selectedName.value = name.toLowerCase().trim();
  selectedDisplayName.value = name;
  loadingActivities.value = true;
  selectedActivities.value = null;

  try {
    const response = await getActivitiesByName(name);
    selectedActivities.value = response.activities;
  } catch (err) {
    console.error('Failed to fetch activities by name:', err);
    error.value = 'Failed to load activities for this workout.';
  } finally {
    loadingActivities.value = false;
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

function formatSpeed(metersPerSecond) {
  const kmh = metersPerSecond * 3.6;
  return `${kmh.toFixed(1)} km/h`;
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
  fetchNames();
});
</script>

<style scoped>
.similar-activities {
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
  grid-template-columns: 350px 1fr;
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
  gap: 0.75rem;
  overflow-y: auto;
  max-height: calc(100vh - 280px);
}

.gear-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1rem;
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

.gear-info {
  flex: 1;
}

.gear-name {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 0.25rem 0;
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

.count-badge {
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #667eea;
  color: white;
  border-radius: 16px;
  font-size: 0.875rem;
  font-weight: 700;
  padding: 0 8px;
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

.details-header {
  margin-bottom: 1rem;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
  font-size: 1.4rem;
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
}

.activity-item-date {
  font-weight: 600;
  color: #333;
}

.activity-item-stats {
  display: flex;
  gap: 1.25rem;
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
