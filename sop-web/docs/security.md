# 安全與成本控制

## 安全原則

### 1. API Key 絕對不放前端

**錯誤示範**：
```typescript
// ❌ 危險！瀏覽器可看到 key
const ANTHROPIC_API_KEY = "sk-ant-...";
fetch("https://api.anthropic.com/v1/messages", {
  headers: { "x-api-key": ANTHROPIC_API_KEY }
});
```

**正確做法**：
```typescript
// ✅ 透過 Cloud Function 代理
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase/config';

const claudeProxy = httpsCallable(functions, 'claudeProxy');
const result = await claudeProxy({ prompt: "...", system: "..." });
```

Cloud Function 端：
```typescript
// functions/src/claude-proxy.ts
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

export const claudeProxy = onCall(
  { secrets: [anthropicKey] },
  async (request) => {
    // 1. 驗證使用者已登入
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '需要登入');
    }
    
    // 2. 呼叫 Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey.value(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        ...request.data,
      }),
    });
    
    // 3. 記錄用量
    await recordUsage(request.auth.uid, response);
    
    return await response.json();
  }
);
```

設定 secret：
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# 貼上 key 後 enter
```

### 2. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // === Helper functions ===
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(resource) {
      return isAuthenticated() && resource.data.owner == request.auth.uid;
    }
    
    function isMember(resource) {
      // 預留多人擴展
      return isAuthenticated() 
             && (resource.data.owner == request.auth.uid 
                 || request.auth.uid in resource.data.members);
    }
    
    function hasValidSchema(data, requiredFields) {
      return data.keys().hasAll(requiredFields);
    }
    
    // === Users ===
    match /users/{userId} {
      // 只能讀寫自己的資料
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow create: if isAuthenticated() 
                    && request.auth.uid == userId
                    && hasValidSchema(request.resource.data, 
                                      ['uid', 'email', 'displayName']);
      allow update: if isAuthenticated() 
                    && request.auth.uid == userId
                    // 不能改 uid 與 email
                    && request.resource.data.uid == resource.data.uid
                    && request.resource.data.email == resource.data.email;
      allow delete: if false;  // 不允許前端刪除（要求支援聯絡）
    }
    
    // === SOPs ===
    match /sops/{sopId} {
      allow read: if isMember(resource);
      allow create: if isAuthenticated()
                    && request.resource.data.owner == request.auth.uid
                    && hasValidSchema(request.resource.data, 
                                      ['sopId', 'owner', 'title', 'createdAt']);
      allow update: if isMember(resource)
                    // 不能改 owner
                    && request.resource.data.owner == resource.data.owner;
      allow delete: if isOwner(resource);
      
      // === Versions（子集合）===
      match /versions/{versionId} {
        allow read: if isMember(get(/databases/$(database)/documents/sops/$(sopId)));
        allow create: if isMember(get(/databases/$(database)/documents/sops/$(sopId)));
        allow update: if false;  // 版本不可變
        allow delete: if false;  // 版本不可刪
      }
      
      // === Changes（子集合）===
      match /changes/{changeId} {
        allow read: if isMember(get(/databases/$(database)/documents/sops/$(sopId)));
        allow create: if isMember(get(/databases/$(database)/documents/sops/$(sopId)));
        allow update: if false;
        allow delete: if false;
      }
    }
    
    // === Processing Jobs ===
    match /processing_jobs/{jobId} {
      allow read: if isOwner(resource);
      allow create: if isAuthenticated()
                    && request.resource.data.owner == request.auth.uid;
      allow update: if isOwner(resource);
      allow delete: if isOwner(resource);
    }
    
    // === Usage Stats ===
    match /usage_stats/{statId} {
      // 只能讀，寫入由 Cloud Functions 處理
      allow read: if isAuthenticated() 
                  && resource.data.userId == request.auth.uid;
      allow write: if false;
    }
    
    // === 預設拒絕 ===
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 3. Storage Security Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // 使用者只能存取自己的檔案
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null 
                         && request.auth.uid == userId;
    }
    
    // 預設拒絕
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 4. 上傳檔案安全

#### 檔案類型白名單

```typescript
const ALLOWED_TYPES = {
  // 文字
  'text/plain': '.txt',
  'text/markdown': '.md',
  
  // 文件
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/pdf': '.pdf',
  
  // 圖片
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
} as const;

