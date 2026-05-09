# sop-web

SOP 內訓文件產生與更新系統 (Web 版) — 實作專案。

完整規格在 `../SOP/` 目錄。本目錄是 Web 版的可執行實作。

## 階段狀態

目前完成：**W1（專案骨架 + Firebase Emulator）**

之後階段見 `../SOP/extracted/sop-web/docs/implementation-roadmap.md`。

## 開發環境需求

- Node.js 20+ (測試在 Node 22 也可，functions emulator 會以 host node 跑)
- pnpm 10+
- Java 11+ (Firestore / Storage emulator 需要)
- 任何瀏覽器 (Chrome / Edge / Firefox / Safari 最新兩版)

## 第一次設定

```bash
pnpm install
```

## 開發指令

```bash
# 同時啟動前端 + 全套 Firebase Emulator
pnpm dev

# 或分開
pnpm dev:web        # http://localhost:5173
pnpm emu            # Emulator UI: http://localhost:4000

# 型別檢查
pnpm typecheck

# 測試
pnpm test

# 建置
pnpm build
```

## Emulator 連接埠

| 服務 | Port |
|------|------|
| Vite dev server | 5173 |
| Auth | 9099 |
| Firestore | 8080 |
| Storage | 9199 |
| Functions | 5001 |
| Hosting | 5000 |
| Emulator UI | 4000 |

## 目錄結構

```
sop-web/
├── frontend/          # Vue 3 + Vite + TS
│   └── src/
│       ├── pages/     # Landing / Login / Dashboard
│       ├── layouts/   # AuthLayout / MainLayout
│       ├── components/
│       ├── router/
│       ├── stores/    # Pinia (auth)
│       ├── services/  # Firestore / Auth 包裝層
│       ├── firebase/  # SDK 初始化
│       └── types/
├── functions/         # Cloud Functions (TS)
│   └── src/
│       ├── index.ts
│       └── hello.ts   # W1: helloWorld 用於管線驗證
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
└── pnpm-workspace.yaml
```

## W1 驗收

W1 只跑 Emulator，不接正式 Firebase 專案。流程：

1. `pnpm install`
2. `pnpm dev`（啟動 Vite + Emulator）
3. 開 http://localhost:5173
4. 點 Landing 的「使用 Google 登入」→ Auth Emulator 會跳出 mock 登入畫面，建一個假帳號
5. 自動轉到 `/dashboard`，看到「您還沒有 SOP」+ Cloud Function 連線狀態
6. 開 http://localhost:4000 → Firestore tab 確認 `users/{uid}` 已建立，含 `preferences`、`apiUsageLimit` 預設值
7. DevTools console 應有 `[helloWorld]` 訊息

## 重要約定

- **語言**：UI 文字一律繁體中文 (zh-TW)
- **時區**：Firestore Timestamp 為 UTC，UI 顯示用 +08:00 (date-fns-tz)
- **TypeScript**：strict mode + noUncheckedIndexedAccess
- **元件命名**：PascalCase 檔案、kebab-case 多字檔名
- **業務邏輯放 core/**（W2 起建立），不寫在 Vue 元件中
- **Firestore 操作集中在 services/**，不直接從元件呼叫 SDK
