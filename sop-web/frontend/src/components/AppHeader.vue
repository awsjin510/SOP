<script setup lang="ts">
import { useRouter } from 'vue-router';
import { LogOut } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const router = useRouter();

async function handleSignOut(): Promise<void> {
  await authStore.signOut();
  await router.push({ name: 'landing' });
}
</script>

<template>
  <header
    class="bg-white border-b border-gray-200 sticky top-0 z-10"
  >
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <RouterLink
        :to="{ name: 'dashboard' }"
        class="font-semibold text-primary-700 text-lg tracking-tight"
      >
        SOP 內訓系統
      </RouterLink>

      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-600 hidden sm:inline">
          {{ authStore.displayName }}
        </span>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-700 transition-colors"
          @click="handleSignOut"
        >
          <LogOut class="w-4 h-4" />
          登出
        </button>
      </div>
    </div>
  </header>
</template>
