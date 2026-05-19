import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export const RATE_LIMIT_PER_MIN = 10;

/**
 * 簡易速率限制：每使用者每分鐘最多 RATE_LIMIT_PER_MIN 次呼叫。
 * 用 firestore doc rate_limits/{uid}_{minute} 計數，TTL 由排程清理（W10）。
 *
 * 回傳：是否通過 + 當前計數。
 */
export async function checkRateLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
}> {
  const db = getFirestore();
  const minute = Math.floor(Date.now() / 60_000);
  const ref = db.doc(`rate_limits/${userId}_${minute}`);

  // 用 transaction 讀-寫一致
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.data()?.['count'] as number | undefined) ?? 0;
    if (current >= RATE_LIMIT_PER_MIN) {
      return { allowed: false, count: current };
    }
    if (snap.exists) {
      tx.update(ref, {
        count: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    } else {
      tx.set(ref, {
        userId,
        minute,
        count: 1,
        // 兩分鐘後過期，給 cleanup 用
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60_000),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
    return { allowed: true, count: current + 1 };
  });

  return { ...result, limit: RATE_LIMIT_PER_MIN };
}
