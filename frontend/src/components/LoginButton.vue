<template>
  <a href="/auth/login" class="login-button">
    <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
    </svg>
    Login with Strava
  </a>
</template>

<style scoped>
.login-button {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  font-weight: 600;
  background: #fc4c02;
  color: white;
  text-decoration: none;
  border-radius: 8px;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(252, 76, 2, 0.3);
}

.login-button:hover {
  background: #e04402;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(252, 76, 2, 0.4);
}

.icon {
  width: 24px;
  height: 24px;
}
</style>
