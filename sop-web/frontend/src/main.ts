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

  // 等首次 auth 狀態 resolve 再 mount，避免 router guard race
  const authStore = useAuthStore();
  await authStore.bind();

  app.use(router);
  app.mount('#app');
}

void bootstrap();
