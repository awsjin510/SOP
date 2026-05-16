# Cloud Functions 規格

## 概覽

Cloud Functions 只做最少的事，**所有業務邏輯都在前端**。

### Functions 清單

| Function | 用途 | Trigger |
|---------|------|---------|
| `claudeProxy` | 代理 Anthropic API | onCall (HTTPS) |
| `onUserCreated` | 使用者首次登入時建立 user doc | onCreate (Auth) |
| `onJobCreated` | 處理任務啟動時設預設值 | onCreate (Firestore) |
| `cleanupOldJobs` | 定期清理舊的 processing_jobs | Scheduled |
| `cleanupTempFiles` | 定期清理暫存檔 | Scheduled |

## 1. claudeProxy（核心）

### 用途

代理所有對 Anthropic API 的呼叫，藏 API Key、做用量追蹤、速率限制。

### Spec

```typescript
// functions/src/claude-proxy.ts

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { Anthropic } from '@anthropic-ai/sdk';
import { db, FieldValue } from './firebase-admin';
import { format } from 'date-fns';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

interface ClaudeProxyRequest {
  // Anthropic API 標準請求
  model?: string;              // 預設 'claude-opus-4-7'
  max_tokens?: number;         // 預設 4096
  system?: string;
  messages: Array<{role: 'user' | 'assistant'; content: any}>;
  temperature?: number;
  
  // 額外參數
  jobId?: string;              // 關聯的處理任務（用於追蹤）
  purpose?: string;            // 用途描述（debug 用）
}

interface ClaudeProxyResponse {
  // Anthropic API 標準回應
  id: string;
  content: Array<{type: 'text'; text: string}>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  
  // 額外資訊
  estimated_cost_usd: number;
  monthly_usage_usd: number;
  monthly_limit_usd: number;
}

export const claudeProxy = onCall<ClaudeProxyRequest, Promise<ClaudeProxyResponse>>(
  {
    secrets: [anthropicKey],
    region: 'asia-east1',
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 300,        // 5 分鐘上限
  },
  async (request) => {
    // === 1. 驗證認證 ===
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '需要登入才能使用此功能');
    }
    const userId = request.auth.uid;
    
    // === 2. 速率限制 ===
    const rateLimitOk = await checkRateLimit(userId);
    if (!rateLimitOk) {
      throw new HttpsError(
        'resource-exhausted',
        '請求過於頻繁，請稍後再試（每分鐘最多 10 次）'
      );
    }
    
    // === 3. 用量上限檢查 ===
    const usageCheck = await checkMonthlyUsage(userId);
    if (!usageCheck.canProceed) {
      throw new HttpsError(
        'resource-exhausted',
        `本月用量已達上限 $${usageCheck.limit}。請到設定頁調整。`
      );
    }
    
    // === 4. 呼叫 Anthropic API ===
    const client = new Anthropic({ apiKey: anthropicKey.value() });
    
    let response;
    try {
      response = await client.messages.create({
        model: request.data.model || 'claude-opus-4-7',
        max_tokens: request.data.max_tokens || 4096,
        system: request.data.system,
        messages: request.data.messages,
        temperature: request.data.temperature ?? 0.7,
      });
    } catch (error: any) {
      // 區分錯誤類型
      if (error.status === 429) {
        throw new HttpsError('resource-exhausted', 'Anthropic API 限流，請稍後再試');
      }
      if (error.status === 401) {
        // API key 問題，記錄並通知管理者
        console.error('Anthropic API key invalid', error);
        throw new HttpsError('internal', '伺服器設定錯誤，請聯絡管理員');
      }
      throw new HttpsError('internal', `Claude API 錯誤：${error.message}`);
    }
    
    // === 5. 計算成本與記錄用量 ===
    const cost = calculateCost(response.usage, response.model);
    await recordUsage(userId, response, cost, request.data);
    
    // === 6. 接近上限通知（80%）===
    const newTotal = usageCheck.currentUsage + cost;
    if (newTotal >= usageCheck.limit * 0.8 
        && usageCheck.currentUsage < usageCheck.limit * 0.8) {
      await sendUsageWarning(userId, newTotal, usageCheck.limit);
    }
    
    // === 7. 回傳 ===
    return {
      ...response,
      estimated_cost_usd: cost,
      monthly_usage_usd: newTotal,
      monthly_limit_usd: usageCheck.limit,
    };
  }
);

// ============================================
// Helper Functions
// ============================================

async function checkRateLimit(userId: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const ref = db.doc(`rate_limits/${userId}_${minute}`);
  
  try {
    await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      const count = snap.data()?.count || 0;
      
      if (count >= 10) {
        throw new Error('rate_limit_exceeded');
      }
      
      txn.set(ref, {
        count: FieldValue.increment(1),
        userId,
        minute,
        expiresAt: new Date(Date.now() + 120000),  // 2 分鐘後過期
      }, { merge: true });
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function checkMonthlyUsage(userId: string) {
  const yearMonth = format(new Date(), 'yyyy-MM');
  const usageDoc = await db.doc(`usage_stats/${userId}_${yearMonth}`).get();
  const userDoc = await db.doc(`users/${userId}`).get();
  
  const currentUsage = usageDoc.data()?.estimatedCostUsd || 0;
  const limit = userDoc.data()?.apiUsageLimit?.monthly_usd_limit || 50;
  
  return {
    canProceed: currentUsage < limit,
    currentUsage,
    limit,
  };
}

function calculateCost(usage: any, model: string): number {
  // 依 2026 年定價（要實作時確認最新）
  const pricing: Record<string, {input: number; output: number}> = {
    'claude-opus-4-7':       { input: 15, output: 75 },     // $/MTok
    'claude-opus-4-6':       { input: 15, output: 75 },
    'claude-sonnet-4-6':     { input: 3,  output: 15 },
    'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  };
  
  const price = pricing[model] || pricing['claude-opus-4-7'];
  
  return (
    (usage.input_tokens / 1_000_000) * price.input +
    (usage.output_tokens / 1_000_000) * price.output
  );
}

async function recordUsage(
  userId: string, 
  response: any, 
  cost: number, 
  request: ClaudeProxyRequest
) {
  const yearMonth = format(new Date(), 'yyyy-MM');
  const docId = `${userId}_${yearMonth}`;
  
  await db.doc(`usage_stats/${docId}`).set({
    userId,
    yearMonth,
    claudeTokensInput: FieldValue.increment(response.usage.input_tokens),
    claudeTokensOutput: FieldValue.increment(response.usage.output_tokens),
    estimatedCostUsd: FieldValue.increment(cost),
    callCount: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  
  // 如果有 jobId，也記錄到該 job
  if (request.jobId) {
    await db.doc(`processing_jobs/${request.jobId}`).update({
      'apiUsage.claudeTokensInput': FieldValue.increment(response.usage.input_tokens),
      'apiUsage.claudeTokensOutput': FieldValue.increment(response.usage.output_tokens),
      'apiUsage.estimatedCostUsd': FieldValue.increment(cost),
    });
  }
}

async function sendUsageWarning(userId: string, current: number, limit: number) {
  const ratio = (current / limit) * 100;
  await db.collection(`users/${userId}/notifications`).add({
    type: 'usage_warning',
    severity: 'warning',
    title: '本月用量達 80%',
    message: `本月已用 $${current.toFixed(2)} / $${limit.toFixed(2)}（${ratio.toFixed(0)}%）`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}
```

