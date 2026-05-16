# Pinia Stores 規格

## 設計原則

1. **Store 邏輯薄**：複雜邏輯放 `core/` 或 services
2. **單一職責**：每個 store 管一個範疇
3. **Firestore 訂閱集中**：訂閱與取消訂閱在 store 內處理
4. **不直接操作 SDK**：透過 `services/` 層

## Store 清單

```
src/stores/
├── auth.ts          # 認證狀態
├── sop.ts           # SOP 列表與當前 SOP
├── job.ts           # 處理任務
├── usage.ts         # 用量統計
├── ui.ts            # UI 狀態
└── notifications.ts # 通知
```

## auth.ts

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { auth } from '@/firebase/config';
import { userService } from '@/services/userService';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserDoc | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  
  const isAuthenticated = computed(() => user.value !== null);
  const uid = computed(() => user.value?.uid);
  
  // 監聽認證狀態
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      // 取得 user doc
      const userDoc = await userService.getOrCreate(firebaseUser);
      user.value = userDoc;
    } else {
      user.value = null;
    }
    loading.value = false;
  });
  
  async function signInWithGoogle() {
    error.value = null;
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }
  
  async function logout() {
    await signOut(auth);
  }
  
  async function updatePreferences(prefs: Partial<UserDoc['preferences']>) {
    if (!user.value) return;
    await userService.updatePreferences(user.value.uid, prefs);
    user.value = { ...user.value, preferences: { ...user.value.preferences, ...prefs }};
  }
  
  return {
    user,
    loading,
    error,
    isAuthenticated,
    uid,
    signInWithGoogle,
    logout,
    updatePreferences,
  };
});
```

## sop.ts

```typescript
export const useSopStore = defineStore('sop', () => {
  const sops = ref<SopDoc[]>([]);
  const currentSop = ref<SopDoc | null>(null);
  const versions = ref<VersionDoc[]>([]);
  const changes = ref<ChangeDoc[]>([]);
  
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  let unsubscribeSops: (() => void) | null = null;
  let unsubscribeVersions: (() => void) | null = null;
  
  // 訂閱使用者所有 SOP
  function subscribeToSops(uid: string) {
    if (unsubscribeSops) unsubscribeSops();
    
    unsubscribeSops = sopService.subscribeUserSops(uid, (newSops) => {
      sops.value = newSops;
    });
  }
  
  function unsubscribeFromSops() {
    if (unsubscribeSops) {
      unsubscribeSops();
      unsubscribeSops = null;
    }
  }
  
  // 載入特定 SOP
  async function loadSop(sopId: string) {
    loading.value = true;
    try {
      currentSop.value = await sopService.getSop(sopId);
      
      // 訂閱版本
      if (unsubscribeVersions) unsubscribeVersions();
      unsubscribeVersions = sopService.subscribeVersions(sopId, (newVersions) => {
        versions.value = newVersions;
      });
      
      // 載入變更紀錄（不訂閱，因為不會即時變動）
      changes.value = await sopService.getChanges(sopId);
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }
  
  // 建立新 SOP（觸發後端處理）
  async function createSop(input: CreateSopInput): Promise<string> {
    const jobId = await sopService.createSop(input);
    return jobId;
  }
  
  // 更新 SOP（觸發後端處理）
  async function updateSop(sopId: string, input: UpdateSopInput): Promise<string> {
    const jobId = await sopService.updateSop(sopId, input);
    return jobId;
  }
  
  // 刪除 SOP
  async function deleteSop(sopId: string) {
    await sopService.deleteSop(sopId);
  }
  
  return {
    sops,
    currentSop,
    versions,
    changes,
    loading,
    error,
    subscribeToSops,
    unsubscribeFromSops,
    loadSop,
    createSop,
    updateSop,
    deleteSop,
  };
});
```

## job.ts

```typescript
export const useJobStore = defineStore('job', () => {
  const currentJob = ref<ProcessingJobDoc | null>(null);
  const userJobs = ref<ProcessingJobDoc[]>([]);
  
  let unsubscribeJob: (() => void) | null = null;
  let unsubscribeUserJobs: (() => void) | null = null;
  
  // 訂閱單一任務
  function subscribeToJob(jobId: string) {
    if (unsubscribeJob) unsubscribeJob();
    
    unsubscribeJob = jobService.subscribeJob(jobId, (job) => {
      currentJob.value = job;
    });
  }
  
  function unsubscribeFromJob() {
    if (unsubscribeJob) {
      unsubscribeJob();
      unsubscribeJob = null;
      currentJob.value = null;
    }
  }
  
  // 訂閱使用者所有進行中任務
  function subscribeToUserJobs(uid: string) {
    if (unsubscribeUserJobs) unsubscribeUserJobs();
    
    unsubscribeUserJobs = jobService.subscribeUserJobs(uid, (jobs) => {
      userJobs.value = jobs;
    });
  }
  
  // 取消任務
  async function cancelJob(jobId: string) {
    await jobService.cancelJob(jobId);
  }
  
  // 提交審核結果
  async function submitReview(jobId: string, review: ReviewSubmission) {
    await jobService.submitReview(jobId, review);
  }
  
  // 計算狀態
  const activeJobs = computed(() => 
    userJobs.value.filter(j => 
      ['pending', 'uploading', 'extracting', 'building_ir', 
       'enhancing', 'merging', 'rendering'].includes(j.status)
    )
  );
  
  const awaitingReviewJobs = computed(() => 
    userJobs.value.filter(j => j.status === 'awaiting_review')
  );
  
  return {
    currentJob,
    userJobs,
    activeJobs,
    awaitingReviewJobs,
    subscribeToJob,
    unsubscribeFromJob,
    subscribeToUserJobs,
    cancelJob,
    submitReview,
  };
});
```

## usage.ts

```typescript
export const useUsageStore = defineStore('usage', () => {
  const currentMonthUsage = ref<UsageStatsDoc | null>(null);
  const historicalUsage = ref<UsageStatsDoc[]>([]);
  
  let unsubscribeCurrent: (() => void) | null = null;
  
  function subscribeToCurrentMonth(uid: string) {
    const yearMonth = format(new Date(), 'yyyy-MM');
    const docId = `${uid}_${yearMonth}`;
    
    if (unsubscribeCurrent) unsubscribeCurrent();
    
    unsubscribeCurrent = usageService.subscribeStats(docId, (stats) => {
      currentMonthUsage.value = stats;
    });
  }
  
  async function loadHistorical(uid: string, months: number = 6) {
    historicalUsage.value = await usageService.getHistorical(uid, months);
  }
  
  // 計算狀態
  const usageRatio = computed(() => {
    if (!currentMonthUsage.value) return 0;
    const limit = useAuthStore().user?.apiUsageLimit?.monthly_usd_limit || 50;
    return currentMonthUsage.value.estimatedCostUsd / limit;
  });
  
  const isApproachingLimit = computed(() => usageRatio.value >= 0.8);
  const isOverLimit = computed(() => usageRatio.value >= 1);
  
  return {
    currentMonthUsage,
    historicalUsage,
    usageRatio,
    isApproachingLimit,
    isOverLimit,
    subscribeToCurrentMonth,
    loadHistorical,
  };
});
```

## ui.ts

```typescript
export const useUiStore = defineStore('ui', () => {
  const theme = ref<'light' | 'dark' | 'auto'>('auto');
  const sidebarOpen = ref(true);
  const searchOpen = ref(false);
  
  // 全域 modal
  const modal = ref<{
    open: boolean;
    component?: string;
    props?: any;
  }>({ open: false });
  
  // 全域 toasts
  const toasts = ref<Array<{
    id: string;
    type: 'success' | 'warning' | 'danger' | 'info';
    message: string;
    duration?: number;
  }>>([]);
  
  function setTheme(newTheme: typeof theme.value) {
    theme.value = newTheme;
    
    // 套用到 document
    if (newTheme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
      document.documentElement.dataset.theme = newTheme;
    }
  }
  
  function showModal(component: string, props?: any) {
    modal.value = { open: true, component, props };
  }
  
  function hideModal() {
    modal.value = { open: false };
  }
  
  function toast(type: typeof toasts.value[0]['type'], message: string, duration = 5000) {
    const id = nanoid();
    toasts.value.push({ id, type, message, duration });
    
    if (duration > 0) {
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id);
      }, duration);
    }
  }
  
  return {
    theme,
    sidebarOpen,
    searchOpen,
    modal,
    toasts,
    setTheme,
    showModal,
    hideModal,
    toast,
  };
});
```

## notifications.ts

```typescript
export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<NotificationDoc[]>([]);
  const unreadCount = computed(() => 
    notifications.value.filter(n => !n.read).length
  );
  
  let unsubscribe: (() => void) | null = null;
  
  function subscribe(uid: string) {
    if (unsubscribe) unsubscribe();
    
    unsubscribe = notificationService.subscribe(uid, (newNotifications) => {
      notifications.value = newNotifications;
    });
  }
  
  async function markAsRead(notificationId: string) {
    await notificationService.markAsRead(notificationId);
  }
  
  async function markAllAsRead() {
    await notificationService.markAllAsRead(useAuthStore().uid!);
  }
  
  return {
    notifications,
    unreadCount,
    subscribe,
    markAsRead,
    markAllAsRead,
  };
});
```

## Service 層架構

Stores 不直接操作 Firebase SDK，而是透過 Services：

```
src/services/
├── userService.ts        # users collection 操作
├── sopService.ts         # sops collection 操作
├── jobService.ts         # processing_jobs 操作
├── usageService.ts       # usage_stats 操作
├── notificationService.ts
├── storageService.ts     # Firebase Storage
└── claudeService.ts      # 透過 claudeProxy 呼叫
```

範例：

```typescript
// src/services/sopService.ts
import { 
  collection, doc, query, where, orderBy, 
  onSnapshot, getDoc, setDoc, deleteDoc 
} from 'firebase/firestore';
import { db } from '@/firebase/config';

