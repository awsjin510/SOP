<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  getStoredKey,
  setStoredKey,
  clearStoredKey,
  maskKey,
} from '@/services/byok-key';
import { callClaude } from '@/services/claude';
import {
  getPreferredModel,
  setPreferredModel,
  MODEL_CATALOG,
  type ModelId,
} from '@/services/model-pref';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const byokKey = ref<string>('');
const storedKey = ref<string | null>(getStoredKey());
const showKey = ref(false);
const saveMsg = ref<string | null>(null);

const isReady = computed(() => storedKey.value !== null);

// ── 預設模型 ──
const selectedModel = ref<ModelId>(getPreferredModel());
const modelSavedMsg = ref<string | null>(null);

function onSelectModel(): void {
  setPreferredModel(selectedModel.value);
  modelSavedMsg.value = '✓ 已更新預設模型';
  setTimeout(() => (modelSavedMsg.value = null), 2500);
}

function save(): void {
  const v = byokKey.value.trim();
  if (!v) {
    saveMsg.value = '請貼上 API key';
    return;
  }
  if (!v.startsWith('sk-ant-')) {
    saveMsg.value = '格式看起來不對（Anthropic key 開頭應為 sk-ant-）';
    return;
  }
  setStoredKey(v);
  storedKey.value = v;
  byokKey.value = '';
  saveMsg.value = '✓ 已儲存於這個瀏覽器';
  setTimeout(() => (saveMsg.value = null), 3000);
}

function remove(): void {
  if (!confirm('確定要移除 API key？之後 AI 抽取會無法使用。')) return;
  clearStoredKey();
  storedKey.value = null;
  saveMsg.value = '✓ 已移除';
  setTimeout(() => (saveMsg.value = null), 3000);
}

const testing = ref(false);
const testResult = ref<string | null>(null);
const testError = ref<string | null>(null);

async function test(): Promise<void> {
  testing.value = true;
  testResult.value = null;
  testError.value = null;
  try {
    const res = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [
        { role: 'user', content: '請用一句繁體中文回答：1 + 1 = ?' },
      ],
    });
    testResult.value = `${res.text.trim()}（model=${res.model}, $${res.cost_usd.toFixed(6)}）`;
  } catch (err) {
    testError.value = err instanceof Error ? err.message : String(err);
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-6 py-10">
    <h1 class="text-2xl font-semibold text-primary-700 mb-6">個人設定</h1>

    <section class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-primary-700 mb-2">
        Anthropic API key
        <span v-if="isReady" class="ml-2 text-success text-sm">● 已設定</span>
        <span v-else class="ml-2 text-gray-400 text-sm">● 未設定</span>
      </h2>

      <div v-if="isReady" class="space-y-3">
        <p class="text-sm text-gray-600">
          目前使用你自己的 Anthropic API key 直接從瀏覽器呼叫，
          <strong>不會經過任何後端</strong>。用量請至
          <a
            href="https://console.anthropic.com/settings/usage"
            target="_blank"
            rel="noopener"
            class="text-primary-700 underline"
            >Anthropic Console</a
          >
          查看。
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
          @click="remove"
        >
          移除 API key
        </button>
      </div>

      <div v-else class="space-y-3">
        <div
          class="rounded-md bg-yellow-50 border border-yellow-300 p-3 text-xs text-yellow-900 space-y-1"
        >
          <p><strong>⚠️ 安全性</strong></p>
          <ul class="list-disc pl-4 space-y-0.5">
            <li>key 只存在<strong>這個瀏覽器</strong>的 localStorage，不會上傳任何伺服器</li>
            <li>從瀏覽器發出時<strong>只送 api.anthropic.com</strong>（HTTPS）</li>
            <li>勿在公用電腦使用；用完請點「移除」</li>
          </ul>
        </div>
        <label class="block text-sm text-gray-700">
          API key
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
          @click="save"
        >
          儲存 API key
        </button>
        <p class="text-xs text-gray-500">
          沒有 key？到
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener"
            class="text-primary-700 underline"
            >Anthropic Console</a
          >
          建立一把。
        </p>
      </div>

      <p
        v-if="saveMsg"
        class="mt-3 text-xs"
        :class="saveMsg.startsWith('✓') ? 'text-success' : 'text-danger'"
      >
        {{ saveMsg }}
      </p>
    </section>

    <!-- 預設模型 -->
    <section class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-primary-700 mb-2">預設 AI 模型</h2>
      <p class="text-sm text-gray-600 mb-4">
        抽取 SOP 時用哪個 Claude 模型。從 Opus 切到 Sonnet 可省約 5 倍成本，
        切到 Haiku 約省 20 倍但抽取細節可能會掉。
      </p>

      <div class="space-y-3">
        <label
          v-for="m in MODEL_CATALOG"
          :key="m.id"
          class="flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors hover:bg-gray-50"
          :class="
            selectedModel === m.id
              ? 'border-primary-700 bg-primary-50/40'
              : 'border-gray-200'
          "
        >
          <input
            v-model="selectedModel"
            type="radio"
            :value="m.id"
            class="mt-1 accent-primary-700"
            @change="onSelectModel"
          />
          <div class="flex-1">
            <div class="flex items-baseline justify-between gap-2 flex-wrap">
              <span class="font-medium text-sm text-primary-700">{{ m.label }}</span>
              <span class="text-xs font-mono text-gray-500">
                ${{ m.pricePerMTokInput }} / ${{ m.pricePerMTokOutput }} per MTok
              </span>
            </div>
            <p class="text-xs text-gray-600 mt-0.5">{{ m.description }}</p>
          </div>
        </label>
      </div>

      <p
        v-if="modelSavedMsg"
        class="mt-3 text-xs text-success"
      >
        {{ modelSavedMsg }}
      </p>
    </section>

    <section class="bg-white rounded-lg border border-gray-200 p-6">
      <h2 class="text-base font-semibold text-primary-700 mb-2">連線測試</h2>
      <p class="text-sm text-gray-600 mb-4">
        會用你的 BYOK key 呼叫一次 Haiku（成本 &lt; $0.001）。
      </p>

      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 transition-colors disabled:opacity-50"
        :disabled="testing || !isReady"
        @click="test"
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
        class="mt-4 text-sm text-danger bg-danger/10 px-3 py-2 rounded-md whitespace-pre-wrap"
      >
        ✗ {{ testError }}
      </p>
    </section>
  </div>
</template>
