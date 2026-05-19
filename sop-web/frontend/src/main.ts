import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { router } from '@/router';
import '@/style.css';

async function bootstrap(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  app.config.errorHandler = (err, _instance, info) => {
    // eslint-disable-next-line no-console
    console.error('[vue:errorHandler]', info, err);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      // eslint-disable-next-line no-console
      console.error('[unhandledrejection]', event.reason);
    });
  }

  app.use(router);

  // GH Pages SPA fallback：404.html 把原本路徑存進 sessionStorage，
  // 我們在這裡 replace 回去。
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
