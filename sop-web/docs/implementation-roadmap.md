# 實作 Roadmap（Web 版）

## 階段總覽

| 階段 | 目標 | 預計時長 | 產出 |
|------|------|---------|------|
| W1 | 專案骨架 + Firebase 設定 | 2-3 天 | 可登入的空殼 |
| W2 | Core Library（IR + 抽取器骨架） | 1.5-2 週 | TS library 雛形 |
| W3 | 訪談抽取器 + 基礎 UI | 1 週 | 上傳訪談產 IR |
| W4 | 多素材整合 | 1 週 | 完整產 SOP |
| W5 | Word/PDF 渲染 | 4-5 天 | 可下載文件 |
| W6 | 更新功能基礎 | 1 週 | 修改清單更新 |
| W7 | 多素材更新 + 匯流 | 1-1.5 週 | 完整更新功能 |
| W8 | 互動審核 UI | 1 週 | 審核閘門 |
| W9 | 版本管理 UI | 4-5 天 | 歷史與比較 |
| W10 | 部署與優化 | 3-4 天 | 上線 |

**總計：約 8-10 週**（Claude Code 全力做）

## 階段 W1：專案骨架 + Firebase 設定

### 目標

建立可運行的空殼，使用者可以 Google 登入，看到空的 Dashboard。

### 工作項目

1. **建立 Firebase 專案**
   - 在 Firebase Console 建立專案
   - 啟用 Authentication（Google provider）
   - 啟用 Firestore（asia-east1 區域）
   - 啟用 Storage
   - 啟用 Functions（升級到 Blaze 方案，需要綁卡，但個人用免費額度足夠）

2. **本地專案初始化**
   ```bash
   npm create vite@latest sop-web -- --template vue-ts
   cd sop-web
   npm install
   ```

3. **安裝核心依賴**
   ```bash
   # Firebase
   npm install firebase
   
   # 路由與狀態
   npm install vue-router pinia
   
   # UI
   npm install -D tailwindcss postcss autoprefixer
   npm install lucide-vue-next  # 圖示
   
   # shadcn-vue（手動安裝對應元件）
   
   # 驗證
   npm install zod
   
   # 工具
   npm install date-fns
   npm install nanoid  # 產 ID
   ```

4. **設定 Tailwind**
   - 配置設計系統（顏色、字型）
   - 加入深藍 + 靛紫 accent

5. **設定 Firebase**
   ```typescript
   // src/firebase/config.ts
   import { initializeApp } from 'firebase/app';
   import { getAuth } from 'firebase/auth';
   import { getFirestore } from 'firebase/firestore';
   import { getStorage } from 'firebase/storage';
   import { getFunctions } from 'firebase/functions';
   
   const firebaseConfig = {
     // 從 Firebase Console 取得
   };
   
   export const app = initializeApp(firebaseConfig);
   export const auth = getAuth(app);
   export const db = getFirestore(app);
   export const storage = getStorage(app);
   export const functions = getFunctions(app, 'asia-east1');
   ```

6. **建立基本路由**
   - `/` Landing
   - `/login` Login
   - `/dashboard` Dashboard（要登入才能看）

7. **登入流程**
   - 使用 Firebase Auth 的 Google provider
   - 登入後寫入 users collection
   - 路由 guard 防止未登入訪問

8. **初始化 Cloud Functions**
   ```bash
   firebase init functions --typescript
   ```
   - 建立 hello world function 測試

### 完成標準

- [ ] 本地 `npm run dev` 可跑
- [ ] 可以 Google 登入
- [ ] 登入後 users collection 自動建立記錄
- [ ] Dashboard 是空的但能正確顯示
- [ ] 路由保護生效（未登入無法看 Dashboard）
- [ ] Cloud Function 可被前端呼叫

### 產出檔案

