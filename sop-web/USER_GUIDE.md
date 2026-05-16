# SOP 內訓文件系統 — 使用手冊

> 對象：CloudOrange 雲力橘子內部使用者（Jin 與團隊）
> 介面：繁體中文
> 版本：W10（首次上線版）

---

## 1. 系統能做什麼

把零散的內訓素材轉成**可下載、可更新、可追溯**的 SOP 文件。

兩個主要功能：

- **建立新 SOP**：上傳訪談逐字稿 / 既有文件 / 截圖 → 系統抽取內容、整合成單一 IR、產出 Word 與 PDF。
- **更新既有 SOP**：上傳修改清單 / 會議紀錄 / 廠商通知 / 新版截圖 → 系統抽取變更意圖、匯流去重、偵測衝突與完整性問題、人工審核後產出新版本。

每個版本會保留完整變更紀錄與三層級 Changelog（管理者摘要 / 審查者清單 / 執行者詳細 diff）。

---

## 2. 第一次設定

1. 登入：點 **「使用 Google 登入」**。第一次登入會在 Firestore 自動建立 `users/{uid}` 紀錄。
2. 進到 Dashboard：右上 → **個人設定** 可看到本月 API 用量上限（預設 $50）。
3. 建議在 Settings 先按一次 **「呼叫 Haiku 一次」** 確認 Cloud Functions 與 Anthropic API Key 已經設好。

---

## 3. 建立新 SOP（W3 / W4 流程）

入口：Dashboard → **「建立新 SOP」**。

### Step 1：上傳素材
- 支援檔案類型：
  - 訪談逐字稿：`.txt` / `.md`
  - 既有文件：`.docx` / `.pdf`
  - 截圖：`.png` / `.jpg` / `.webp`
- 系統會自動分類，可在右側下拉手動覆寫。

### Step 2：基本資訊
- 設定 SOP 標題、適用對象、難度、tags 等。

### Step 3：確認啟動
- 系統估算 API 費用，確認後送進處理佇列。
- 自動跳到 Job Progress 頁面，可即時看到每個子任務的狀態。

### 處理流程（Pipeline 內部步驟）

1. 上傳所有檔案到 Firebase Storage
2. 分流抽取：訪談 / 文件 / 截圖
3. 多源整合（去重、章節整合、截圖配對）
4. 內訓增強循環（小新提問 → 小修補強 → 小審驗證）
5. 渲染 Markdown / Word / PDF
6. 寫入 Firestore（建立 `sops/{id}` + `versions/v1.0.0`）

---

## 4. 更新 SOP（W6 / W7 / W8 流程）

入口：SOP Detail 頁右上 → **「更新」**。

### Step 1：上傳更新素材
- 四種類型：
  - **修改清單**（`.docx` / `.md`）：直接列出要改的項目
  - **文字檔**（`.txt`）：會議紀錄、Bug 報告、變更說明
  - **PDF**：廠商通知、Release Note
  - **截圖**：新版操作畫面
- 系統會自動分類，可手動覆寫。

### Step 2：變更摘要（選填）
- 一句話描述本次更新。

### Step 3：確認啟動
- 系統估算費用，按下 **🚀 開始更新** 後跳到 Job Progress。

### 處理流程

1. 上傳素材
2. 讀取現有 IR（最新版本）
3. 分流抽取（每個檔案對應一個抽取器）
4. 匯流：
   - 去重 + 多源印證提升信心
   - 偵測 3 種衝突（來源衝突 / 時序衝突 / 語意不相容）
   - 偵測 7 種完整性問題（截圖待更新、術語未定義、引用斷裂、孤兒 troubleshooting、訓練影響、對象不匹配、跨步驟不一致）
5. **人工審核閘門**（W8 後新增）：
   - 沒有衝突且全自動 → 直接進套用
   - 否則進入「變更審核」介面（自動跳轉）
6. 套用已 accepted / modified 的變更
7. 渲染新版本 + 寫 changes 紀錄

---

## 5. 變更審核（W8）

當系統有不確定項目時會自動帶你到 **/job/:jobId/review**。

### 三個分頁

- **變更**：每筆 intent 的卡片，含 description / before / after / 信心 / 影響 / 來源
- **衝突**：多源不一致時的 radio 選項，含「推薦」標記
- **完整性**：審核中發現的潛在問題（嚴重度低 / 中 / 高）

### 操作方式

點擊或鍵盤都能用：

| 鍵 | 行為 |
|----|------|
| `a` | 接受 |
| `r` | 拒絕 |
| `s` | 略過 / 全部忽略（衝突卡） |
| `e` | 編輯（focus 卡片內 textarea） |
| `↑` `↓` | 切上下卡 |
| `←` `→` | 切衝突 option |
| `1`–`9` | 直接選衝突第 N 個 option |

### 批次工具

- **接受所有 ≥ 85%**：高信心一鍵全收
- **拒絕所有 < 50%**：低信心一鍵全清
- **只顯示待審**：filter 切換

