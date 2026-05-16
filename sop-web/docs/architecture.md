# 系統架構

## 整體資料流

```
┌─────────────────────────────────────────────────────────────┐
│                     使用者瀏覽器                              │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Vue 3 + TypeScript                      │   │
│  │                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐                 │   │
│  │  │  Pages       │  │  Components  │                 │   │
│  │  │  - Login     │  │  - Uploader  │                 │   │
│  │  │  - Dashboard │  │  - Reviewer  │                 │   │
│  │  │  - Editor    │  │  - Diff View │                 │   │
│  │  └──────────────┘  └──────────────┘                 │   │
│  │                                                      │   │
│  │  ┌────────────────────────────────────────────┐     │   │
│  │  │           Pinia Stores                     │     │   │
│  │  │  - authStore  - sopStore  - jobStore       │     │   │
│  │  └────────────────────────────────────────────┘     │   │
│  │                                                      │   │
│  │  ┌────────────────────────────────────────────┐     │   │
│  │  │      Core Library (TypeScript)              │     │   │
│  │  │                                              │     │   │
│  │  │  Extractors:                                 │     │   │
│  │  │  - TranscriptExtractor                       │     │   │
│  │  │  - DocumentExtractor                         │     │   │
│  │  │  - ScreenshotExtractor                       │     │   │
│  │  │  - ChangeListExtractor                       │     │   │
│  │  │  - TextExtractor                             │     │   │
│  │  │  - PdfExtractor                              │     │   │
│  │  │                                              │     │   │
│  │  │  IR Builder, Merger, Renderer                │     │   │
│  │  └────────────────────────────────────────────┘     │   │
│  │                                                      │   │
│  │  ┌────────────────────────────────────────────┐     │   │
│  │  │      Firebase SDK                           │     │   │
│  │  │  - Auth, Firestore, Storage, Functions      │     │   │
│  │  └────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                  Firebase（後端）                            │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Auth      │  │  Firestore   │  │   Storage    │       │
│  │             │  │              │  │              │       │
│  │  Google     │  │  - users     │  │  - 上傳檔案  │       │
│  │  登入       │  │  - sops      │  │  - 產出文件  │       │
│  │             │  │  - jobs      │  │  - 截圖      │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │            Cloud Functions                          │     │
│  │                                                     │     │
│  │  - claudeProxy (代理 Anthropic API，藏 key)        │     │
│  │  - validateSop (寫入前驗證 IR schema)              │     │
│  │  - cleanupTempFiles (定期清理暫存檔)               │     │
│  └────────────────────────────────────────────────────┘     │
│                                ↓                             │
│                   ┌─────────────────────────┐                │
│                   │   Anthropic Claude API   │                │
│                   └─────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## 為什麼這樣設計

### 為什麼前端做大部分工作？

**優點**：
- ✅ 成本低（使用者瀏覽器運算 = 不花錢）
- ✅ 即時回饋（不用等網路來回）
- ✅ 容易除錯（瀏覽器開發者工具）
- ✅ 隱私好（檔案不離開使用者瀏覽器，除非主動儲存）

**限制**：
- ⚠️ 大檔案受限於瀏覽器記憶體
- ⚠️ 同時處理多任務會卡 UI（要用 Web Worker）

### 為什麼還需要 Cloud Functions？

**只用來做這兩件事**：

1. **代理 Claude API**
   - API key 必須藏在後端
   - Functions 環境變數安全存放
   - 還可順便做用量限制、日誌

2. **寫入前驗證**（可選）
   - IR schema 驗證
   - 檔案大小檢查
   - 防止使用者透過 console 硬塞錯資料

不做：
- ❌ 抽取邏輯（前端處理）
- ❌ 文件渲染（前端用 docx.js）
- ❌ 檔案處理（前端用 mammoth/pdf.js）

### 為什麼用 Firestore 不用 Realtime Database？

| 項目 | Firestore | Realtime DB |
|------|-----------|------------|
| 結構 | 文件型，類似 MongoDB | 巨大 JSON 樹 |
| 查詢能力 | 強（多條件、排序、分頁） | 弱 |
| 即時同步 | 支援（listener） | 支援（更即時） |
| 擴展性 | 高 | 中 |
| 成本 | 按操作次數 | 按頻寬 |
| **對 SOP 系統** | **更適合（複雜查詢）** | 不適合 |

## 模組分層

### Layer 1：UI 層（Vue 3）

**職責**：
- 頁面路由
- 元件渲染
- 使用者互動處理
- 狀態管理（Pinia）

**不做**：
- 業務邏輯（交給 Core Library）
- 資料儲存（交給 Firebase SDK）

### Layer 2：Core Library 層（TypeScript）

**職責**：
- 抽取器（6 種素材）
- IR 建構與驗證
- 變更合併引擎
- 文件渲染（docx、pdf）
- Schema 驗證

**特性**：
- 純 TypeScript，無 Vue 依賴
- 可獨立測試
- 未來可重複用於 Node CLI / 桌面應用

### Layer 3：Firebase 整合層

**職責**：
- 認證（Auth）
- 資料讀寫（Firestore）
- 檔案上傳下載（Storage）
- Cloud Function 呼叫

**設計**：
- 包裝 Firebase SDK 成 service classes
- 不直接讓元件操作 SDK
- 統一錯誤處理

### Layer 4：後端 Functions 層

**職責**：
- 代理 Claude API
- 安全檢查
- 定期任務

**特性**：
- 最小化（不做業務邏輯）
- 無狀態
- TypeScript

## 處理長任務的策略

產 SOP 是長任務（可能 5-15 分鐘），不能阻塞 UI。

### 方案：Web Worker + Firestore 即時同步

```
主執行緒（Vue UI）
    ↓ postMessage
