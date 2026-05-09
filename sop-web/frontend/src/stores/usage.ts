import { defineStore } from 'pinia';
import type { Unsubscribe } from 'firebase/firestore';
import { subscribeMonthlyUsage, type UsageStats } from '@/services/usage';

interface UsageState {
  current: UsageStats | null;
  loading: boolean;
  unsubscribe: Unsubscribe | null;
}

export const useUsageStore = defineStore('usage', {
  state: (): UsageState => ({
    current: null,
    loading: false,
    unsubscribe: null,
  }),

  getters: {
    /** 當月已用 USD（無資料時為 0） */
    currentCostUsd: (state): number => state.current?.estimatedCostUsd ?? 0,
  },

  actions: {
    bind(userId: string): void {
      this.unbind();
      this.loading = true;
      this.unsubscribe = subscribeMonthlyUsage(userId, (stats) => {
        this.current = stats;
        this.loading = false;
      });
    },

    unbind(): void {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
      this.current = null;
    },
  },
});
