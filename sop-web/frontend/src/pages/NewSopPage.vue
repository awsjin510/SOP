<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { nanoid } from 'nanoid';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-vue-next';
import FileUploader from '@/components/FileUploader.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { useAuthStore } from '@/stores/auth';
import {
  slugify,
  generateFallbackSopId,
} from '@/services/sop';
import { createJob } from '@/services/job';
import { runCreateSopPipeline, CREATE_SOP_SUBTASKS } from '@/core/pipelines/create-sop';

const authStore = useAuthStore();
const router = useRouter();

const step = ref<1 | 2 | 3 | 4>(1);
const files = ref<File[]>([]);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const meta = ref<{
  title: string;
  category: string;
  targetAudience: string;
  difficulty: '初級' | '中級' | '進階';
  estimatedDurationMinutes: number | null;
  tags: string;
}>({
  title: '',
  category: '',
  targetAudience: '',
  difficulty: '初級',
  estimatedDurationMinutes: null,
  tags: '',
});

// W3 只接受訪談；如果使用者上傳多個檔案，第一個被當訪談，其他列出但不處理
const transcriptFile = computed(() => files.value[0] ?? null);

const sopIdPreview = computed(() => {
  const slug = slugify(meta.value.title);
  return slug || generateFallbackSopId(() => nanoid(8));
});

const canNextFromStep1 = computed(() => files.value.length > 0);
const canNextFromStep3 = computed(
  () =>
    meta.value.title.trim().length > 0 &&
    meta.value.targetAudience.trim().length > 0,
);

function goNext(): void {
  if (step.value < 4) step.value = (step.value + 1) as 1 | 2 | 3 | 4;
}

function goPrev(): void {
  if (step.value > 1) step.value = (step.value - 1) as 1 | 2 | 3 | 4;
}

