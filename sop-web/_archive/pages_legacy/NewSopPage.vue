<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { nanoid } from 'nanoid';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Mic,
} from 'lucide-vue-next';
import FileUploader from '@/components/FileUploader.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { useAuthStore } from '@/stores/auth';
import { slugify, generateFallbackSopId } from '@/services/sop';
import { createJob } from '@/services/job';
import {
  runCreateSopPipeline,
  CREATE_SOP_SUBTASKS,
  classifyFile,
  type ClassifiedFile,
  type ClassifiedFileType,
} from '@/core/pipelines/create-sop';

const authStore = useAuthStore();
const router = useRouter();

const step = ref<1 | 2 | 3 | 4>(1);
const files = ref<File[]>([]);
const classifications = ref<Map<string, ClassifiedFileType>>(new Map());
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

// 上傳新檔案時自動分類
watch(
  files,
  (newFiles) => {
    const next = new Map(classifications.value);
    const keys = new Set<string>();
    for (const f of newFiles) {
      const k = fileKey(f);
      keys.add(k);
      if (!next.has(k)) {
        next.set(k, classifyFile(f));
      }
    }
    // 移除已不存在檔案的分類
    for (const k of next.keys()) {
      if (!keys.has(k)) next.delete(k);
    }
    classifications.value = next;
  },
  { immediate: true },
);

function fileKey(f: File): string {
  return `${f.name}::${f.size}`;
}

const classifiedFiles = computed<ClassifiedFile[]>(() =>
  files.value.map((file) => ({
    file,
    type: classifications.value.get(fileKey(file)) ?? classifyFile(file),
  })),
);

const counts = computed(() => {
  const c = { transcript: 0, document: 0, screenshot: 0 };
  for (const cf of classifiedFiles.value) c[cf.type]++;
  return c;
});

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

function setClassification(file: File, type: ClassifiedFileType): void {
  const next = new Map(classifications.value);
  next.set(fileKey(file), type);
  classifications.value = next;
}

const typeLabels: Record<ClassifiedFileType, string> = {
  transcript: '訪談逐字稿',
  document: '既有文件',
  screenshot: '操作截圖',
};

async function startProcessing(): Promise<void> {
  if (!authStore.authUser || classifiedFiles.value.length === 0) return;
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

    void runCreateSopPipeline({
      jobId,
      uid,
      files: classifiedFiles.value,
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
      <h2 class="font-semibold text-primary-700 mb-3">步驟 1 / 4：上傳素材</h2>
      <p class="text-sm text-gray-600 mb-4">
        支援訪談（.txt/.md）、文件（.docx/.pdf）、截圖（.png/.jpg/.webp）混合上傳。
      </p>
      <FileUploader
        :files="files"
        :multiple="true"
        accept=".txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp"
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

    <!-- Step 2: 分類確認 -->
    <section
      v-else-if="step === 2"
      class="bg-white rounded-lg border border-gray-200 p-6"
    >
      <h2 class="font-semibold text-primary-700 mb-3">步驟 2 / 4：確認分類</h2>
      <p class="text-sm text-gray-600 mb-4">
        系統依檔名自動分類；錯了可下拉調整。
      </p>

      <ul class="text-sm space-y-2">
        <li
          v-for="cf in classifiedFiles"
          :key="`${cf.file.name}-${cf.file.size}`"
          class="flex items-center gap-3 bg-gray-50 px-3 py-2 rounded-md"
        >
          <component
            :is="
              cf.type === 'screenshot'
                ? ImageIcon
                : cf.type === 'document'
                  ? FileText
                  : Mic
            "
            class="w-4 h-4 text-gray-500 shrink-0"
          />
          <span class="flex-1 truncate">{{ cf.file.name }}</span>
          <select
            :value="cf.type"
            class="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:border-primary-500 focus:outline-none"
            @change="
              (e) =>
                setClassification(
                  cf.file,
                  (e.target as HTMLSelectElement).value as ClassifiedFileType,
                )
            "
          >
            <option value="transcript">訪談逐字稿</option>
            <option value="document">既有文件</option>
            <option value="screenshot">操作截圖</option>
          </select>
        </li>
      </ul>

      <div class="mt-4 text-xs text-gray-500 flex gap-4">
        <span>訪談 {{ counts.transcript }}</span>
        <span>·</span>
        <span>文件 {{ counts.document }}</span>
        <span>·</span>
        <span>截圖 {{ counts.screenshot }}</span>
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
    <section v-else class="bg-white rounded-lg border border-gray-200 p-6">
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
        <div class="flex">
          <dt class="w-24 text-gray-500">難度</dt>
          <dd>{{ meta.difficulty }}</dd>
        </div>
        <div class="flex">
          <dt class="w-24 text-gray-500">素材</dt>
          <dd>
            <span v-if="counts.transcript > 0">
              {{ counts.transcript }} 份{{ typeLabels.transcript }}
            </span>
            <span v-if="counts.document > 0">
              · {{ counts.document }} 份{{ typeLabels.document }}
            </span>
            <span v-if="counts.screenshot > 0">
              · {{ counts.screenshot }} 張{{ typeLabels.screenshot }}
            </span>
          </dd>
        </div>
      </dl>

      <p class="text-xs text-gray-500 mb-4">
        Claude 會分析多源素材、做內訓增強，預估花費 $0.50–$3.00（依素材量）。
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
