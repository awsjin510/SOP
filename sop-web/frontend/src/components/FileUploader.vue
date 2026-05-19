<script setup lang="ts">
import { computed, ref } from 'vue';
import { Upload, FileText, X } from 'lucide-vue-next';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.docx', '.pdf', '.png', '.jpg', '.jpeg', '.webp',
]);

function validateFile(file: File): { valid: boolean; reason?: string } {
  if (file.size > MAX_FILE_BYTES) {
    return { valid: false, reason: `檔案超過 ${MAX_FILE_BYTES / 1024 / 1024}MB 上限` };
  }
  const lower = file.name.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `不支援的副檔名：${ext}` };
  }
  return { valid: true };
}

interface Props {
  multiple?: boolean;
  accept?: string;
  files: File[];
}

const props = withDefaults(defineProps<Props>(), {
  multiple: true,
  accept: '.txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp',
});

const emit = defineEmits<{
  (e: 'update:files', files: File[]): void;
}>();

const dragActive = ref(false);
const errors = ref<string[]>([]);
const inputRef = ref<HTMLInputElement | null>(null);

const totalBytes = computed(() =>
  props.files.reduce((sum, f) => sum + f.size, 0),
);

function handleDragEnter(e: DragEvent): void {
  e.preventDefault();
  dragActive.value = true;
}

function handleDragLeave(e: DragEvent): void {
  e.preventDefault();
  // 子元素冒泡導致誤觸；只在離開外層時關閉
  const target = e.currentTarget as HTMLElement;
  if (e.relatedTarget && target.contains(e.relatedTarget as Node)) return;
  dragActive.value = false;
}

function handleDrop(e: DragEvent): void {
  e.preventDefault();
  dragActive.value = false;
  const dropped = Array.from(e.dataTransfer?.files ?? []);
  acceptFiles(dropped);
}

function handleSelect(e: Event): void {
  const target = e.target as HTMLInputElement;
  const picked = Array.from(target.files ?? []);
  acceptFiles(picked);
  // 清空 input 讓使用者可重複選同名檔案
  target.value = '';
}

function acceptFiles(incoming: File[]): void {
  errors.value = [];
  const accepted: File[] = props.multiple ? [...props.files] : [];
  for (const file of incoming) {
    const result = validateFile(file);
    if (!result.valid) {
      errors.value.push(`${file.name}: ${result.reason}`);
      continue;
    }
    if (accepted.some((f) => f.name === file.name && f.size === file.size)) {
      // 重複，跳過
      continue;
    }
    accepted.push(file);
    if (!props.multiple) break;
  }
  emit('update:files', accepted);
}

function removeFile(index: number): void {
  const next = [...props.files];
  next.splice(index, 1);
  emit('update:files', next);
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <div>
    <div
      class="rounded-lg border-2 border-dashed p-8 text-center transition-colors"
      :class="
        dragActive
          ? 'border-primary-500 bg-primary-50'
          : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
      "
      @dragenter="handleDragEnter"
      @dragover.prevent
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <Upload class="w-10 h-10 text-gray-400 mx-auto mb-3" />
      <p class="text-sm text-gray-700 mb-2">
        拖拉檔案到這裡，或
        <button
          type="button"
          class="text-primary-700 font-medium hover:underline"
          @click="inputRef?.click()"
        >
          點擊選擇
        </button>
      </p>
      <p class="text-xs text-gray-500">
        支援 txt / md / docx / pdf / png / jpg / webp · 單檔上限
        {{ Math.round(MAX_FILE_BYTES / 1024 / 1024) }}MB
      </p>
      <input
        ref="inputRef"
        type="file"
        class="hidden"
        :multiple="multiple"
        :accept="accept"
        @change="handleSelect"
      />
    </div>

    <ul
      v-if="files.length > 0"
      class="mt-4 space-y-2 bg-white border border-gray-200 rounded-lg p-3"
    >
      <li
        v-for="(file, i) in files"
        :key="`${file.name}-${file.size}`"
        class="flex items-center gap-3 text-sm"
      >
        <FileText class="w-4 h-4 text-gray-400 shrink-0" />
        <span class="flex-1 truncate">{{ file.name }}</span>
        <span class="text-xs text-gray-500">{{ fmtSize(file.size) }}</span>
        <button
          type="button"
          class="text-gray-400 hover:text-danger transition-colors"
          @click="removeFile(i)"
          aria-label="移除檔案"
        >
          <X class="w-4 h-4" />
        </button>
      </li>
      <li class="pt-2 border-t border-gray-100 text-xs text-gray-500 text-right">
        總計 {{ files.length }} 個檔案 · {{ fmtSize(totalBytes) }}
      </li>
    </ul>

    <div
      v-if="errors.length > 0"
      class="mt-4 bg-danger/10 text-danger text-sm rounded-md p-3 space-y-1"
      role="alert"
    >
      <p v-for="(err, i) in errors" :key="i">⚠️ {{ err }}</p>
    </div>
  </div>
</template>
