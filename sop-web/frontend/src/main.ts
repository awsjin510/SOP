import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth';
import '@/style.css';

async function bootstrap(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  // 全域 Vue 錯誤 — 由 ErrorBoundary 接住渲染錯誤；這裡接 setup 階段的同步錯誤
  app.config.errorHandler = (err, _instance, info) => {
    // eslint-disable-next-line no-console
    console.error('[vue:errorHandler]', info, err);
  };

  // 攔截未處理 promise rejection，至少有 console 記錄
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      // eslint-disable-next-line no-console
      console.error('[unhandledrejection]', event.reason);
    });
  }

  // 等首次 auth 狀態 resolve 再 mount，避免 router guard race
  const authStore = useAuthStore();
  await authStore.bind();

  app.use(router);
  app.mount('#app');
}

void bootstrap();
