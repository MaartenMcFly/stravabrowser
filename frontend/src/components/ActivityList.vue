<template>
  <div class="activity-list">
    <div v-if="isLoading" class="loading">
      <div class="spinner"></div>
      <p>Loading activities...</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="fetchActivities" class="retry-button">Retry</button>
    </div>

    <div v-else-if="activities.length === 0" class="empty">
      <p>No activities found.</p>
      <p class="empty-subtitle">Start tracking your workouts on Strava!</p>
    </div>

    <div v-else class="activities-grid">
      <ActivityCard
        v-for="activity in activities"
        :key="activity.id"
        :activity="activity"
      />
    </div>

    <div v-if="activities.length > 0" class="pagination">
      <button
        @click="loadMore"
        :disabled="isLoadingMore"
        class="load-more-button"
      >
        {{ isLoadingMore ? 'Loading...' : 'Load More' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getActivities } from '../services/api';
import ActivityCard from './ActivityCard.vue';

const activities = ref([]);
const isLoading = ref(true);
const isLoadingMore = ref(false);
const error = ref('');
const currentPage = ref(1);

async function fetchActivities(append = false) {
  try {
    if (!append) {
      isLoading.value = true;
    } else {
      isLoadingMore.value = true;
    }
    error.value = '';

    const response = await getActivities(currentPage.value, 50);

    if (append) {
      activities.value = [...activities.value, ...response.activities];
    } else {
      activities.value = response.activities;
    }
  } catch (err) {
    console.error('Failed to fetch activities:', err);
    error.value = 'Failed to load activities. Please try again.';
  } finally {
    isLoading.value = false;
    isLoadingMore.value = false;
  }
}

async function loadMore() {
  currentPage.value++;
  await fetchActivities(true);
}

onMounted(() => {
  fetchActivities();
});
</script>

<style scoped>
.activity-list {
  width: 100%;
}

.loading,
.empty,
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

.loading p,
.empty p {
  color: #666;
  font-size: 1.1rem;
}

.empty-subtitle {
  color: #999;
  font-size: 0.95rem;
  margin-top: 0.5rem;
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

.activities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
}

.pagination {
  text-align: center;
  margin-top: 2rem;
}

.load-more-button {
  padding: 0.75rem 2rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.3s;
}

.load-more-button:hover:not(:disabled) {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.load-more-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
