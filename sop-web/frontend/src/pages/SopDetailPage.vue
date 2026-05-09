<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ArrowLeft, FileDown } from 'lucide-vue-next';
import { getSop, getLatestVersion } from '@/services/sop';
import { renderMarkdown } from '@/core/renderer/markdown';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import type { SopDoc } from '@/types/firestore';

const route = useRoute();
const sopId = computed(() => route.params['id'] as string);

const sop = ref<SopDoc | null>(null);
const markdownSource = ref<string>('');
const renderedHtml = ref<string>('');
const loading = ref(true);
const error = ref<string | null>(null);
const docxUrl = ref<string>('');
const pdfUrl = ref<string>('');

onMounted(async () => {
  try {
    const [s, v] = await Promise.all([
      getSop(sopId.value),
      getLatestVersion(sopId.value),
    ]);
    if (!s || !v) {
      error.value = '找不到此 SOP（可能尚未完成或已刪除）';
      return;
    }
    sop.value = s;
    docxUrl.value = v.documentDocxUrl;
    pdfUrl.value = v.documentPdfUrl;
    // 優先用版本中存好的 documentMarkdown；若無則臨時 render
    const md = v.documentMarkdown || renderMarkdown(v.ir);
    markdownSource.value = md;
    const html = await marked.parse(md, { async: true });
    renderedHtml.value = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4',
        'p', 'br', 'hr',
        'strong', 'em', 'code', 'pre',
        'ul', 'ol', 'li',
        'blockquote', 'a',
      ],
      ALLOWED_ATTR: ['href'],
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'dashboard' }"
      class="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary-700 mb-4"
    >
      <ArrowLeft class="w-4 h-4" />
      回到列表
    </RouterLink>

    <section v-if="loading" class="bg-white rounded-lg border border-gray-200 p-8">
      <LoadingSpinner label="正在載入 SOP…" />
    </section>

    <section
      v-else-if="error"
      class="bg-danger/10 border border-danger/30 rounded-lg p-4 text-sm text-danger"
    >
      {{ error }}
    </section>

    <template v-else-if="sop">
      <header class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold text-primary-700 mb-2">
              {{ sop.title }}
            </h1>
            <div class="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span class="px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-xs font-medium">
                v{{ sop.currentVersion }}
              </span>
              <span v-if="sop.category">{{ sop.category }}</span>
              <span>·</span>
              <span>{{ sop.difficulty }}</span>
              <span>·</span>
              <span>{{ sop.stepsCount }} 步驟</span>
              <span v-if="sop.troubleshootingCount > 0">
                · {{ sop.troubleshootingCount }} 個 troubleshooting
              </span>
              <span v-if="sop.glossaryCount > 0"> · {{ sop.glossaryCount }} 個術語 </span>
            </div>
            <p class="text-xs text-gray-500 mt-2">
              適用對象：{{ sop.targetAudience }}
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <a
              v-if="docxUrl"
              :href="docxUrl"
              :download="`${sop.sopId}-v${sop.currentVersion}.docx`"
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 transition-colors"
            >
              <FileDown class="w-4 h-4" />
              Word
            </a>
            <a
              v-if="pdfUrl"
              :href="pdfUrl"
              :download="`${sop.sopId}-v${sop.currentVersion}.pdf`"
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary-700 text-primary-700 text-sm font-medium hover:bg-primary-50 transition-colors"
            >
              <FileDown class="w-4 h-4" />
              PDF
            </a>
          </div>
        </div>
      </header>

      <section class="bg-white rounded-lg border border-gray-200 p-6">
        <h2 class="font-semibold text-primary-700 mb-4 text-base">
          線上預覽（Markdown）
        </h2>
        <article
          class="sop-md prose prose-sm max-w-none"
          v-html="renderedHtml"
        />
      </section>

      <p
        v-if="!docxUrl && !pdfUrl"
        class="text-xs text-gray-400 mt-6 text-center"
      >
        此 SOP 尚未產出 Word/PDF（建立流程未完成或來自舊版本）。
      </p>
    </template>
  </div>
</template>

<style scoped>
.sop-md :deep(h1) {
  @apply text-2xl font-bold text-primary-700 mt-0 mb-3;
}
.sop-md :deep(h2) {
  @apply text-xl font-semibold text-primary-700 mt-6 mb-3 pb-1 border-b border-gray-200;
}
.sop-md :deep(h3) {
  @apply text-base font-semibold text-primary-700 mt-4 mb-2;
}
.sop-md :deep(p) {
  @apply text-sm text-gray-700 my-2 leading-relaxed;
}
.sop-md :deep(ul),
.sop-md :deep(ol) {
  @apply text-sm text-gray-700 my-2 ml-5 space-y-1;
}
.sop-md :deep(ul) {
  @apply list-disc;
}
.sop-md :deep(ol) {
  @apply list-decimal;
}
.sop-md :deep(strong) {
  @apply text-primary-700;
}
.sop-md :deep(blockquote) {
  @apply border-l-4 border-accent-300 bg-accent-50 px-3 py-1 my-2 text-sm text-gray-700 italic;
}
.sop-md :deep(code) {
  @apply bg-gray-100 px-1 rounded text-xs;
}
.sop-md :deep(pre) {
  @apply bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto my-3;
}
.sop-md :deep(pre code) {
  @apply bg-transparent text-gray-100;
}
.sop-md :deep(hr) {
  @apply my-6 border-gray-200;
}
</style>
