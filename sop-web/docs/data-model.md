# Firestore 資料模型

## 設計原則

1. **個人使用優先，預留多人擴展**：每個記錄都有 `owner` 欄位
2. **document-oriented**：充分利用 Firestore 的文件型結構
3. **避免深層巢狀**：不超過 3 層 collection
4. **支援即時同步**：適合用 listener 訂閱的結構
5. **歷史不可變**：版本與變更紀錄一旦寫入就不改（只能新增）

## Collections 概覽

```
firestore/
├── users/                         # 使用者
│   └── {user_id}
├── sops/                          # SOP 主檔
│   └── {sop_id}
│       ├── versions/              # 子集合：版本
│       │   └── {version_id}
│       └── changes/               # 子集合：變更紀錄
│           └── {change_id}
├── processing_jobs/               # 處理中的任務
│   └── {job_id}
└── usage_stats/                   # 用量統計（個人）
    └── {user_id}_{yyyy-mm}
```

## 詳細結構

### `users/{user_id}`

```typescript
interface UserDoc {
  // === 基本資訊 ===
  uid: string;                      // = doc.id, = auth.uid
  email: string;
  displayName: string;
  photoURL?: string;
  
  // === 偏好設定 ===
  preferences: {
    language: 'zh-TW' | 'en';       // 預設 zh-TW
    theme: 'light' | 'dark' | 'auto';
    defaultTargetAudience?: string; // 預設「適用對象」字串
  };
  
  // === Anthropic API 用量限制（個人成本控制）===
  apiUsageLimit: {
    monthly_usd_limit: number;       // 預設 50
    notification_threshold: number;  // 預設 0.8（80% 時通知）
  };
  
  // === 元資料 ===
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  
  // === 多人擴展預留 ===
  organizationId?: string;          // 未來擴展用，個人版為 null
  role?: 'admin' | 'member';        // 未來擴展用
}
```

### `sops/{sop_id}`

```typescript
interface SopDoc {
  // === 識別 ===
  id: string;                       // = doc.id
  sopId: string;                    // 業務識別碼（kebab-case）
                                    // 例: "ec2-provisioning"
  
  // === 擁有權（多人擴展核心）===
  owner: string;                    // user.uid
  members?: string[];               // 預留多人擴展，個人版為空陣列
  visibility: 'private' | 'organization' | 'public';  // 預設 'private'
  
  // === 內容元資料（同步自最新 IR）===
  title: string;
  category?: string;                // "AWS 操作"、"n8n 自動化" 等
  tags: string[];
  targetAudience: string;
  estimatedDuration: string;
  difficulty: '初級' | '中級' | '進階';
  authors: string[];
  
  // === 版本資訊 ===
  currentVersion: string;           // semver: "1.3.0"
  totalVersions: number;
  
  // === 統計 ===
  stepsCount: number;
  troubleshootingCount: number;
  glossaryCount: number;
  
  // === 元資料 ===
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastReviewedAt?: Timestamp;
  
  // === 狀態 ===
  status: 'active' | 'archived' | 'draft';
}
```

### `sops/{sop_id}/versions/{version_id}`

```typescript
interface VersionDoc {
  // === 識別 ===
  id: string;                       // = doc.id（建議用 v{semver} 如 "v1.3.0"）
  version: string;                  // "1.3.0"
  
  // === 完整 IR（內嵌）===
  ir: IR;                           // 完整的 IR 物件（JSON）
                                    // 大小限制：Firestore 文件 1MB
                                    // 超過 1MB 時 ir 改存 Storage，這裡放 ir_storage_url
  
  // === Storage 路徑 ===
  irStorageUrl?: string;            // 如果 IR > 1MB 改存 Storage
  documentDocxUrl: string;          // 產出的 Word 文件
  documentPdfUrl: string;           // 產出的 PDF
  sourceMaterialsUrls: string[];    // 該版本使用的原始素材
  
  // === 關聯到變更紀錄 ===
  fromVersion?: string;             // 從哪個版本改來的（首版為 null）
  changeId?: string;                // 對應 changes/{change_id}
  
  // === 元資料 ===
  createdAt: Timestamp;
  createdBy: string;                // user.uid
  changeSummary?: string;           // 一句話摘要
  
  // === 品質檢查 ===
  qualityIssues: number;            // 待處理的品質問題數
  needsRetraining: boolean;
}
```

