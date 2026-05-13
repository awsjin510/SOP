import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';

let _app: App | undefined;

/**
 * 取得（或初始化）firebase-admin App。
 *
 * 使用 FIREBASE_ADMIN_CREDENTIAL 環境變數（Vercel 設定的 service account JSON 字串）。
 */
export function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0]!;
    return _app;
  }

  const credEnv = process.env.FIREBASE_ADMIN_CREDENTIAL;
  if (!credEnv) {
    throw new Error(
      'FIREBASE_ADMIN_CREDENTIAL 環境變數未設定。' +
        '請從 Firebase Console → 專案設定 → 服務帳號 → 產生新私鑰，' +
        '將 JSON 內容貼到 Vercel 環境變數中。',
    );
  }

  const serviceAccount = JSON.parse(credEnv) as Record<string, string>;
  _app = initializeApp({ credential: cert(serviceAccount) });
  return _app;
}
