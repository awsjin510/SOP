<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
  Filter,
  Loader2,
} from 'lucide-vue-next';
import IntentCard from '@/components/IntentCard.vue';
import ConflictCard from '@/components/ConflictCard.vue';
import CompletenessIssueCard from '@/components/CompletenessIssueCard.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import {
  subscribeJob,
  patchIntent,
  resolveConflict,
  acknowledgeIssue,
  batchPatchIntents,
  markReviewCompleted,
  type ProcessingJob,
} from '@/services/job';
import { runUpdateSopApply } from '@/core/pipelines/update-sop';

type Section = 'intents' | 'conflicts' | 'issues';

const route = useRoute();
const router = useRouter();
const jobId = computed(() => route.params['jobId'] as string);

const job = ref<ProcessingJob | null>(null);
const error = ref<string | null>(null);
const completing = ref(false);
const completeError = ref<string | null>(null);
let unsubscribe: (() => void) | null = null;

const activeSection = ref<Section>('intents');
const activeIntentIdx = ref(0);
const activeConflictIdx = ref(0);
const activeIssueIdx = ref(0);

const filterPending = ref(false);

onMounted(() => {
  unsubscribe = subscribeJob(jobId.value, (j) => {
    job.value = j;
    if (j?.status === 'failed') {
      error.value = j.error?.message ?? '處理失敗';
    } else if (j?.status === 'completed' && j.result) {
      // 完成 → 1.5s 跳到 SOP 詳情
      setTimeout(() => {
        void router.push({ name: 'sop-detail', params: { id: j.result!.sopId } });
      }, 1500);
    }
  });
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  unsubscribe?.();
  window.removeEventListener('keydown', onKeydown);
});

const intents = computed(() => job.value?.intermediate?.intents ?? []);
const conflicts = computed(() => job.value?.intermediate?.conflicts ?? []);
const issues = computed(() => job.value?.intermediate?.completenessIssues ?? []);

const filteredIntents = computed(() => {
  if (!filterPending.value) return intents.value;
  return intents.value.filter((i) => i.status === 'pending');
});

const stats = computed(() => {
  const accepted = intents.value.filter((i) => i.status === 'accepted').length;
  const rejected = intents.value.filter((i) => i.status === 'rejected').length;
  const modified = intents.value.filter((i) => i.status === 'modified').length;
  const pending = intents.value.filter((i) => i.status === 'pending').length;
  const skipped = intents.value.filter((i) => i.status === 'skipped').length;
  return { accepted, rejected, modified, pending, skipped, total: intents.value.length };
});

const conflictStats = computed(() => {
  const undecided = conflicts.value.filter(
    (c) => !c.dismissed && c.resolvedOptionIndex === undefined,
  ).length;
  return { total: conflicts.value.length, undecided };
});

const issueStats = computed(() => {
  const unacknowledgedHigh = issues.value.filter(
    (i) => i.severity === '高' && !i.acknowledged,
  ).length;
  return { total: issues.value.length, unacknowledgedHigh };
});

const canComplete = computed(() => {
  // 無未決衝突 + 無未確認的「高」嚴重度問題 + 至少一筆 accepted/modified
  return (
    conflictStats.value.undecided === 0 &&
    issueStats.value.unacknowledgedHigh === 0 &&
    intents.value.some((i) => i.status === 'accepted' || i.status === 'modified')
  );
});

// ============================================================
// Card actions
// ============================================================

async function acceptIntent(intentId: string): Promise<void> {
  await patchIntent(jobId.value, intentId, { status: 'accepted' });
}
async function rejectIntent(intentId: string): Promise<void> {
  await patchIntent(jobId.value, intentId, { status: 'rejected' });
}
async function skipIntent(intentId: string): Promise<void> {
  await patchIntent(jobId.value, intentId, { status: 'skipped' });
}
async function editIntent(intentId: string, after: string): Promise<void> {
  await patchIntent(jobId.value, intentId, {
    status: 'modified',
    user_modification: { after, modified_at: new Date().toISOString() },
  });
}
async function pickConflict(conflictId: string, index: number): Promise<void> {
  await resolveConflict(jobId.value, conflictId, { resolvedOptionIndex: index });
}
async function dismissConflict(conflictId: string): Promise<void> {
  await resolveConflict(jobId.value, conflictId, { dismissed: true });
}
async function toggleIssue(issueId: string, ack: boolean): Promise<void> {
  await acknowledgeIssue(jobId.value, issueId, ack);
}

// ============================================================
// Batch actions
// ============================================================

async function batchAccept(threshold: number): Promise<void> {
  await batchPatchIntents(jobId.value, { acceptIfConfidenceAtLeast: threshold });
}
async function batchReject(threshold: number): Promise<void> {
  await batchPatchIntents(jobId.value, { rejectIfConfidenceBelow: threshold });
}

// ============================================================
// Complete review
// ============================================================

async function completeReview(): Promise<void> {
  if (!canComplete.value) return;
  completing.value = true;
  completeError.value = null;
  try {
    await markReviewCompleted(jobId.value);
    // 在前端直接跑 phase 2（避免額外 cloud function）
    await runUpdateSopApply(jobId.value);
  } catch (err) {
    completeError.value = err instanceof Error ? err.message : String(err);
  } finally {
    completing.value = false;
  }
}