Web Worker（執行抽取、合併、渲染）
    ↓ 進度回報
主執行緒
    ↓ 寫入 Firestore（jobs collection）
Firestore listener（其他元件訂閱）
    ↓ 即時更新
進度條 UI
```

**好處**：
- 不阻塞 UI
- 進度即時顯示
- 多分頁可看到同個任務進度
- 可中斷（使用者按取消）

### 何時用 Cloud Functions 處理？

只有兩種情況才把任務丟到後端：
1. 呼叫 Claude API（必須走後端）
2. 大檔案處理（瀏覽器記憶體不夠）

否則一律前端處理。

## 即時更新機制（Firestore Listener）

```typescript
// 訂閱處理任務狀態
const jobRef = doc(db, 'processing_jobs', jobId);
onSnapshot(jobRef, (snapshot) => {
  const job = snapshot.data();
  // 進度條自動更新
  store.updateJobProgress(job);
});
```

這個設計讓 UI 和處理邏輯解耦：
- 處理邏輯只管寫 Firestore
- UI 只管讀 Firestore
- 任何一邊變動都自動同步

## 安全模型

### 認證

- Firebase Authentication 處理
- 預設只開 Google 登入（個人用）
- 未來加 Email + Password、Microsoft 等

### 授權（Firestore Security Rules）

```
個人使用版本（v1）：
  - 任何人可登入
  - 每個使用者只能讀寫自己的資料
  - owner 欄位匹配 auth.uid

未來多人版本：
  - 加上 members[] 欄位
  - 規則改為：owner == uid OR uid in members
```

### API Key 保護

```
Anthropic API Key
  ↓ 存放
Firebase Functions 環境變數
  ↓ 只能被
Cloud Function 讀取
  ↓ 對外提供
HTTPS endpoint（要 Firebase Auth token）
  ↓ 接收
前端的 prompt
  ↓ 轉發
Anthropic API
```

**前端永遠看不到 key**。

### 資料隱私

- 檔案存在使用者自己的 Storage 路徑下
- Firestore Rules 確保跨使用者不可讀
- 即使使用者本機有 token 被偷，也只能看自己的資料

## 成本控制

### Firebase 免費額度（個人使用足夠）

| 服務 | 免費額度 |
|------|---------|
| Auth | 無限 |
| Firestore | 50K 讀 / 20K 寫 / 1GB 儲存 / 天 |
| Storage | 5GB 儲存 / 1GB 下載 / 天 |
| Functions | 2M 次調用 / 月 |
| Hosting | 10GB 儲存 / 360MB/天 下載 |

### Claude API 成本（要自己付）

- 預估每份 SOP $2-5 USD
- 建議在使用者首頁顯示「本月已用 $XX」
- 設定月度上限（例如 $50），超過自動暫停

## 部署架構

```
GitHub repo (sop-web)
    ↓ push
GitHub Actions
    ↓ build (npm run build)
Firebase Hosting
    ↓ deploy

最終產物：
- https://your-app.web.app（Firebase 預設）
- https://your-app.firebaseapp.com（備用網域）
- 可加 custom domain
```

部署細節見 `deployment/deploy-guide.md`。
