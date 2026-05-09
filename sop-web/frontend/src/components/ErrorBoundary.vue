<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';
import { AlertTriangle, RotateCcw } from 'lucide-vue-next';

const error = ref<Error | null>(null);
const componentInfo = ref<string>('');

onErrorCaptured((err, instance, info) => {
  error.value = err instanceof Error ? err : new Error(String(err));
  componentInfo.value = info;
  console.error('[ErrorBoundary] caught', err, instance, info);
  // 阻止錯誤向上冒泡（讓本 boundary 取代渲染）
  return false;
});

function reset(): void {
  error.value = null;
  componentInfo.value = '';
}

function reload(): void {
  window.location.reload();
}
</script>

<template>
  <div v-if="error" class="max-w-2xl mx-auto py-8">
    <section
      class="bg-white border-2 border-danger/30 rounded-lg p-6 shadow-md"
    >
      <div class="flex items-start gap-3 mb-4">
        <AlertTriangle class="w-6 h-6 text-danger shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-semibold text-danger">頁面渲染發生錯誤</h2>
          <p class="text-sm text-gray-600 mt-1">
            這通常代表程式有未預期的問題。錯誤已記錄到主控台，可以試著重試或重新整理。
          </p>
        </div>
      </div>

      <details class="bg-gray-50 border border-gray-200 rounded-md p-3 mb-4">
        <summary class="text-xs font-medium text-gray-700 cursor-pointer">
          技術細節
        </summary>
        <div class="mt-2 text-xs text-gray-600 space-y-1">
          <p>
            <span class="font-medium">訊息：</span>
            <code class="bg-white px-1 rounded">{{ error.message }}</code>
          </p>
          <p v-if="componentInfo">
            <span class="font-medium">位置：</span>
            <code class="bg-white px-1 rounded">{{ componentInfo }}</code>
          </p>
          <pre
            v-if="error.stack"
            class="mt-2 text-xxs whitespace-pre-wrap text-gray-500 overflow-x-auto max-h-64"
          >{{ error.stack }}</pre>
        </div>
      </details>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800"
          @click="reset"
        >
          <RotateCcw class="w-4 h-4" />
          重試此頁
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
          @click="reload"
        >
          重新整理整個應用
        </button>
        <RouterLink
          :to="{ name: 'dashboard' }"
          class="ml-auto text-sm text-primary-700 hover:underline"
          @click="reset"
        >
          回到 Dashboard
        </RouterLink>
      </div>
    </section>
  </div>
  <slot v-else />
</template>

<style scoped>
.text-xxs {
  font-size: 0.65rem;
  line-height: 1rem;
}
</style>
