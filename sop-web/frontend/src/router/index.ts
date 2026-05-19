import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/pages/LandingPage.vue'),
    meta: { layout: 'auth' },
  },
  {
    path: '/new',
    name: 'new',
    component: () => import('@/pages/NewSopPage.vue'),
    meta: { layout: 'main' },
  },
  {
    path: '/progress',
    name: 'progress',
    component: () => import('@/pages/JobProgressPage.vue'),
    meta: { layout: 'main' },
  },
  {
    path: '/result',
    name: 'result',
    component: () => import('@/pages/SopDetailPage.vue'),
    meta: { layout: 'main' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
    meta: { layout: 'main' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
