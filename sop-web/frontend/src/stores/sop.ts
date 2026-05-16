import { defineStore } from 'pinia';
import type { Unsubscribe } from 'firebase/firestore';
import { subscribeUserSops } from '@/services/sop';
import type { SopDoc } from '@/types/firestore';

interface SopState {
  sops: SopDoc[];
  loading: boolean;
  unsubscribe: Unsubscribe | null;
}

export const useSopStore = defineStore('sop', {
  state: (): SopState => ({
    sops: [],
    loading: false,
    unsubscribe: null,
  }),

  getters: {
    count: (state): number => state.sops.length,
  },

  actions: {
    bind(uid: string): void {
      this.unbind();
      this.loading = true;
      this.unsubscribe = subscribeUserSops(uid, (list) => {
        this.sops = list;
        this.loading = false;
      });
    },

    unbind(): void {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
      this.sops = [];
    },
  },
});
