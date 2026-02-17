<template>
  <div class="callback">
    <div class="container">
      <div v-if="isLoading" class="loading">
        <div class="spinner"></div>
        <p>Completing authentication...</p>
      </div>

      <div v-if="error" class="error">
        <h2>Authentication Failed</h2>
        <p>{{ error }}</p>
        <button @click="goHome" class="button">Return to Home</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();
const isLoading = ref(true);
const error = ref('');

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const success = params.get('success');

  if (success === 'true') {
    // Check auth status with backend
    await authStore.checkAuthStatus();

    if (authStore.isAuthenticated) {
      router.push('/dashboard');
    } else {
      error.value = 'Authentication failed. Please try again.';
      isLoading.value = false;
    }
  } else {
    error.value = 'Invalid callback. Please try logging in again.';
    isLoading.value = false;
  }
});

function goHome() {
  router.push('/');
}
</script>

<style scoped>
.callback {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.container {
  text-align: center;
  padding: 3rem;
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 500px;
}

.loading {
  padding: 2rem;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1.5rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  padding: 2rem;
}

.error h2 {
  color: #c33;
  margin-bottom: 1rem;
}

.error p {
  color: #666;
  margin-bottom: 1.5rem;
}

.button {
  padding: 0.75rem 2rem;
  font-size: 1rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.3s;
}

.button:hover {
  background: #5568d3;
}
</style>