### `sops/{sop_id}/changes/{change_id}`

```typescript
interface ChangeDoc {
  // === 識別 ===
  id: string;                       // = doc.id
  
  // === 版本關聯 ===
  fromVersion: string;              // "1.2.0"
  toVersion: string;                // "1.3.0"
  
  // === 變更詳情 ===
  changeIntents: ChangeIntent[];    // 完整的變更意圖陣列（schema 見 schemas/）
  conflicts: Conflict[];
  completenessIssues: CompletenessIssue[];
  
  // === 統計 ===
  stats: {
    totalRawIntents: number;
    consolidated: number;
    autoApplied: number;
    manuallyAccepted: number;
    rejected: number;
    conflictsResolved: number;
  };
  
  // === Changelog 文件 ===
  changelogDocxUrl: string;         // 三層級 changelog Word
  
  // === 元資料 ===
  createdAt: Timestamp;
  appliedAt: Timestamp;
  appliedBy: string;
  reviewer: string;
}
```

### `processing_jobs/{job_id}`

```typescript
interface ProcessingJobDoc {
  // === 識別 ===
  id: string;                       // = doc.id
  
  // === 擁有權 ===
  owner: string;                    // user.uid
  
  // === 任務類型 ===
  type: 'create_sop' | 'update_sop';
  
  // === 關聯 ===
  sopId?: string;                   // 完成後關聯到 SOP（create_sop 才有）
  fromVersion?: string;             // update_sop 才有
  
  // === 狀態 ===
  status: 
    | 'pending'                     // 剛建立
    | 'uploading'                   // 上傳中
    | 'extracting'                  // 抽取中
    | 'building_ir'                 // 建構 IR 中
    | 'enhancing'                   // 內訓增強中
    | 'merging'                     // （update）匯流中
    | 'awaiting_review'             // 等待人工審核
    | 'rendering'                   // 產文件中
    | 'completed'                   // 完成
    | 'failed'                      // 失敗
    | 'cancelled';                  // 使用者取消
  
  // === 進度 ===
  progress: number;                 // 0-100
  currentStep: string;              // 「分析訪談逐字稿」「整合截圖」等
  
  // === 子任務狀態（給 UI 顯示）===
  subtasks: Array<{
    name: string;                   // 「上傳檔案」「抽取訪談」等
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: Timestamp;
    completedAt?: Timestamp;
    message?: string;
  }>;
  
  // === 上傳的檔案 ===
  uploadedFiles: Array<{
    name: string;
    type: 'transcript' | 'document' | 'screenshot' | 'change_list' | 'pdf' | 'text';
    storageUrl: string;
    size: number;                   // bytes
    contentType: string;            // MIME
  }>;
  
  // === 中間產物（除錯用）===
  intermediate?: {
    extractorOutputs?: Record<string, any>;
    irDraft?: any;
    changeIntents?: any;
  };
  
  // === 結果 ===
  result?: {
    sopId: string;                  // 完成後產出的 SOP
    versionId: string;
  };
  
  // === 錯誤 ===
  error?: {
    message: string;
    code: string;
    stack?: string;
    occurredAt: Timestamp;
  };
  
  // === 成本追蹤 ===
  apiUsage: {
    claudeTokensInput: number;
    claudeTokensOutput: number;
    estimatedCostUsd: number;
  };
  
  // === 元資料 ===
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  
  // === 預估時間 ===
  estimatedTimeRemainingSec?: number;
}
```

