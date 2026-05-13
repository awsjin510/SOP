import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from './admin';

export const RATE_LIMIT_PER_MIN = 10;

export async function checkRateLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
}> {
  const db = getFirestore(getAdminApp());
  const minute = Math.floor(Date.now() / 60_000);
  const ref = db.doc(`rate_limits/${userId}_${minute}`);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.data()?.['count'] as number | undefined) ?? 0;
    if (current >= RATE_LIMIT_PER_MIN) return { allowed: false, count: current };
    if (snap.exists) {
      tx.update(ref, { count: FieldValue.increment(1), updatedAt: Timestamp.now() });
    } else {
      tx.set(ref, {
        userId, minute, count: 1,
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60_000),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
    return { allowed: true, count: current + 1 };
  });

  return { ...result, limit: RATE_LIMIT_PER_MIN };
}
