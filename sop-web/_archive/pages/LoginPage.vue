<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

async function handleSignIn(): Promise<void> {
  try {
    await authStore.signIn();
    const target = (route.query.redirect as string) ?? '/dashboard';
    await router.push(target);
  } catch {
    // 錯誤已記錄在 store
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <div class="bg-white rounded-lg p-8 border border-gray-200 text-center">
      <h1 class="text-2xl font-semibold text-primary-700 mb-2">登入</h1>
      <p class="text-sm text-gray-600 mb-6">使用 Google 帳號開始使用 SOP 內訓系統</p>

      <button
        type="button"
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-primary-700 text-white font-medium hover:bg-primary-800 transition-colors disabled:opacity-60"
        :disabled="authStore.loading"
        @click="handleSignIn"
      >
        <LoadingSpinner v-if="authStore.loading" label="" size="sm" />
        <span v-else>以 Google 登入</span>
      </button>

      <p
        v-if="authStore.error"
        class="mt-4 text-sm text-danger"
        role="alert"
      >
        登入失敗：{{ authStore.error }}
      </p>
    </div>
  </div>
</template>
