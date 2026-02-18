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
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { invalidateCache } from '../services/api';

const router = useRouter();
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
</style>
