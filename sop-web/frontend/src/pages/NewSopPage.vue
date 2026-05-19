<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { FileText, FolderOpen } from 'lucide-vue-next';
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

const title = ref('');
const files = ref<File[]>([]);
const error = ref<string | null>(null);

const byokReady = computed(() => hasStoredKey());

const canStart = computed(
  () => byokReady.value && title.value.trim().length > 0 && files.value.length > 0,
);

async function start(): Promise<void> {
  if (!canStart.value) return;
  error.value = null;

  const uploaded: JobUploadedFile[] = files.value.map((f) => ({
    name: f.name,
    type: classifyUploadedFile(f),
    blob: f,
    size: f.size,
  }));

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
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-10">
    <h1 class="text-2xl font-semibold text-primary-700 mb-2">建立新 SOP</h1>
    <p class="text-sm text-gray-600 mb-6">
      上傳訪談稿、文件或截圖，或載入先前下載的 SOP.json 繼續編輯。
    </p>

    <!-- 載入 SOP.json -->
    <section class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <h2 class="text-base font-semibold text-primary-700 mb-2">
        <FolderOpen class="inline w-4 h-4 mr-1" />
        從 SOP.json 繼續編輯
      </h2>
      <p class="text-sm text-gray-600 mb-3">
        把先前下載的 .sop.json 檔丟回來，直接跳到結果頁繼續操作。
      </p>
      <button
        type="button"
        class="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
        @click="pickSopJson"
      >
        選擇 SOP.json
      </button>
      <input
        ref="sopJsonInput"
        type="file"
        class="hidden"
        accept=".json,application/json"
        @change="handleSopJsonSelect"
      />
    </section>

    <div class="text-center text-xs text-gray-400 mb-6">— 或 —</div>

    <!-- 新建 -->
    <section class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <h2 class="text-base font-semibold text-primary-700 mb-3">
        <FileText class="inline w-4 h-4 mr-1" />
        從素材建立新 SOP
      </h2>

      <label class="block mb-4">
        <span class="text-sm text-gray-700">SOP 標題</span>
        <input
          v-model="title"
          type="text"
          maxlength="80"
          placeholder="例：新員工帳號開通流程"
          class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <FileUploader v-model:files="files" />
    </section>

    <p
      v-if="error"
      class="mb-3 text-sm text-danger bg-danger/10 px-3 py-2 rounded-md"
    >
      {{ error }}
    </p>

    <div
      v-if="!byokReady"
      class="mb-3 text-sm bg-yellow-50 border border-yellow-300 text-yellow-900 px-3 py-2 rounded-md"
    >
      尚未在
      <RouterLink :to="{ name: 'settings' }" class="underline">個人設定</RouterLink>
      設定 Anthropic API key，無法執行抽取。
    </div>

    <button
      type="button"
      class="px-6 py-3 rounded-md bg-primary-700 text-white font-medium hover:bg-primary-800 transition-colors disabled:opacity-50"
      :disabled="!canStart"
      @click="start"
    >
      開始抽取
    </button>
  </div>
</template>
