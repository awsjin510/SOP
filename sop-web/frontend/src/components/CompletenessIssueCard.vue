<script setup lang="ts">
import { Info, CheckCircle2 } from 'lucide-vue-next';
import type { CompletenessIssueReview } from '@/services/job';

interface Props {
  issue: CompletenessIssueReview;
  active?: boolean;
}

defineProps<Props>();
const emit = defineEmits<{
  (e: 'toggle', acknowledged: boolean): void;
  (e: 'focus'): void;
}>();

const TYPE_LABEL: Record<string, string> = {
  screenshot_outdated: '截圖待更新',
  glossary_missing: '術語未定義',
  reference_broken: '引用斷裂',
  troubleshooting_orphan: '孤兒 troubleshooting',
  training_impact: '訓練影響',
  audience_mismatch: '對象不匹配',
  cross_step_inconsistency: '跨步驟不一致',
};

const SEV_TONE: Record<string, string> = {
  低: 'bg-gray-100 text-gray-600',
  中: 'bg-yellow-100 text-yellow-800',
  高: 'bg-danger/10 text-danger',
};
</script>

<template>
  <article
    class="bg-white rounded-lg border-2 transition-shadow"
    :class="
      active
        ? 'border-accent shadow-md ring-2 ring-accent/10'
        : 'border-gray-200 hover:border-gray-300'
    "
    tabindex="0"
    @focus="emit('focus')"
    @click="emit('focus')"
  >
    <header class="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
      <Info class="w-4 h-4 text-accent shrink-0" />
      <span class="text-xs font-medium px-2 py-0.5 rounded bg-accent/10 text-accent">
        {{ TYPE_LABEL[issue.type] ?? issue.type }}
      </span>
      <span
        class="text-xs px-2 py-0.5 rounded font-medium"
        :class="SEV_TONE[issue.severity]"
      >
        嚴重度：{{ issue.severity }}
      </span>
      <span
        v-if="issue.acknowledged"
        class="ml-auto inline-flex items-center gap-1 text-xs text-success"
      >
        <CheckCircle2 class="w-3.5 h-3.5" />
        已確認
      </span>
    </header>

    <div class="px-4 py-3 space-y-2">
      <p class="text-sm text-gray-900">{{ issue.description }}</p>
      <p v-if="issue.suggestion" class="text-xs text-gray-500">
        建議：{{ issue.suggestion }}
      </p>
      <p v-if="issue.targetId" class="text-xs text-gray-400 font-mono">
        相關：{{ issue.targetId }}
      </p>
    </div>

    <footer class="px-4 py-2 border-t border-gray-100 flex items-center text-xs">
      <label class="inline-flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          :checked="issue.acknowledged === true"
          @change="
            emit('toggle', ($event.target as HTMLInputElement).checked)
          "
        />
        <span class="text-gray-700">已確認，可繼續</span>
      </label>
      <span class="ml-auto text-gray-400">a 切換確認狀態</span>
    </footer>
  </article>
</template>