### 前端呼叫範例

```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase/config';

const claudeProxy = httpsCallable<ClaudeProxyRequest, ClaudeProxyResponse>(
  functions, 
  'claudeProxy'
);

// 使用
async function callClaude(prompt: string, system: string) {
  try {
    const result = await claudeProxy({
      system,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      jobId: currentJobId,
    });
    
    return result.data.content[0].text;
  } catch (error: any) {
    if (error.code === 'resource-exhausted') {
      // 顯示用量超限提示
      throw new UsageLimitExceededError(error.message);
    }
    throw error;
  }
}
```

## 2. onUserCreated

使用者第一次登入時自動建立 user document。

```typescript
// functions/src/auth-triggers.ts

import { auth } from 'firebase-functions/v1';

export const onUserCreated = auth.user().onCreate(async (user) => {
  await db.doc(`users/${user.uid}`).set({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0],
    photoURL: user.photoURL,
    
    preferences: {
      language: 'zh-TW',
      theme: 'auto',
    },
    
    apiUsageLimit: {
      monthly_usd_limit: 50,
      notification_threshold: 0.8,
    },
    
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    
    // 多人擴展預留
    organizationId: null,
    role: 'admin',  // 個人使用所有人都是 admin
  });
});
```

## 3. onJobCreated

