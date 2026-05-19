import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// 在 import store 前 mock Firebase 與 services（避免實際連線）
vi.mock('@/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: unknown) => void) => {
    // 預設模擬未登入
    cb(null);
    return () => {};
  }),
}));

vi.mock('@/services/auth', () => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/services/user', () => ({
  getOrCreateUser: vi.fn(),
}));

import { useAuthStore } from './auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts unauthenticated with no user', async () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
    expect(store.userDoc).toBeNull();
    expect(store.error).toBeNull();
  });

  it('marks initialized after bind() resolves', async () => {
    const store = useAuthStore();
    await store.bind();
    expect(store.initialized).toBe(true);
    expect(store.authUser).toBeNull();
  });

  it('exposes "訪客" as displayName when not signed in', () => {
    const store = useAuthStore();
    expect(store.displayName).toBe('訪客');
  });
});
