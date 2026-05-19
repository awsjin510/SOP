import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '@/firebase/config';
import type { UserDoc } from '@/types/firestore';

const USERS_COLLECTION = 'users';

export async function getOrCreateUser(authUser: User): Promise<UserDoc> {
  const ref = doc(db, USERS_COLLECTION, authUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // 更新 lastLoginAt（只改這一欄）
    await updateDoc(ref, { lastLoginAt: serverTimestamp() });
    return snap.data() as UserDoc;
  }

  // 第一次登入：建立 user doc
  const newUser = {
    uid: authUser.uid,
    email: authUser.email ?? '',
    displayName: authUser.displayName ?? authUser.email ?? '未命名',
    ...(authUser.photoURL ? { photoURL: authUser.photoURL } : {}),
    preferences: {
      language: 'zh-TW',
      theme: 'auto',
    },
    apiUsageLimit: {
      monthly_usd_limit: 50,
      notification_threshold: 0.8,
    },
    organizationId: null,
    role: null,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  await setDoc(ref, newUser);
  // serverTimestamp 在回傳值上是 null，重新讀一次拿到實際 Timestamp
  const fresh = await getDoc(ref);
  return fresh.data() as UserDoc;
}
