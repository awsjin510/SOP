<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Sparkles, FileText } from 'lucide-vue-next';
import FileUploader from '@/components/FileUploader.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { useAuthStore } from '@/stores/auth';
import { getSop } from '@/services/sop';
import { createJob } from '@/services/job';
import {
  runUpdateSopPipeline,
  UPDATE_SOP_SUBTASKS,
  type UpdateChangeListFormat,
} from '@/core/pipelines/update-sop';
import type { SopDoc } from '@/types/firestore';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const sopId = computed(() => route.params['id'] as string);

const sop = ref<SopDoc | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const step = ref<1 | 2 | 3>(1);
const files = ref<File[]>([]);
const changeSummary = ref<string>('');

onMounted(async () => {
  try {
    const s = await getSop(sopId.value);
    if (!s) {
      error.value = '找不到此 SOP';
      return;
    }
    sop.value = s;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});

const changeListFile = computed<File | null>(() => files.value[0] ?? null);

const detectedFormat = computed<UpdateChangeListFormat>(() => {
  const f = changeListFile.value;
  if (!f) return 'markdown';
  const name = f.name.toLowerCase();
  if (name.endsWith('.docx')) return 'docx';
  return 'markdown';
});

const canNextFromStep1 = computed(
  () => files.value.length > 0 && changeListFile.value !== null,
);

function goNext(): void {
  if (step.value < 3) step.value = (step.value + 1) as 1 | 2 | 3;
}
function goPrev(): void {
  if (step.value > 1) step.value = (step.value - 1) as 1 | 2 | 3;
}

async function startProcessing(): Promise<void> {
  if (!authStore.authUser || !changeListFile.value || !sop.value) return;
  submitting.value = true;
  submitError.value = null;

  try {
    const uid = authStore.authUser.uid;
    const jobId = await createJob({
      owner: uid,
      type: 'update_sop',
      sopId: sopId.value,
      subtasks: [...UPDATE_SOP_SUBTASKS],
    });

    void runUpdateSopPipeline({
      jobId,
      uid,
      sopId: sopId.value,
      changeListFile: changeListFile.value,
      changeListFormat: detectedFormat.value,
      ...(changeSummary.value.trim()
        ? { changeSummary: changeSummary.value.trim() }
        : {}),
      appliedBy: authStore.userDoc?.email ?? authStore.authUser.email ?? uid,
    }).catch((err: unknown) => {
      console.error('[update-sop pipeline]', err);
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
    <RouterLink
      :to="{ name: 'sop-detail', params: { id: sopId } }"
      class="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary-700 mb-4"
    >
      <ArrowLeft class="w-4 h-4" />
      返回 SOP
    </RouterLink>

    <h1 class="text-2xl font-semibold text-primary-700 mb-6">更新 SOP</h1>

    <section v-if="loading" class="bg-white rounded-lg border border-gray-200 p-6">
      <LoadingSpinner label="正在載入 SOP…" />
    </section>

    <section
      v-else-if="error || !sop"
      class="bg-danger/10 border border-danger/30 rounded-lg p-4 text-sm text-danger"
    >
      {{ error ?? '找不到 SOP' }}
    </section>

    <template v-else>
      <!-- Banner -->
      <div class="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
        <p class="text-sm text-primary-700">
          您正在更新：
          <span class="font-semibold">{{ sop.title }}</span>
          <span class="ml-2 px-2 py-0.5 bg-white text-primary-700 rounded text-xs font-medium border border-primary-200">
            v{{ sop.currentVersion }}
          </span>
        </p>
        <p class="text-xs text-primary-700/70 mt-1">
          {{ sop.stepsCount }} 步驟 · {{ sop.troubleshootingCount }} 個 troubleshooting · {{ sop.glossaryCount }} 個術語
        </p>
      </div>

      <!-- 步驟指示 -->
      <ol class="flex items-center gap-2 mb-8 text-xs text-gray-500">
        <li
          v-for="(label, idx) in ['上傳修改清單', '變更摘要', '確認啟動']"
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
          <span v-if="idx < 2" class="text-gray-300">→</span>
        </li>
      </ol>

      <!-- Step 1: 上傳 -->
      <section
        v-if="step === 1"
        class="bg-white rounded-lg border border-gray-200 p-6"
      >
        <h2 class="font-semibold text-primary-700 mb-3">
          步驟 1 / 3：上傳修改清單
        </h2>
        <p class="text-sm text-gray-600 mb-4">
          支援 .docx（Word 表格 / 條列）或 .md（Markdown 條列）。W7 起會支援會議紀錄、廠商通知等其他格式。
        </p>
        <FileUploader
          :files="files"
          :multiple="false"
          accept=".docx,.md"
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

      <!-- Step 2: 變更摘要 -->
      <section
        v-else-if="step === 2"
        class="bg-white rounded-lg border border-gray-200 p-6"
      >
        <h2 class="font-semibold text-primary-700 mb-3">步驟 2 / 3：變更摘要</h2>
        <p class="text-sm text-gray-600 mb-4">
          一句話描述本次更新（會記錄在版本歷史中，幫助未來追溯）。
        </p>
        <label class="block">
          <span class="text-sm font-medium text-gray-700">變更摘要（選填）</span>
          <input
            v-model="changeSummary"
            type="text"
            class="mt-1 w-full rounded-md border-gray-300 border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            placeholder="例：更新 Security Group 設定章節"
          />
        </label>

        <div class="mt-4 text-sm bg-gray-50 rounded-md p-3 flex items-center gap-3">
          <FileText class="w-4 h-4 text-gray-500 shrink-0" />
          <span class="flex-1 truncate">{{ changeListFile?.name }}</span>
          <span class="text-xs text-gray-500">{{ detectedFormat }}</span>
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

      <!-- Step 3: 確認啟動 -->
      <section v-else class="bg-white rounded-lg border border-gray-200 p-6">
        <h2 class="font-semibold text-primary-700 mb-3">步驟 3 / 3：確認啟動</h2>

        <dl class="text-sm space-y-2 mb-6">
          <div class="flex">
            <dt class="w-24 text-gray-500">SOP</dt>
            <dd class="text-gray-900 font-medium">{{ sop.title }}</dd>
          </div>
          <div class="flex">
            <dt class="w-24 text-gray-500">當前版本</dt>
            <dd>v{{ sop.currentVersion }}</dd>
          </div>
          <div class="flex">
            <dt class="w-24 text-gray-500">修改清單</dt>
            <dd>{{ changeListFile?.name }}</dd>
          </div>
          <div v-if="changeSummary" class="flex">
            <dt class="w-24 text-gray-500">變更摘要</dt>
            <dd>{{ changeSummary }}</dd>
          </div>
        </dl>

        <p class="text-xs text-gray-500 mb-4">
          系統會抽取變更意圖並自動套用到 IR，產出新版本（semver 自動 bump）。預估費用 $0.30–$1.50。
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
            {{ submitting ? '正在啟動…' : '🚀 開始更新' }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
