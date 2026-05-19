import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export interface UsageRecord {
  userId: string;
  yearMonth: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function currentYearMonth(now: Date = new Date()): string {
  // GMT+8（規格要求所有時間戳一律 GMT+8）
  const gmt8 = new Date(now.getTime() + 8 * 3600 * 1000);
  const yyyy = gmt8.getUTCFullYear();
  const mm = String(gmt8.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export function usageDocId(userId: string, ym: string = currentYearMonth()): string {
  return `${userId}_${ym}`;
}

/** 累加當月用量到 usage_stats/{uid}_{yyyy-mm} */
export async function recordUsage(rec: UsageRecord): Promise<void> {
  const db = getFirestore();
  const id = usageDocId(rec.userId, rec.yearMonth);
  await db
    .doc(`usage_stats/${id}`)
    .set(
      {
        id,
        userId: rec.userId,
        yearMonth: rec.yearMonth,
        claudeTokensInput: FieldValue.increment(rec.inputTokens),
        claudeTokensOutput: FieldValue.increment(rec.outputTokens),
        estimatedCostUsd: FieldValue.increment(rec.costUsd),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  logger.info('usage recorded', {
    uid: rec.userId,
    cost: rec.costUsd,
    yearMonth: rec.yearMonth,
  });
}

/**
 * 讀取當月已用 USD。
 * 不存在時回傳 0（首次呼叫前還沒有 doc）。
 */
export async function readMonthlyUsageUsd(
  userId: string,
  ym: string = currentYearMonth(),
): Promise<number> {
  const db = getFirestore();
  const snap = await db.doc(`usage_stats/${usageDocId(userId, ym)}`).get();
  const data = snap.data() as { estimatedCostUsd?: number } | undefined;
  return data?.estimatedCostUsd ?? 0;
}

export { currentYearMonth };