export function validateFile(file: File): { valid: boolean; reason?: string } {
  if (!ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES]) {
    return { valid: false, reason: `不支援的檔案類型：${file.type}` };
  }
  
  if (file.size > 50 * 1024 * 1024) {
    return { valid: false, reason: '檔案大小超過 50MB 上限' };
  }
  
  return { valid: true };
}
```

#### 檔案內容檢查

對於 PDF：
- 拒絕含 JavaScript 的 PDF
- 拒絕加密的 PDF（要使用者先解密）

對於圖片：
- 檢查實際 magic bytes（不只看副檔名）
- 限制解析度（如 8000x8000 以下）

對於 docx：
- 拒絕含巨集的 docm
- 警告含外部連結的內容

### 5. 跨站攻擊防護（XSS）

Vue 預設會 escape，但要注意：

```vue
<!-- ❌ 危險：v-html 會渲染 HTML -->
<div v-html="userContent" />

<!-- ✅ 安全 -->
<div>{{ userContent }}</div>

<!-- 如果一定要渲染 HTML（例如 Markdown 預覽） -->
<div v-html="sanitize(markdownToHtml(userContent))" />
```

用 DOMPurify 過濾：
```typescript
import DOMPurify from 'dompurify';

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 
                    'ul', 'ol', 'li', 'code', 'pre', 'a'],
    ALLOWED_ATTR: ['href'],
  });
}
```

### 6. 資料隱私

#### Anthropic 資料政策確認

預設情況下：
- ✅ Anthropic 不用 API 資料訓練模型（除非顧客明確同意）
- ✅ 資料保留 30 天後刪除（用於濫用偵測）

如果處理特別敏感的內容（客戶機密、個資）：
- 考慮 Anthropic Zero Data Retention 方案
- 或在前端先做 PII 遮罩再送 API

#### 使用者資料刪除

提供「刪除我的所有資料」功能（雖然個人版可能不太需要）：
- 透過 Cloud Function 執行
- 刪除 Firestore 所有相關文件
- 刪除 Storage 所有檔案
- 從 Auth 刪除帳號

## 成本控制

### 1. Firebase 成本

#### 免費額度（個人使用足夠）

| 服務 | 免費額度 |
|------|---------|
| Auth | 無限 |
| Firestore | 50K 讀 / 20K 寫 / 1GB 儲存 / 天 |
| Storage | 5GB 儲存 / 1GB 下載 / 天 |
| Functions | 2M 次調用 / 月 |
| Hosting | 10GB 儲存 / 360MB/天 下載 |

**估算個人使用一個月**：
- 100 次登入 = 100 reads
- 30 個 SOP 操作 = 300 reads + 50 writes
- 100 個 Function 呼叫 = 100 調用
- 50MB 儲存

**結論**：免費額度的 1% 都用不到。

#### 預算上限保護

雖然免費額度多，還是設預算告警：

```bash
# 在 Firebase Console > Settings > Usage and billing
# 設 Budget alert：$1 / 月
# 超過就發 email 通知
```

### 2. Anthropic API 成本

這是**真正的主要成本來源**。

#### 用量估算

每份 SOP 預估：
- **建立新 SOP**：$2-5 USD
  - 訪談分析：~$1-2
  - 內訓增強（多輪）：~$1-2
  - 文件渲染輔助：~$0.5
- **更新 SOP**：$1-3 USD
  - 抽取（多素材）：~$0.5-1
  - 匯流：~$0.5
  - 潤飾：~$0.5

#### 用量追蹤實作

每次 Function 呼叫後寫入 usage_stats：

```typescript
async function recordUsage(userId: string, response: AnthropicResponse) {
  const cost = calculateCost(response.usage);
  const yearMonth = format(new Date(), 'yyyy-MM');
  const docId = `${userId}_${yearMonth}`;
  
  await db.doc(`usage_stats/${docId}`).set({
    userId,
    yearMonth,
    claudeTokensInput: increment(response.usage.input_tokens),
    claudeTokensOutput: increment(response.usage.output_tokens),
    estimatedCostUsd: increment(cost),
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

function calculateCost(usage: Usage): number {
  // Claude Opus 4.7 定價（依當前實際定價）
  const INPUT_PRICE_PER_MTOK = 15;   // $/MTok
  const OUTPUT_PRICE_PER_MTOK = 75;
  
  return (
    (usage.input_tokens / 1_000_000) * INPUT_PRICE_PER_MTOK +
    (usage.output_tokens / 1_000_000) * OUTPUT_PRICE_PER_MTOK
  );
}
```

#### 月度上限保護

在每次呼叫前檢查：

```typescript
export const claudeProxy = onCall(async (request) => {
  const userId = request.auth!.uid;
  
  // 檢查月度用量
  const yearMonth = format(new Date(), 'yyyy-MM');
  const usageDoc = await db.doc(`usage_stats/${userId}_${yearMonth}`).get();
  const userDoc = await db.doc(`users/${userId}`).get();
  
  const currentUsage = usageDoc.data()?.estimatedCostUsd || 0;
  const limit = userDoc.data()?.apiUsageLimit?.monthly_usd_limit || 50;
  
  if (currentUsage >= limit) {
    throw new HttpsError(
      'resource-exhausted',
      `本月用量已達上限 $${limit}。請到設定頁調整或等下月。`
    );
  }
  
  // 達 80% 通知（透過 Firestore，前端會 listen）
  if (currentUsage >= limit * 0.8) {
    await db.doc(`users/${userId}/notifications/${nanoid()}`).set({
      type: 'usage_warning',
      message: `本月已用 $${currentUsage}，達上限 ${Math.round(currentUsage/limit*100)}%`,
      createdAt: Timestamp.now(),
    });
  }
  
  // 繼續呼叫
  // ...
});
```

#### Token 優化技巧

1. **分塊處理大檔案**：不要一次餵 50 頁文件給 Claude
2. **快取 prompt**：用 Anthropic 的 prompt caching 功能
3. **適當的 max_tokens**：不要每次都設 4096
4. **選擇對的模型**：簡單任務用 Haiku 即可

```typescript
// 範例：簡單分類用 Haiku
const classifyResult = await claudeProxy({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 100,  // 只需要分類結果
  messages: [...]
});

// 複雜抽取才用 Opus
const extractResult = await claudeProxy({
  model: 'claude-opus-4-7',
  max_tokens: 4000,
  messages: [...]
});
```

### 3. 個人預算建議

```yaml
建議配置：
  Firebase: $0/月（用免費額度）
  Anthropic API:
    - 月度上限：$50
    - 預期用量：$10-30
    - 含 Buffer：$50-100 抓得住
  其他: $0
  
  總計：$10-100/月（看用量）
```

設定方式：
- Anthropic Console 設 monthly billing limit
- Firebase 設 budget alert

### 4. 緊急斷路機制

意外大量用量時的保護：

```typescript
// 速率限制：每分鐘最多 10 次 Claude 呼叫
const RATE_LIMIT_PER_MIN = 10;

async function checkRateLimit(userId: string): Promise<boolean> {
  const key = `rate_limit/${userId}/${Math.floor(Date.now() / 60000)}`;
  const ref = db.doc(key);
  
  const snap = await ref.get();
  const count = snap.data()?.count || 0;
  
  if (count >= RATE_LIMIT_PER_MIN) return false;
  
  await ref.set({
    count: increment(1),
    expiresAt: Timestamp.fromMillis(Date.now() + 60000),
  }, { merge: true });
  
  return true;
}
```

## 監控與告警

### 1. 用量監控頁

設定頁要顯示：
- 本月用量 vs 上限
- 各任務類型的成本分布
- Token 使用趨勢

### 2. 異常告警

寫一個 Cloud Function 定期檢查：
- 單日用量是否突然飆升
- API 錯誤率是否上升
- 失敗任務數量

### 3. Sentry 整合（可選）

```typescript
import * as Sentry from '@sentry/vue';

Sentry.init({
  app,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  tracesSampleRate: 0.1,  // 10% 取樣
});
```

個人使用可以不用，免費版有 5K events/月。

## 安全檢查清單

部署前確認：

- [ ] Firestore Rules 通過 emulator 測試
- [ ] Storage Rules 通過 emulator 測試
- [ ] Anthropic key 在 Functions secrets 而非 .env
- [ ] CORS 設定正確（只允許你的網域）
- [ ] 月度用量上限已設定
- [ ] 預算告警已設定
- [ ] 速率限制已實作
- [ ] 敏感資訊不在 git（.gitignore 完整）
- [ ] HTTPS 強制（Firebase Hosting 預設）
- [ ] CSP（Content Security Policy）已設定