### `usage_stats/{user_id}_{yyyy-mm}`

```typescript
interface UsageStatsDoc {
  // === 識別 ===
  id: string;                       // 例: "uid_2026-05"
  userId: string;
  yearMonth: string;                // "2026-05"
  
  // === Claude API 用量 ===
  claudeTokensInput: number;
  claudeTokensOutput: number;
  estimatedCostUsd: number;
  
  // === 操作統計 ===
  sopsCreated: number;
  sopsUpdated: number;
  filesProcessed: number;
  
  // === 元資料 ===
  updatedAt: Timestamp;
}
```

## 關鍵設計決策

### 為什麼 IR 內嵌在 version 文件中？

Firestore 文件上限 1MB，一份普通 SOP 的 IR 約 50-200KB。

**好處**：
- 一次讀取，不用多次查詢
- 簡單

**特殊情況**：
- IR > 1MB 時改存 Storage（用 `irStorageUrl` 欄位）
- 大型 SOP 的截圖描述可能讓 IR 變大

### 為什麼 changes 是獨立 collection 不是嵌在 version 裡？

- 一個變更可能對應多個版本（如 v1.2 的變更被 revert 後，v1.4 又用了）
- 變更可以單獨查詢、分析
- 變更紀錄是「歷史事實」，不該嵌在會變動的 version 裡

### 為什麼 processing_jobs 是頂層 collection？

- 一個 job 還沒完成時不能放 sop 下（sop 還沒建立）
- 跨 sop 查詢方便（「我所有處理中的任務」）
- 完成後可以歸檔/刪除，不污染主資料

### 為什麼預留 `members[]` 而不是另開 organization collection？

個人使用版本：
```typescript
sop: { owner: "jin", members: [] }
```

未來多人擴展：
```typescript
sop: { 
  owner: "jin", 
  members: ["alice", "bob"],
  organizationId: "cloudorange"
}
```

- 個人使用時 members 是空陣列，無額外負擔
- 加入多人功能時不用大改資料結構
- Security Rules 同時支援個人與多人：
  ```
  allow read: if owner == request.auth.uid 
              || request.auth.uid in members;
  ```

## Indexes 建議

Firestore 預設索引可能不夠，要建立 composite index：

```yaml
indexes:
  - collection: sops
    fields:
      - owner: ASCENDING
      - updatedAt: DESCENDING
    purpose: "查詢使用者的 SOP，按更新時間排序"
  
  - collection: processing_jobs
    fields:
      - owner: ASCENDING
      - status: ASCENDING
      - createdAt: DESCENDING
    purpose: "查詢使用者進行中的任務"
  
  - collection: sops/{sopId}/versions
    fields:
      - createdAt: DESCENDING
    purpose: "版本歷史，新到舊"
```

## 資料量估算（個人使用）

每份 SOP：
- 主檔：~5KB
- 每版本（含 IR）：~100KB
- 每變更紀錄：~50KB

每月 10 份新 SOP + 30 次更新：
- ~3MB Firestore（單月）
- ~50MB Storage（含截圖、Word/PDF）

**結論**：免費額度（1GB Firestore + 5GB Storage）可用很久。

## TypeScript 類型定義

實作時應建立統一的類型定義檔：

```typescript
// src/types/firestore.ts
export interface UserDoc { ... }
export interface SopDoc { ... }
export interface VersionDoc { ... }
export interface ChangeDoc { ... }
export interface ProcessingJobDoc { ... }
export interface UsageStatsDoc { ... }

// src/types/ir.ts（從 schemas/ir-schema.json 推導）
export interface IR { ... }

// src/types/change-intent.ts
export interface ChangeIntent { ... }
export interface Conflict { ... }
export interface CompletenessIssue { ... }
```

建議用 `quicktype` 或 `json-schema-to-typescript` 從 JSON Schema 自動產生類型，避免手寫不同步。