// ============================================================
// Keyboard shortcuts
// ============================================================

function onKeydown(e: KeyboardEvent): void {
  // 編輯中或在 input/textarea 內不攔截
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    moveActive(e.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (activeSection.value === 'conflicts') {
      const c = conflicts.value[activeConflictIdx.value];
      if (!c || c.dismissed) return;
      const cur = c.resolvedOptionIndex ?? 0;
      const next =
        e.key === 'ArrowRight'
          ? Math.min(c.options.length - 1, cur + 1)
          : Math.max(0, cur - 1);
      e.preventDefault();
      void pickConflict(c.id, next);
    }
    return;
  }
  // 數字快速選衝突 option
  if (
    activeSection.value === 'conflicts' &&
    /^[1-9]$/.test(e.key)
  ) {
    const c = conflicts.value[activeConflictIdx.value];
    if (!c) return;
    const idx = parseInt(e.key, 10) - 1;
    if (idx < c.options.length) {
      e.preventDefault();
      void pickConflict(c.id, idx);
    }
    return;
  }
  switch (e.key.toLowerCase()) {
    case 'a':
      e.preventDefault();
      void doActionOnActive('accept');
      break;
    case 'r':
      e.preventDefault();
      void doActionOnActive('reject');
      break;
    case 'e':
      // 編輯只用點擊觸發（要 focus 元件內 textarea）
      break;
    case 's':
      e.preventDefault();
      void doActionOnActive('skip');
      break;
    case 'tab':
      // 讓瀏覽器處理，不攔截
      break;
  }
}

function moveActive(delta: number): void {
  if (activeSection.value === 'intents') {
    const max = filteredIntents.value.length - 1;
    activeIntentIdx.value = Math.max(0, Math.min(max, activeIntentIdx.value + delta));
  } else if (activeSection.value === 'conflicts') {
    const max = conflicts.value.length - 1;
    activeConflictIdx.value = Math.max(0, Math.min(max, activeConflictIdx.value + delta));
  } else {
    const max = issues.value.length - 1;
    activeIssueIdx.value = Math.max(0, Math.min(max, activeIssueIdx.value + delta));
  }
}

async function doActionOnActive(action: 'accept' | 'reject' | 'skip'): Promise<void> {
  if (activeSection.value === 'intents') {
    const intent = filteredIntents.value[activeIntentIdx.value];
    if (!intent) return;
    if (action === 'accept') await acceptIntent(intent.intent_id);
    if (action === 'reject') await rejectIntent(intent.intent_id);
    if (action === 'skip') await skipIntent(intent.intent_id);
  } else if (activeSection.value === 'conflicts') {
    const c = conflicts.value[activeConflictIdx.value];
    if (!c) return;
    if (action === 'skip') await dismissConflict(c.id);
    if (action === 'accept' && c.resolvedOptionIndex !== undefined) {
      // 已選 → 不需動作；視為 accept 確認
    } else if (action === 'reject') {
      await dismissConflict(c.id);
    }
  } else {
    const issue = issues.value[activeIssueIdx.value];
    if (!issue) return;
    if (action === 'accept') await toggleIssue(issue.id, !issue.acknowledged);
    if (action === 'skip') await toggleIssue(issue.id, true);
  }
}

