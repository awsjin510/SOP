<script setup lang="ts">
import { Settings, Home } from 'lucide-vue-next';
</script>

<template>
  <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <RouterLink
        :to="{ name: 'landing' }"
        class="font-semibold text-primary-700 text-lg tracking-tight"
      >
        SOP 智能產出平台
      </RouterLink>

      <div class="flex items-center gap-4">
        <RouterLink
          :to="{ name: 'landing' }"
          class="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-700 transition-colors"
        >
          <Home class="w-4 h-4" />
          首頁
        </RouterLink>
        <RouterLink
          :to="{ name: 'settings' }"
          class="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-700 transition-colors"
        >
          <Settings class="w-4 h-4" />
          設定
        </RouterLink>
      </div>
    </div>
  </header>
</template>
