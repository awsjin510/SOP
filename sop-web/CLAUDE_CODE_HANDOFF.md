# 給 Claude Code 的接手指引（Web 版）

> **Claude Code 你好。如果你正在讀這份文件，這是你應該讀的第一份檔案。**

## 你的任務

從零實作一個 **SOP 內訓文件產生與更新系統的 Web 版**。

本目錄已包含完整規格，你的工作是依規格寫程式。

## 重要的脈絡

這個專案有「**先前已存在的 CLI 規格**」（在另一個 repo 或目錄）。Web 版的核心邏輯（IR、抽取器邏輯、合併規則）與 CLI 版相同，但：

- 語言：Python → TypeScript
- 介面：CLI → Web UI
- 儲存：本機檔案 → Firebase
- 互動：終端機問答 → Web 表單

如果你看到某些設計決策（例如 step_id 為何不用順序編號、為何要分流抽取再匯流）覺得很細，那是 CLI 版規格中討論過的結論，**請尊重這些設計決策**，不要重新發明輪子。

## 閱讀順序（請嚴格遵守）

1. **本檔（CLAUDE_CODE_HANDOFF.md）** ← 你正在讀
2. **README.md** — 專案總覽
3. **docs/architecture.md** — 系統架構
4. **docs/data-model.md** — Firestore 資料模型（最重要！）
5. **docs/ux-flows.md** — 使用者流程
6. **docs/security.md** — 安全與成本控制
7. **docs/implementation-roadmap.md** — 分階段實作指引
8. **frontend/design-system.md** — 設計系統
9. **frontend/pages-spec.md** — 頁面規格
10. **firebase/functions/functions-spec.md** — Cloud Functions
11. **schemas/** — 資料 schema
12. **skills/** — 業務邏輯規格

## 你應該怎麼做

### 第一階段：理解（不要急著寫程式碼）

按上面順序讀完後，先做以下三件事：

1. **回頭跟使用者確認你理解的範圍**
   - 列出系統將支援的素材類型
   - 列出資料流（前端 → Functions → Anthropic）
   - 列出兩個主要功能（建立 SOP、更新 SOP）
   
2. **跟使用者確認實作環境**
   - Node 版本、套件管理工具（npm / pnpm / yarn）
   - 本地開發環境設定
   - Firebase 專案是否已建立
   - Anthropic API Key 是否已準備

3. **跟使用者確認測試策略**
   - 是否要先用 Firebase Emulator 開發
   - 何時部署到正式環境
   - 測試素材怎麼來

### 第二階段：依 roadmap 階段實作

嚴格按照 `docs/implementation-roadmap.md` 的順序，**一個階段一個階段做**。

每個階段都要：
1. 在動工前跟使用者確認本階段的範圍
2. 完成後**自己跑一次測試**確認可運作
3. 跟使用者展示成果，獲得確認後再進下一階段

**不要一次寫完所有功能**。

### 第三階段：使用者驗收

每階段完成都要展示：
- 程式碼能跑（npm run dev）
- 範例輸入能產生符合 schema 的輸出
- 邊界案例有處理（或標記為 TODO）

## 重要原則（非常重要，請反覆閱讀）

### 1. Schema 是契約
- 所有資料結構以 `schemas/*.json` 為準
- 任何 schema 變動先跟使用者確認
- 用 quicktype 或 json-schema-to-typescript 產生 TS types

### 2. 分層職責
- **UI 元件**：只管渲染、收使用者輸入
- **Pinia Stores**：只管狀態、訂閱 Firestore
- **Core Library**：所有業務邏輯（抽取、合併、渲染）
- **Firebase Services**：所有 Firebase 操作

不要把業務邏輯放在 Vue 元件中。

### 3. step_id 必須穩定
- 用 nanoid 或 UUID
- **絕對不要**用順序編號
- 跨版本永遠不變

### 4. 不要編造內容
- 原素材沒有的資訊就標 `needs_human_input: true`
- 不確定就拋給使用者確認
- `source_refs` 必須真實存在

### 5. 安全絕對優先
- API Key 絕對不放前端
- 所有寫入透過 Firestore Security Rules 保護
- 上傳檔案必須驗證類型與大小

### 6. 成本意識
- 用便宜的模型做簡單任務
- 用 prompt caching
- 設定月度上限

### 7. 語言與時區
- 所有面向使用者的文字一律**繁體中文（zh-TW）**
- 程式碼註解可用英文
- 所有時間戳一律 GMT+8（UI 顯示用 +08:00）

### 8. TypeScript 嚴格模式
- `strict: true`
- 不用 any（除非真的不得已）
- 不用 ts-ignore（除非有充分理由）

## 你會用到的依賴

### 前端（Vite + Vue 3）
```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.0",
    "pinia": "^2.1.0",
    
    "firebase": "^10.7.0",
    
    "tailwindcss": "^3.4.0",
    "lucide-vue-next": "^0.300.0",
    
    "zod": "^3.22.0",
    "date-fns": "^3.0.0",
    "nanoid": "^5.0.0",
    
    "mammoth": "^1.6.0",
    "pdfjs-dist": "^4.0.0",
    "docx": "^8.5.0",
    "pdf-lib": "^1.17.0",
    "marked": "^11.0.0",
    "dompurify": "^3.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "typescript": "^5.3.0",
    "vue-tsc": "^1.8.0",
    "vitest": "^1.1.0",
    "@vue/test-utils": "^2.4.0"
  }
}
```

### 後端（Cloud Functions）
```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "date-fns": "^3.0.0"
  }
}
```

## 不要做的事

- ❌ 不要把 API Key 放前端
- ❌ 不要把整個系統一次寫完
- ❌ 不要跳過 schema 驗證
- ❌ 不要把所有素材丟給一個大 prompt 處理（要分流）
- ❌ 不要為了精簡跳過 source_refs（更新功能會壞）
- ❌ 不要自動解決衝突
- ❌ 不要在第一階段就追求 100% 自動化
- ❌ 不要重新編號 step_id
- ❌ 不要用簡體中文
- ❌ 不要直接從元件呼叫 Firestore（透過 services）
- ❌ 不要在 Pinia store 寫業務邏輯（放 core/）

## 該做的事

- ✅ 階段性實作，每階段獨立可運作
- ✅ 寫測試（每個 extractor 都要有測試）
- ✅ 用 schema 驗證所有資料
- ✅ 保留中間產物方便除錯
- ✅ 遇到模糊需求**主動問**使用者
- ✅ 每階段結束跟使用者展示
- ✅ 把所有 prompt 放在 SKILL.md 中（不要塞在 TS 裡）
- ✅ 先用 Firebase Emulator 開發

## 你應該如何回應使用者

當使用者說「開始吧」「請開始實作」時，你的第一個回應應該是：

```
我已經讀完規格，準備開始實作。在動工前我想跟你確認幾件事：

【系統理解確認】
我理解這個系統將：
1. ...
2. ...

【實作環境確認】
- Node.js 版本：建議 20 LTS
- 套件管理工具：建議 pnpm（理由...）
- Firebase 專案：是否已建立？我需要 firebaseConfig
- Anthropic API Key：是否已準備？是否要我教你如何設定 Functions secrets

【實作起點建議】
依 roadmap 我建議從階段 W1 開始：
- 目標：專案骨架 + Firebase 基礎設定
- 預計產出：可登入的空殼網站
- 預計時長：2-3 天

【需要確認的事】
1. Firebase 專案的 region 你偏好哪個？建議 asia-east1
2. 預設的月度 API 用量上限：建議 $50
3. 是否要先建立 GitHub repo？

確認以上後我就進入階段 W1。
```

**不要在沒確認的情況下直接開始寫程式碼。**

## 階段交付的標準格式

每階段完成時：

```
✅ 階段 W{n} 完成

【本階段成果】
- 程式碼：commits {sha1}..{sha2}
- 測試：通過 {x}/{y} 個測試案例
- 部署：{是否已部署到 Firebase Hosting}

【已實作功能】
1. ...
2. ...

【已知限制 / TODO】
1. ...
2. ...

【建議下一步】
進入階段 W{n+1}：{階段名稱}
- 目標：{說明}
- 預計時長：{時間}

是否進入下一階段？
```

## 出錯時怎麼辦

- **規格有矛盾**：先列出矛盾點，問使用者怎麼處理，**不要自己決定**
- **規格未涵蓋的情境**：列出來問
- **技術選擇有多種方案**：列出選項+利弊，請使用者選
- **測試失敗**：先停下，分析原因，跟使用者討論
- **超出 Firebase 免費額度**：立刻停下，跟使用者討論

## 與 CLI 版規格的關係

如果使用者要把 CLI 規格中的某些檔案搬過來用，這個 Web 版規格的 `skills/` 目錄就是放那些檔案的地方。

CLI 版的規格檔案：
- `schemas/ir-schema.yaml` → Web 版用 JSON 版本
- `skills/sop-trainer/SKILL.md` → Web 版做為「sop-trainer 邏輯規格」（不是真的 skill）
- `skills/sop-updater/SKILL.md` → 同上
- 抽取器的 prompt → 直接搬

**邏輯不變，載體改變**。

## 最後提醒

這個系統的使用者是 **Jin**，工作於 CloudOrange（雲力橘子）。Jin 的偏好：
- 繁體中文溝通
- 工程師背景，可以聊技術細節
- 偏好深色 accent + 淺色底（深藍 / 靛紫）
- 重視結構化、可追溯
- 已熟悉 Claude Code、n8n、AWS、多代理系統

你不需要過度解釋基礎概念，但要把實作決策說清楚。

---

**準備好了就開始讀 README.md 吧。**
