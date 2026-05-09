<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-vue-next';
import { subscribeJob, type ProcessingJob } from '@/services/job';

const route = useRoute();
const router = useRouter();

const jobId = computed(() => route.params['jobId'] as string);
const job = ref<ProcessingJob | null>(null);
const error = ref<string | null>(null);
let unsubscribe: (() => void) | null = null;

onMounted(() => {
  if (!jobId.value) {
    error.value = '缺少 jobId';
    return;
  }
  unsubscribe = subscribeJob(jobId.value, (j) => {
    job.value = j;
    if (j?.status === 'completed' && j.result) {
      // 完成後 1.5 秒自動轉到 SOP 詳細頁
      setTimeout(() => {
        void router.push({
          name: 'sop-detail',
          params: { id: j.result!.sopId },
        });
      }, 1500);
    }
  });
});
onUnmounted(() => unsubscribe?.());

const statusLabel: Record<string, string> = {
  pending: '排隊中',
  uploading: '上傳中',
  extracting: '抽取中',
  building_ir: '建構 IR',
  enhancing: '內訓增強',
  merging: '匯流',
  awaiting_review: '等待審核',
  rendering: '產文件',
  completed: '已完成',
  failed: '失敗',
  cancelled: '已取消',
};

function statusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-success';
    case 'failed':
    case 'cancelled':
      return 'text-danger';
    default:
      return 'text-primary-700';
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-semibold text-primary-700 mb-6">處理進度</h1>

    <p v-if="error" class="text-danger">{{ error }}</p>

    <section
      v-else-if="!job"
      class="bg-white rounded-lg border border-gray-200 p-8 text-center"
    >
      <Loader2 class="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
      <p class="text-sm text-gray-600">載入任務中…</p>
    </section>

    <section v-else class="space-y-6">
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <div class="flex items-baseline gap-3 mb-3">
          <span
            class="text-sm font-medium uppercase tracking-wide"
            :class="statusClass(job.status)"
          >
            {{ statusLabel[job.status] ?? job.status }}
          </span>
          <span class="text-sm text-gray-500">{{ job.currentStep }}</span>
          <span class="ml-auto text-2xl font-semibold text-primary-700">
            {{ job.progress }}%
          </span>
        </div>

        <div class="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            class="h-full bg-primary-500 transition-[width] duration-300"
            :style="{ width: `${job.progress}%` }"
          />
        </div>

        <ul class="space-y-2 text-sm">
          <li
            v-for="task in job.subtasks"
            :key="task.name"
            class="flex items-center gap-2"
          >
            <CheckCircle2
              v-if="task.status === 'completed'"
              class="w-4 h-4 text-success shrink-0"
            />
            <Loader2
              v-else-if="task.status === 'running'"
              class="w-4 h-4 text-primary-500 animate-spin shrink-0"
            />
            <AlertCircle
              v-else-if="task.status === 'failed'"
              class="w-4 h-4 text-danger shrink-0"
            />
            <Circle v-else class="w-4 h-4 text-gray-300 shrink-0" />
            <span
              :class="
                task.status === 'completed'
                  ? 'text-gray-700'
                  : task.status === 'running'
                    ? 'text-primary-700 font-medium'
                    : task.status === 'failed'
                      ? 'text-danger'
                      : 'text-gray-400'
              "
            >
              {{ task.name }}
            </span>
            <span
              v-if="task.message"
              class="text-xs text-gray-500 ml-auto"
            >
              {{ task.message }}
            </span>
          </li>
        </ul>
      </div>

      <!-- 失敗 -->
      <section
        v-if="job.status === 'failed' && job.error"
        class="bg-danger/10 border border-danger/30 rounded-lg p-4 text-sm text-danger"
      >
        <p class="font-medium mb-1">處理失敗</p>
        <p>{{ job.error.message }}</p>
      </section>

      <!-- 完成 -->
      <section
        v-if="job.status === 'completed' && job.result"
        class="bg-success/10 border border-success/30 rounded-lg p-4 text-sm"
      >
        <p class="font-medium text-success mb-2">✓ SOP 已建立</p>
        <RouterLink
          :to="{ name: 'sop-detail', params: { id: job.result.sopId } }"
          class="inline-flex items-center gap-1 text-primary-700 hover:underline"
        >
          前往 {{ job.result.sopId }}
          <ArrowRight class="w-4 h-4" />
        </RouterLink>
      </section>
    </section>
  </div>
</template>