export const sopService = {
  subscribeUserSops(uid: string, callback: (sops: SopDoc[]) => void): () => void {
    const q = query(
      collection(db, 'sops'),
      where('owner', '==', uid),
      orderBy('updatedAt', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const sops = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SopDoc));
      callback(sops);
    });
  },
  
  async getSop(sopId: string): Promise<SopDoc> {
    const snap = await getDoc(doc(db, 'sops', sopId));
    if (!snap.exists()) throw new Error('SOP not found');
    return { ...snap.data(), id: snap.id } as SopDoc;
  },
  
  async createSop(input: CreateSopInput): Promise<string> {
    // 建立 processing_job
    const jobId = nanoid();
    await setDoc(doc(db, 'processing_jobs', jobId), {
      id: jobId,
      owner: useAuthStore().uid,
      type: 'create_sop',
      status: 'pending',
      progress: 0,
      // ...
    });
    
    // 啟動 Web Worker
    const worker = new Worker(new URL('@/workers/sop-trainer.worker.ts', import.meta.url), {
      type: 'module'
    });
    worker.postMessage({ type: 'start', input, jobId });
    
    return jobId;
  },
  
  // ... 其他方法
};
```

## 使用範例

```vue
<!-- DashboardPage.vue -->
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useSopStore } from '@/stores/sop';

