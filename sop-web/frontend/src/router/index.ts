import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/pages/LandingPage.vue'),
    meta: { layout: 'auth', requiresGuest: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { layout: 'auth', requiresGuest: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/pages/DashboardPage.vue'),
    meta: { layout: 'main', requiresAuth: true },
  },
  {
    path: '/sop/new',
    name: 'new-sop',
    component: () => import('@/pages/NewSopPage.vue'),
    meta: { layout: 'main', requiresAuth: true },
  },
  {
    path: '/sop/:id',
    name: 'sop-detail',
    component: () => import('@/pages/SopDetailPage.vue'),
    meta: { layout: 'main', requiresAuth: true },
  },
  {
    path: '/sop/:id/update',
    name: 'update-sop',
    component: () => import('@/pages/UpdateSopPage.vue'),
    meta: { layout: 'main', requiresAuth: true },
  },
  {
    path: '/job/:jobId',
    name: 'job-progress',
    component: () => import('@/pages/JobProgressPage.vue'),
    meta: { layout: 'main', requiresAuth: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
    meta: { layout: 'main', requiresAuth: true },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  // App.vue 在 mount 前已 bind，但保險起見等一下
  if (!authStore.initialized) {
    await authStore.bind();
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  // 已登入時不再進入 / 或 /login，直接到 dashboard
  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    return { name: 'dashboard' };
  }

  return true;
});
