<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { FileText, FolderOpen, MessageSquare } from 'lucide-vue-next';
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
const pastedText = ref('');
const error = ref<string | null>(null);

const byokReady = computed(() => hasStoredKey());

const trimmedText = computed(() => pastedText.value.trim());
const pastedCharCount = computed(() => trimmedText.value.length);

const canStart = computed(() => {
  if (!byokReady.value) return false;
  if (title.value.trim().length === 0) return false;
  return files.value.length > 0 || pastedCharCount.value >= 50;
});

async function start(): Promise<void> {
  if (!canStart.value) return;
  error.value = null;

  const uploaded: JobUploadedFile[] = [];

  // 文字直接輸入優先：包成 transcript-type 的虛擬檔
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
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-10">
    <h1 class="text-2xl font-semibold text-primary-700 mb-2">建立新 SOP</h1>
    <p class="text-sm text-gray-600 mb-6">
      直接輸入文字、上傳訪談稿 / 文件 / 截圖，或載入先前下載的 SOP.json 繼續編輯。
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

      <!-- 直接輸入文字 -->
      <label class="block mb-5">
        <span class="text-sm text-gray-700 inline-flex items-center gap-1">
          <MessageSquare class="w-3.5 h-3.5" />
          直接輸入文字（描述流程、貼訪談摘要、貼會議筆記都可以）
        </span>
        <textarea
          v-model="pastedText"
          rows="8"
          placeholder="例：
新人要先寄信給 IT 組申請 AD 帳號，主旨寫『新進員工帳號申請』，附上身分證字號跟到職日。IT 拿到信會在 1 個工作天內回覆，附上初始密碼。新人第一次登入要在 24 小時內換掉密碼，不然帳號會被鎖。
換密碼方式：Ctrl+Alt+Del → 變更密碼 → ...

（至少 50 字，內容越完整 SOP 越好）"
          class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-sans leading-relaxed"
        />
        <span
          class="text-xs mt-1 block"
          :class="
            pastedCharCount === 0
              ? 'text-gray-400'
              : pastedCharCount < 50
                ? 'text-yellow-700'
                : 'text-gray-500'
          "
        >
          {{ pastedCharCount }} 字 · {{ pastedCharCount === 0
            ? '可空白；若空白請改上傳檔案'
            : pastedCharCount < 50
              ? '太短，至少 50 字才會送出'
              : '✓ 將以這段文字作為主要素材' }}
        </span>
      </label>

      <div class="my-5 flex items-center gap-3 text-xs text-gray-400">
        <span class="flex-1 h-px bg-gray-200" />
        以下可加 / 或直接上傳檔案
        <span class="flex-1 h-px bg-gray-200" />
      </div>

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