async function startProcessing(): Promise<void> {
  if (!authStore.authUser || !transcriptFile.value) return;
  submitting.value = true;
  submitError.value = null;

  const uid = authStore.authUser.uid;

  try {
    const sopId = sopIdPreview.value;
    const jobId = await createJob({
      owner: uid,
      type: 'create_sop',
      sopId,
      subtasks: [...CREATE_SOP_SUBTASKS],
    });

    // 啟動 pipeline（不 await，立刻導向進度頁）
    void runCreateSopPipeline({
      jobId,
      uid,
      transcriptFile: transcriptFile.value,
      meta: {
        sopId,
        title: meta.value.title.trim(),
        targetAudience: meta.value.targetAudience.trim(),
        ...(meta.value.category.trim()
          ? { category: meta.value.category.trim() }
          : {}),
        ...(meta.value.difficulty ? { difficulty: meta.value.difficulty } : {}),
        ...(meta.value.estimatedDurationMinutes
          ? { estimatedDurationMinutes: meta.value.estimatedDurationMinutes }
          : {}),
        ...(meta.value.tags.trim()
          ? {
              tags: meta.value.tags
                .split(/[,，\s]+/)
                .map((t) => t.trim())
                .filter(Boolean),
            }
          : {}),
        authors: [authStore.userDoc?.email ?? authStore.authUser.email ?? uid],
      },
    }).catch((err: unknown) => {
      // pipeline 內部已寫 job.status='failed'；這裡只記錄
      console.error('[create-sop pipeline]', err);
    });

    await router.push({ name: 'job-progress', params: { jobId } });
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err);
    submitting.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-semibold text-primary-700 mb-6">建立新 SOP</h1>

    <!-- 步驟指示 -->
    <ol class="flex items-center gap-2 mb-8 text-xs text-gray-500">
      <li
        v-for="(label, idx) in ['上傳素材', '確認分類', '基本資訊', '確認啟動']"
        :key="label"
        class="flex items-center gap-2"
      >
        <span
          class="w-6 h-6 rounded-full flex items-center justify-center font-medium"
          :class="
            step > idx + 1
              ? 'bg-primary-700 text-white'
              : step === idx + 1
                ? 'bg-primary-100 text-primary-700 border border-primary-700'
                : 'bg-gray-100 text-gray-400'
          "
        >
          {{ idx + 1 }}
        </span>
        <span :class="step === idx + 1 ? 'text-primary-700 font-medium' : ''">
          {{ label }}
        </span>
        <span v-if="idx < 3" class="text-gray-300">→</span>
      </li>
    </ol>

    <!-- Step 1: 上傳 -->
    <section
      v-if="step === 1"
      class="bg-white rounded-lg border border-gray-200 p-6"
    >
      <h2 class="font-semibold text-primary-700 mb-3">步驟 1 / 4：上傳訪談逐字稿</h2>
      <p class="text-sm text-gray-600 mb-4">
        W3 階段只支援訪談逐字稿（.txt / .md）。多素材整合留 W4。
      </p>
      <FileUploader
        :files="files"
        :multiple="false"
        accept=".txt,.md"
        @update:files="(v) => (files = v)"
      />

      <div class="flex justify-end mt-6">
        <button
          type="button"
          class="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 disabled:opacity-50"
          :disabled="!canNextFromStep1"
          @click="goNext"
        >
          下一步
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>
    </section>

    <!-- Step 2: 分類確認（W3 只一種類型，純展示） -->
    <section
      v-else-if="step === 2"
      class="bg-white rounded-lg border border-gray-200 p-6"
    >
      <h2 class="font-semibold text-primary-700 mb-3">步驟 2 / 4：確認分類</h2>
      <p class="text-sm text-gray-600 mb-4">
        W3 階段所有上傳檔案都被當作「訪談逐字稿」。多類型自動分類在 W4。
      </p>
      <ul class="text-sm bg-gray-50 rounded-md p-3 space-y-1">
        <li v-if="transcriptFile" class="flex items-center justify-between">
          <span>{{ transcriptFile.name }}</span>
          <span class="text-xs text-primary-700 font-medium">訪談逐字稿</span>
        </li>
      </ul>

      <div class="flex justify-between mt-6">
        <button
          type="button"
          class="inline-flex items-center gap-1 px-4 py-2 rounded-md text-sm text-gray-600 hover:text-primary-700"
          @click="goPrev"
        >
          <ArrowLeft class="w-4 h-4" />
          上一步
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800"
          @click="goNext"
        >
          下一步
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>
    </section>

    <!-- Step 3: 基本資訊 -->
    <section
      v-else-if="step === 3"
      class="bg-white rounded-lg border border-gray-200 p-6"
    >
      <h2 class="font-semibold text-primary-700 mb-3">步驟 3 / 4：基本資訊</h2>

      <div class="space-y-4">
        <label class="block">
          <span class="text-sm font-medium text-gray-700">標題 *</span>
          <input
            v-model="meta.title"
            type="text"
            class="mt-1 w-full rounded-md border-gray-300 border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            placeholder="例：EC2 啟動 SOP"
          />
          <span class="text-xs text-gray-500 mt-1 block">
            sop_id 會自動產生：
            <code class="bg-gray-100 px-1 rounded">{{ sopIdPreview }}</code>
          </span>
        </label>

        <label class="block">
          <span class="text-sm font-medium text-gray-700">適用對象 *</span>
          <input
            v-model="meta.targetAudience"
            type="text"
            class="mt-1 w-full rounded-md border-gray-300 border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            placeholder="例：新進雲端工程師 / 入職 0-3 個月"
          />
        </label>

        <div class="grid sm:grid-cols-2 gap-4">
          <label class="block">
            <span class="text-sm font-medium text-gray-700">分類</span>
            <input
              v-model="meta.category"
              type="text"
              class="mt-1 w-full rounded-md border-gray-300 border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="例：AWS 操作"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-gray-700">難度</span>
            <select
              v-model="meta.difficulty"
              class="mt-1 w-full rounded-md border-gray-300 border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            >
              <option value="初級">初級</option>
              <option value="中級">中級</option>
              <option value="進階">進階</option>
            </select>
          </label>
        </div>

        <div class="grid sm:grid-cols-2 gap-4">
          <label class="block">
            <span class="text-sm font-medium text-gray-700">預估時間（分鐘）</span>
            <input
              v-model.number="meta.estimatedDurationMinutes"
              type="number"
              min="0"
              class="mt-1 w-full rounded-md border-gray-300 border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="留空讓系統估"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-gray-700">標籤（用逗號分隔）</span>
            <input
              v-model="meta.tags"
              type="text"
              class="mt-1 w-full rounded-md border-gray-300 border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="aws, ec2, 新人必學"
            />
          </label>
        </div>
      </div>

      <div class="flex justify-between mt-6">
        <button
          type="button"
          class="inline-flex items-center gap-1 px-4 py-2 rounded-md text-sm text-gray-600 hover:text-primary-700"
          @click="goPrev"
        >
          <ArrowLeft class="w-4 h-4" />
          上一步
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 disabled:opacity-50"
          :disabled="!canNextFromStep3"
          @click="goNext"
        >
          下一步
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>
    </section>

    <!-- Step 4: 確認啟動 -->
    <section
      v-else
      class="bg-white rounded-lg border border-gray-200 p-6"
    >
      <h2 class="font-semibold text-primary-700 mb-3">步驟 4 / 4：確認啟動</h2>

      <dl class="text-sm space-y-2 mb-6">
        <div class="flex">
          <dt class="w-24 text-gray-500">標題</dt>
          <dd class="text-gray-900 font-medium">{{ meta.title }}</dd>
        </div>
        <div class="flex">
          <dt class="w-24 text-gray-500">sop_id</dt>
          <dd>
            <code class="bg-gray-100 px-1 rounded">{{ sopIdPreview }}</code>
          </dd>
        </div>
        <div class="flex">
          <dt class="w-24 text-gray-500">適用對象</dt>
          <dd>{{ meta.targetAudience }}</dd>
        </div>
        <div v-if="meta.category" class="flex">
          <dt class="w-24 text-gray-500">分類</dt>
          <dd>{{ meta.category }}</dd>
        </div>
        <div class="flex">
          <dt class="w-24 text-gray-500">難度</dt>
          <dd>{{ meta.difficulty }}</dd>
        </div>
        <div class="flex">
          <dt class="w-24 text-gray-500">素材</dt>
          <dd>{{ transcriptFile?.name ?? '—' }}</dd>
        </div>
      </dl>

      <p class="text-xs text-gray-500 mb-4">
        Claude 會分析訪談逐字稿產出 SOP，過程中會花費約 $0.30–$1.00（依長度）。
      </p>

      <p
        v-if="submitError"
        class="text-sm text-danger bg-danger/10 px-3 py-2 rounded-md mb-4"
      >
        {{ submitError }}
      </p>

      <div class="flex justify-between">
        <button
          type="button"
          class="inline-flex items-center gap-1 px-4 py-2 rounded-md text-sm text-gray-600 hover:text-primary-700"
          :disabled="submitting"
          @click="goPrev"
        >
          <ArrowLeft class="w-4 h-4" />
          上一步
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800 disabled:opacity-50"
          :disabled="submitting"
          @click="startProcessing"
        >
          <LoadingSpinner v-if="submitting" label="" size="sm" />
          <Sparkles v-else class="w-4 h-4" />
          {{ submitting ? '正在啟動…' : '🚀 開始處理' }}
        </button>
      </div>
    </section>
  </div>
</template>
