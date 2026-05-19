<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  FileDown,
  Pencil,
  Eye,
  GitBranch,
  History,
  FolderOpen,
  Info,
} from 'lucide-vue-next';
import {
  getSop,
  getLatestVersion,
  subscribeChanges,
  listVersions,
  type ChangeRecord,
  type VersionSummary,
} from '@/services/sop';
import { renderMarkdown } from '@/core/renderer/markdown';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import type { SopDoc, ImageAsset } from '@/types/firestore';

type Tab = 'overview' | 'preview' | 'versions' | 'changes' | 'materials';

const route = useRoute();
const sopId = computed(() => route.params['id'] as string);

const sop = ref<SopDoc | null>(null);
const latestImageAssets = ref<Record<string, ImageAsset>>({});
const latestSourceMaterialsUrls = ref<string[]>([]);
const markdownSource = ref<string>('');
const renderedHtml = ref<string>('');
const loading = ref(true);
const error = ref<string | null>(null);
const docxUrl = ref<string>('');
const pdfUrl = ref<string>('');
const changes = ref<ChangeRecord[]>([]);
const versions = ref<VersionSummary[]>([]);
let changesUnsub: (() => void) | null = null;

const activeTab = ref<Tab>('overview');

const intentTypeLabel: Record<string, string> = {
  add_step: '新增步驟',
  modify_step: '修改步驟',
  remove_step: '刪除步驟',
  reorder_step: '調整順序',
  add_tip: '新增提示',
  add_warning: '新增警示',
  add_glossary: '新增術語',
  modify_glossary: '修改術語',
  add_troubleshooting: '新增 troubleshooting',
  modify_troubleshooting: '修改 troubleshooting',
  remove_troubleshooting: '刪除 troubleshooting',
  modify_meta: '修改 meta',
  replace_screenshot: '替換截圖',
};

function fmtDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  const d = ts.toDate();
  const local = new Date(d.getTime() + 8 * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

onMounted(async () => {
  try {
    const [s, v, vs] = await Promise.all([
      getSop(sopId.value),
      getLatestVersion(sopId.value),
      listVersions(sopId.value),
    ]);
    if (!s || !v) {
      error.value = '找不到此 SOP（可能尚未完成或已刪除）';
      return;
    }
    sop.value = s;
    docxUrl.value = v.documentDocxUrl;
    pdfUrl.value = v.documentPdfUrl;
    latestImageAssets.value = v.imageAssets;
    versions.value = vs;
    // 從版本 doc 拿 sourceMaterialsUrls — 用 listVersions 拿不到完整內容，再呼叫 getVersion
    // 簡化：getLatestVersion 沒回傳 sourceMaterialsUrls，後面 materials 分頁再 lazy load
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
    changesUnsub = subscribeChanges(sopId.value, (list) => {
      changes.value = list;
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => changesUnsub?.());

// Lazy 載入素材清單（latest 版本的 sourceMaterialsUrls）
const materialsLoading = ref(false);
const materialsLoaded = ref(false);

async function ensureMaterialsLoaded(): Promise<void> {
  if (materialsLoaded.value || materialsLoading.value) return;
  materialsLoading.value = true;
  try {
    if (!sop.value) return;
    const versionId = `v${sop.value.currentVersion}`;
    const { getVersion } = await import('@/services/sop');
    const v = await getVersion(sopId.value, versionId);
    latestSourceMaterialsUrls.value = v?.sourceMaterialsUrls ?? [];
    materialsLoaded.value = true;
  } finally {
    materialsLoading.value = false;
  }
}

function setTab(t: Tab): void {
  activeTab.value = t;
  if (t === 'materials') void ensureMaterialsLoaded();
}

const TABS: Array<{ key: Tab; label: string; icon: typeof Info; show: () => boolean }> = [
  { key: 'overview', label: '概覽', icon: Info, show: () => true },
  { key: 'preview', label: '預覽', icon: Eye, show: () => true },
  { key: 'versions', label: '版本', icon: GitBranch, show: () => true },
  { key: 'changes', label: '變更', icon: History, show: () => changes.value.length > 0 },
  { key: 'materials', label: '素材', icon: FolderOpen, show: () => true },
];

const imageAssetEntries = computed(() => Object.entries(latestImageAssets.value));
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
      <header class="bg-white rounded-lg border border-gray-200 p-6 mb-4">
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
          <div class="flex gap-2 shrink-0 flex-wrap">
            <RouterLink
              :to="{ name: 'update-sop', params: { id: sop.sopId } }"
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent-500 text-white text-sm font-medium hover:bg-accent-600 transition-colors"
            >
              <Pencil class="w-4 h-4" />
              更新
            </RouterLink>
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

      <!-- Tabs -->
      <nav class="flex border-b border-gray-200 mb-4 text-sm">
        <button
          v-for="t in TABS.filter((x) => x.show())"
          :key="t.key"
          type="button"
          class="px-4 py-2 -mb-px border-b-2 transition inline-flex items-center gap-1.5"
          :class="
            activeTab === t.key
              ? 'border-primary-700 text-primary-700 font-medium'
              : 'border-transparent text-gray-500 hover:text-primary-700'
          "
          @click="setTab(t.key)"
        >
          <component :is="t.icon" class="w-4 h-4" />
          {{ t.label }}
        </button>
      </nav>

      <!-- Tab：Overview -->
      <section
        v-if="activeTab === 'overview'"
        class="bg-white rounded-lg border border-gray-200 p-6"
      >
        <h2 class="font-semibold text-primary-700 mb-3 text-base">SOP 摘要</h2>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt class="text-gray-500 text-xs">當前版本</dt>
            <dd class="font-mono">v{{ sop.currentVersion }}</dd>
          </div>
          <div>
            <dt class="text-gray-500 text-xs">總版本數</dt>
            <dd>{{ sop.totalVersions }}</dd>
          </div>
          <div>
            <dt class="text-gray-500 text-xs">建立時間</dt>
            <dd>{{ fmtDate(sop.createdAt) }}</dd>
          </div>
          <div>
            <dt class="text-gray-500 text-xs">最近更新</dt>
            <dd>{{ fmtDate(sop.updatedAt) }}</dd>
          </div>
          <div v-if="sop.lastReviewedAt">
            <dt class="text-gray-500 text-xs">最近覆審</dt>
            <dd>{{ fmtDate(sop.lastReviewedAt) }}</dd>
          </div>
          <div>
            <dt class="text-gray-500 text-xs">預估時長</dt>
            <dd>{{ sop.estimatedDuration }}</dd>
          </div>
        </dl>
        <div v-if="sop.tags.length > 0" class="mt-4">
          <p class="text-gray-500 text-xs mb-1">Tags</p>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="t in sop.tags"
              :key="t"
              class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
            >
              {{ t }}
            </span>
          </div>
        </div>
      </section>

      <!-- Tab：Preview -->
      <section
        v-else-if="activeTab === 'preview'"
        class="bg-white rounded-lg border border-gray-200 p-6"
      >
        <h2 class="font-semibold text-primary-700 mb-4 text-base">
          線上預覽（Markdown）
        </h2>
        <article
          class="sop-md prose prose-sm max-w-none"
          v-html="renderedHtml"
        />
      </section>

      <!-- Tab：Versions -->
      <section
        v-else-if="activeTab === 'versions'"
        class="bg-white rounded-lg border border-gray-200 p-4"
      >
        <header class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-primary-700 text-base">版本列表</h2>
          <RouterLink
            :to="{ name: 'sop-versions', params: { id: sopId } }"
            class="text-xs text-primary-700 hover:underline"
          >
            打開完整版本歷史 →
          </RouterLink>
        </header>
        <ul class="text-sm divide-y divide-gray-100">
          <li
            v-for="v in versions"
            :key="v.id"
            class="py-2 flex items-center gap-3"
          >
            <span class="font-mono text-primary-700">v{{ v.version }}</span>
            <span class="text-xs text-gray-500">{{ fmtDate(v.createdAt) }}</span>
            <span v-if="v.changeSummary" class="text-xs text-gray-700 truncate flex-1">
              {{ v.changeSummary }}
            </span>
            <span v-else class="flex-1" />
            <a
              v-if="v.documentDocxUrl"
              :href="v.documentDocxUrl"
              :download="`${sopId}-${v.id}.docx`"
              class="text-xs text-gray-500 hover:text-primary-700"
            >
              .docx
            </a>
            <a
              v-if="v.documentPdfUrl"
              :href="v.documentPdfUrl"
              :download="`${sopId}-${v.id}.pdf`"
              class="text-xs text-gray-500 hover:text-primary-700"
            >
              .pdf
            </a>
          </li>
          <li
            v-if="versions.length === 0"
            class="text-sm text-gray-500 text-center py-6"
          >
            尚無版本紀錄。
          </li>
        </ul>
      </section>

      <!-- Tab：Changes -->
      <section
        v-else-if="activeTab === 'changes'"
        class="bg-white rounded-lg border border-gray-200 p-6"
      >
        <h2 class="font-semibold text-primary-700 mb-4 text-base">
          變更紀錄
        </h2>
        <ol class="space-y-4">
          <li
            v-for="ch in changes"
            :key="ch.id"
            class="border-l-4 border-accent-300 pl-4"
          >
            <div class="flex items-baseline gap-2 text-sm flex-wrap">
              <span class="font-medium text-primary-700">
                v{{ ch.fromVersion }} → v{{ ch.toVersion }}
              </span>
              <span class="text-xs text-gray-500">
                {{ fmtDate(ch.createdAt) }} · {{ ch.appliedBy }}
              </span>
              <RouterLink
                :to="{
                  name: 'change-detail',
                  params: { id: sopId, changeId: ch.id },
                }"
                class="ml-auto text-xs text-primary-700 hover:underline"
              >
                詳細 →
              </RouterLink>
            </div>
            <ul class="mt-2 space-y-1 text-sm text-gray-700">
              <li
                v-for="intent in ch.changeIntents.slice(0, 5)"
                :key="intent.intent_id"
                class="flex items-start gap-2"
              >
                <span
                  class="px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded text-xs font-medium shrink-0"
                >
                  {{ intentTypeLabel[intent.type] ?? intent.type }}
                </span>
                <span class="flex-1">{{ intent.description }}</span>
                <span class="text-xs text-gray-400 shrink-0">
                  {{ Math.round(intent.confidence * 100) }}%
                </span>
              </li>
              <li
                v-if="ch.changeIntents.length > 5"
                class="text-xs text-gray-400"
              >
                …及另外 {{ ch.changeIntents.length - 5 }} 項
              </li>
            </ul>
          </li>
        </ol>
      </section>

      <!-- Tab：Materials -->
      <section
        v-else-if="activeTab === 'materials'"
        class="bg-white rounded-lg border border-gray-200 p-6"
      >
        <h2 class="font-semibold text-primary-700 mb-4 text-base">
          當前版本素材
        </h2>
        <div v-if="materialsLoading" class="text-sm text-gray-500">
          <LoadingSpinner label="載入素材中…" />
        </div>
        <template v-else>
          <div v-if="latestSourceMaterialsUrls.length > 0" class="mb-6">
            <h3 class="text-sm font-medium text-gray-700 mb-2">原始素材</h3>
            <ul class="text-sm space-y-1">
              <li
                v-for="(url, idx) in latestSourceMaterialsUrls"
                :key="idx"
                class="text-xs"
              >
                <a
                  :href="url"
                  target="_blank"
                  rel="noopener"
                  class="text-primary-700 hover:underline truncate block"
                >
                  {{ idx + 1 }}. {{ url.split('/').pop() }}
                </a>
              </li>
            </ul>
          </div>
          <div v-if="imageAssetEntries.length > 0">
            <h3 class="text-sm font-medium text-gray-700 mb-2">
              截圖（{{ imageAssetEntries.length }}）
            </h3>
            <ul class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <li
                v-for="[id, asset] in imageAssetEntries"
                :key="id"
                class="border border-gray-200 rounded-md p-2 text-xs"
              >
                <div class="aspect-video bg-gray-100 rounded overflow-hidden mb-1">
                  <img
                    :src="asset.downloadUrl"
                    :alt="asset.sourceFile"
                    loading="lazy"
                    class="w-full h-full object-contain"
                  />
                </div>
                <div class="font-mono text-gray-500 truncate" :title="id">
                  {{ id }}
                </div>
                <div class="text-gray-400 truncate" :title="asset.sourceFile">
                  {{ asset.sourceFile }}
                </div>
              </li>
            </ul>
          </div>
          <p
            v-if="latestSourceMaterialsUrls.length === 0 && imageAssetEntries.length === 0 && !materialsLoading"
            class="text-sm text-gray-500"
          >
            無素材紀錄。
          </p>
        </template>
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
