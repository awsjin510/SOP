<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Inbox, FileText } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { useSopStore } from '@/stores/sop';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const authStore = useAuthStore();
const sopStore = useSopStore();
const router = useRouter();

onMounted(() => {
  if (authStore.authUser) {
    sopStore.bind(authStore.authUser.uid);
  }
});
onUnmounted(() => sopStore.unbind());

function goNewSop(): void {
  void router.push({ name: 'new-sop' });
}

function fmtUpdated(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  const d = ts.toDate();
  // 顯示為 GMT+8（規格要求）
  const local = new Date(d.getTime() + 8 * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}
</script>

<template>
  <div>
    <header class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-semibold text-primary-700">我的 SOP</h1>
        <p class="text-sm text-gray-600 mt-1">共 {{ sopStore.count }} 份</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-700 text-white font-medium hover:bg-primary-800 transition-colors"
        @click="goNewSop"
      >
        <Plus class="w-4 h-4" />
        新增 SOP
      </button>
    </header>

    <section v-if="sopStore.loading">
      <LoadingSpinner label="正在載入 SOP 清單…" />
    </section>

    <section
      v-else-if="sopStore.sops.length === 0"
      class="bg-white rounded-lg border border-gray-200 p-12 text-center"
    >
      <Inbox class="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h2 class="text-lg font-medium text-primary-700 mb-2">您還沒有 SOP</h2>
      <p class="text-sm text-gray-600 mb-6">
        上傳訪談逐字稿即可產出第一份 SOP。
      </p>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 transition-colors"
        @click="goNewSop"
      >
        <Plus class="w-4 h-4" />
        建立第一份
      </button>
    </section>

    <section v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="sop in sopStore.sops"
        :key="sop.id"
        :to="{ name: 'sop-detail', params: { id: sop.id } }"
        class="bg-white rounded-lg border border-gray-200 p-5 hover:border-primary-400 hover:shadow-sm transition"
      >
        <div class="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <FileText class="w-3 h-3" />
          <span>v{{ sop.currentVersion }}</span>
          <span>·</span>
          <span>{{ fmtUpdated(sop.updatedAt) }}</span>
        </div>
        <h3 class="font-semibold text-primary-700 mb-2 line-clamp-2">
          {{ sop.title }}
        </h3>
        <p class="text-xs text-gray-500 mb-3">{{ sop.targetAudience }}</p>
        <div class="flex items-center gap-3 text-xs text-gray-500">
          <span>{{ sop.stepsCount }} 步驟</span>
          <span v-if="sop.troubleshootingCount > 0">
            {{ sop.troubleshootingCount }} 排除
          </span>
          <span v-if="sop.glossaryCount > 0">{{ sop.glossaryCount }} 術語</span>
        </div>
      </RouterLink>
    </section>
  </div>
</template>
