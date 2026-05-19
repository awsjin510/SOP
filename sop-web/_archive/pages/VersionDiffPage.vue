<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, GitCompare, Plus, Minus, Edit3, ArrowUpDown } from 'lucide-vue-next';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { getVersion, type VersionDoc } from '@/services/sop';
import { diffIr, type IrDiff } from '@/core/diff/ir-diff';

const route = useRoute();
const sopId = computed(() => route.params['id'] as string);
const aId = computed(() => (route.query['a'] as string | undefined) ?? '');
const bId = computed(() => (route.query['b'] as string | undefined) ?? '');

const versionA = ref<VersionDoc | null>(null);
const versionB = ref<VersionDoc | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  if (!aId.value || !bId.value) {
    error.value = '請從版本歷史選擇兩個版本進行比較。';
    loading.value = false;
    return;
  }
  try {
    const [a, b] = await Promise.all([
      getVersion(sopId.value, aId.value),
      getVersion(sopId.value, bId.value),
    ]);
    if (!a || !b) {
      error.value = '找不到指定的版本。';
      return;
    }
    // 確保 before / after 順序：以 createdAt 較早者為 before
    const aDate = a.createdAt?.toDate().getTime() ?? 0;
    const bDate = b.createdAt?.toDate().getTime() ?? 0;
    if (aDate <= bDate) {
      versionA.value = a;
      versionB.value = b;
    } else {
      versionA.value = b;
      versionB.value = a;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});

const diff = computed<IrDiff | null>(() => {
  if (!versionA.value || !versionB.value) return null;
  return diffIr(versionA.value.ir, versionB.value.ir);
});

