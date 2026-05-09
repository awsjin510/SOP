import {
  doc,
  onSnapshot,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';

export interface UsageStats {
  id: string;
  userId: string;
  yearMonth: string;
  claudeTokensInput: number;
  claudeTokensOutput: number;
  estimatedCostUsd: number;
  updatedAt: Timestamp | null;
}

/**
 * GMT+8 的當月 yyyy-MM。
 * 規格要求所有時間戳一律 GMT+8（用 date-fns-tz 的 zonedTimeToUtc 等處理）。
 */
export function currentYearMonth(now: Date = new Date()): string {
  const gmt8 = new Date(now.getTime() + 8 * 3600 * 1000);
  const yyyy = gmt8.getUTCFullYear();
  const mm = String(gmt8.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export function usageDocId(userId: string, ym: string = currentYearMonth()): string {
  return `${userId}_${ym}`;
}

/**
 * 訂閱使用者當月用量；回傳 unsubscribe。
 * 如果該月還沒有任何 API 呼叫，doc 不會存在 → onNext 收到 null。
 */
export function subscribeMonthlyUsage(
  userId: string,
  onNext: (stats: UsageStats | null) => void,
): Unsubscribe {
  const ref = doc(db, 'usage_stats', usageDocId(userId));
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onNext(null);
      return;
    }
    onNext(snap.data() as UsageStats);
  });
}

/**
 * 列出過去 N 個月（含當月）的 GMT+8 yyyy-MM。
 * 例：listPastMonths(6) ⇒ ['2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12']
 */
export function listPastMonths(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime());
    d.setUTCMonth(d.getUTCMonth() - i);
    out.push(currentYearMonth(d));
  }
  return out;
}

/**
 * 取近 N 個月用量（給 dashboard 趨勢圖用）。
 * 用 getDocs 一次性拉，不訂閱（節省 listener）。
 */
export async function getRecentMonthlyUsage(
  userId: string,
  monthsBack: number = 6,
): Promise<UsageStats[]> {
  const months = listPastMonths(monthsBack);
  const { getDoc } = await import('firebase/firestore');
  const results = await Promise.all(
    months.map(async (ym) => {
      const ref = doc(db, 'usage_stats', usageDocId(userId, ym));
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        return {
          id: usageDocId(userId, ym),
          userId,
          yearMonth: ym,
          claudeTokensInput: 0,
          claudeTokensOutput: 0,
          estimatedCostUsd: 0,
          updatedAt: null,
        } satisfies UsageStats;
      }
      return snap.data() as UsageStats;
    }),
  );
  return results;
}
