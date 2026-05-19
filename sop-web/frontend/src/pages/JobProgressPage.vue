<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { useCurrentJobStore } from '@/stores/current-job';
import { useSopStore } from '@/stores/sop';
import { runMvpExtractionPipeline } from '@/core/pipelines/mvp';

const router = useRouter();
const jobStore = useCurrentJobStore();
const sopStore = useSopStore();

const percent = computed(() => jobStore.percent);
const status = computed(() => jobStore.status);
const message = computed(() => jobStore.message);
const error = computed(() => jobStore.error);

async function run(): Promise<void> {
  try {
    const result = await runMvpExtractionPipeline(
      { files: jobStore.files, title: jobStore.title },
      (p) => jobStore.report(p.status, p.percent, p.message),
    );
    sopStore.setCurrent(result);
    jobStore.succeed();
    await router.replace({ name: 'result' });
  } catch (err) {
    jobStore.fail(err instanceof Error ? err.message : String(err));
  }
}

onMounted(() => {
  if (!jobStore.hasFiles) {
    void router.replace({ name: 'new' });
    return;
  }
  if (jobStore.status === 'idle') {
    void run();
  }
});

async function back(): Promise<void> {
  jobStore.reset();
  await router.push({ name: 'new' });
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-6 py-16">
    <h1 class="text-2xl font-semibold text-primary-700 mb-2">
      AI 正在抽取 SOP
    </h1>
    <p class="text-sm text-gray-600 mb-8">
      請勿關閉這個分頁。處理時間視素材大小，通常 30 秒至 2 分鐘。
    </p>

    <div v-if="!error" class="bg-white rounded-lg border border-gray-200 p-6">
      <div class="flex items-center gap-3 mb-4">
        <LoadingSpinner v-if="status !== 'completed'" label="" size="sm" />
        <span class="text-sm text-gray-700">{{ message || '準備中…' }}</span>
        <span class="ml-auto text-sm font-mono text-gray-500">{{ percent }}%</span>
      </div>
      <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-primary-700 transition-[width]"
          :style="{ width: `${percent}%` }"
        />
      </div>
    </div>

    <div
      v-else
      class="bg-danger/10 border border-danger/30 rounded-lg p-6"
    >
      <p class="font-medium text-danger mb-2">抽取失敗</p>
      <p class="text-sm text-gray-700 whitespace-pre-wrap mb-4">{{ error }}</p>
      <button
        type="button"
        class="px-4 py-2 rounded-md bg-white border border-gray-300 text-sm hover:bg-gray-50"
        @click="back"
      >
        回上一步重試
      </button>
    </div>
  </div>
</template>
