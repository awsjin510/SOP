<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  GitBranch,
  FileDown,
  GitCompare,
  Sparkles,
  AlertCircle,
} from 'lucide-vue-next';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import {
  getSop,
  listVersions,
  subscribeChanges,
  type ChangeRecord,
  type VersionSummary,
} from '@/services/sop';
import type { SopDoc } from '@/types/firestore';

const route = useRoute();
const router = useRouter();
const sopId = computed(() => route.params['id'] as string);

const sop = ref<SopDoc | null>(null);
const versions = ref<VersionSummary[]>([]);
const changes = ref<ChangeRecord[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const compareSelection = ref<{ a?: string; b?: string }>({});

let changesUnsub: (() => void) | null = null;

onMounted(async () => {
  try {
    const [s, vs] = await Promise.all([
      getSop(sopId.value),
      listVersions(sopId.value),
    ]);
    sop.value = s;
    versions.value = vs;
    changesUnsub = subscribeChanges(sopId.value, (cs) => {
      changes.value = cs;
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});

import { onUnmounted } from 'vue';
onUnmounted(() => changesUnsub?.());

const changesByChangeId = computed(() => {
  const m = new Map<string, ChangeRecord>();
  for (const c of changes.value) m.set(c.id, c);
  return m;
});

function fmt(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  const d = ts.toDate();
  const local = new Date(d.getTime() + 8 * 3600 * 1000);
  return local.toISOString().slice(0, 16).replace('T', ' ');
}

function pickForCompare(versionId: string): void {
  if (!compareSelection.value.a) {
    compareSelection.value = { a: versionId };
  } else if (!compareSelection.value.b && compareSelection.value.a !== versionId) {
    compareSelection.value = { ...compareSelection.value, b: versionId };
  } else {
    compareSelection.value = { a: versionId };
  }
}

function clearCompare(): void {
  compareSelection.value = {};
}

function goCompare(): void {
  if (!compareSelection.value.a || !compareSelection.value.b) return;
  void router.push({
    name: 'version-diff',
    params: { id: sopId.value },
    query: { a: compareSelection.value.a, b: compareSelection.value.b },
  });
}

function isPicked(versionId: string): 'a' | 'b' | null {
  if (compareSelection.value.a === versionId) return 'a';
  if (compareSelection.value.b === versionId) return 'b';
  return null;
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <RouterLink
      :to="{ name: 'sop-detail', params: { id: sopId } }"
      class="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary-700 mb-4"
    >
      <ArrowLeft class="w-4 h-4" />
      返回 SOP
    </RouterLink>

    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-primary-700 flex items-center gap-2">
        <GitBranch class="w-5 h-5" />
        版本歷史
      </h1>
      <p v-if="sop" class="text-sm text-gray-500 mt-1">
        {{ sop.title }} · 共 {{ versions.length }} 個版本
      </p>
    </header>

    <p v-if="error" class="text-danger">{{ error }}</p>

    <section
      v-if="loading"
      class="bg-white rounded-lg border border-gray-200 p-8 text-center"
    >
      <LoadingSpinner label="載入版本歷史…" />
    </section>

    <template v-else>
      <!-- 比較工具列 -->
      <div
        class="bg-primary-50 border border-primary-200 rounded-lg p-3 mb-6 flex items-center gap-3 text-sm sticky top-0 z-10"
      >
        <GitCompare class="w-4 h-4 text-primary-700 shrink-0" />
        <span class="text-primary-700 font-medium">版本對比</span>
        <span class="text-xs text-gray-600">
          已選：
          <span class="font-mono">{{ compareSelection.a ?? '—' }}</span>
          <span class="mx-1 text-gray-400">↔</span>
          <span class="font-mono">{{ compareSelection.b ?? '—' }}</span>
        </span>
        <button
          v-if="compareSelection.a || compareSelection.b"
          type="button"
          class="text-xs text-gray-500 hover:text-gray-700"
          @click="clearCompare"
        >
          清除
        </button>
        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 disabled:opacity-50"
          :disabled="!compareSelection.a || !compareSelection.b"
          @click="goCompare"
        >
          <GitCompare class="w-4 h-4" />
          對比此兩版
        </button>
      </div>

      <!-- 時間軸 -->
      <ol class="relative ml-4 border-l-2 border-gray-200 space-y-6">
        <li
          v-for="v in versions"
          :key="v.id"
          class="ml-6 relative"
        >
          <span
            class="absolute -left-[34px] top-1 w-4 h-4 rounded-full border-2 border-white shadow"
            :class="
              isPicked(v.id) === 'a'
                ? 'bg-accent'
                : isPicked(v.id) === 'b'
                  ? 'bg-primary-500'
                  : 'bg-gray-300'
            "
          />
          <article
            class="bg-white rounded-lg border-2 transition"
            :class="
              isPicked(v.id)
                ? 'border-primary-500 shadow-md'
                : 'border-gray-200 hover:border-gray-300'
            "
          >
            <header class="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <span class="font-mono text-sm font-semibold text-primary-700">
                v{{ v.version }}
              </span>
              <span v-if="v.fromVersion" class="text-xs text-gray-500">
                ← v{{ v.fromVersion }}
              </span>
              <span
                v-if="v.needsRetraining"
                class="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent inline-flex items-center gap-1"
              >
                <Sparkles class="w-3 h-3" />
                需重訓
              </span>
              <span
                v-if="v.qualityIssues && v.qualityIssues > 0"
                class="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 inline-flex items-center gap-1"
              >
                <AlertCircle class="w-3 h-3" />
                {{ v.qualityIssues }} 項待處理
              </span>
              <span class="ml-auto text-xs text-gray-500">{{ fmt(v.createdAt) }}</span>
            </header>

            <div class="px-4 py-3 space-y-2">
              <p v-if="v.changeSummary" class="text-sm text-gray-900">
                {{ v.changeSummary }}
              </p>
              <p class="text-xs text-gray-500">
                {{ v.stepsCount ?? 0 }} 步驟 · {{ v.troubleshootingCount ?? 0 }}
                個 troubleshooting · {{ v.glossaryCount ?? 0 }} 個術語
              </p>

              <!-- 該版本的變更紀錄摘要 -->
              <ul
                v-if="v.changeId && changesByChangeId.has(v.changeId)"
                class="text-xs text-gray-700 space-y-0.5 mt-2"
              >
                <li
                  v-for="intent in changesByChangeId.get(v.changeId)!.changeIntents.slice(0, 3)"
                  :key="intent.intent_id"
                  class="flex items-center gap-2"
                >
                  <span
                    class="px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded text-xs font-medium shrink-0"
                  >
                    {{ intent.type }}
                  </span>
                  <span class="truncate">{{ intent.description }}</span>
                </li>
                <li
                  v-if="changesByChangeId.get(v.changeId)!.changeIntents.length > 3"
                  class="text-gray-400"
                >
                  …及另外 {{ changesByChangeId.get(v.changeId)!.changeIntents.length - 3 }} 項
                </li>
              </ul>
            </div>

            <footer class="px-4 py-2 border-t border-gray-100 flex items-center gap-2 text-xs">
              <button
                type="button"
                class="px-2 py-1 rounded text-primary-700 hover:bg-primary-50"
                @click="pickForCompare(v.id)"
              >
                {{ isPicked(v.id) ? '取消選擇' : '選為比較' }}
              </button>
              <a
                v-if="v.documentDocxUrl"
                :href="v.documentDocxUrl"
                :download="`${sopId}-${v.id}.docx`"
                class="inline-flex items-center gap-1 px-2 py-1 rounded text-gray-600 hover:bg-gray-100"
              >
                <FileDown class="w-3.5 h-3.5" />
                Word
              </a>
              <a
                v-if="v.documentPdfUrl"
                :href="v.documentPdfUrl"
                :download="`${sopId}-${v.id}.pdf`"
                class="inline-flex items-center gap-1 px-2 py-1 rounded text-gray-600 hover:bg-gray-100"
              >
                <FileDown class="w-3.5 h-3.5" />
                PDF
              </a>
              <RouterLink
                v-if="v.changeId"
                :to="{
                  name: 'change-detail',
                  params: { id: sopId, changeId: v.changeId },
                }"
                class="ml-auto text-gray-500 hover:text-primary-700"
              >
                查看變更紀錄 →
              </RouterLink>
            </footer>
          </article>
        </li>
      </ol>

      <p
        v-if="versions.length === 0"
        class="text-sm text-gray-500 text-center py-12"
      >
        此 SOP 尚無版本紀錄。
      </p>
    </template>
  </div>
</template>
