/**
 * BYOK (Bring Your Own Key) — 使用者自己提供 Anthropic API key。
 * 存在當前瀏覽器的 localStorage，不會送到後端（除了 api.anthropic.com 本身）。
 *
 * 威脅模型差異：
 * - 我們不 bundle key 在 JS（傳統反模式）；是使用者自己貼自己的 key
 * - localStorage 仍可被同 origin 的 script 讀到，所以不要在 SOP 系統載入任何
 *   第三方 script（CSP 已限制）
 */
const STORAGE_KEY = 'sop_anthropic_byok_key';

export function getStoredKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setStoredKey(key: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  if (!trimmed) {
    clearStoredKey();
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, trimmed);
}

export function clearStoredKey(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function hasStoredKey(): boolean {
  return getStoredKey() !== null;
}

/** 顯示用遮罩：sk-ant-...XXXX */
export function maskKey(key: string): string {
  if (key.length <= 14) return '••••••••';
  return `${key.slice(0, 10)}••••${key.slice(-4)}`;
}
