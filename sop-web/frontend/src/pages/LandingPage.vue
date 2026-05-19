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
  Type,
  FileText,
  Image,
  Mic,
  ListChecks,
  Bell,
  CheckCircle2,
  ChevronRight,
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

const sourceTypes = [
  { icon: Type, label: '直接輸入文字' },
  { icon: FileText, label: 'Word / PDF' },
  { icon: Image, label: '操作截圖' },
  { icon: Mic, label: '會議逐字稿' },
  { icon: ListChecks, label: '修改清單' },
  { icon: Bell, label: 'Release Note' },
];

const formats = [
  { label: 'Word', sub: '.docx', initials: 'W', tone: 'bg-blue-50 text-blue-700 ring-blue-200' },
  { label: 'PDF', sub: '.pdf', initials: 'P', tone: 'bg-red-50 text-red-700 ring-red-200' },
  { label: 'Markdown', sub: '.md', initials: 'M', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { label: 'SOP.json', sub: '可載回繼續編輯', initials: '{}', tone: 'bg-accent-50 text-accent-700 ring-accent-200' },
];
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
      <!-- subtle grid -->
      <div
        aria-hidden="true"
        class="absolute inset-0 opacity-[0.05]"
        style="background-image: linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px); background-size: 48px 48px;"
      />

      <div class="relative max-w-6xl mx-auto px-6 py-20 sm:py-24 lg:py-28 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
        <!-- LEFT: copy -->
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium mb-6 ring-1 ring-white/20">
            <Sparkles class="w-3.5 h-3.5" />
            AI 內訓文件產生器 · 純前端 · BYOK
          </div>

          <h1 class="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight mb-6 leading-[1.1]">
            把<span class="text-accent-200">訪談</span>變成
            <br class="hidden sm:block" />
            標準作業<span class="text-accent-200">流程</span>
          </h1>

          <p class="text-base sm:text-lg text-primary-100 max-w-2xl mb-8 leading-relaxed">
            上傳訪談稿、文件、截圖，AI 自動抽取成結構化 SOP，
            一鍵下載 Word / PDF / Markdown / SOP.json。
            資料只在你的瀏覽器中處理，不上雲端。
          </p>

          <!-- BYOK gate -->
          <div
            v-if="!byokReady"
            class="mb-7 inline-flex items-start gap-3 px-4 py-3 rounded-lg bg-yellow-400/10 border border-yellow-300/30 backdrop-blur-sm text-sm max-w-2xl"
          >
            <KeyRound class="w-5 h-5 text-yellow-200 shrink-0 mt-0.5" />
            <div>
              <p class="font-medium text-yellow-100 mb-0.5">尚未設定 Anthropic API key</p>
              <p class="text-yellow-200/80 text-xs">
                本工具直接從你的瀏覽器呼叫 Claude API，請先到設定貼上自己的 key（一分鐘設定）。
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3 mb-8">
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

          <!-- Trust strip -->
          <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-primary-200/90">
            <span class="inline-flex items-center gap-1.5">
              <CheckCircle2 class="w-3.5 h-3.5 text-accent-200" />
              純前端執行
            </span>
            <span class="inline-flex items-center gap-1.5">
              <CheckCircle2 class="w-3.5 h-3.5 text-accent-200" />
              無需註冊
            </span>
            <span class="inline-flex items-center gap-1.5">
              <CheckCircle2 class="w-3.5 h-3.5 text-accent-200" />
              不編造內容
            </span>
          </div>
        </div>

        <!-- RIGHT: mock SOP preview -->
        <div class="hidden lg:block relative">
          <!-- floating badge top-right -->
          <div
            class="absolute -top-4 -right-4 z-20 px-3 py-1.5 rounded-full bg-accent-500/90 text-white text-xs font-semibold shadow-lg backdrop-blur-sm flex items-center gap-1.5"
          >
            <Sparkles class="w-3 h-3" />
            AI 生成
          </div>

          <!-- floating tag bottom-left -->
          <div
            class="absolute -bottom-3 -left-3 z-20 px-3 py-1.5 rounded-md bg-white/10 backdrop-blur-md text-white text-xs ring-1 ring-white/20"
          >
            <span class="font-mono">.docx</span> · <span class="font-mono">.pdf</span> · <span class="font-mono">.md</span>
          </div>

          <!-- mock card -->
          <div class="relative bg-white rounded-2xl shadow-2xl ring-1 ring-white/20 overflow-hidden rotate-1 hover:rotate-0 transition-transform duration-500">
            <div class="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-primary-50 to-accent-50 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <span class="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <span class="w-2.5 h-2.5 rounded-full bg-green-400/70" />
              <span class="ml-2 text-[11px] font-medium text-primary-700 truncate">新員工帳號開通流程.sop.json</span>
            </div>
            <div class="p-5 text-gray-800">
              <div class="text-xs font-mono text-accent-700 mb-1">SOP-2026-001</div>
              <h3 class="text-base font-bold text-primary-700 mb-3 leading-snug">新員工帳號開通流程</h3>
              <ol class="space-y-2.5">
                <li class="flex gap-2.5 text-xs">
                  <span class="w-5 h-5 shrink-0 rounded-full bg-primary-700 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-800">寄信給 IT 組申請 AD 帳號</p>
                    <p class="text-gray-500 mt-0.5 text-[11px]">主旨：「新進員工帳號申請」，附身分證末四碼</p>
                  </div>
                </li>
                <li class="flex gap-2.5 text-xs">
                  <span class="w-5 h-5 shrink-0 rounded-full bg-primary-700 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-800">等 IT 回覆初始密碼</p>
                    <p class="text-gray-500 mt-0.5 text-[11px]">SLA：1 個工作天內</p>
                  </div>
                </li>
                <li class="flex gap-2.5 text-xs">
                  <span class="w-5 h-5 shrink-0 rounded-full bg-primary-700 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-800">24 小時內首次登入並改密碼</p>
                    <p class="text-gray-500 mt-0.5 text-[11px]">Ctrl+Alt+Del → 變更密碼</p>
                  </div>
                </li>
                <li class="flex gap-2.5 text-xs opacity-60">
                  <span class="w-5 h-5 shrink-0 rounded-full bg-gray-300 text-white flex items-center justify-center text-[10px] font-bold">4</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-800">設定雙因素驗證 (2FA)</p>
                  </div>
                </li>
              </ol>
              <div class="mt-4 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-[10px] text-gray-400">
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100">source_ref ✓</span>
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100">4 steps</span>
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/10 text-success">已驗證</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- SOURCES STRIP -->
    <section class="border-y border-gray-100 bg-gradient-to-b from-primary-50/40 to-white">
      <div class="max-w-6xl mx-auto px-6 py-8">
        <p class="text-center text-xs font-medium text-gray-500 mb-5 tracking-wide uppercase">支援的素材來源</p>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <div
            v-for="s in sourceTypes"
            :key="s.label"
            class="group flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-gray-100 transition-all"
          >
            <div class="w-10 h-10 rounded-lg bg-white ring-1 ring-gray-200 flex items-center justify-center group-hover:ring-primary-300 group-hover:bg-primary-50 transition-colors">
              <component :is="s.icon" class="w-5 h-5 text-primary-700" />
            </div>
            <span class="text-xs text-gray-600 text-center leading-tight">{{ s.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="max-w-6xl mx-auto px-6 py-16 lg:py-20">
      <div class="text-center mb-12">
        <p class="text-sm font-semibold text-accent-700 mb-2 tracking-[0.2em] uppercase">使用流程</p>
        <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-700">三步搞定一份 SOP</h2>
      </div>

      <div class="relative grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4">
        <!-- connecting dotted line (desktop) -->
        <div
          aria-hidden="true"
          class="hidden md:block absolute top-[60px] left-[16.67%] right-[16.67%] h-px border-t-2 border-dotted border-gray-200 z-0"
        />

        <!-- step 1 -->
        <div class="relative z-10">
          <div class="bg-white rounded-2xl ring-1 ring-gray-200 p-6 h-full hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
            <div class="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-4 shadow-md">
              <FileInput class="w-7 h-7 text-white" />
              <span class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-[10px] font-bold text-primary-700 flex items-center justify-center ring-2 ring-primary-100">1</span>
            </div>
            <h3 class="font-bold text-primary-700 mb-1.5 text-base">上傳素材</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              訪談逐字稿 (.txt / .md)、Word / PDF 文件、操作截圖 — 多個一起丟也可以。
            </p>
          </div>
        </div>

        <!-- step 2 -->
        <div class="relative z-10">
          <div class="bg-white rounded-2xl ring-1 ring-gray-200 p-6 h-full hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
            <div class="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center mb-4 shadow-md">
              <Cpu class="w-7 h-7 text-white" />
              <span class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-[10px] font-bold text-accent-700 flex items-center justify-center ring-2 ring-accent-100">2</span>
            </div>
            <h3 class="font-bold text-primary-700 mb-1.5 text-base">AI 自動抽取</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              Claude 把零散的素材整理成標準化的步驟、故障排除、術語表。
            </p>
          </div>
        </div>

        <!-- step 3 -->
        <div class="relative z-10">
          <div class="bg-white rounded-2xl ring-1 ring-gray-200 p-6 h-full hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
            <div class="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center mb-4 shadow-md">
              <FileOutput class="w-7 h-7 text-white" />
              <span class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-[10px] font-bold text-primary-700 flex items-center justify-center ring-2 ring-primary-100">3</span>
            </div>
            <h3 class="font-bold text-primary-700 mb-1.5 text-base">即時下載</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              Word、PDF、Markdown、SOP.json 四種格式按需產出，不需等待。
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section class="relative bg-gradient-to-b from-white via-primary-50/30 to-primary-50/60 py-16 lg:py-20 border-t border-gray-100 overflow-hidden">
      <div
        aria-hidden="true"
        class="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-accent-200/30 blur-3xl"
      />
      <div class="relative max-w-6xl mx-auto px-6">
        <div class="text-center mb-12">
          <p class="text-sm font-semibold text-accent-700 mb-2 tracking-[0.2em] uppercase">特色</p>
          <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-700">為什麼用這個工具</h2>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div class="group bg-white rounded-2xl p-7 ring-1 ring-gray-200 hover:ring-primary-300 hover:shadow-xl transition-all duration-300">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Lock class="w-6 h-6 text-primary-700" />
            </div>
            <h3 class="font-bold text-primary-700 mb-2 text-base">隱私優先</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              所有處理都在你的瀏覽器中完成，素材不會上傳到任何伺服器。
            </p>
          </div>
          <div class="group bg-white rounded-2xl p-7 ring-1 ring-gray-200 hover:ring-accent-300 hover:shadow-xl transition-all duration-300">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-100 to-accent-200 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <ShieldCheck class="w-6 h-6 text-accent-700" />
            </div>
            <h3 class="font-bold text-primary-700 mb-2 text-base">不編造內容</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              每個產出的步驟都有 source_ref 指回原素材；無對應的內容會明確標記。
            </p>
          </div>
          <div class="group bg-white rounded-2xl p-7 ring-1 ring-gray-200 hover:ring-primary-300 hover:shadow-xl transition-all duration-300">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-100 to-yellow-200 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Zap class="w-6 h-6 text-yellow-700" />
            </div>
            <h3 class="font-bold text-primary-700 mb-2 text-base">即開即用</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              不需註冊、不需登入。貼上自己的 Anthropic API key 立刻開始。
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- FORMATS -->
    <section class="max-w-6xl mx-auto px-6 py-16 lg:py-20">
      <div class="text-center mb-12">
        <p class="text-sm font-semibold text-accent-700 mb-2 tracking-[0.2em] uppercase">匯出格式</p>
        <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-700">四種格式，按情境選</h2>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          v-for="f in formats"
          :key="f.label"
          class="group bg-white rounded-2xl ring-1 ring-gray-200 p-6 text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
        >
          <div
            class="w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center text-lg font-bold ring-1 group-hover:scale-110 transition-transform"
            :class="f.tone"
          >
            {{ f.initials }}
          </div>
          <p class="font-bold text-sm text-primary-700">{{ f.label }}</p>
          <p class="text-xs text-gray-500 mt-1">{{ f.sub }}</p>
        </div>
      </div>
    </section>

    <!-- BOTTOM CTA -->
    <section class="relative bg-gradient-to-br from-primary-700 via-primary-800 to-accent-800 text-white py-16 lg:py-20 overflow-hidden">
      <div
        aria-hidden="true"
        class="absolute top-0 right-0 w-80 h-80 rounded-full bg-accent-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        class="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-primary-500/20 blur-3xl"
      />
      <div class="relative max-w-3xl mx-auto px-6 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium mb-5 ring-1 ring-white/20">
          <Sparkles class="w-3.5 h-3.5" />
          一分鐘上手
        </div>
        <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 leading-tight">
          準備好把訪談變成 SOP 了嗎？
        </h2>
        <p class="text-primary-100 mb-8 max-w-xl mx-auto">
          {{ byokReady ? '你已經設定好 API key，立刻開始建立第一份 SOP。' : '只需一分鐘設定，就能開始第一份 SOP。' }}
        </p>
        <div class="flex flex-wrap items-center justify-center gap-3">
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
            class="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm text-white font-medium hover:bg-white/15 transition-colors"
            @click="goSettings"
          >
            <KeyRound class="w-4 h-4" />
            先去設定 API key
          </button>
        </div>

        <p class="text-xs text-primary-200/70 mt-8 inline-flex items-center gap-1.5">
          <ChevronRight class="w-3 h-3" />
          本工具不會在雲端保存資料，請主動下載結果以便保存
        </p>
      </div>
    </section>
  </div>
</template>
