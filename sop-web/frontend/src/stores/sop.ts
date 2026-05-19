import { defineStore } from 'pinia';
import type { SopState } from '@/services/sop';

/**
 * 目前正在編輯的 SOP（單一 in-memory 物件）。
 * 重新整理頁面 = 清空（除非使用者下載 SOP.json 自己保留）。
 */
interface CurrentSopState {
  current: SopState | null;
}

export const useSopStore = defineStore('sop', {
  state: (): CurrentSopState => ({
    current: null,
  }),

  getters: {
    hasSop: (state): boolean => state.current !== null,
  },

  actions: {
    setCurrent(sop: SopState): void {
      this.current = sop;
    },
    clear(): void {
      this.current = null;
    },
  },
});