const authStore = useAuthStore();
const sopStore = useSopStore();

onMounted(() => {
  if (authStore.uid) {
    sopStore.subscribeToSops(authStore.uid);
  }
});

onBeforeUnmount(() => {
  sopStore.unsubscribeFromSops();
});
</script>

<template>
  <div>
    <h1>我的 SOP（{{ sopStore.sops.length }}）</h1>
    <SopCard 
      v-for="sop in sopStore.sops" 
      :key="sop.id" 
      :sop="sop" 
    />
  </div>
</template>
```

## 跨 Store 互動

```typescript
// 在 store 中使用其他 store
import { useAuthStore } from './auth';

export const useSopStore = defineStore('sop', () => {
  // ...
  
  async function createSop(input: CreateSopInput) {
    const authStore = useAuthStore();
    if (!authStore.uid) throw new Error('Not authenticated');
    
    return await sopService.createSop({ ...input, owner: authStore.uid });
  }
});
```

## 持久化（可選）

Pinia 預設不持久化，如需保存到 localStorage：

```typescript
// 用 pinia-plugin-persistedstate
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

// 在 store 中標記
export const useUiStore = defineStore('ui', () => {
  // ...
}, {
  persist: {
    paths: ['theme', 'sidebarOpen'],  // 只持久化特定欄位
  }
});
```

## 測試

```typescript
// tests/stores/auth.test.ts
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';

beforeEach(() => {
  setActivePinia(createPinia());
});

it('should not be authenticated initially', () => {
  const store = useAuthStore();
  expect(store.isAuthenticated).toBe(false);
});
```
