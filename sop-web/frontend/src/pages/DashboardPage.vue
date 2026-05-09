<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { httpsCallable } from 'firebase/functions';
import { Plus, Inbox } from 'lucide-vue-next';
import { functions } from '@/firebase/config';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const helloMessage = ref<string | null>(null);
const helloError = ref<string | null>(null);

// W1 用 helloWorld 證明前端→Cloud Functions 管線打通
onMounted(async () => {
  try {
    const helloWorld = httpsCallable<unknown, { message: string; uid: string | null }>(
      functions,
      'helloWorld',
    );
    const res = await helloWorld({});
    helloMessage.value = `${res.data.message} (uid=${res.data.uid ?? 'anonymous'})`;
    // 在 console 也留一筆，方便驗證
    console.info('[helloWorld]', res.data);
  } catch (err) {
    helloError.value = err instanceof Error ? err.message : String(err);
    console.error('[helloWorld] failed', err);
  }
});
</script>

<template>
  <div>
    <header class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-semibold text-primary-700">我的 SOP</h1>
        <p class="text-sm text-gray-600 mt-1">共 0 份</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-700 text-white font-medium hover:bg-primary-800 transition-colors disabled:opacity-50"
        disabled
        title="W3 階段開放"
      >
        <Plus class="w-4 h-4" />
        新增 SOP
      </button>
    </header>

    <section class="bg-white rounded-lg border border-gray-200 p-12 text-center">
      <Inbox class="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h2 class="text-lg font-medium text-primary-700 mb-2">您還沒有 SOP</h2>
      <p class="text-sm text-gray-600 mb-6">
        W1 階段尚未實作上傳功能；W3 完成後即可在此建立第一份 SOP。
      </p>
      <p class="text-xs text-gray-400">
        登入帳號：{{ authStore.userDoc?.email ?? authStore.authUser?.email ?? '—' }}
      </p>
    </section>

    <!-- W1 驗收用：顯示 Cloud Function 連線狀態 -->
    <section class="mt-8 text-xs text-gray-500">
      <p v-if="helloMessage">✅ Cloud Function 連線：{{ helloMessage }}</p>
      <p v-else-if="helloError" class="text-warning">
        ⚠️ Cloud Function 連線失敗：{{ helloError }}
      </p>
      <p v-else>… 正在測試 Cloud Function 連線</p>
    </section>
  </div>
</template>
