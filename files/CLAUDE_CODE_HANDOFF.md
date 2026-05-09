# 給 Claude Code 的接手指引

> **如果你是 Claude Code，這是你應該讀的第一份文件**

## 你的任務

從零實作一個 SOP 內訓文件產生與更新系統。本目錄已包含完整規格，你的工作是依規格寫程式。

## 閱讀順序（請嚴格遵守）

1. **本檔（CLAUDE_CODE_HANDOFF.md）** ← 你正在讀
2. **README.md** — 專案總覽
3. **docs/architecture.md** — 系統架構
4. **docs/ir-design.md** — IR 設計（最重要的資料模型）
5. **docs/implementation-roadmap.md** — 分階段實作指引
6. **schemas/ir-schema.yaml + schemas/examples/sample-ir.yaml** — IR 範例
7. **schemas/change-intent-schema.yaml + schemas/examples/sample-change-intents.yaml** — 變更意圖範例
8. **skills/sop-trainer/SKILL.md + skills/sop-updater/SKILL.md** — 兩個 skill 的契約
9. **skills/sop-updater/extractors/*.md** — 四個抽取器規格
10. **skills/sop-updater/merger/merge-rules.md** — 匯流規則
11. **skills/*/templates/*.md** — Word 文件模板規格

## 你應該怎麼做

### 第一階段：理解（不要急著寫程式碼）

按上面順序讀完所有文件後，先做以下三件事：

1. **回頭跟使用者確認你理解的範圍**
   - 列出系統將支援的素材類型
   - 列出資料流（輸入 → IR → 輸出）
   - 列出兩個 skill 的觸發條件
   
2. **跟使用者確認實作環境**
   - Python 版本、套件管理工具（pip / poetry / uv）
   - skill 安裝位置（macOS：`~/.claude/skills/`）
   - 儲存位置（建議 `~/sop-storage/` 或讓使用者指定）
   - Git repo 設定

3. **跟使用者確認測試素材**
   - 是否要先用 `tests/test-cases.md` 中的範例
   - 還是使用者會提供真實素材

### 第二階段：依 roadmap 階段實作

嚴格按照 `docs/implementation-roadmap.md` 的順序，**一個階段一個階段做**。

每個階段都要：
1. 在動工前跟使用者確認本階段的範圍
2. 完成後**自己跑一次測試**確認可運作
3. 跟使用者展示成果，獲得確認後再進下一階段

**不要一次寫完所有功能**。內訓 SOP 系統的關鍵是品質，不是速度。

### 第三階段：使用者驗收

每階段完成都要展示：
- 程式碼能跑
- 範例輸入能產生符合 schema 的輸出
- 邊界案例有處理（或標記為 TODO）

## 重要原則（非常重要，請反覆閱讀）

### 1. Schema 是契約
- 所有資料結構以 `schemas/*.yaml` 為準
- 任何 schema 變動先跟使用者確認
- 不要在程式碼裡寫死欄位名，從 schema 載入

### 2. 不要編造內容
- 原素材沒有的資訊就標 `needs_human_input: true`，**絕對不要幻覺**
- 不確定就拋給使用者確認
- `source_refs` 必須真實存在，每段內容都要能追到來源

### 3. step_id 必須穩定
- 用 UUID 或內容 hash
- **絕對不要**用順序編號（會在新增步驟時錯亂）
- 跨版本永遠不變

### 4. 人工閘門優先於自動化
- 衝突 → 拋出來給人決定
- 低信心 → 拋出來給人確認
- 完整性問題 → 拋出來給人處理
- 寧可慢一點，不可錯一點

### 5. 模組化、可測試
- 每個抽取器、每個合併規則獨立可測
- 使用 pytest（或同等工具）
- 中間產物（每個抽取器的 YAML 輸出）都保留下來方便除錯

### 6. 語言與時區
- 所有面向使用者的文字（含錯誤訊息）一律**繁體中文（zh-TW）**
- 程式碼註解可用英文
- 所有時間戳一律 GMT+8（含 `+08:00` 標記）
- 檔案編碼一律 UTF-8

### 7. Skill 設計遵循 Anthropic 規範
- 每個 SKILL.md 含 YAML frontmatter（`name`、`description`）
- description 寫清楚觸發條件、用途、輸入輸出
- 主流程在 SKILL.md，子流程拆到子檔案
- 參考 Anthropic 官方 docx、pdf、pdf-reading skill 的結構

## 你會用到的依賴

### 必需的 Python 套件
```
pyyaml>=6.0          # IR 與 change_intents
python-docx>=1.0     # Word 讀寫
pypdf>=4.0           # PDF 讀寫（也透過 pdf skill）
Pillow>=10.0         # 截圖處理
jsonschema>=4.0      # schema 驗證
```

### 建議的 Python 套件
```
typer 或 click       # CLI 框架
rich                 # 互動式 CLI 介面、彩色輸出
pytest               # 測試
ruff                 # linter / formatter
```

### Anthropic 官方 skill（依賴）
- `docx` skill：Word 文件操作
- `pdf` skill：PDF 產生
- `pdf-reading` skill：PDF 讀取
- 安裝位置通常在 `/mnt/skills/public/` 或從 Anthropic 文件取得

## 不要做的事

- ❌ 不要把整個系統一次寫完
- ❌ 不要跳過 schema 驗證
- ❌ 不要把所有素材丟給一個大 prompt 處理（要分流）
- ❌ 不要為了精簡跳過 source_refs（更新功能會壞）
- ❌ 不要自動解決衝突
- ❌ 不要在第一階段就追求 100% 自動化
- ❌ 不要重新編號 step_id
- ❌ 不要用簡體中文

## 該做的事

- ✅ 階段性實作，每階段獨立可運作
- ✅ 寫測試（每個抽取器都要有測試）
- ✅ 用 schema 驗證所有資料
- ✅ 保留中間產物方便除錯
- ✅ 遇到模糊需求**主動問**使用者
- ✅ 每階段結束跟使用者展示
- ✅ 把所有 prompt 放在 SKILL.md 中（不要塞在 Python 裡）

## 你應該如何回應使用者

當使用者說「開始吧」「請開始實作」時，你的第一個回應應該是：

```
我已經讀完規格，準備開始實作。在動工前我想跟你確認幾件事：

【系統理解確認】
我理解這個系統將：
1. ...
2. ...
3. ...

【實作環境確認】
- 使用 Python {版本}
- 套件管理工具：{你建議使用的}
- Skill 安裝位置：~/.claude/skills/
- SOP 儲存位置：{你建議的位置}

【實作起點建議】
依 roadmap 我建議從階段 1 開始：
- 目標：{階段 1 目標}
- 預計產出：{會產出什麼檔案}
- 預計時長：{時間}

【測試素材確認】
階段 1 需要一份訪談逐字稿做測試，請問：
(a) 我用 tests/test-cases.md 中的虛擬範例
(b) 你會提供真實素材
(c) 你希望我產生一份模擬素材給你過目

確認以上後我就開始進入階段 1。
```

**不要在沒確認的情況下直接開始寫程式碼。**

## 階段交付的標準格式

每階段完成時，向使用者報告：

```
✅ 階段 {n} 完成

【本階段成果】
- 程式碼：{path/to/code}
- 測試：通過 {x}/{y} 個測試案例
- 範例輸出：{path/to/sample-output}

【已實作功能】
1. ...
2. ...

【已知限制 / TODO】
1. ...
2. ...

【建議下一步】
進入階段 {n+1}：{階段名稱}
- 目標：{說明}
- 預計時長：{時間}

是否進入下一階段？
```

## 出錯時怎麼辦

- **規格有矛盾**：先列出矛盾點，問使用者怎麼處理，**不要自己決定**
- **規格未涵蓋的情境**：列出來問，等回答再做
- **技術選擇有多種方案**：列出選項+利弊，請使用者選
- **測試失敗**：先停下，分析原因，跟使用者討論

## 最後提醒

這個系統的使用者是 **Jin**，工作於 CloudOrange（雲力橘子）。Jin 的偏好：
- 繁體中文溝通
- 工程師背景，可以聊技術細節
- 偏好深色 accent 配色（深藍 / 靛紫）
- 重視結構化、可追溯
- 已熟悉 Claude Code、n8n、AWS、多代理系統

你不需要過度解釋基礎概念，但要把實作決策說清楚。

---

**準備好了就開始讀 README.md 吧。**
