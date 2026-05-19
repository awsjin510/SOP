<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { FileText, Upload, Download, KeyRound } from 'lucide-vue-next';
import { hasStoredKey } from '@/services/byok-key';

const router = useRouter();
const byokReady = computed(() => hasStoredKey());

async function goNew(): Promise<void> {
  await router.push({ name: 'new' });
}

async function goSettings(): Promise<void> {
  await router.push({ name: 'settings' });
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-16">
    <h1 class="text-4xl font-bold text-primary-700 mb-3">
      SOP 內訓文件產生系統
    </h1>
    <p class="text-gray-600 mb-8">
      把訪談稿、文件、截圖丟進來，AI 幫你整理成標準作業流程。下載 Word / PDF / Markdown / SOP.json。
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
      <div class="bg-white rounded-lg border border-gray-200 p-5">
        <Upload class="w-6 h-6 text-primary-700 mb-2" />
        <h3 class="font-semibold text-sm mb-1">上傳素材</h3>
        <p class="text-xs text-gray-600">訪談逐字稿、Word/PDF 文件、操作截圖</p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-5">
        <FileText class="w-6 h-6 text-primary-700 mb-2" />
        <h3 class="font-semibold text-sm mb-1">AI 自動抽取</h3>
        <p class="text-xs text-gray-600">用 Claude 把素材轉成結構化 SOP</p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-5">
        <Download class="w-6 h-6 text-primary-700 mb-2" />
        <h3 class="font-semibold text-sm mb-1">即時下載</h3>
        <p class="text-xs text-gray-600">Word / PDF / Markdown / SOP.json 四種格式</p>
      </div>
    </div>

    <div
      v-if="!byokReady"
      class="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6 text-sm"
    >
      <div class="flex items-start gap-3">
        <KeyRound class="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" />
        <div class="flex-1">
          <p class="font-medium text-yellow-900 mb-1">尚未設定 Anthropic API key</p>
          <p class="text-yellow-800 mb-2">
            本工具直接從你的瀏覽器呼叫 Claude，請先到設定貼上自己的 API key。
          </p>
          <button
            type="button"
            class="text-sm font-medium text-yellow-900 underline hover:text-yellow-700"
            @click="goSettings"
          >
            前往設定 →
          </button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="px-6 py-3 rounded-md bg-primary-700 text-white font-medium hover:bg-primary-800 transition-colors disabled:opacity-50"
        :disabled="!byokReady"
        @click="goNew"
      >
        開始新建 SOP
      </button>
      <button
        type="button"
        class="px-4 py-3 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        @click="goSettings"
      >
        個人設定
      </button>
    </div>

    <p class="text-xs text-gray-500 mt-12">
      ⓘ 本工具不會在雲端保存你的資料。所有處理都在你的瀏覽器中進行，要保留結果請主動下載
      Word / PDF / Markdown，或下載 SOP.json 以便日後載回繼續編輯。
    </p>
  </div>
</template>
