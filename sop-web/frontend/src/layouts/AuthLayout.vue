<script setup lang="ts">
// 公開頁面（Landing 等）的佈局：無 header，頁面自行控制版面
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <main class="flex-1 w-full">
      <slot />
    </main>
    <footer class="text-center text-xs text-gray-400 py-6 border-t border-gray-100 bg-white">
      © 2026 CloudForce · 雲力 ·
      <a
        href="https://github.com/awsjin510/SOP"
        target="_blank"
        rel="noopener"
        class="hover:text-primary-700 underline"
      >GitHub</a>
    </footer>
  </div>
</template>
