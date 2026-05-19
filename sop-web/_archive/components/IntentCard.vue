<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, X, Edit3, SkipForward } from 'lucide-vue-next';
import type { ChangeIntent } from '@/core/ir/schemas';

interface Props {
  intent: ChangeIntent;
  active?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'accept'): void;
  (e: 'reject'): void;
  (e: 'skip'): void;
  (e: 'edit', after: string): void;
  (e: 'focus'): void;
}>();

const editing = ref(false);
const draft = ref('');

watch(
  () => props.intent.intent_id,
  () => {
    editing.value = false;
    draft.value = '';
  },
);

function startEdit(): void {
  editing.value = true;
  draft.value = props.intent.user_modification?.after ?? props.intent.after ?? '';
}

function commitEdit(): void {
  emit('edit', draft.value);
  editing.value = false;
}

function cancelEdit(): void {
  editing.value = false;
}

const statusBadge = computed(() => {
  switch (props.intent.status) {
    case 'accepted':
      return { label: '已接受', cls: 'bg-success/10 text-success' };
    case 'rejected':
      return { label: '已拒絕', cls: 'bg-danger/10 text-danger' };
    case 'modified':
      return { label: '已編輯', cls: 'bg-accent/10 text-accent' };
    case 'skipped':
      return { label: '已略過', cls: 'bg-gray-100 text-gray-500' };
    default:
      return { label: '待審核', cls: 'bg-yellow-100 text-yellow-800' };
  }
});

const confidencePct = computed(() => Math.round(props.intent.confidence * 100));

const typeLabel: Record<string, string> = {
  add_step: '新增步驟',
  modify_step: '修改步驟',
  remove_step: '刪除步驟',
  reorder_step: '調整順序',
  add_troubleshooting: '新增 troubleshooting',
  modify_troubleshooting: '修改 troubleshooting',
  remove_troubleshooting: '移除 troubleshooting',
  add_glossary: '新增術語',
  modify_glossary: '修改術語',
  modify_meta: '修改 meta',
  replace_screenshot: '更新截圖',
  add_warning: '新增警告',
  add_tip: '新增提示',
};
</script>

<template>
  <article
    class="bg-white rounded-lg border-2 transition-shadow"
    :class="
      active
        ? 'border-primary-500 shadow-md ring-2 ring-primary-100'
        : 'border-gray-200 hover:border-gray-300'
    "
    tabindex="0"
    @focus="emit('focus')"
    @click="emit('focus')"
  >
    <header class="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
      <span
        class="text-xs font-medium px-2 py-0.5 rounded bg-primary-50 text-primary-700"
      >
        {{ typeLabel[intent.type] ?? intent.type }}
      </span>
      <span
        v-if="intent.target.step_id"
        class="text-xs text-gray-500 font-mono truncate"
        :title="intent.target.step_id"
      >
        {{ intent.target.step_id }}
      </span>
      <span
        class="ml-auto text-xs px-2 py-0.5 rounded font-medium"
        :class="statusBadge.cls"
      >
        {{ statusBadge.label }}
      </span>
      <span
        class="text-xs text-gray-500"
        :title="`Confidence ${confidencePct}%`"
      >
        {{ confidencePct }}%
      </span>
    </header>

    <div class="px-4 py-3 space-y-2">
      <p class="text-sm text-gray-900">{{ intent.description }}</p>

      <div v-if="intent.before" class="text-xs">
        <span class="text-gray-500">原本：</span>
        <span class="text-gray-700">{{ intent.before }}</span>
      </div>

      <div v-if="!editing && (intent.after || intent.user_modification)" class="text-xs">
        <span class="text-gray-500">變更為：</span>
        <span class="text-gray-900 font-medium">
          {{ intent.user_modification?.after ?? intent.after }}
        </span>
      </div>

      <div v-if="editing">
        <label class="text-xs text-gray-500 block mb-1">編輯變更內容</label>
        <textarea
          v-model="draft"
          rows="3"
          class="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:border-primary-500 focus:outline-none"
        />
        <div class="mt-2 flex justify-end gap-2">
          <button
            type="button"
            class="text-xs px-2 py-1 rounded text-gray-600 hover:text-gray-900"
            @click.stop="cancelEdit"
          >
            取消
          </button>
          <button
            type="button"
            class="text-xs px-3 py-1 rounded bg-primary-700 text-white hover:bg-primary-800"
            @click.stop="commitEdit"
          >
            儲存
          </button>
        </div>
      </div>

      <div v-if="intent.rationale" class="text-xs text-gray-500 italic">
        理由：{{ intent.rationale }}
      </div>

      <div
        v-if="intent.impact?.breaking_change || intent.impact?.needs_retraining"
        class="flex flex-wrap gap-1"
      >
        <span
          v-if="intent.impact?.breaking_change"
          class="text-xs px-2 py-0.5 rounded bg-danger/10 text-danger"
        >
          breaking change
        </span>
        <span
          v-if="intent.impact?.needs_retraining"
          class="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent"
        >
          需重訓
        </span>
        <span
          v-if="intent.impact?.needs_screenshot_update"
          class="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800"
        >
          需更新截圖
        </span>
      </div>

      <details class="text-xs text-gray-500">
        <summary class="cursor-pointer">來源（{{ intent.source_refs.length }}）</summary>
        <ul class="mt-1 ml-2 space-y-0.5">
          <li v-for="(ref, i) in intent.source_refs" :key="i">
            <span class="font-mono">{{ ref.source_file }}</span>
            <span v-if="ref.location"> · {{ ref.location }}</span>
            <span v-if="ref.excerpt" class="text-gray-400"> — {{ ref.excerpt }}</span>
          </li>
        </ul>
      </details>
    </div>

    <footer
      v-if="!editing"
      class="px-4 py-2 border-t border-gray-100 flex items-center gap-2 text-xs"
    >
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2 py-1 rounded text-success hover:bg-success/10"
        @click.stop="emit('accept')"
      >
        <Check class="w-3.5 h-3.5" />
        接受 (a)
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2 py-1 rounded text-danger hover:bg-danger/10"
        @click.stop="emit('reject')"
      >
        <X class="w-3.5 h-3.5" />
        拒絕 (r)
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2 py-1 rounded text-accent hover:bg-accent/10"
        @click.stop="startEdit"
      >
        <Edit3 class="w-3.5 h-3.5" />
        編輯 (e)
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 ml-auto"
        @click.stop="emit('skip')"
      >
        <SkipForward class="w-3.5 h-3.5" />
        略過 (s)
      </button>
    </footer>
  </article>
</template>