```
sop-web/
├── src/
│   ├── App.vue
│   ├── main.ts
│   ├── router/
│   │   └── index.ts
│   ├── stores/
│   │   └── auth.ts
│   ├── pages/
│   │   ├── LandingPage.vue
│   │   ├── LoginPage.vue
│   │   └── DashboardPage.vue
│   ├── firebase/
│   │   └── config.ts
│   └── style.css
├── functions/
│   └── src/
│       └── index.ts
├── firebase.json
├── firestore.rules
├── storage.rules
└── package.json
```

---

## 階段 W2：Core Library（IR + 抽取器骨架）

### 目標

建立 Core Library 的基礎結構，定義所有資料類型，建立抽取器的抽象介面。

### 工作項目

1. **JSON Schema 定義**
   - `schemas/ir-schema.json`
   - `schemas/change-intent-schema.json`
   - 用 quicktype 產生 TypeScript types

2. **Core 模組結構**
   ```
   src/core/
   ├── types/
   │   ├── ir.ts
   │   ├── change-intent.ts
   │   └── extractor.ts
   ├── ir/
   │   ├── builder.ts
   │   ├── validator.ts
   │   └── schemas.ts
   ├── extractors/
   │   ├── base.ts            # BaseExtractor 抽象類別
   │   ├── transcript.ts      # 訪談（W3 實作）
   │   ├── document.ts        # 文件（W4 實作）
   │   ├── screenshot.ts      # 截圖（W4 實作）
   │   ├── change-list.ts     # 修改清單（W6 實作）
   │   ├── text.ts            # 文字檔（W7 實作）
   │   └── pdf.ts             # PDF（W7 實作）
   ├── merger/
   │   ├── merger.ts          # 匯流引擎（W7 實作）
   │   ├── conflict.ts
   │   └── completeness.ts
   └── renderer/
       ├── docx.ts            # Word 渲染（W5 實作）
       ├── pdf.ts             # PDF 渲染（W5 實作）
       └── markdown.ts        # Markdown（W3 實作）
   ```

3. **BaseExtractor 抽象類別**
   ```typescript
   export abstract class BaseExtractor<TInput, TOutput> {
     abstract type: ExtractorType;
     abstract extract(input: TInput): Promise<TOutput>;
     
     protected async callClaude(prompt: ClaudePrompt): Promise<string> {
       // 透過 Cloud Function 代理呼叫
     }
   }
   ```

4. **Cloud Function：claudeProxy**
   ```typescript
   export const claudeProxy = onCall(async (request) => {
     // 驗證使用者身份
     // 呼叫 Anthropic API
     // 記錄用量到 usage_stats
     // 回傳結果
   });
   ```

5. **Schema 驗證 utility**
   - 用 zod 寫 IR validator
   - 寫測試案例

### 完成標準

- [ ] 所有 TypeScript types 定義完整
- [ ] BaseExtractor 抽象類別可運作
- [ ] claudeProxy function 可被呼叫並回應
- [ ] IR schema validator 通過範例驗證
- [ ] 用量會寫入 Firestore

---

## 階段 W3：訪談抽取器 + 基礎 UI

### 目標

可以上傳訪談逐字稿，產出 IR，並用 Markdown 預覽。

### 工作項目

1. **TranscriptExtractor 實作**
   - 移植 CLI 規格的邏輯到 TS
   - 完整的 prompt 設計

2. **檔案上傳元件**
   - `<FileUploader>` 元件
   - 支援拖拉、點擊
   - 上傳到 Firebase Storage

3. **NewSopPage 雛形**
   - 上傳 → 處理 → 預覽流程

4. **JobProgressPage 雛形**
   - Firestore listener 訂閱進度
   - 進度條顯示

5. **Web Worker 整合**
   - 抽取邏輯在 Worker 跑
   - 不阻塞 UI

6. **Markdown renderer**
   - 從 IR 產 Markdown 預覽
   - 用 marked 顯示

### 完成標準

