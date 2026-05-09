import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
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
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 將最大的依賴拆出獨立 chunk，避免 main bundle 過肥。
        // 名稱以 vendor- 前綴方便 hosting/CDN 設快取規則。
        manualChunks: (id: string): string | undefined => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('docx')) return 'vendor-docx';
          if (id.includes('pdf-lib') || id.includes('@pdf-lib')) return 'vendor-pdflib';
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('mammoth')) return 'vendor-mammoth';
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
