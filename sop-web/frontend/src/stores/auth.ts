import { defineStore } from 'pinia';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/firebase/config';
import { signInWithGoogle, signOut } from '@/services/auth';
import { getOrCreateUser } from '@/services/user';
import type { UserDoc } from '@/types/firestore';

interface AuthState {
  authUser: User | null;
  userDoc: UserDoc | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    authUser: null,
    userDoc: null,
    loading: false,
    initialized: false,
    error: null,
  }),

  getters: {
    isAuthenticated: (state): boolean => state.authUser !== null,
    displayName: (state): string =>
      state.userDoc?.displayName ?? state.authUser?.displayName ?? '訪客',
  },

  actions: {
    /**
     * 在 app 啟動時呼叫一次。回傳 promise，resolve 在第一次取得 auth state 後。
     */
    bind(): Promise<void> {
      return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
          this.authUser = user;
          if (user) {
            try {
              this.userDoc = await getOrCreateUser(user);
            } catch (err) {
              this.error = err instanceof Error ? err.message : String(err);
              this.userDoc = null;
            }
          } else {
            this.userDoc = null;
          }
          this.initialized = true;
          resolve();
        });
      });
    },

    async signIn(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        await signInWithGoogle();
        // userDoc 會由 onAuthStateChanged 觸發 getOrCreateUser 寫入
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async signOut(): Promise<void> {
      this.loading = true;
      try {
        await signOut();
      } finally {
        this.loading = false;
      }
    },
  },
});
