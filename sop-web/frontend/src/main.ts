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

  // GH Pages SPA fallback: 404.html 把原本路徑存到 sessionStorage，
  // 我們在 mount 後 replace 回去（router 啟動時 base 路徑已經被吃掉，這裡只 push 子路徑）
  if (typeof window !== 'undefined') {
    const redirect = sessionStorage.getItem('ghpages_redirect');
    if (redirect) {
      sessionStorage.removeItem('ghpages_redirect');
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const target = base && redirect.startsWith(base) ? redirect.slice(base.length) : redirect;
      await router.replace(target || '/');
    }
  }

  app.mount('#app');
}

void bootstrap();
