import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

import Home from '../views/Home.vue';
import Dashboard from '../views/Dashboard.vue';
import Callback from '../views/Callback.vue';
import Equipment from '../views/Equipment.vue';
import Statistics from '../views/Statistics.vue';
import SimilarActivities from '../views/SimilarActivities.vue';
import Admin from '../views/Admin.vue';
import Fitness from '../views/Fitness.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { requiresGuest: true },
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
    meta: { requiresAuth: true },
  },
  {
    path: '/equipment',
    name: 'Equipment',
    component: Equipment,
    meta: { requiresAuth: true },
  },
  {
    path: '/statistics',
    name: 'Statistics',
    component: Statistics,
    meta: { requiresAuth: true },
  },
  {
    path: '/similar',
    name: 'Similar',
    component: SimilarActivities,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'Admin',
    component: Admin,
    meta: { requiresAuth: true },
  },
  {
    path: '/fitness',
    name: 'Fitness',
    component: Fitness,
    meta: { requiresAuth: true },
  },
  {
    path: '/callback',
    name: 'Callback',
    component: Callback,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guard
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  // Wait for auth status to be checked
  if (authStore.isLoading) {
    await new Promise((resolve) => {
      const unwatch = authStore.$subscribe(() => {
        if (!authStore.isLoading) {
          unwatch();
          resolve();
        }
      });
    });
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // Redirect to home if route requires auth and user is not authenticated
    next({ name: 'Home' });
  } else if (to.meta.requiresGuest && authStore.isAuthenticated) {
    // Redirect to dashboard if route requires guest and user is authenticated
    next({ name: 'Dashboard' });
  } else {
    next();
  }
});

export default router;