- [ ] 上傳 1 份訪談文字檔
- [ ] 系統處理（顯示進度）
- [ ] 產出符合 schema 的 IR
- [ ] 可以預覽為 Markdown
- [ ] 寫入 Firestore（建立 SOP + 第一個版本）

---

## 階段 W4：多素材整合

### 目標

支援訪談 + 既有文件 + 截圖三種素材混合輸入。

### 工作項目

1. **DocumentExtractor**
   - 用 mammoth 讀 docx
   - 用 pdf.js 讀 pdf
   - 抽取結構化內容

2. **ScreenshotExtractor**
   - 上傳圖片
   - 透過 Claude Vision 描述（透過 claudeProxy）
   - 產生 image descriptions

3. **IR Builder**
   - 合併多素材輸出
   - source_refs 追溯
   - assets/images.yaml 處理

4. **內訓增強循環**
   - 小新（NewbieSimulator）
   - 小修（Enhancer）
   - 小審（Reviewer）

5. **NewSopPage 完整版**
   - 自動分類上傳的檔案
   - 使用者可調整分類
   - 設定 SOP 基本資訊

### 完成標準

- [ ] 上傳訪談 + Word + 多張截圖
- [ ] 系統正確分類
- [ ] 整合產出單一 IR
- [ ] 截圖正確配對到步驟
- [ ] 內訓增強有作用（可看到補強內容）

---

## 階段 W5：Word/PDF 渲染

### 目標

從 IR 產出符合品牌風格的 Word 與 PDF。

### 工作項目

1. **Word 渲染（用 docx 套件）**
   - 封面頁設計
   - 步驟卡片式排版
   - 顏色系統（深藍 + 靛紫）
   - 截圖嵌入 + 紅框標註

2. **PDF 渲染**
   - 從 Word 轉？或直接用 pdf-lib 渲染？
   - 評估後決定（推薦直接 pdf-lib，更可控）

3. **下載功能**
   - 從 Storage 下載
   - 檔名規則：`{sop_id}-v{version}.docx`

4. **線上預覽**
   - 在頁面中顯示文件預覽
   - 可選：用 mammoth 把 docx 轉 HTML 預覽

### 完成標準

- [ ] 產出 Word 含完整內容
- [ ] 排版專業（封面、目錄、步驟卡片）
- [ ] 截圖正確嵌入
- [ ] 顏色與字型符合設計系統
- [ ] PDF 排版不跑掉
- [ ] 可下載

---

## 階段 W6：更新功能基礎（修改清單）

### 目標

可用修改清單更新既有 SOP，產新版本。

### 工作項目

1. **ChangeListExtractor**
   - Word 表格解析
   - Word 追蹤修訂解析
   - Markdown 條列解析
   - 對映到 step_id

2. **基礎合併引擎**
   - 套用 change_intents 到舊 IR
   - add / modify / remove 處理

3. **UpdateSopPage**
   - 上傳更新素材
   - 同 NewSopPage 但 context 不同

4. **基礎 changelog**
   - 列出本次變更
   - 簡單 diff 顯示

### 完成標準

- [ ] 上傳修改清單
- [ ] 產出 change_intents（信心評估正確）
- [ ] 套用後 step_id 跨版本穩定
- [ ] 新版本寫入 Firestore（versions 子集合）
- [ ] 變更紀錄寫入 changes 子集合

---

## 階段 W7：多素材更新 + 匯流

### 目標

支援所有四種更新素材，並做完整的匯流（去重、衝突偵測、完整性檢查）。

### 工作項目

1. **TextExtractor**
   - 文字檔類型判斷
   - 依類型抽取

2. **PdfExtractor (更新用)**
   - PDF 變更通知處理
   - 術語對映

3. **ScreenshotExtractor (更新用)**
   - 視覺差異分析
   - 連帶影響偵測

4. **匯流引擎**
   - 去重與信心提升
   - 衝突偵測（3 種類型）
   - 完整性檢查（7 種類型）

