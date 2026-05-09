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
