# SOP 內訓文件產生與更新系統 - Web 版

> Claude Code 實作規格 v1.0
> 適用情境：CloudOrange 雲力橘子 內部工具（個人使用 + 預留多人擴展）
> 部署平台：Firebase（Hosting + Auth + Firestore + Storage + Functions）

## 系統概覽

把 CLI 版的 SOP 系統包裝成 Web 應用，讓使用者透過瀏覽器：
1. 上傳訪談、文件、截圖、修改清單
2. 自動產出內訓 SOP（Word/PDF）
3. 管理多版本與變更紀錄
4. 用更新素材修訂既有 SOP

## 技術棧

| 層 | 技術 |
|----|------|
| **前端框架** | Vue 3 + Vite + TypeScript |
| **狀態管理** | Pinia |
| **路由** | Vue Router |
| **UI 函式庫** | shadcn-vue + Tailwind CSS |
| **檔案處理** | mammoth (docx 讀)、pdf.js (pdf 讀)、docx (docx 寫)、pdf-lib (pdf 寫) |
| **後端服務** | Firebase 全家桶 |
| **AI 模型** | Claude API（透過 Cloud Functions 代理） |
| **部署** | Firebase Hosting |

## Firebase 服務使用

- **Authentication**：Google 登入（個人用最方便）
- **Firestore**：使用者、SOP、版本、變更紀錄的中繼資料
- **Cloud Storage**：上傳檔案、產出文件、截圖
- **Cloud Functions**：Claude API 代理、檔案處理（如需要）
- **Hosting**：靜態網站託管

## 核心設計原則

1. **核心邏輯前端做**：抽取、IR 建構、合併、渲染都在瀏覽器
2. **Cloud Functions 只做兩件事**：
   - 代理 Claude API（藏 API key）
   - 寫入 Firestore 前的權限檢查
3. **資料模型預留多人**：所有記錄都有 owner 欄位，未來加 members 即可
4. **個人使用優先**：登入即可用，不做複雜的權限管理

## 目錄結構

```
sop-web/
├── README.md                      # 本檔
├── CLAUDE_CODE_HANDOFF.md         # 給 Claude Code 的接手指引
├── CLAUDE.md                      # Claude Code 專案配置（自動載入）
├── docs/                          # 完整文件
│   ├── architecture.md            # 系統架構
│   ├── data-model.md              # Firestore 資料模型
│   ├── ux-flows.md                # 使用者流程
│   ├── implementation-roadmap.md  # 實作 Roadmap
│   └── security.md                # 安全與成本控制
├── schemas/                       # 資料 schema（沿用 CLI 規格）
│   ├── ir-schema.json             # IR JSON Schema
│   ├── change-intent-schema.json  # 變更意圖 schema
│   └── examples/
├── skills/                        # 業務邏輯規格（沿用 CLI 規格）
│   ├── sop-trainer/
│   └── sop-updater/
├── firebase/                      # Firebase 設定
│   ├── functions/                 # Cloud Functions 規格
│   ├── security-rules/            # Firestore + Storage 安全規則
│   └── firebase-config-spec.md
├── frontend/                      # 前端規格
│   ├── pages-spec.md              # 頁面規格
│   ├── components-spec/           # 元件規格
│   ├── stores-spec.md             # Pinia stores
│   └── design-system.md           # 設計系統
├── deployment/                    # 部署相關
│   └── deploy-guide.md
└── tests/
    └── test-cases.md
```

## 與 CLI 版的關係

CLI 版規格中的核心設計**幾乎完全沿用**：

| CLI 版 | Web 版 | 變動 |
|-------|--------|-----|
| IR schema (YAML) | IR schema (JSON) | 格式轉換 |
| 四個抽取器邏輯 | TypeScript 改寫 | 邏輯同、語言換 |
| 匯流引擎 | TypeScript 改寫 | 邏輯同、語言換 |
| Word/PDF 模板規格 | docx.js 實作 | 邏輯同、API 換 |
| CLI 互動 | Web UI | **重新設計 UX** |
| 本機檔案系統 | Firebase Storage | 儲存層換 |
| 無使用者管理 | Firebase Auth | 新增 |

**新增的部分**：
- 前端 UI（Vue 3 元件、頁面、路由）
- Firebase 整合（Auth、Firestore、Storage、Functions）
- 即時進度顯示（用 Firestore listener）
- 雲端版本管理

## 給 Claude Code 的指引

請依以下順序閱讀：

1. **CLAUDE_CODE_HANDOFF.md** ← 接手指引
2. **README.md** ← 你正在讀
3. **docs/architecture.md** ← 系統架構
4. **docs/data-model.md** ← 資料模型（最重要）
5. **docs/ux-flows.md** ← 使用者流程
6. **docs/implementation-roadmap.md** ← 分階段實作
7. **schemas/** ← 資料 schema
8. **firebase/** ← Firebase 相關
9. **frontend/** ← 前端規格
10. **skills/** ← 業務邏輯（沿用 CLI 規格）

## 重要約定

- **語言**：所有面向使用者的文字繁體中文（zh-TW）
- **編碼**：UTF-8
- **時區**：時間戳一律 GMT+8（用 Firestore Timestamp，UI 顯示時轉 +08:00）
- **設計**：深藍 (#1A2B4A) + 靛紫 (#4A3A6E) accent + 淺色底
- **檔名規則**：kebab-case
- **TypeScript**：嚴格模式（strict: true）

## 關鍵限制與注意

### Anthropic API Key 安全
- **絕對不能放前端**
- 透過 Cloud Functions 代理
- Functions 環境變數儲存 key

### 檔案大小限制
- 單檔 50MB（瀏覽器處理上限）
- 總素材 200MB / SOP

### Claude API 成本
- 每份 SOP 預估 $2-5 USD
- 個人使用無上限，但要顯示用量

### 瀏覽器支援
- Chrome / Edge 最新 2 版
- Firefox 最新 2 版
- Safari 最新 2 版
- 不支援 IE
