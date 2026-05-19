<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUsageStore } from '@/stores/usage';
import { getRecentMonthlyUsage, type UsageStats } from '@/services/usage';
import { callClaude } from '@/services/claude';
import {
  getStoredKey,
  setStoredKey,
  clearStoredKey,
  maskKey,
} from '@/services/byok-key';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const authStore = useAuthStore();
const usageStore = useUsageStore();

// ── BYOK 狀態 ──
const byokKey = ref<string>('');
const storedKey = ref<string | null>(getStoredKey());
const showKey = ref(false);
const byokSaveMsg = ref<string | null>(null);

const isBYOK = computed(() => storedKey.value !== null);

function saveByokKey(): void {
  const v = byokKey.value.trim();
  if (!v) {
    byokSaveMsg.value = '請貼上 API key';
    return;
  }
  if (!v.startsWith('sk-ant-')) {
    byokSaveMsg.value = '格式看起來不對（Anthropic key 開頭應為 sk-ant-）';
    return;
  }
  setStoredKey(v);
  storedKey.value = v;
  byokKey.value = '';
  byokSaveMsg.value = '✓ 已儲存於這個瀏覽器';
  setTimeout(() => (byokSaveMsg.value = null), 3000);
}

function removeByokKey(): void {
  if (!confirm('確定要移除 BYOK key？之後 AI 呼叫會改走伺服器代理（需後端 secret 已設定）。')) return;
  clearStoredKey();
  storedKey.value = null;
  byokSaveMsg.value = '✓ 已移除';
  setTimeout(() => (byokSaveMsg.value = null), 3000);
}

// ── 用量（僅在伺服器代理模式有意義）──
const monthlyLimit = computed(
  () => authStore.userDoc?.apiUsageLimit?.monthly_usd_limit ?? 50,
);

const usedUsd = computed(() => usageStore.currentCostUsd);
const usedPct = computed(() =>
  Math.min(100, Math.round((usedUsd.value / monthlyLimit.value) * 100)),
);

const limitTone = computed(() => {
  if (usedPct.value >= 100) return 'bg-danger';
  if (usedPct.value >= 80) return 'bg-yellow-500';
  return 'bg-primary-500';
});

const recentUsage = ref<UsageStats[]>([]);
const recentLoading = ref(false);

async function loadRecent(): Promise<void> {
  if (!authStore.authUser) return;
  recentLoading.value = true;
  try {
    recentUsage.value = await getRecentMonthlyUsage(authStore.authUser.uid, 6);
  } finally {
    recentLoading.value = false;
  }
}

const recentMaxUsd = computed(() =>
  Math.max(1, ...recentUsage.value.map((u) => u.estimatedCostUsd ?? 0)),
);

// ── 連線測試（兩種模式共用）──
const testing = ref(false);
const testResult = ref<string | null>(null);
const testError = ref<string | null>(null);

