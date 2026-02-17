import { defineStore } from 'pinia';
import axios from 'axios';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    isAuthenticated: false,
    isLoading: true,
    athlete: null,
  }),

  actions: {
    async checkAuthStatus() {
      this.isLoading = true;

      try {
        const response = await axios.get('/auth/status', {
          withCredentials: true,
        });

        this.isAuthenticated = response.data.authenticated;
        this.athlete = response.data.athlete || null;
      } catch (error) {
        console.error('Auth status check failed:', error);
        this.isAuthenticated = false;
        this.athlete = null;
      } finally {
        this.isLoading = false;
      }
    },

    async logout() {
      try {
        await axios.post('/auth/logout', {}, {
          withCredentials: true,
        });

        this.isAuthenticated = false;
        this.athlete = null;
      } catch (error) {
        console.error('Logout failed:', error);
        throw error;
      }
    },
  },
});
