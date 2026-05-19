<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  Upload,
  Sparkles,
  KeyRound,
  ArrowRight,
  FileInput,
  Cpu,
  FileOutput,
  Lock,
  ShieldCheck,
  Zap,
} from 'lucide-vue-next';
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
  <div>
    <!-- HERO -->
    <section
      class="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-800 to-accent-800 text-white"
    >
      <!-- decorative blobs -->
      <div
        aria-hidden="true"
        class="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-accent-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        class="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-primary-500/20 blur-3xl"
      />

      <div class="relative max-w-5xl mx-auto px-6 py-20 sm:py-28">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium mb-6">
          <Sparkles class="w-3.5 h-3.5" />
          AI 內訓文件產生器 · 純前端 · BYOK
        </div>

        <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
          把<span class="text-accent-200">訪談</span>變成
          <br class="hidden sm:block" />
          標準作業<span class="text-accent-200">流程</span>
        </h1>

        <p class="text-base sm:text-lg text-primary-100 max-w-2xl mb-10 leading-relaxed">
          上傳訪談稿、文件、截圖，AI 自動抽取成結構化 SOP，
          一鍵下載 Word / PDF / Markdown / SOP.json。
          資料只在你的瀏覽器中處理，不上雲端。
        </p>

        <!-- BYOK gate -->
        <div
          v-if="!byokReady"
          class="mb-8 inline-flex items-start gap-3 px-4 py-3 rounded-lg bg-yellow-400/10 border border-yellow-300/30 backdrop-blur-sm text-sm max-w-2xl"
        >
          <KeyRound class="w-5 h-5 text-yellow-200 shrink-0 mt-0.5" />
          <div>
            <p class="font-medium text-yellow-100 mb-0.5">尚未設定 Anthropic API key</p>
            <p class="text-yellow-200/80 text-xs">
              本工具直接從你的瀏覽器呼叫 Claude API，請先到設定貼上自己的 key（一分鐘設定）。
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="group inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-white text-primary-700 font-semibold shadow-lg hover:shadow-xl hover:bg-accent-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!byokReady"
            @click="goNew"
          >
            開始新建 SOP
            <ArrowRight
              class="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-disabled:translate-x-0"
            />
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 px-5 py-3.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white font-medium hover:bg-white/15 transition-colors"
            @click="goSettings"
          >
            <KeyRound class="w-4 h-4" />
            {{ byokReady ? '已設定 API key' : '前往設定 API key' }}
          </button>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="max-w-5xl mx-auto px-6 py-16">
      <div class="text-center mb-10">
        <p class="text-sm font-medium text-accent-700 mb-2 tracking-wide uppercase">使用流程</p>
        <h2 class="text-2xl sm:text-3xl font-bold text-primary-700">三步搞定一份 SOP</h2>
      </div>

      <div class="relative grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- step 1 -->
        <div class="relative">
          <div class="bg-white rounded-xl border border-gray-200 p-6 h-full hover:shadow-md transition-shadow">
            <div
              class="w-12 h-12 rounded-lg bg-primary-50 flex items-center justify-center mb-4"
            >
              <FileInput class="w-6 h-6 text-primary-700" />
            </div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-mono text-accent-700">STEP 1</span>
            </div>
            <h3 class="font-semibold text-primary-700 mb-1.5">上傳素材</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              訪談逐字稿 (.txt / .md)、Word / PDF 文件、操作截圖 — 多個一起丟也可以。
            </p>
          </div>
        </div>
        <!-- step 2 -->
        <div class="relative">
          <div class="bg-white rounded-xl border border-gray-200 p-6 h-full hover:shadow-md transition-shadow">
            <div
              class="w-12 h-12 rounded-lg bg-accent-50 flex items-center justify-center mb-4"
            >
              <Cpu class="w-6 h-6 text-accent-700" />
            </div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-mono text-accent-700">STEP 2</span>
            </div>
            <h3 class="font-semibold text-primary-700 mb-1.5">AI 自動抽取</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              Claude 把零散的素材整理成標準化的步驟、故障排除、術語表。
            </p>
          </div>
        </div>
        <!-- step 3 -->
        <div class="relative">
          <div class="bg-white rounded-xl border border-gray-200 p-6 h-full hover:shadow-md transition-shadow">
            <div
              class="w-12 h-12 rounded-lg bg-primary-50 flex items-center justify-center mb-4"
            >
              <FileOutput class="w-6 h-6 text-primary-700" />
            </div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-mono text-accent-700">STEP 3</span>
            </div>
            <h3 class="font-semibold text-primary-700 mb-1.5">即時下載</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              Word、PDF、Markdown、SOP.json 四種格式按需產出，不需等待。
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section class="bg-gradient-to-b from-white to-primary-50/40 py-16 border-t border-gray-100">
      <div class="max-w-5xl mx-auto px-6">
        <div class="text-center mb-10">
          <p class="text-sm font-medium text-accent-700 mb-2 tracking-wide uppercase">特色</p>
          <h2 class="text-2xl sm:text-3xl font-bold text-primary-700">為什麼用這個工具</h2>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <Lock class="w-7 h-7 text-primary-700 mb-3" />
            <h3 class="font-semibold text-primary-700 mb-1.5">隱私優先</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              所有處理都在你的瀏覽器中完成，素材不會上傳到任何伺服器。
            </p>
          </div>
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <ShieldCheck class="w-7 h-7 text-accent-700 mb-3" />
            <h3 class="font-semibold text-primary-700 mb-1.5">不編造內容</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              每個產出的步驟都有 source_ref 指回原素材；無對應的內容會明確標記。
            </p>
          </div>
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <Zap class="w-7 h-7 text-primary-700 mb-3" />
            <h3 class="font-semibold text-primary-700 mb-1.5">即開即用</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              不需註冊、不需登入。貼上自己的 Anthropic API key 立刻開始。
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- FORMATS -->
    <section class="max-w-5xl mx-auto px-6 py-16">
      <div class="text-center mb-10">
        <p class="text-sm font-medium text-accent-700 mb-2 tracking-wide uppercase">匯出格式</p>
        <h2 class="text-2xl sm:text-3xl font-bold text-primary-700">四種格式，按情境選</h2>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div class="text-2xl mb-1">📄</div>
          <p class="font-medium text-sm text-primary-700">Word</p>
          <p class="text-xs text-gray-500 mt-0.5">.docx</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div class="text-2xl mb-1">📕</div>
          <p class="font-medium text-sm text-primary-700">PDF</p>
          <p class="text-xs text-gray-500 mt-0.5">.pdf</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div class="text-2xl mb-1">📝</div>
          <p class="font-medium text-sm text-primary-700">Markdown</p>
          <p class="text-xs text-gray-500 mt-0.5">.md</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div class="text-2xl mb-1">🧬</div>
          <p class="font-medium text-sm text-primary-700">SOP.json</p>
          <p class="text-xs text-gray-500 mt-0.5">可載回繼續編輯</p>
        </div>
      </div>
    </section>

    <!-- BOTTOM CTA -->
    <section class="bg-gradient-to-br from-primary-700 to-accent-800 text-white py-14">
      <div class="max-w-3xl mx-auto px-6 text-center">
        <h2 class="text-2xl sm:text-3xl font-bold mb-3">準備好把訪談變成 SOP 了嗎？</h2>
        <p class="text-primary-100 mb-7">
          {{ byokReady ? '你已經設定好 API key，立刻開始建立第一份 SOP。' : '只需一分鐘設定，就能開始第一份 SOP。' }}
        </p>
        <button
          type="button"
          class="group inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-white text-primary-700 font-semibold shadow-lg hover:shadow-xl hover:bg-accent-50 transition-all disabled:opacity-50"
          :disabled="!byokReady"
          @click="goNew"
        >
          <Upload class="w-4 h-4" />
          開始新建 SOP
          <ArrowRight class="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        <button
          v-if="!byokReady"
          type="button"
          class="ml-3 inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm text-white font-medium hover:bg-white/15 transition-colors"
          @click="goSettings"
        >
          <KeyRound class="w-4 h-4" />
          先去設定 API key
        </button>

        <p class="text-xs text-primary-200/70 mt-8">
          ⓘ 本工具不會在雲端保存資料。請主動下載結果以便保存。
        </p>
      </div>
    </section>
  </div>
</template>