async function testClaude(): Promise<void> {
  testing.value = true;
  testResult.value = null;
  testError.value = null;
  try {
    const res = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: '請用一句繁體中文回答：1 + 1 = ?',
        },
      ],
    });
    testResult.value = `${res.text.trim()} (model=${res.model}, $${res.cost_usd.toFixed(
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
    void loadRecent();
  }
});
onUnmounted(() => unbindHandler?.());
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-semibold text-primary-700 mb-6">個人設定</h1>

    <!-- BYOK 模式設定 -->
    <section class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-primary-700 mb-2">
        AI 模式 ·
        <span v-if="isBYOK" class="text-success">BYOK</span>
        <span v-else class="text-gray-500">伺服器代理</span>
      </h2>

      <div v-if="isBYOK" class="space-y-3">
        <p class="text-sm text-gray-600">
          目前使用你自己的 Anthropic API key 直接從瀏覽器呼叫，**不會**經過此網站的後端。
          用量請至
          <a
            href="https://console.anthropic.com/settings/usage"
            target="_blank"
            rel="noopener"
            class="text-primary-700 underline"
            >Anthropic Console → Usage</a
          >
          查看與管理。
        </p>
        <div class="flex items-center gap-2 text-sm">
          <span class="font-mono text-gray-700">
            {{ showKey ? storedKey : maskKey(storedKey ?? '') }}
          </span>
          <button
            type="button"
            class="text-xs text-gray-500 underline"
            @click="showKey = !showKey"
          >
            {{ showKey ? '隱藏' : '顯示' }}
          </button>
        </div>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md border border-danger text-danger text-sm hover:bg-danger/5"
          @click="removeByokKey"
        >
          移除 BYOK key
        </button>
      </div>

      <div v-else class="space-y-3">
        <p class="text-sm text-gray-600">
          目前未設定 BYOK，AI 呼叫會走 Cloud Function（需後端已設
          <code class="text-xs bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code> secret）。
        </p>
        <div class="rounded-md bg-yellow-50 border border-yellow-300 p-3 text-xs text-yellow-900 space-y-1">
          <p><strong>⚠️ 安全性權衡</strong></p>
          <ul class="list-disc pl-4 space-y-0.5">
            <li>key 只存在<strong>這個瀏覽器</strong>的 localStorage，不會上傳到任何伺服器</li>
            <li>從瀏覽器發出，<strong>只送 api.anthropic.com</strong>（HTTPS）</li>
            <li>勿在公用電腦使用；登出時請點「移除 BYOK key」</li>
            <li>勿把 key 截圖或貼給其他人</li>
          </ul>
        </div>
        <label class="block text-sm text-gray-700">
          Anthropic API key
          <input
            v-model="byokKey"
            type="password"
            autocomplete="off"
            placeholder="sk-ant-..."
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </label>
        <button
          type="button"
          class="px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800"
          @click="saveByokKey"
        >
          儲存 key 並啟用 BYOK
        </button>
        <p class="text-xs text-gray-500">
          沒有 key？到
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener"
            class="text-primary-700 underline"
            >Anthropic Console → API Keys</a
          >
          建立一把。
        </p>
      </div>

      <p
        v-if="byokSaveMsg"
        class="mt-2 text-xs"
        :class="byokSaveMsg.startsWith('✓') ? 'text-success' : 'text-danger'"
      >
        {{ byokSaveMsg }}
      </p>
    </section>

    <!-- 本月用量（僅伺服器代理模式有意義） -->
    <section
      v-if="!isBYOK"
      class="bg-white rounded-lg border border-gray-200 p-6 mb-6"
    >
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
          class="h-full transition-[width]"
          :class="limitTone"
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

    <!-- 近 6 個月趨勢 -->
    <section
      v-if="!isBYOK"
      class="bg-white rounded-lg border border-gray-200 p-6 mb-6"
    >
      <h2 class="text-base font-semibold text-primary-700 mb-4">
        近 6 個月用量趨勢
      </h2>

      <LoadingSpinner v-if="recentLoading" label="載入歷史用量…" size="sm" />

      <ul v-else-if="recentUsage.length > 0" class="space-y-2">
        <li
          v-for="u in [...recentUsage].reverse()"
          :key="u.yearMonth"
          class="flex items-center gap-3 text-xs"
        >
          <span class="font-mono w-16 text-gray-600">{{ u.yearMonth }}</span>
          <div class="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
            <div
              class="h-full bg-primary-500/80 transition-[width]"
              :style="{
                width: `${Math.min(100, (u.estimatedCostUsd / recentMaxUsd) * 100)}%`,
              }"
            />
          </div>
          <span class="w-20 text-right text-gray-700 font-mono">
            ${{ u.estimatedCostUsd.toFixed(2) }}
          </span>
        </li>
      </ul>

      <p v-else class="text-xs text-gray-400">尚無歷史紀錄。</p>

      <p class="text-xs text-gray-400 mt-3">
        以實際 API 費率（Anthropic input/output tokens）估算；含所有透過 claudeProxy 的呼叫。
      </p>
    </section>

    <!-- 連線測試 -->
    <section class="bg-white rounded-lg border border-gray-200 p-6">
      <h2 class="text-base font-semibold text-primary-700 mb-2">
        連線測試
      </h2>
      <p class="text-sm text-gray-600 mb-4">
        <span v-if="isBYOK">
          會用你儲存的 BYOK key 直接呼叫 Anthropic Haiku 一次（成本 &lt; $0.001）。
        </span>
        <span v-else>
          會呼叫 Cloud Function（需後端 secrets 已設定 <code class="text-xs bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code>）。
        </span>
      </p>

      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 transition-colors disabled:opacity-50"
        :disabled="testing"
        @click="testClaude"
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
