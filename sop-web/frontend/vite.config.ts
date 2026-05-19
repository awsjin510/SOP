import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// `VITE_BASE_PATH` 由 GH Pages workflow 設成 '/SOP/'；本地 dev 維持 '/'。
const basePath = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 將最大的依賴拆出獨立 chunk，避免 main bundle 過肥。
        // 名稱以 vendor- 前綴方便 hosting/CDN 設快取規則。
        // NOTE: docx 不切獨立 chunk — 它內部用 lazy-init IIFE 模式
        //       (`var X = {}; function init() { ...X.read = ... }`)，
        //       一旦 rollup 把 docx 跟它的共享依賴（如 xmlbuilder、
        //       sax 等）跨 chunk 拆開，初始化順序就會亂掉，跳
        //       "Cannot set properties of undefined (setting 'read')"。
        //       讓它跟使用頁自然 bundle 在一起就沒事。
        manualChunks: (id: string): string | undefined => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('pdf-lib') || id.includes('@pdf-lib')) return 'vendor-pdflib';
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('marked') || id.includes('dompurify'))
            return 'vendor-md';
          if (id.includes('lucide-vue-next')) return 'vendor-icons';
          if (id.includes('vue') || id.includes('pinia')) return 'vendor-vue';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
