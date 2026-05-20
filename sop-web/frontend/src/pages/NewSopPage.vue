<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  FileText,
  FolderOpen,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Type,
  FileUp,
} from 'lucide-vue-next';
import FileUploader from '@/components/FileUploader.vue';
import { useCurrentJobStore } from '@/stores/current-job';
import { useSopStore } from '@/stores/sop';
import { classifyUploadedFile } from '@/core/pipelines/mvp';
import { parseSopJson } from '@/services/sop';
import { hasStoredKey } from '@/services/byok-key';
import type { JobUploadedFile } from '@/services/job';

const router = useRouter();
const jobStore = useCurrentJobStore();
const sopStore = useSopStore();

const DEFAULT_SOP_PROMPT = `協助我把零散的素材與口頭經驗，整理成一份標準作業流程（SOP）。

請依以下步驟進行：
1. 我會提供素材（文字、筆記、對話、截圖等）
2. 你協助我釐清流程的「目的、輸入、步驟、輸出、檢核點」
3. 產出結構化 SOP 文件
4. 標註模糊或需補充的環節，向我提問確認

語氣專業、條列清晰、繁體中文。
`;

const title = ref('');
const files = ref<File[]>([]);
const pastedText = ref(DEFAULT_SOP_PROMPT);
const error = ref<string | null>(null);

const byokReady = computed(() => hasStoredKey());

const trimmedText = computed(() => pastedText.value.trim());
const pastedCharCount = computed(() => trimmedText.value.length);
const titleOk = computed(() => title.value.trim().length > 0);
const sourceOk = computed(() => files.value.length > 0 || pastedCharCount.value >= 50);

const checklist = computed(() => [
  { key: 'key', label: 'API Key', ok: byokReady.value, hint: '請至個人設定' },
  { key: 'title', label: 'SOP 標題', ok: titleOk.value, hint: '請填寫標題' },
  { key: 'source', label: '素材', ok: sourceOk.value, hint: '文字 ≥ 50 字或上傳檔案' },
]);

const canStart = computed(() => checklist.value.every((c) => c.ok));

async function start(): Promise<void> {
  if (!canStart.value) return;
  error.value = null;

  const uploaded: JobUploadedFile[] = [];

  if (pastedCharCount.value >= 50) {
    uploaded.push({
      name: '直接輸入的文字.txt',
      type: 'transcript',
      blob: new Blob([trimmedText.value], { type: 'text/plain' }),
      size: trimmedText.value.length,
    });
  }

  for (const f of files.value) {
    uploaded.push({
      name: f.name,
      type: classifyUploadedFile(f),
      blob: f,
      size: f.size,
    });
  }

  jobStore.queue({ files: uploaded, title: title.value.trim() });
  await router.push({ name: 'progress' });
}

const sopJsonInput = ref<HTMLInputElement | null>(null);

async function pickSopJson(): Promise<void> {
  sopJsonInput.value?.click();
}

