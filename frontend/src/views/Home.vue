<template>
  <div class="home">
    <div class="container">
      <h1 class="title">Strava Activity Browser</h1>
      <p class="subtitle">View and browse your Strava activities</p>

      <LoginButton />

      <div v-if="errorMessage" class="error">
        {{ errorMessage }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import LoginButton from '../components/LoginButton.vue';

const router = useRouter();
const errorMessage = ref('');

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');

  if (error) {
    const errorMessages = {
      access_denied: 'You denied access to the application.',
      missing_code: 'Authorization code was missing.',
      token_exchange_failed: 'Failed to exchange authorization code for tokens.',
    };

    errorMessage.value = errorMessages[error] || 'An error occurred during login.';
  }
});
</script>

<style scoped>
.home {
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

.title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #333;
  margin-bottom: 1rem;
}

.subtitle {
  font-size: 1.1rem;
  color: #666;
  margin-bottom: 2rem;
}

.error {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  color: #c33;
}
</style>