function truncate(s: string, n = 200): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <RouterLink
      :to="{ name: 'sop-versions', params: { id: sopId } }"
      class="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary-700 mb-4"
    >
      <ArrowLeft class="w-4 h-4" />
      返回版本歷史
    </RouterLink>

    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-primary-700 flex items-center gap-2">
        <GitCompare class="w-5 h-5" />
        版本對比
      </h1>
      <p
        v-if="versionA && versionB"
        class="text-sm text-gray-500 mt-1 font-mono"
      >
        v{{ versionA.version }} → v{{ versionB.version }}
      </p>
    </header>

    <p
      v-if="error"
      class="text-sm text-danger bg-danger/10 px-3 py-2 rounded-md"
    >
      {{ error }}
    </p>

    <section
      v-if="loading"
      class="bg-white rounded-lg border border-gray-200 p-8 text-center"
    >
      <LoadingSpinner label="計算 diff 中…" />
    </section>

    <template v-else-if="diff">
      <!-- 摘要 -->
      <section class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h2 class="text-base font-semibold text-primary-700 mb-3">變更摘要</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="bg-success/5 border border-success/20 rounded px-3 py-2">
            <div class="text-success flex items-center gap-1">
              <Plus class="w-3 h-3" /> 新增步驟
            </div>
            <div class="text-2xl font-semibold text-success mt-1">
              {{ diff.summary.addedSteps }}
            </div>
          </div>
          <div class="bg-danger/5 border border-danger/20 rounded px-3 py-2">
            <div class="text-danger flex items-center gap-1">
              <Minus class="w-3 h-3" /> 刪除步驟
            </div>
            <div class="text-2xl font-semibold text-danger mt-1">
              {{ diff.summary.removedSteps }}
            </div>
          </div>
          <div class="bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
            <div class="text-yellow-800 flex items-center gap-1">
              <Edit3 class="w-3 h-3" /> 修改步驟
            </div>
            <div class="text-2xl font-semibold text-yellow-800 mt-1">
              {{ diff.summary.changedSteps }}
            </div>
          </div>
          <div class="bg-accent/5 border border-accent/20 rounded px-3 py-2">
            <div class="text-accent flex items-center gap-1">
              <ArrowUpDown class="w-3 h-3" /> 順序變動
            </div>
            <div class="text-2xl font-semibold text-accent mt-1">
              {{ diff.summary.reorderedSteps }}
            </div>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-3">
          troubleshooting：+{{ diff.summary.addedTroubles }} / -{{ diff.summary.removedTroubles }}
          / ~{{ diff.summary.changedTroubles }} ·
          術語：+{{ diff.summary.addedTerms }} / -{{ diff.summary.removedTerms }} / ~{{
            diff.summary.changedTerms
          }} · meta 欄位變動：{{ diff.summary.metaFields }}
        </p>
      </section>

      <!-- Meta diff -->
      <section
        v-if="diff.meta.fields.length > 0"
        class="bg-white rounded-lg border border-gray-200 p-4 mb-6"
      >
        <h2 class="text-base font-semibold text-primary-700 mb-3">SOP Meta 變動</h2>
        <ul class="space-y-2 text-sm">
          <li
            v-for="f in diff.meta.fields"
            :key="f.field"
            class="grid grid-cols-12 gap-2 text-xs"
          >
            <span class="col-span-3 text-gray-500 font-mono">{{ f.field }}</span>
            <span class="col-span-4 line-through text-danger truncate" :title="f.before">
              {{ truncate(f.before, 100) }}
            </span>
            <span class="col-span-1 text-gray-400">→</span>
            <span class="col-span-4 text-success truncate" :title="f.after">
              {{ truncate(f.after, 100) }}
            </span>
          </li>
        </ul>
      </section>

      <!-- Step changes -->
      <section
        v-if="
          diff.steps.added.length > 0 ||
          diff.steps.removed.length > 0 ||
          diff.steps.changed.length > 0 ||
          diff.steps.reordered.length > 0
        "
        class="bg-white rounded-lg border border-gray-200 p-4 mb-6"
      >
        <h2 class="text-base font-semibold text-primary-700 mb-3">步驟變動</h2>

        <ul v-if="diff.steps.added.length > 0" class="mb-4">
          <li
            v-for="s in diff.steps.added"
            :key="s.step_id"
            class="bg-success/5 border-l-4 border-success px-3 py-2 mb-2 text-sm"
          >
            <div class="flex items-center gap-2">
              <Plus class="w-4 h-4 text-success" />
              <span class="font-medium">新增：{{ s.title }}</span>
              <span class="text-xs text-gray-500 font-mono">{{ s.step_id }}</span>
            </div>
            <p
              v-if="s.actions[0]"
              class="text-xs text-gray-600 mt-1 ml-6"
            >
              {{ truncate(s.actions[0].text, 200) }}
            </p>
          </li>
        </ul>

        <ul v-if="diff.steps.removed.length > 0" class="mb-4">
          <li
            v-for="s in diff.steps.removed"
            :key="s.step_id"
            class="bg-danger/5 border-l-4 border-danger px-3 py-2 mb-2 text-sm"
          >
            <div class="flex items-center gap-2">
              <Minus class="w-4 h-4 text-danger" />
              <span class="font-medium line-through">{{ s.title }}</span>
              <span class="text-xs text-gray-500 font-mono">{{ s.step_id }}</span>
            </div>
          </li>
        </ul>

        <ul v-if="diff.steps.changed.length > 0" class="mb-4">
          <li
            v-for="s in diff.steps.changed"
            :key="s.step_id"
            class="bg-yellow-50 border-l-4 border-yellow-400 px-3 py-2 mb-2 text-sm"
          >
            <div class="flex items-center gap-2">
              <Edit3 class="w-4 h-4 text-yellow-700" />
              <span class="font-medium">{{ s.title }}</span>
              <span class="text-xs text-gray-500 font-mono">{{ s.step_id }}</span>
            </div>
            <ul class="mt-2 ml-6 space-y-1 text-xs">
              <li
                v-for="f in s.fields"
                :key="f.field"
                class="grid grid-cols-12 gap-2"
              >
                <span class="col-span-2 text-gray-500 font-mono">{{ f.field }}</span>
                <span
                  class="col-span-5 line-through text-danger truncate"
                  :title="f.before"
                >
                  {{ truncate(f.before, 120) }}
                </span>
                <span class="col-span-5 text-success truncate" :title="f.after">
                  {{ truncate(f.after, 120) }}
                </span>
              </li>
            </ul>
          </li>
        </ul>

        <ul v-if="diff.steps.reordered.length > 0" class="mb-4">
          <li
            v-for="s in diff.steps.reordered"
            :key="s.step_id"
            class="bg-accent/5 border-l-4 border-accent px-3 py-2 mb-2 text-sm"
          >
            <div class="flex items-center gap-2">
              <ArrowUpDown class="w-4 h-4 text-accent" />
              <span class="font-medium">{{ s.title }}</span>
              <span class="text-xs text-gray-500 font-mono">{{ s.step_id }}</span>
              <span class="ml-auto text-xs text-gray-500">
                順序 {{ s.fromOrder }} → {{ s.toOrder }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Trouble changes -->
      <section
        v-if="
          diff.troubleshooting.added.length +
            diff.troubleshooting.removed.length +
            diff.troubleshooting.changed.length >
          0
        "
        class="bg-white rounded-lg border border-gray-200 p-4 mb-6"
      >
        <h2 class="text-base font-semibold text-primary-700 mb-3">
          Troubleshooting 變動
        </h2>
        <ul class="space-y-1 text-sm">
          <li
            v-for="t in diff.troubleshooting.added"
            :key="t.id"
            class="text-success"
          >
            + {{ t.symptom }}
            <span class="text-xs text-gray-500 font-mono">{{ t.id }}</span>
          </li>
          <li
            v-for="t in diff.troubleshooting.removed"
            :key="t.id"
            class="text-danger line-through"
          >
            - {{ t.symptom }}
            <span class="text-xs text-gray-500 font-mono">{{ t.id }}</span>
          </li>
          <li
            v-for="t in diff.troubleshooting.changed"
            :key="t.trouble_id"
            class="text-yellow-700"
          >
            ~ {{ t.symptom }}
            <span class="text-xs text-gray-500">
              （{{ t.fields.length }} 欄位變動）
            </span>
          </li>
        </ul>
      </section>

      <!-- Glossary changes -->
      <section
        v-if="
          diff.glossary.added.length +
            diff.glossary.removed.length +
            diff.glossary.changed.length >
          0
        "
        class="bg-white rounded-lg border border-gray-200 p-4 mb-6"
      >
        <h2 class="text-base font-semibold text-primary-700 mb-3">術語變動</h2>
        <ul class="space-y-1 text-sm">
          <li v-for="g in diff.glossary.added" :key="g.id" class="text-success">
            + {{ g.term }}
          </li>
          <li
            v-for="g in diff.glossary.removed"
            :key="g.id"
            class="text-danger line-through"
          >
            - {{ g.term }}
          </li>
          <li
            v-for="g in diff.glossary.changed"
            :key="g.term_id"
            class="text-yellow-700"
          >
            ~ {{ g.term }}
            <span class="text-xs text-gray-500">
              （{{ g.fields.length }} 欄位變動）
            </span>
          </li>
        </ul>
      </section>

      <p
        v-if="
          diff.summary.addedSteps +
            diff.summary.removedSteps +
            diff.summary.changedSteps +
            diff.summary.reorderedSteps +
            diff.summary.addedTroubles +
            diff.summary.removedTroubles +
            diff.summary.changedTroubles +
            diff.summary.addedTerms +
            diff.summary.removedTerms +
            diff.summary.changedTerms +
            diff.summary.metaFields ===
          0
        "
        class="text-sm text-gray-500 text-center py-12"
      >
        兩個版本內容完全相同。
      </p>
    </template>
  </div>
</template>
