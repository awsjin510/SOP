# Claude Code 專案配置

> 這份檔案會被 Claude Code 在啟動時自動讀取。

## 專案資訊

**名稱**：SOP 內訓文件產生與更新系統（Web 版）
**擁有者**：Jin / CloudOrange 雲力橘子
**目標**：把 CLI 版的 SOP 系統包裝成 Web 應用

## 你（Claude Code）應該怎麼做

### 第一次啟動時

1. **先讀 CLAUDE_CODE_HANDOFF.md** ← 完整的接手指引
2. 然後依序讀完 README.md、docs/ 下所有檔案
3. **不要急著寫程式碼**
4. 跟使用者確認你的理解，獲得授權後再開始

### 進入實作階段時

1. 嚴格按照 `docs/implementation-roadmap.md` 的階段順序
2. **一次一個階段**，完成後展示給使用者確認
3. 不要跳階段
4. 不要把多階段的東西混在一起

## 技術棧（已決定，不要建議改）

- **前端**：Vue 3 + Vite + TypeScript
- **狀態**：Pinia
- **路由**：Vue Router
- **UI**：shadcn-vue + Tailwind CSS
- **後端**：Firebase（Auth + Firestore + Storage + Functions + Hosting）
- **AI**：Claude API（透過 Cloud Functions 代理）

## 重要約定

### 語言
- 所有面向使用者的 UI 文字：**繁體中文（zh-TW）**
- 程式碼註解：可英文
- 變數命名：英文

### 時區
- Firestore 用 Timestamp（UTC）
- UI 顯示用 +08:00（GMT+8）
- 用 date-fns 的 zonedTimeToUtc / utcToZonedTime

### 設計
- 主色：深藍 #1A2B4A
- 強調色：靛紫 #4A3A6E
- 底色：淺色（gray-50）
- Light mode 為預設，但要支援 dark mode

### 程式碼風格
- TypeScript 嚴格模式：strict: true
- 不用 any（除非有充分理由）
- 不用 ts-ignore
- Components：PascalCase
- Files：kebab-case
- Stores / utils：camelCase

## 你不可以做的事

- ❌ **絕對不要把 Anthropic API Key 放前端**
- ❌ 不要用 simplified Chinese
- ❌ 不要把業務邏輯塞在 Vue 元件中
- ❌ 不要直接從元件呼叫 Firestore（透過 services）
- ❌ 不要重新發明 step_id 編碼系統（用 nanoid）
- ❌ 不要編造原素材沒有的內容（標 needs_human_input）
- ❌ 不要一次寫完所有功能（分階段）
- ❌ 不要跳過測試
- ❌ 不要忽略 TypeScript 錯誤

## 你必須做的事

- ✅ 階段性實作（按 roadmap）
- ✅ 每階段完成都跟使用者展示
- ✅ Schema 是契約（用 zod 或 quicktype）
- ✅ 寫測試（vitest）
- ✅ 用 Firebase Emulator 開發
- ✅ 遇到模糊需求**主動問**
- ✅ 把 prompt 集中放（不要塞在 TS 程式碼中）

## 開發環境設定

```bash
# 第一次設定
node --version  # 要 20+
npm --version   # 或用 pnpm

# 安裝
npm install

# 啟動 Firebase Emulator
firebase emulators:start

# 啟動前端 dev server
npm run dev

# 同時跑（推薦）：用 concurrently
npm run dev:all
```

## 常用指令

```bash
# 開發
npm run dev              # 啟動 Vite dev server
npm run build            # 建置生產版本
npm run preview          # 預覽生產版本

# 測試
npm run test             # 跑單元測試
npm run test:e2e         # 跑 E2E 測試
npm run typecheck        # TypeScript 檢查

# Firebase
firebase emulators:start # 啟動 emulator
firebase deploy          # 部署全部
firebase deploy --only hosting  # 只部署前端

# Functions
cd functions
npm run build
firebase deploy --only functions
```

## 與使用者互動原則

### 該主動問的

- 規格有矛盾的地方
- 設計決策有多種方案
- 需要使用者的測試素材
- 階段交付前的展示
- 部署前的最終確認

### 不該主動問的

- 規格中已明確說明的事
- 顯然的程式設計細節（變數命名等）
- 標準作法（除非有特殊考量）

## 階段交付的格式

```markdown
## ✅ 階段 W{n} 完成

### 本階段成果
- 程式碼：[git diff summary]
- 測試：通過 X/Y 個案例
- 部署：{是否已部署}

### 已實作
1. 功能 A
2. 功能 B

### 已知限制 / TODO
1. ...

### 下一步建議
進入階段 W{n+1}：{標題}
- 預計 {時間}
- 主要工作：{摘要}

是否進入下一階段？
```

## 出錯時怎麼辦

- **規格矛盾**：列出來問使用者
- **超出規格範圍**：問
- **TS 錯誤**：解決，不繞過
- **測試失敗**：先停下分析
- **超出 Firebase 免費額度**：立刻停下討論
- **API 用量飆升**：檢查是否有循環呼叫

## 與 CLI 版的關係

如果 Jin 提到「CLI 版規格」，那是另一個目錄/repo 的內容。本 Web 版規格的核心邏輯（IR 結構、抽取規則、合併引擎）與 CLI 版相同，**請直接沿用，不要重新設計**。

CLI 版的內容可以直接搬到本 Web 版的 skills/ 目錄做為「邏輯規格」（不是真的 Anthropic Skill）。

## 最後

如果有任何疑問，先問再做。

Jin 是工程師背景，可以接受技術討論，但時間寶貴，不要在已決定的事上反覆。