### 完成標準

- [ ] 四種素材都能正確抽取
- [ ] 多源印證能提升信心
- [ ] 衝突會被偵測
- [ ] 完整性問題會被偵測

---

## 階段 W8：互動審核 UI

### 目標

設計流暢的審核介面，讓使用者快速處理變更、衝突、完整性問題。

### 工作項目

1. **ReviewInterface 頁面**
   - 變更卡片元件
   - 衝突卡片元件
   - 完整性問題卡片元件

2. **批次操作**
   - 「接受所有信心 ≥ X 的項目」
   - 「拒絕所有 < Y 信心的項目」

3. **編輯功能**
   - 內聯編輯變更內容
   - 修改後重算 confidence

4. **鍵盤快捷鍵**
   - a/r/e/s/← /→

5. **進度同步**
   - 審核狀態寫回 Firestore
   - 多分頁同步

### 完成標準

- [ ] 變更逐項審核流暢
- [ ] 衝突解決介面清楚
- [ ] 完整性問題能被處理
- [ ] 鍵盤操作可用
- [ ] 中斷後可恢復進度

---

## 階段 W9：版本管理 UI

### 目標

完整的版本歷史、版本比較、變更紀錄檢視。

### 工作項目

1. **VersionHistoryPage**
   - 時間軸式呈現
   - 每版本的變更摘要

2. **VersionDiff 頁面**
   - 兩版本對照
   - 視覺化 diff（紅綠對比）

3. **三層級 changelog 渲染**
   - 從 changes 文件產出
   - Word 下載

4. **SopDetail 完整版**
   - 多分頁（概覽、預覽、版本、變更、素材）

### 完成標準

- [ ] 版本歷史清楚
- [ ] 版本比較準確
- [ ] changelog 可下載

---

## 階段 W10：部署與優化

### 目標

上線並做最終優化。

### 工作項目

1. **效能優化**
   - 程式碼分割
   - 圖片懶載入
   - Firestore 查詢優化

2. **錯誤處理**
   - 全域錯誤邊界
   - 友善的錯誤訊息
   - Sentry 整合（可選）

3. **使用文件**
   - 寫一份使用手冊
   - 截圖教學

4. **部署**
   - GitHub Actions 自動部署
   - 環境變數設定
   - Firebase Hosting

5. **監控**
   - 用量 dashboard
   - 錯誤監控

### 完成標準

- [ ] 部署到 Firebase Hosting
- [ ] 自訂網域可運作
- [ ] CI/CD 流程跑得通
- [ ] Lighthouse 分數 ≥ 85
- [ ] 你自己用一週沒大問題

---

## 通用實作原則

### 給 Claude Code 的提醒

1. **每階段獨立可運作**：完成後可以獨立 demo
2. **TypeScript 嚴格模式**：強型別，少用 any
3. **元件單一職責**：避免巨型元件
4. **Pinia store 邏輯薄**：複雜邏輯放 core/
5. **Firestore 操作集中**：所有 db 操作在 src/firebase/services/
6. **錯誤要明顯**：catch 後要有 UI 反應
7. **不要編造**：原素材沒有的就標 needs_human_input
8. **語言**：所有 UI 文字繁體中文

### 測試策略

- **Core library**：vitest，每個抽取器要有單元測試
- **Vue 元件**：Vue Test Utils（重要元件）
- **整合測試**：Cypress / Playwright（核心流程）
- **手動測試**：每階段你親自跑一次

### 不要做的事

- ❌ 不要把抽取邏輯放在 Vue 元件中
- ❌ 不要直接從元件呼叫 Firestore（透過 services）
- ❌ 不要把 API key 放前端
- ❌ 不要忽略 TypeScript 錯誤
- ❌ 不要在沒測試的情況下進下階段
- ❌ 不要過度設計（個人工具 = 簡潔優先）