處理任務啟動時的初始化（可選，前端做也可以）。

```typescript
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

export const onJobCreated = onDocumentCreated(
  'processing_jobs/{jobId}',
  async (event) => {
    const job = event.data?.data();
    if (!job) return;
    
    // 驗證 owner
    if (!job.owner) {
      await event.data?.ref.update({
        status: 'failed',
        error: { message: 'Missing owner', code: 'invalid_request' },
      });
      return;
    }
    
    // 設定預設值
    await event.data?.ref.update({
      progress: 0,
      currentStep: '初始化',
      subtasks: [],
      apiUsage: {
        claudeTokensInput: 0,
        claudeTokensOutput: 0,
        estimatedCostUsd: 0,
      },
      startedAt: FieldValue.serverTimestamp(),
    });
  }
);
```

## 4. cleanupOldJobs

每天清理 7 天以上的已完成 jobs（節省 Firestore 空間）。

```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const cleanupOldJobs = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Taipei',
  },
  async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const oldJobs = await db.collection('processing_jobs')
      .where('status', 'in', ['completed', 'failed', 'cancelled'])
      .where('updatedAt', '<', sevenDaysAgo)
      .limit(100)
      .get();
    
    const batch = db.batch();
    oldJobs.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    console.log(`Cleaned ${oldJobs.size} old jobs`);
  }
);
```

## 5. cleanupTempFiles

每週清理 Storage 中的暫存檔。

```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getStorage } from 'firebase-admin/storage';

export const cleanupTempFiles = onSchedule(
  {
    schedule: 'every monday 04:00',
    timeZone: 'Asia/Taipei',
  },
  async () => {
    const bucket = getStorage().bucket();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // 列出所有 users/*/tmp/* 的檔案
    const [files] = await bucket.getFiles({ prefix: 'users/' });
    
    const tmpFiles = files.filter(f => 
      f.name.includes('/tmp/') 
      && new Date(f.metadata.timeCreated) < sevenDaysAgo
    );
    
    await Promise.all(tmpFiles.map(f => f.delete()));
    console.log(`Cleaned ${tmpFiles.length} temp files`);
  }
);
```

## 部署設定

### firebase.json

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "*.log"],
      "predeploy": [
        "npm --prefix functions run lint",
        "npm --prefix functions run build"
      ]
    }
  ]
}
```

### functions/package.json

```json
{
  "name": "sop-functions",
  "engines": {
    "node": "20"
  },
  "main": "lib/index.js",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "eslint": "^8.0.0"
  },
  "scripts": {
    "build": "tsc",
    "serve": "npm run build && firebase emulators:start --only functions",
    "lint": "eslint src",
    "deploy": "firebase deploy --only functions"
  }
}
```

### 設定 Secret

```bash
# 設定 Anthropic API Key
firebase functions:secrets:set ANTHROPIC_API_KEY

# 確認已設定
firebase functions:secrets:access ANTHROPIC_API_KEY

# 部署
firebase deploy --only functions
```

## 測試

### 本地 Emulator

```bash
# 啟動所有 emulator
firebase emulators:start

# 只啟動 functions
firebase emulators:start --only functions

# 含 firestore + functions
firebase emulators:start --only functions,firestore
```

### 從前端連接 emulator

```typescript
// src/firebase/config.ts
import { connectFunctionsEmulator } from 'firebase/functions';
import { connectFirestoreEmulator } from 'firebase/firestore';

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

### 單元測試

```typescript
// functions/src/__tests__/claude-proxy.test.ts
import { claudeProxy } from '../claude-proxy';

describe('claudeProxy', () => {
  it('應該拒絕未認證的請求', async () => {
    await expect(
      claudeProxy({ data: {...}, auth: undefined })
    ).rejects.toThrow('需要登入');
  });
  
  it('應該檢查月度上限', async () => {
    // mock 用量已達上限
    // expect throw resource-exhausted
  });
});
```

## 監控

### Cloud Logging

```typescript
import { logger } from 'firebase-functions';

logger.info('Function executed', { userId, requestId });
logger.error('API call failed', { error });
```

### 用量告警

在 Google Cloud Console：
- Cloud Monitoring → Alerting
- 設定 Function execution count > 1000/hour 時告警
- 設定 error rate > 5% 時告警

### 預算告警

Firebase Console → Settings → Usage and billing：
- 設定每月預算 $5
- 超過 50%、80%、100% 時 email 通知
