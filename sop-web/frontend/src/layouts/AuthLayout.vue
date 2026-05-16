<script setup lang="ts">
// 公開頁面（Landing / Login）的佈局：無 header，置中
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <main class="flex-1 flex items-center justify-center px-6">
      <slot />
    </main>
    <footer class="text-center text-sm text-gray-500 py-6">
      © 2026 CloudOrange · 雲力橘子
    </footer>
  </div>
</template>
