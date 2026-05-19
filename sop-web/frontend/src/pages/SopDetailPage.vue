<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Download, FileJson, FileText, FileType, Home } from 'lucide-vue-next';
import { useSopStore } from '@/stores/sop';
import { buildSopJsonBlob, slugify } from '@/services/sop';
import { renderMarkdown } from '@/core/renderer/markdown';

const router = useRouter();
const sopStore = useSopStore();

const sop = computed(() => sopStore.current);

const markdown = computed(() => (sop.value ? renderMarkdown(sop.value.ir) : ''));

const htmlPreview = computed(() => {
  if (!markdown.value) return '';
  const raw = marked.parse(markdown.value, { async: false }) as string;
  return DOMPurify.sanitize(raw);
});

const downloadError = ref<string | null>(null);

function fileBaseName(): string {
  return slugify(sop.value?.metadata.title ?? 'sop');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const downloadingDocx = ref(false);
async function downloadDocx(): Promise<void> {
  if (!sop.value) return;
  downloadError.value = null;
  downloadingDocx.value = true;
  try {
    const { renderDocx } = await import('@/core/renderer/docx');
    const blob = await renderDocx(sop.value.ir);
    triggerDownload(blob, `${fileBaseName()}.docx`);
  } catch (err) {
    downloadError.value = `Word 產生失敗：${(err as Error).message}`;
  } finally {
    downloadingDocx.value = false;
  }
}

const downloadingPdf = ref(false);
async function downloadPdf(): Promise<void> {
  if (!sop.value) return;
  downloadError.value = null;
  downloadingPdf.value = true;
  try {
    const { renderPdf } = await import('@/core/renderer/pdf');
    const blob = await renderPdf(sop.value.ir);
    triggerDownload(blob, `${fileBaseName()}.pdf`);
  } catch (err) {
    downloadError.value = `PDF 產生失敗：${(err as Error).message}`;
  } finally {
    downloadingPdf.value = false;
  }
}

function downloadMd(): void {
  if (!sop.value) return;
  const blob = new Blob([markdown.value], { type: 'text/markdown' });
  triggerDownload(blob, `${fileBaseName()}.md`);
}

function downloadJson(): void {
  if (!sop.value) return;
  const blob = buildSopJsonBlob(sop.value);
  triggerDownload(blob, `${fileBaseName()}.sop.json`);
}

async function goHome(): Promise<void> {
  sopStore.clear();
  await router.push({ name: 'landing' });
}

onMounted(() => {
  if (!sopStore.hasSop) {
    void router.replace({ name: 'new' });
  }
});
</script>

<template>
  <div v-if="sop" class="max-w-4xl mx-auto px-6 py-10">
    <div class="flex items-start justify-between mb-2 gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-semibold text-primary-700">{{ sop.metadata.title }}</h1>
        <p class="text-xs text-gray-500 mt-1">
          {{ sop.ir.steps.length }} 個步驟 · 故障排除 {{ sop.ir.troubleshooting?.length ?? 0 }} 條 · 術語 {{ sop.ir.glossary?.length ?? 0 }} 條
        </p>
      </div>
      <button
        type="button"
        class="px-3 py-1.5 rounded-md border border-gray-300 text-sm hover:bg-gray-50 inline-flex items-center gap-1.5"
        @click="goHome"
      >
        <Home class="w-4 h-4" />
        新開另一份
      </button>
    </div>

    <div
      class="rounded-md bg-yellow-50 border border-yellow-300 text-yellow-900 px-3 py-2 text-xs mb-6"
    >
      ⓘ 本工具不會保存你的資料 — 重整頁面、關閉瀏覽器後就會清空。請立即下載
      Word / PDF / Markdown 留存，或下載 SOP.json 以便日後載入繼續編輯。
    </div>

    <!-- 下載區 -->
    <section class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <h2 class="text-base font-semibold text-primary-700 mb-3">
        <Download class="inline w-4 h-4 mr-1" />
        下載
      </h2>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 disabled:opacity-50"
          :disabled="downloadingDocx"
          @click="downloadDocx"
        >
          <FileType class="w-4 h-4" />
          {{ downloadingDocx ? '產生中…' : 'Word (.docx)' }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 disabled:opacity-50"
          :disabled="downloadingPdf"
          @click="downloadPdf"
        >
          <FileType class="w-4 h-4" />
          {{ downloadingPdf ? '產生中…' : 'PDF (.pdf)' }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
          @click="downloadMd"
        >
          <FileText class="w-4 h-4" />
          Markdown (.md)
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
          @click="downloadJson"
        >
          <FileJson class="w-4 h-4" />
          SOP.json
        </button>
      </div>
      <p
        v-if="downloadError"
        class="mt-3 text-sm text-danger bg-danger/10 px-3 py-2 rounded-md"
      >
        {{ downloadError }}
      </p>
    </section>

    <!-- 預覽 -->
    <section class="bg-white rounded-lg border border-gray-200 p-6">
      <h2 class="text-base font-semibold text-primary-700 mb-4">預覽</h2>
      <article
        class="prose prose-sm max-w-none prose-headings:text-primary-700 prose-strong:text-gray-800"
        v-html="htmlPreview"
      />
    </section>
  </div>
</template>
