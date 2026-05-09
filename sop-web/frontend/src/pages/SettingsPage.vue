<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase/config';
import { useAuthStore } from '@/stores/auth';
import { useUsageStore } from '@/stores/usage';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const authStore = useAuthStore();
const usageStore = useUsageStore();

const monthlyLimit = computed(
  () => authStore.userDoc?.apiUsageLimit?.monthly_usd_limit ?? 50,
);

const usedUsd = computed(() => usageStore.currentCostUsd);
const usedPct = computed(() =>
  Math.min(100, Math.round((usedUsd.value / monthlyLimit.value) * 100)),
);

// W2 驗收用：手動觸發一次 claudeProxy（在 .env.local 已設 ANTHROPIC_API_KEY 時）
const testing = ref(false);
const testResult = ref<string | null>(null);
const testError = ref<string | null>(null);

async function testClaudeProxy(): Promise<void> {
  testing.value = true;
  testResult.value = null;
  testError.value = null;
  try {
    const fn = httpsCallable<
      unknown,
      { text: string; cost_usd: number; model: string }
    >(functions, 'claudeProxy');
    const res = await fn({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: '請用一句繁體中文回答：1 + 1 = ?',
        },
      ],
    });
    testResult.value = `${res.data.text.trim()} (model=${res.data.model}, $${res.data.cost_usd.toFixed(
      6,
    )})`;
  } catch (err) {
    testError.value = err instanceof Error ? err.message : String(err);
  } finally {
    testing.value = false;
  }
}

let unbindHandler: (() => void) | null = null;
onMounted(() => {
  if (authStore.authUser) {
    usageStore.bind(authStore.authUser.uid);
    unbindHandler = () => usageStore.unbind();
  }
});
onUnmounted(() => unbindHandler?.());
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold text-primary-700 mb-6">個人設定</h1>

    <section class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-primary-700 mb-4">
        本月 API 用量
      </h2>

      <div class="flex items-baseline gap-2 mb-2">
        <span class="text-3xl font-semibold text-primary-700">
          ${{ usedUsd.toFixed(2) }}
        </span>
        <span class="text-gray-500">/ ${{ monthlyLimit.toFixed(2) }}</span>
      </div>

      <div class="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          class="h-full bg-primary-500 transition-[width]"
          :style="{ width: `${usedPct}%` }"
        />
      </div>

      <p class="text-xs text-gray-500">
        達 {{ usedPct }}% · 80% 觸發通知 · 100% 拒絕新呼叫
      </p>

      <p v-if="usageStore.current" class="text-xs text-gray-400 mt-2">
        Tokens: {{ usageStore.current.claudeTokensInput }} in /
        {{ usageStore.current.claudeTokensOutput }} out · 月份
        {{ usageStore.current.yearMonth }}
      </p>
      <p v-else class="text-xs text-gray-400 mt-2">本月尚無 API 呼叫紀錄</p>
    </section>

    <section class="bg-white rounded-lg border border-gray-200 p-6">
      <h2 class="text-base font-semibold text-primary-700 mb-2">
        W2 驗收：claudeProxy 連線測試
      </h2>
      <p class="text-sm text-gray-600 mb-4">
        確認 functions/.env.local 已設定 ANTHROPIC_API_KEY 後再點。
      </p>

      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 transition-colors disabled:opacity-50"
        :disabled="testing"
        @click="testClaudeProxy"
      >
        <LoadingSpinner v-if="testing" label="" size="sm" />
        <span v-else>呼叫 Haiku 一次</span>
      </button>

      <p
        v-if="testResult"
        class="mt-4 text-sm text-success bg-success/10 px-3 py-2 rounded-md"
      >
        ✓ {{ testResult }}
      </p>
      <p
        v-if="testError"
        class="mt-4 text-sm text-danger bg-danger/10 px-3 py-2 rounded-md"
      >
        ✗ {{ testError }}
      </p>
    </section>
  </div>
</template>
