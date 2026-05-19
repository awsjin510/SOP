<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle, X } from 'lucide-vue-next';
import type { ConflictReview } from '@/services/job';

interface Props {
  conflict: ConflictReview;
  active?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'pick', index: number): void;
  (e: 'dismiss'): void;
  (e: 'focus'): void;
}>();

const TYPE_LABEL: Record<string, string> = {
  source_contradiction: '來源衝突',
  temporal_conflict: '時序衝突',
  semantic_inconsistency: '語意不相容',
};

const TYPE_TONE: Record<string, string> = {
  source_contradiction: 'bg-yellow-100 text-yellow-800',
  temporal_conflict: 'bg-accent/10 text-accent',
  semantic_inconsistency: 'bg-danger/10 text-danger',
};

const decided = computed(
  () => props.conflict.dismissed === true || props.conflict.resolvedOptionIndex !== undefined,
);
</script>

<template>
  <article
    class="bg-white rounded-lg border-2 transition-shadow"
    :class="
      active
        ? 'border-yellow-500 shadow-md ring-2 ring-yellow-100'
        : 'border-gray-200 hover:border-gray-300'
    "
    tabindex="0"
    @focus="emit('focus')"
    @click="emit('focus')"
  >
    <header class="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
      <AlertTriangle class="w-4 h-4 text-yellow-600 shrink-0" />
      <span
        class="text-xs font-medium px-2 py-0.5 rounded"
        :class="TYPE_TONE[conflict.type]"
      >
        {{ TYPE_LABEL[conflict.type] ?? conflict.type }}
      </span>
      <span class="text-xs text-gray-500 truncate">{{ conflict.description }}</span>
      <span
        v-if="decided"
        class="ml-auto text-xs px-2 py-0.5 rounded bg-success/10 text-success"
      >
        {{ conflict.dismissed ? '已忽略' : `已選 #${conflict.resolvedOptionIndex! + 1}` }}
      </span>
      <span
        v-else
        class="ml-auto text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800"
      >
        待決定
      </span>
    </header>

    <div class="px-4 py-3 space-y-3">
      <p v-if="conflict.rationale" class="text-xs text-gray-500 italic">
        {{ conflict.rationale }}
      </p>

      <ul class="space-y-2">
        <li
          v-for="(opt, i) in conflict.options"
          :key="opt.intent_id"
          class="text-xs border rounded-md p-2 transition"
          :class="
            conflict.resolvedOptionIndex === i
              ? 'border-success bg-success/5'
              : i === conflict.recommendedOptionIndex
                ? 'border-primary-300 bg-primary-50/50'
                : 'border-gray-200'
          "
        >
          <div class="flex items-start gap-2">
            <input
              type="radio"
              :name="`conflict-${conflict.id}`"
              :checked="conflict.resolvedOptionIndex === i"
              :disabled="conflict.dismissed"
              class="mt-0.5"
              @change="emit('pick', i)"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1 text-gray-700">
                <span class="font-medium">選項 {{ i + 1 }}</span>
                <span v-if="i === conflict.recommendedOptionIndex" class="text-primary-700">
                  · 推薦
                </span>
                <span class="ml-auto text-gray-400">
                  conf {{ Math.round(opt.confidence * 100) }}%
                </span>
              </div>
              <p class="text-gray-900 mt-0.5">{{ opt.description }}</p>
              <p v-if="opt.after" class="text-gray-700 mt-0.5">
                <span class="text-gray-500">→ </span>{{ opt.after }}
              </p>
              <p class="text-gray-400 mt-0.5">
                來源：{{ opt.source_refs.map((r) => r.source_file).join(', ') }}
              </p>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <footer class="px-4 py-2 border-t border-gray-100 flex items-center gap-2 text-xs">
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100"
        @click.stop="emit('dismiss')"
      >
        <X class="w-3.5 h-3.5" />
        全部忽略 (s)
      </button>
      <span class="ml-auto text-gray-400">用 ←/→ 選項，1-{{ conflict.options.length }} 快速指定</span>
    </footer>
  </article>
</template>