### 完成審核

按下 **「完成審核並產新版本」** 即進入 Phase 2：套用 → 渲染 → 寫版本。
完成後會自動轉到新版本的 SOP 詳情頁。

> 完成條件：無未決衝突 + 無未確認的高嚴重度完整性問題 + 至少一筆 accepted/modified

---

## 6. 版本管理（W9）

### SopDetail 多分頁

- **概覽**：當前版本、總版本、時間軸基本資訊
- **預覽**：Markdown 線上瀏覽
- **版本**：簡版列表（每筆都有 .docx / .pdf 直接下載）
- **變更**：摘要式變更紀錄
- **素材**：當前版本的原始檔與截圖縮圖

### 版本歷史頁面（/sop/:id/versions）

- 時間軸式呈現所有版本
- 每筆顯示 changeSummary、需重訓 flag、品質 issue 數
- 點「選為比較」後，再選一個版本，按 **對比此兩版** 進入 diff 頁

### 版本 Diff 頁面（/sop/:id/diff?a=&b=）

- 摘要四象限：新增 / 刪除 / 修改 / 順序變動
- Meta 變動（標題、難度、tags、authors）
- 步驟層級：
  - 新增 / 刪除 / 修改（含逐欄位 fieldDiff）/ 順序變動
- Troubleshooting / Glossary 變動清單

### 變更紀錄詳情（/sop/:id/changes/:changeId）

- 完整列出所有 intent（含 before / after / 編輯後 / 理由）
- 跳過項與原因
- 衝突解決紀錄
- 完整性問題清單
- 可下載 **三層級 Changelog Word**：
  - Tier 1：管理者摘要
  - Tier 2：審查者清單
  - Tier 3：執行者詳細 diff

---

## 7. 用量與成本

- **個人設定** 顯示本月已用 USD / 上限
- 達 80% 會通知；達 100% 會拒絕新呼叫
- 預設模型：`claude-opus-4-7`（複雜抽取）+ `claude-haiku-4-5-20251001`（分類等簡單任務）
- 預估費用：
  - 建立新 SOP：$0.50–$3.00
  - 更新 SOP：$0.30–$3.00（依素材數量與複雜度）

---

## 8. 安全與隱私

- 所有素材只存在自己 uid 路徑下（`users/{uid}/jobs/{jobId}/...`）
- 規則層阻擋跨用戶讀寫（見 `firestore.rules` / `storage.rules`）
- Anthropic API Key **永遠在後端 Functions**，前端透過 `claudeProxy` 代理
- 無第三方追蹤

---

## 9. 常見問題（FAQ）

**Q：上傳素材後跑很久沒反應？**
A：到 `/job/:jobId` 看子任務狀態。「失敗」會顯示錯誤訊息；常見原因是檔案格式不支援或 PDF 是掃描檔（解析後內容為空）。

**Q：審核完按「完成審核」沒反應？**
A：檢查右下角 footer 文字 — 是否有「待決衝突 N」或「高嚴重未確認問題 N」。把它們處理掉按鈕才會啟用。

**Q：兩個版本對比顯示「兩個版本內容完全相同」？**
A：對的，可能你選的兩版本只差在 metadata（如 updated_at）；diff 對齊規則只看實質內容。

**Q：截圖配對錯了步驟怎麼辦？**
A：W7 用 Vision 自動配對，可能會錯。建議在 review 介面手動拒絕該 `replace_screenshot` intent，再重新上傳並用標準命名（例：`step-name-screenshot.png`）。

**Q：我需要支援團隊協作？**
A：目前 schema 已預留 `members` 欄位，但 W10 範圍只支援個人擁有。後續可改 Firestore Rules 的 `isMember` 函式即可開啟。

---

## 10. 快速操作對照表

| 動作 | 路徑 |
|------|------|
| 看所有 SOP | `/dashboard` |
| 建立新 SOP | `/sop/new` |
| SOP 詳情 | `/sop/:id` |
| 更新 SOP | `/sop/:id/update` |
| 版本歷史 | `/sop/:id/versions` |
| 版本對比 | `/sop/:id/diff?a=v1&b=v2` |
| 變更紀錄 | `/sop/:id/changes/:changeId` |
| 任務進度 | `/job/:jobId` |
| 變更審核 | `/job/:jobId/review` |
| 個人設定 | `/settings` |

---

## 11. 開發者：本機跑起來

```bash
# 第一次
cd sop-web
pnpm install

# Functions：複製 .env.local.example → 填 ANTHROPIC_API_KEY
cp functions/.env.local.example functions/.env.local

# 啟動 emulator + frontend dev server
pnpm dev   # 在 sop-web/ 根目錄會用 concurrently 跑 emulator + vite
```

更詳細的部署流程請看 `deployment/deploy-guide.md`（規格內附）。

---

## 12. 回報問題

- 程式問題：在 GitHub repo 開 issue
- 規格疑問：直接找 Jin
