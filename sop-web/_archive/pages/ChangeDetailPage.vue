<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  ArrowLeft,
  FileDown,
  AlertTriangle,
  Info,
} from 'lucide-vue-next';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { getChange, getSop, type ChangeRecord } from '@/services/sop';
import { renderChangelogDocx } from '@/core/renderer/changelog-docx';
import type { SopDoc } from '@/types/firestore';

const route = useRoute();
const sopId = computed(() => route.params['id'] as string);
const changeId = computed(() => route.params['changeId'] as string);

const sop = ref<SopDoc | null>(null);
const change = ref<ChangeRecord | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const downloading = ref(false);

onMounted(async () => {
  try {
    const [s, c] = await Promise.all([
      getSop(sopId.value),
      getChange(sopId.value, changeId.value),
    ]);
    sop.value = s;
    change.value = c;
    if (!c) error.value = '找不到此變更紀錄';
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});

const conflicts = computed(() => (change.value?.conflicts ?? []) as Array<Record<string, unknown>>);
const issues = computed(() => (change.value?.completenessIssues ?? []) as Array<Record<string, unknown>>);

async function downloadChangelog(): Promise<void> {
  if (!change.value || !sop.value) return;
  downloading.value = true;
  try {
    const blob = await renderChangelogDocx({
      sopTitle: sop.value.title,
      fromVersion: change.value.fromVersion,
      toVersion: change.value.toVersion,
      appliedBy: change.value.appliedBy,
      appliedAt:
        change.value.createdAt?.toDate().toISOString().slice(0, 19) ?? '',
      change: change.value,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sopId.value}-changelog-v${change.value.fromVersion}-to-v${change.value.toVersion}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    downloading.value = false;
  }
}

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
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <RouterLink
      :to="{ name: 'sop-versions', params: { id: sopId } }"
      class="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary-700 mb-4"
    >
      <ArrowLeft class="w-4 h-4" />
      返回版本歷史
    </RouterLink>

    <header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-semibold text-primary-700">變更紀錄</h1>
        <p v-if="change" class="text-sm text-gray-500 mt-1 font-mono">
          v{{ change.fromVersion }} → v{{ change.toVersion }}
        </p>
      </div>
      <button
        v-if="change"
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 disabled:opacity-50"
        :disabled="downloading"
        @click="downloadChangelog"
      >
        <LoadingSpinner v-if="downloading" size="sm" label="" />
        <FileDown v-else class="w-4 h-4" />
        {{ downloading ? '產生中…' : '下載 Changelog (Word)' }}
      </button>
    </header>

    <p v-if="error" class="text-danger mb-4">{{ error }}</p>

    <section
      v-if="loading"
      class="bg-white rounded-lg border border-gray-200 p-8 text-center"
    >
      <LoadingSpinner label="載入變更紀錄…" />
    </section>

    <template v-else-if="change">
      <!-- 變更項目 -->
      <section class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h2 class="text-base font-semibold text-primary-700 mb-3">
          變更項目（{{ change.changeIntents.length }}）
        </h2>
        <ol class="space-y-3">
          <li
            v-for="intent in change.changeIntents"
            :key="intent.intent_id"
            class="border-l-4 border-primary-300 pl-3 py-1"
          >
            <div class="flex items-start gap-2 text-sm">
              <span
                class="px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded text-xs font-medium shrink-0"
              >
                {{ intentTypeLabel[intent.type] ?? intent.type }}
              </span>
              <span class="flex-1">{{ intent.description }}</span>
              <span class="text-xs text-gray-400 shrink-0">
                {{ Math.round(intent.confidence * 100) }}%
              </span>
            </div>
            <p v-if="intent.before" class="text-xs text-gray-500 mt-1">
              <span class="text-danger">原本：</span>{{ intent.before }}
            </p>
            <p v-if="intent.after" class="text-xs text-gray-500">
              <span class="text-success">變更：</span>{{ intent.after }}
            </p>
            <p
              v-if="intent.user_modification?.after"
              class="text-xs text-accent"
            >
              編輯後：{{ intent.user_modification.after }}
            </p>
            <p v-if="intent.rationale" class="text-xs text-gray-500 italic">
              理由：{{ intent.rationale }}
            </p>
          </li>
        </ol>
      </section>

      <!-- Skipped -->
      <section
        v-if="change.skippedIntents && change.skippedIntents.length > 0"
        class="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-6"
      >
        <h2 class="text-base font-semibold text-gray-700 mb-3">
          跳過項目（{{ change.skippedIntents.length }}）
        </h2>
        <ul class="space-y-1 text-sm text-gray-600">
          <li v-for="(s, idx) in change.skippedIntents" :key="idx">
            <span class="font-medium">{{ s.intent.description }}</span>
            <span class="text-xs text-gray-500"> · {{ s.reason }}</span>
          </li>
        </ul>
      </section>

      <!-- Conflicts -->
      <section
        v-if="conflicts.length > 0"
        class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6"
      >
        <h2 class="text-base font-semibold text-yellow-800 mb-3 flex items-center gap-2">
          <AlertTriangle class="w-4 h-4" />
          審核中處理的衝突（{{ conflicts.length }}）
        </h2>
        <ul class="space-y-2 text-xs text-gray-700">
          <li v-for="(c, idx) in conflicts" :key="idx">
            <div class="font-medium">{{ (c['type'] as string) }}</div>
            <div class="text-gray-600">{{ (c['description'] as string) }}</div>
          </li>
        </ul>
      </section>

      <!-- Completeness issues -->
      <section
        v-if="issues.length > 0"
        class="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-6"
      >
        <h2 class="text-base font-semibold text-accent mb-3 flex items-center gap-2">
          <Info class="w-4 h-4" />
          完整性問題（{{ issues.length }}）
        </h2>
        <ul class="space-y-2 text-xs text-gray-700">
          <li v-for="(i, idx) in issues" :key="idx">
            <span class="font-medium">{{ (i['type'] as string) }}</span>
            <span class="text-gray-500"> · 嚴重度 {{ (i['severity'] as string) }}</span>
            <div class="text-gray-600">{{ (i['description'] as string) }}</div>
          </li>
        </ul>
      </section>

      <!-- Stats footer -->
      <p class="text-xs text-gray-500 text-center">
        套用人：{{ change.appliedBy }}
      </p>
    </template>
  </div>
</template>
