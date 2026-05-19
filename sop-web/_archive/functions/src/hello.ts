import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

interface HelloResponse {
  message: string;
  uid: string | null;
  region: string;
  timestamp: string;
}

/**
 * W1 用：驗證前端 → Cloud Functions 管線打通。
 * 之後階段會被 claudeProxy 等真功能取代。
 */
export const helloWorld = onCall<unknown, Promise<HelloResponse>>(
  { region: 'asia-east1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '需要登入才能呼叫 helloWorld');
    }

    logger.info('helloWorld called', { uid: request.auth.uid });

    return {
      message: 'hello from sop-web functions',
      uid: request.auth.uid,
      region: 'asia-east1',
      timestamp: new Date().toISOString(),
    };
  },
);
