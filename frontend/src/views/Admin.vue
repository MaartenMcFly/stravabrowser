<template>
  <div class="admin">
    <header class="header">
      <div class="header-content">
        <h1 class="title">Administration</h1>
        <button @click="goToDashboard" class="back-button">
          ← Back to Activities
        </button>
      </div>
    </header>

    <main class="main">
      <div class="admin-container">

        <!-- Sync new activities -->
        <div class="admin-card">
          <h2 class="card-title">Sync New Activities</h2>
          <p class="card-description">
            Check Strava for activities that have been recorded since the last cache update
            and import them immediately, without waiting for the 24-hour refresh cycle.
          </p>

          <button
            @click="handleSync"
            class="primary-button"
            :disabled="isSyncing"
          >
            <span v-if="isSyncing">Checking Strava…</span>
            <span v-else>Check for New Activities</span>
          </button>
        </div>

        <!-- Equipment cache invalidation -->
        <div class="admin-card">
          <h2 class="card-title">Equipment Cache</h2>
          <p class="card-description">
            Equipment (bikes and shoes) is cached permanently after the first load.
            Use this button to clear the cache so your gear list is reloaded from Strava,
            picking up any new or updated equipment.
          </p>

          <div v-if="equipmentMessage" class="message" :class="equipmentMessageType">
            {{ equipmentMessage }}
          </div>

          <button
            @click="handleInvalidateEquipment"
            class="danger-button"
            :disabled="isEquipmentLoading"
          >
            <span v-if="isEquipmentLoading">Invalidating...</span>
            <span v-else>Refresh Equipment from Strava</span>
          </button>
        </div>

        <!-- Cache invalidation -->
        <div class="admin-card">
          <h2 class="card-title">Activity Cache</h2>
          <p class="card-description">
            The application caches your Strava activities locally to avoid repeated API calls.
            Use this button to wipe the cache and force a full reload of all activities from Strava
            on your next visit to the dashboard.
          </p>

          <div v-if="message" class="message" :class="messageType">
            {{ message }}
          </div>

          <button
            @click="handleInvalidate"
            class="danger-button"
            :disabled="isLoading"
          >
            <span v-if="isLoading">Invalidating...</span>
            <span v-else>Invalidate Cache &amp; Force Full Reload</span>
          </button>
        </div>

      </div>
    </main>

    <!-- Sync results dialog -->
    <Teleport to="body">
      <div v-if="syncResult" class="dialog-backdrop" @click.self="syncResult = null">
        <div class="dialog">
          <div class="dialog-header">
            <h3 class="dialog-title">Sync Results</h3>
            <button class="dialog-close" @click="syncResult = null">✕</button>
          </div>

          <div class="dialog-body">
            <p class="sync-message" :class="syncResult.imported > 0 ? 'sync-success' : 'sync-none'">
              {{ syncResult.message }}
            </p>

            <ul v-if="syncResult.activities.length > 0" class="activity-list">
              <li
                v-for="activity in syncResult.activities"
                :key="activity.start_date"
                class="activity-item"
              >
                <span class="activity-name">{{ activity.name }}</span>
                <span class="activity-date">{{ formatDate(activity.start_date) }}</span>
              </li>
            </ul>
          </div>

          <div class="dialog-footer">
            <button class="close-button" @click="syncResult = null">Close</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { invalidateCache, invalidateEquipmentCache, syncActivities } from '../services/api';

const router = useRouter();

// Equipment cache invalidation
const isEquipmentLoading = ref(false);
const equipmentMessage = ref('');
const equipmentMessageType = ref('success');

async function handleInvalidateEquipment() {
  isEquipmentLoading.value = true;
  equipmentMessage.value = '';
  try {
    const response = await invalidateEquipmentCache();
    equipmentMessage.value = response.message;
    equipmentMessageType.value = 'success';
  } catch (err) {
    console.error('Equipment cache invalidation failed:', err);
    equipmentMessage.value = 'Failed to invalidate equipment cache. Please try again.';
    equipmentMessageType.value = 'error';
  } finally {
    isEquipmentLoading.value = false;
  }
}

// Cache invalidation
const isLoading = ref(false);
const message = ref('');
const messageType = ref('success');

async function handleInvalidate() {
  isLoading.value = true;
  message.value = '';
  try {
    const response = await invalidateCache();
    message.value = response.message;
    messageType.value = 'success';
  } catch (err) {
    console.error('Cache invalidation failed:', err);
    message.value = 'Failed to invalidate cache. Please try again.';
    messageType.value = 'error';
  } finally {
    isLoading.value = false;
  }
}

// Activity sync
const isSyncing = ref(false);
const syncResult = ref(null);

async function handleSync() {
  isSyncing.value = true;
  try {
    syncResult.value = await syncActivities();
  } catch (err) {
    console.error('Sync failed:', err);
    syncResult.value = { imported: 0, activities: [], message: 'Failed to check for new activities. Please try again.' };
  } finally {
    isSyncing.value = false;
  }
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function goToDashboard() {
  router.push('/dashboard');
}
</script>

<style scoped>
.admin {
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

.admin-container {
  max-width: 600px;
}

.admin-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: #333;
}

.card-description {
  color: #555;
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
}

.message {
  padding: 0.875rem 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-weight: 500;
}

.message.success {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.message.error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.admin-card + .admin-card {
  margin-top: 1.5rem;
}

.primary-button {
  padding: 0.75rem 1.75rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  transition: background 0.3s;
}

.primary-button:hover:not(:disabled) {
  background: #5a6fd6;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.danger-button {
  padding: 0.75rem 1.75rem;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  transition: background 0.3s;
}

.danger-button:hover:not(:disabled) {
  background: #b91c1c;
}

.danger-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Dialog */
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: #333;
}

.dialog-close {
  background: none;
  border: none;
  font-size: 1rem;
  color: #888;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: color 0.2s;
}

.dialog-close:hover {
  color: #333;
}

.dialog-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.sync-message {
  margin: 0 0 1rem;
  font-weight: 500;
  font-size: 1rem;
}

.sync-success { color: #065f46; }
.sync-none    { color: #374151; }

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.625rem 1rem;
  font-size: 0.9rem;
}

.activity-item + .activity-item {
  border-top: 1px solid #e5e7eb;
}

.activity-name {
  color: #111;
  font-weight: 500;
}

.activity-date {
  color: #6b7280;
  white-space: nowrap;
  margin-left: 1rem;
}

.dialog-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
}

.close-button {
  padding: 0.6rem 1.5rem;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: background 0.2s;
}

.close-button:hover {
  background: #e5e7eb;
}
</style>