async function handleSopJsonSelect(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const sop = await parseSopJson(file);
    sopStore.setCurrent(sop);
    await router.push({ name: 'result' });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

const supportedTypes = ['txt', 'md', 'docx', 'pdf', 'png', 'jpg', 'webp'];
</script>

<template>
  <div class="max-w-3xl mx-auto pb-32">
    <!-- HERO -->
    <header class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 via-primary-800 to-accent-800 text-white px-8 py-10 mb-8 shadow-lg">
      <div
        aria-hidden="true"
        class="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-accent-400/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        class="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-primary-400/20 blur-3xl"
      />
      <div class="relative">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium mb-4">
          <Sparkles class="w-3.5 h-3.5" />
          新增 SOP
        </div>
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-3">
          把素材丟進來，<br class="sm:hidden">
          <span class="text-accent-200">AI 幫你寫成 SOP</span>
        </h1>
        <p class="text-sm sm:text-base text-primary-100 max-w-xl leading-relaxed">
          支援直接輸入文字、上傳訪談稿 / 文件 / 截圖，或載入先前下載的 SOP.json 繼續編輯。
        </p>
      </div>
    </header>

    <!-- RESUME (從 JSON 載入) -->
    <section class="mb-8 rounded-xl border border-dashed border-primary-200 bg-primary-50/40 p-4 sm:p-5 flex items-start gap-4">
      <div class="w-10 h-10 rounded-lg bg-white border border-primary-100 flex items-center justify-center shrink-0">
        <FolderOpen class="w-5 h-5 text-primary-700" />
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="text-sm font-semibold text-primary-700">已經有 SOP.json？</h2>
        <p class="text-xs text-gray-600 mt-0.5">
          載入先前下載的檔案，直接跳到結果頁繼續編輯。
        </p>
      </div>
      <button
        type="button"
        class="px-3 py-1.5 rounded-md border border-primary-300 bg-white text-xs font-medium text-primary-700 hover:bg-primary-50 transition-colors shrink-0"
        @click="pickSopJson"
      >
        載入 SOP.json
      </button>
      <input
        ref="sopJsonInput"
        type="file"
        class="hidden"
        accept=".json,application/json"
        @change="handleSopJsonSelect"
      />
    </section>

    <!-- BUILDER -->
    <section class="bg-white rounded-2xl ring-1 ring-gray-200 shadow-sm overflow-hidden">
      <div class="px-6 sm:px-8 py-5 border-b border-gray-100 bg-gradient-to-r from-primary-50/70 to-accent-50/50">
        <h2 class="text-lg font-semibold text-primary-700 flex items-center gap-2">
          <FileText class="w-5 h-5" />
          從素材建立新 SOP
        </h2>
        <p class="text-xs text-gray-600 mt-1">
          依序完成三個步驟，可同時用「直接輸入文字」與「上傳檔案」混合素材。
        </p>
      </div>

      <div class="p-6 sm:p-8 space-y-10">
        <!-- STEP 1 -->
        <div class="flex gap-4 sm:gap-5">
          <div
            class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold ring-1 transition-colors"
            :class="
              titleOk
                ? 'bg-success/10 text-success ring-success/30'
                : 'bg-primary-50 text-primary-700 ring-primary-200'
            "
          >
            <CheckCircle2 v-if="titleOk" class="w-5 h-5" />
            <span v-else>1</span>
          </div>
          <div class="flex-1 min-w-0">
            <label class="block">
              <div class="flex items-baseline justify-between mb-1.5">
                <span class="text-sm font-semibold text-gray-800">SOP 標題</span>
                <span class="text-xs text-gray-400">{{ title.length }}/80</span>
              </div>
              <input
                v-model="title"
                type="text"
                maxlength="80"
                placeholder="例：新員工帳號開通流程"
                class="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm bg-gray-50/60 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition"
              />
            </label>
          </div>
        </div>

        <!-- STEP 2 -->
        <div class="flex gap-4 sm:gap-5">
          <div
            class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold ring-1 transition-colors"
            :class="
              sourceOk
                ? 'bg-success/10 text-success ring-success/30'
                : 'bg-primary-50 text-primary-700 ring-primary-200'
            "
          >
            <CheckCircle2 v-if="sourceOk" class="w-5 h-5" />
            <span v-else>2</span>
          </div>
          <div class="flex-1 min-w-0 space-y-6">
            <div>
              <div class="flex items-baseline justify-between mb-1.5">
                <span class="text-sm font-semibold text-gray-800 inline-flex items-center gap-1.5">
                  <Type class="w-4 h-4 text-primary-600" />
                  直接輸入文字
                </span>
                <span
                  class="text-xs px-2 py-0.5 rounded-full transition-colors"
                  :class="
                    pastedCharCount === 0
                      ? 'bg-gray-100 text-gray-500'
                      : pastedCharCount < 50
                        ? 'bg-warning/10 text-warning'
                        : 'bg-success/10 text-success'
                  "
                >
                  {{ pastedCharCount }} 字
                  <span v-if="pastedCharCount > 0 && pastedCharCount < 50">· 還差 {{ 50 - pastedCharCount }}</span>
                  <span v-else-if="pastedCharCount >= 50">✓</span>
                </span>
              </div>
              <p class="text-xs text-gray-500 mb-2">
                描述流程、貼訪談摘要、貼會議筆記都可以；至少 50 字才會送出。
              </p>
              <textarea
                v-model="pastedText"
                rows="9"
                placeholder="例：&#10;新人要先寄信給 IT 組申請 AD 帳號，主旨寫『新進員工帳號申請』，附上身分證字號跟到職日。IT 拿到信會在 1 個工作天內回覆，附上初始密碼。新人第一次登入要在 24 小時內換掉密碼，不然帳號會被鎖。&#10;換密碼方式：Ctrl+Alt+Del → 變更密碼 → ..."
                class="block w-full rounded-lg border border-gray-300 px-3.5 py-3 text-sm bg-gray-50/60 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition leading-relaxed font-sans"
              />
            </div>

            <!-- DIVIDER -->
            <div class="flex items-center gap-3 text-xs text-gray-400">
              <span class="flex-1 h-px bg-gradient-to-r from-transparent to-gray-200" />
              <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">或加上 / 改用檔案</span>
              <span class="flex-1 h-px bg-gradient-to-l from-transparent to-gray-200" />
            </div>

            <div>
              <div class="flex items-baseline justify-between mb-2">
                <span class="text-sm font-semibold text-gray-800 inline-flex items-center gap-1.5">
                  <FileUp class="w-4 h-4 text-primary-600" />
                  上傳檔案
                </span>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="t in supportedTypes"
                    :key="t"
                    class="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
                  >
                    {{ t }}
                  </span>
                </div>
              </div>
              <FileUploader v-model:files="files" />
            </div>
          </div>
        </div>

        <!-- STEP 3 -->
        <div class="flex gap-4 sm:gap-5">
          <div
            class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold ring-1 transition-colors"
            :class="
              canStart
                ? 'bg-success/10 text-success ring-success/30'
                : 'bg-primary-50 text-primary-700 ring-primary-200'
            "
          >
            <CheckCircle2 v-if="canStart" class="w-5 h-5" />
            <span v-else>3</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline mb-2">
              <span class="text-sm font-semibold text-gray-800">準備檢查</span>
            </div>
            <ul class="space-y-1.5">
              <li
                v-for="c in checklist"
                :key="c.key"
                class="flex items-center gap-2 text-sm"
              >
                <span
                  class="w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors"
                  :class="c.ok ? 'bg-success text-white' : 'bg-gray-200 text-gray-400'"
                >
                  <CheckCircle2 v-if="c.ok" class="w-3 h-3" />
                </span>
                <span :class="c.ok ? 'text-gray-700' : 'text-gray-500'">
                  {{ c.label }}
                </span>
                <span v-if="!c.ok" class="text-xs text-gray-400">— {{ c.hint }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- BYOK warning -->
    <div
      v-if="!byokReady"
      class="mt-6 flex items-start gap-3 px-4 py-3 rounded-lg bg-warning/10 border border-warning/30 text-sm"
    >
      <KeyRound class="w-5 h-5 text-warning shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="font-medium text-warning">尚未設定 Anthropic API key</p>
        <p class="text-xs text-gray-600 mt-0.5">
          請先到
          <RouterLink :to="{ name: 'settings' }" class="text-primary-700 font-medium underline">個人設定</RouterLink>
          貼上自己的 key，才能執行抽取。
        </p>
      </div>
    </div>

    <p
      v-if="error"
      class="mt-4 text-sm text-danger bg-danger/10 px-3 py-2 rounded-md"
    >
      {{ error }}
    </p>

    <!-- STICKY ACTION BAR -->
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-3xl z-20 pointer-events-none">
      <div class="pointer-events-auto bg-white/95 backdrop-blur rounded-xl ring-1 ring-gray-200 shadow-xl p-3 sm:p-4 flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <div
            class="text-sm font-semibold flex items-center gap-1.5"
            :class="canStart ? 'text-success' : 'text-gray-500'"
          >
            <CheckCircle2 v-if="canStart" class="w-4 h-4" />
            <span v-else class="w-4 h-4 rounded-full border-2 border-gray-300 inline-block" />
            {{ canStart ? '已準備好，可開始抽取' : '尚未滿足條件' }}
          </div>
          <div class="text-xs text-gray-500 mt-0.5 truncate">
            <template v-for="(c, i) in checklist" :key="c.key">
              <span :class="c.ok ? 'text-gray-600' : 'text-gray-400'">
                {{ c.ok ? '✓' : '○' }} {{ c.label }}
              </span>
              <span v-if="i < checklist.length - 1" class="mx-1.5 text-gray-300">·</span>
            </template>
          </div>
        </div>
        <button
          type="button"
          class="px-4 sm:px-6 py-2.5 rounded-lg bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shadow-md hover:shadow-lg shrink-0"
          :disabled="!canStart"
          @click="start"
        >
          開始抽取
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
