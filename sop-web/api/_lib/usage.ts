import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from './admin';

export interface UsageRecord {
  userId: string;
  yearMonth: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function currentYearMonth(now: Date = new Date()): string {
  const gmt8 = new Date(now.getTime() + 8 * 3600 * 1000);
  const yyyy = gmt8.getUTCFullYear();
  const mm = String(gmt8.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export async function readMonthlyUsageUsd(
  userId: string,
  ym: string = currentYearMonth(),
): Promise<number> {
  const db = getFirestore(getAdminApp());
  const snap = await db.doc(`usage_stats/${userId}_${ym}`).get();
  const data = snap.data() as { estimatedCostUsd?: number } | undefined;
  return data?.estimatedCostUsd ?? 0;
}

export async function recordUsage(rec: UsageRecord): Promise<void> {
  const db = getFirestore(getAdminApp());
  const id = `${rec.userId}_${rec.yearMonth}`;
  await db.doc(`usage_stats/${id}`).set(
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
}
