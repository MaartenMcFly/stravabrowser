<template>
  <div class="dashboard">
    <header class="header">
      <div class="header-content">
        <h1 class="title">My Strava Activities</h1>
        <div class="user-section">
          <button @click="goToStatistics" class="nav-button">
            <svg viewBox="0 0 24 24" fill="currentColor" class="button-icon">
              <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z"/>
            </svg>
            Statistics
          </button>
          <button @click="goToEquipment" class="nav-button">
            <svg viewBox="0 0 24 24" fill="currentColor" class="button-icon">
              <path d="M5 20.5A3.5 3.5 0 0 1 1.5 17 3.5 3.5 0 0 1 5 13.5 3.5 3.5 0 0 1 8.5 17 3.5 3.5 0 0 1 5 20.5M5 12a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5m9.8-2h-1.8l-1.5 2h2.3l-.5.7-2.5-1.2V13H9.3l-1.5 3.5H6.2L8 11.8l-2.1-3.3H7l1 1.5h2.3L9.6 9H7.2L6.7 7.5h2.3L7.8 5.9l1.4-.7L11 8h3l1.4-2.3c-.5-.3-.8-.8-.8-1.4 0-.6.2-1.1.6-1.5.4-.4.9-.6 1.5-.6s1.1.2 1.5.6c.4.4.6.9.6 1.5s-.2 1.1-.6 1.5c-.4.4-.9.6-1.5.6l-1.4 2.3h2.8l-.6.8-1.8-.8h-1.4L15 10.2l1.4 1.1zm3.2 2A3.5 3.5 0 0 1 22.5 17a3.5 3.5 0 0 1-3.5 3.5A3.5 3.5 0 0 1 15.5 17a3.5 3.5 0 0 1 3.5-3.5m0-1.5a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5z"/>
            </svg>
            Equipment
          </button>
          <span v-if="authStore.athlete" class="user-name">
            {{ authStore.athlete.firstname }} {{ authStore.athlete.lastname }}
          </span>
          <button @click="handleLogout" class="logout-button">Logout</button>
        </div>
      </div>
    </header>

    <main class="main">
      <ActivityList />
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import ActivityList from '../components/ActivityList.vue';

const router = useRouter();
const authStore = useAuthStore();

function goToStatistics() {
  router.push('/statistics');
}

function goToEquipment() {
  router.push('/equipment');
}

async function handleLogout() {
  try {
    await authStore.logout();
    router.push('/');
  } catch (error) {
    console.error('Logout failed:', error);
  }
}
</script>

<style scoped>
.dashboard {
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

.user-section {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-name {
  font-size: 1rem;
  font-weight: 500;
}

.nav-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.nav-button:hover {
  background: white;
  color: #667eea;
}

.button-icon {
  width: 20px;
  height: 20px;
}

.logout-button {
  padding: 0.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.logout-button:hover {
  background: white;
  color: #667eea;
}

.main {
  max-width: 1600px;
  margin: 0 auto;
  padding: 3rem;
}
</style>
