<script setup lang="ts">
import { useRouter } from 'vue-router';
import { FileUp, Sparkles, GitBranch } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const authStore = useAuthStore();
const router = useRouter();

async function handleSignIn(): Promise<void> {
  try {
    await authStore.signIn();
    await router.push({ name: 'dashboard' });
  } catch {
    // 錯誤訊息已寫入 store，由模板顯示
  }
}
</script>

<template>
  <div class="w-full max-w-3xl py-12">
    <section class="text-center mb-16">
      <h1 class="text-4xl sm:text-5xl font-bold text-primary-700 mb-4">
        SOP 內訓文件系統
      </h1>
      <p class="text-lg text-gray-600 mb-8 leading-relaxed">
        把訪談、文件、截圖變成新人能讀懂的內訓 SOP，<br />
        並支援版本更新與變更追蹤。
      </p>

      <button
        type="button"
        class="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary-700 text-white font-medium hover:bg-primary-800 transition-colors disabled:opacity-60"
        :disabled="authStore.loading"
        @click="handleSignIn"
      >
        <LoadingSpinner v-if="authStore.loading" label="" size="sm" />
        <span v-else>使用 Google 登入</span>
      </button>

      <p
        v-if="authStore.error"
        class="mt-4 text-sm text-danger"
        role="alert"
      >
        登入失敗：{{ authStore.error }}
      </p>
    </section>

    <section class="grid gap-6 sm:grid-cols-3">
      <article class="bg-white rounded-lg p-6 border border-gray-200">
        <FileUp class="w-8 h-8 text-primary-500 mb-3" />
        <h2 class="font-semibold text-primary-700 mb-2">上傳素材</h2>
        <p class="text-sm text-gray-600">
          訪談逐字稿、既有文件、操作截圖、修改清單，皆可混合輸入。
        </p>
      </article>

      <article class="bg-white rounded-lg p-6 border border-gray-200">
        <Sparkles class="w-8 h-8 text-accent-500 mb-3" />
        <h2 class="font-semibold text-primary-700 mb-2">智慧整合</h2>
        <p class="text-sm text-gray-600">
          自動分流抽取、合併 IR、用新人視角補強內訓內容。
        </p>
      </article>

      <article class="bg-white rounded-lg p-6 border border-gray-200">
        <GitBranch class="w-8 h-8 text-primary-500 mb-3" />
        <h2 class="font-semibold text-primary-700 mb-2">持續更新</h2>
        <p class="text-sm text-gray-600">
          step_id 跨版本穩定，變更可追溯，差異自動產生 changelog。
        </p>
      </article>
    </section>
  </div>
</template>
