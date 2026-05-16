<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { label: '載入中…', size: 'md' },
);

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-10 h-10 border-4',
} as const;
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <span
      :class="[
        sizeMap[size],
        'inline-block rounded-full border-primary-200 border-t-primary-600 animate-spin',
      ]"
      role="status"
      aria-live="polite"
    />
    <span v-if="label" class="text-sm text-gray-600">{{ label }}</span>
  </div>
</template>