function setSection(s: Section): void {
  activeSection.value = s;
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <RouterLink
      :to="{ name: 'job-progress', params: { jobId } }"
      class="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary-700 mb-4"
    >
      <ArrowLeft class="w-4 h-4" />
      返回任務進度
    </RouterLink>

    <h1 class="text-2xl font-semibold text-primary-700 mb-2">變更審核</h1>
    <p class="text-sm text-gray-500 mb-6">
      逐項審核 / 解決衝突 / 確認完整性問題後，點「完成審核」即會套用為新版本。
    </p>

    <p v-if="error" class="text-danger mb-4">{{ error }}</p>

    <section
      v-if="!job"
      class="bg-white rounded-lg border border-gray-200 p-8 text-center"
    >
      <Loader2 class="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
      <p class="text-sm text-gray-600">載入審核資料中…</p>
    </section>

    <template v-else-if="job.intermediate">
      <!-- 統計 / 完成按鈕 -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <button
          type="button"
          class="bg-white rounded-lg border-2 p-3 text-left transition"
          :class="
            activeSection === 'intents'
              ? 'border-primary-500'
              : 'border-gray-200 hover:border-gray-300'
          "
          @click="setSection('intents')"
        >
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <CheckCircle2 class="w-4 h-4" />
            變更
          </div>
          <div class="text-2xl font-semibold text-primary-700 mt-1">
            {{ stats.accepted + stats.modified }}/{{ stats.total }}
          </div>
          <div class="text-xs text-gray-500">
            待 {{ stats.pending }} · 拒 {{ stats.rejected }}
          </div>
        </button>
        <button
          type="button"
          class="bg-white rounded-lg border-2 p-3 text-left transition"
          :class="
            activeSection === 'conflicts'
              ? 'border-yellow-500'
              : 'border-gray-200 hover:border-gray-300'
          "
          @click="setSection('conflicts')"
        >
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <AlertTriangle class="w-4 h-4" />
            衝突
          </div>
          <div class="text-2xl font-semibold text-yellow-700 mt-1">
            {{ conflictStats.total - conflictStats.undecided }}/{{ conflictStats.total }}
          </div>
          <div class="text-xs text-gray-500">未決 {{ conflictStats.undecided }}</div>
        </button>
        <button
          type="button"
          class="bg-white rounded-lg border-2 p-3 text-left transition"
          :class="
            activeSection === 'issues'
              ? 'border-accent'
              : 'border-gray-200 hover:border-gray-300'
          "
          @click="setSection('issues')"
        >
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <Info class="w-4 h-4" />
            完整性
          </div>
          <div class="text-2xl font-semibold text-accent mt-1">
            {{ issueStats.total }}
          </div>
          <div class="text-xs text-gray-500">
            高未確認 {{ issueStats.unacknowledgedHigh }}
          </div>
        </button>
      </div>

      <!-- 批次工具 -->
      <div
        v-if="activeSection === 'intents'"
        class="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 mb-4 flex items-center gap-2 text-xs flex-wrap"
      >
        <Filter class="w-4 h-4 text-gray-500" />
        <button
          type="button"
          class="px-2 py-1 rounded text-success hover:bg-success/10"
          @click="batchAccept(0.85)"
        >
          接受所有 ≥ 85%
        </button>
        <button
          type="button"
          class="px-2 py-1 rounded text-danger hover:bg-danger/10"
          @click="batchReject(0.5)"
        >
          拒絕所有 &lt; 50%
        </button>
        <label class="ml-auto inline-flex items-center gap-1 cursor-pointer text-gray-600">
          <input v-model="filterPending" type="checkbox" />
          只顯示待審
        </label>
      </div>

      <!-- 卡片清單 -->
      <section v-if="activeSection === 'intents'" class="space-y-3">
        <p
          v-if="filteredIntents.length === 0"
          class="text-sm text-gray-500 bg-white rounded-lg border border-gray-200 p-6 text-center"
        >
          沒有符合條件的變更。
        </p>
        <IntentCard
          v-for="(intent, idx) in filteredIntents"
          :key="intent.intent_id"
          :intent="intent"
          :active="idx === activeIntentIdx"
          @focus="activeIntentIdx = idx"
          @accept="acceptIntent(intent.intent_id)"
          @reject="rejectIntent(intent.intent_id)"
          @skip="skipIntent(intent.intent_id)"
          @edit="editIntent(intent.intent_id, $event)"
        />
      </section>

      <section v-else-if="activeSection === 'conflicts'" class="space-y-3">
        <p
          v-if="conflicts.length === 0"
          class="text-sm text-gray-500 bg-white rounded-lg border border-gray-200 p-6 text-center"
        >
          沒有衝突 🎉
        </p>
        <ConflictCard
          v-for="(c, idx) in conflicts"
          :key="c.id"
          :conflict="c"
          :active="idx === activeConflictIdx"
          @focus="activeConflictIdx = idx"
          @pick="pickConflict(c.id, $event)"
          @dismiss="dismissConflict(c.id)"
        />
      </section>

      <section v-else class="space-y-3">
        <p
          v-if="issues.length === 0"
          class="text-sm text-gray-500 bg-white rounded-lg border border-gray-200 p-6 text-center"
        >
          沒有完整性問題 🎉
        </p>
        <CompletenessIssueCard
          v-for="(issue, idx) in issues"
          :key="issue.id"
          :issue="issue"
          :active="idx === activeIssueIdx"
          @focus="activeIssueIdx = idx"
          @toggle="toggleIssue(issue.id, $event)"
        />
      </section>

      <!-- 完成審核 -->
      <footer class="mt-8 sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pt-6 pb-4">
        <div class="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
          <div class="text-xs text-gray-500 flex-1">
            <p>
              已接受 {{ stats.accepted + stats.modified }} 項；待決衝突
              {{ conflictStats.undecided }} 組；高嚴重未確認問題
              {{ issueStats.unacknowledgedHigh }} 項。
            </p>
            <p class="mt-1 text-gray-400">
              快捷鍵：a 接受 / r 拒絕 / s 略過 / e 編輯（focus 卡片後）/ ↑↓ 移動 / ←→ 切衝突選項
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canComplete || completing"
            @click="completeReview"
          >
            <LoadingSpinner v-if="completing" size="sm" label="" />
            <Sparkles v-else class="w-4 h-4" />
            {{ completing ? '套用中…' : '完成審核並產新版本' }}
          </button>
        </div>
        <p
          v-if="completeError"
          class="text-sm text-danger bg-danger/10 px-3 py-2 rounded-md mt-2"
        >
          {{ completeError }}
        </p>
      </footer>
    </template>

    <section
      v-else
      class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900"
    >
      <p>此任務尚無中介資料（intermediate）— 可能尚未進入審核階段或非 update 任務。</p>
    </section>
  </div>
</template>
