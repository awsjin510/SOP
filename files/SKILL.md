---
name: sop-trainer
description: 從訪談逐字稿、會議錄音轉文字、混亂文件（Word/PDF/Notion）、操作截圖等多模態素材，產出內訓用的標準作業程序（SOP）文件。當使用者說「幫我把這份訪談做成 SOP」「整理成內訓文件」「把這些操作做成手冊」「轉成 SOP 給新人看」「製作標準作業程序」時觸發。專為新進員工訓練設計，產出包含 troubleshooting、術語表、操作驗證的詳細文件。輸出格式為 Word 與 PDF。
---

# SOP 內訓文件產生器

## 用途

把多模態素材轉成新進員工可以照著做的 SOP 文件。

**特別注意**：這是「內訓」用 SOP，跟一般操作手冊的差異在於：
- 預設讀者**沒有經驗**，要補背景知識與「為什麼這樣做」
- 主動挖掘並補充 troubleshooting
- 術語第一次出現要定義
- 每步驟要有「成功判斷標準」

## 工作流程

### 步驟 1：理解輸入素材

接收使用者提供的素材，分類整理：

```
inputs/
├── transcripts/      # 訪談逐字稿、會議錄音轉文字
├── docs/             # 既有的 Word/PDF/Notion 文件
└── visuals/          # 截圖、錄影關鍵幀
```

如果使用者沒明確指定路徑，主動詢問素材在哪。

### 步驟 2：分流抽取

依素材類型呼叫對應的抽取器：

- **逐字稿** → 參照 `templates/transcript-extraction-prompt.md`
- **既有文件** → 參照 `templates/document-extraction-prompt.md`
- **截圖** → 參照 `templates/visual-extraction-prompt.md`

每種素材輸出獨立的中間 YAML，存在 `intermediate/` 目錄方便除錯。

### 步驟 3：建構 IR

合併所有抽取結果成單一 IR，符合 `schemas/ir-schema.yaml`。

關鍵要求：
- **每個步驟都要有 `source_refs`**，追溯到原始素材
- **截圖用 `image_id` 引用**，建立 `assets/images.yaml` 對映
- **step_id 用 UUID** 或內容 hash，不要用順序編號
- **時間戳用 GMT+8**

### 步驟 4：內訓增強循環

執行三個 sub-agent 角色：

#### 4.1 小新（Newbie Simulator）

模擬入職第一天的新人，逐步驟讀過 IR，標記：
- 「我看不懂這個術語」→ 記錄在 `gaps.glossary_needed`
- 「為什麼要這樣做？」→ 記錄在 `gaps.rationale_needed`
- 「這裡跳太快」→ 記錄在 `gaps.detail_needed`
- 「做完怎麼知道對了？」→ 記錄在 `gaps.verification_needed`

**重要**：小新不修改 IR，只產出 gap report。

#### 4.2 小修（Enhancer）

讀取 gap report，從原始素材中補強：
- 從訪談逐字稿挖背景知識補 rationale
- 從文件挖術語定義補 glossary
- 主動產生 verification 描述
- 拆解過於跳躍的步驟

如果原素材沒有的資訊，標記為 `needs_human_input: true`，**不要編造**。

#### 4.3 小審（Reviewer）

最終一致性檢查：
- 步驟編號連貫嗎？
- 前後術語一致嗎？
- 截圖都有對應到嗎？
- 所有 warning / permission 都在前置需求章節提及嗎？

產出 `quality_report.yaml`。

### 步驟 5：輸出文件

#### 5.1 先產 Markdown（人工 review 用）
快速可讀，方便人工檢查內容正確性。

#### 5.2 再產 Word（最終交付）
使用 docx skill，套用 `templates/training-sop-template.docx`。

排版要求：
- 封面頁：標題、版本、適用對象、預估學習時間
- 目錄頁：自動生成
- 警告框、提示框、操作框三種色塊區分
- 截圖含紅框標註重點
- 字級舒適（內文 11pt）、行距充足（1.5）
- 配色：淺色底 + 深色 accent（深藍 #1a2b4a / 靛紫 #4a3a6e）

#### 5.3 PDF 輸出
從 Word 轉 PDF，確保排版不跑掉。

### 步驟 6：儲存到版本目錄

```
sop-storage/{sop-id}/
├── meta.yaml              # 更新版本清單
├── versions/v1.0/
│   ├── ir.yaml
│   ├── document.docx
│   ├── document.pdf
│   └── source-materials/  # 複製原始素材進來
└── current → versions/v1.0
```

## 觸發詞細則

明確觸發：
- 「幫我把 X 做成 SOP」
- 「整理成內訓文件」
- 「製作標準作業程序」
- 「把訪談轉成手冊」
- 「給新人看的操作指南」

弱觸發（要先確認）：
- 「整理一下這份文件」（可能只是排版）
- 「寫個操作說明」（可能不是內訓用）

如果不確定，主動詢問：「這份文件是要給新進員工訓練用的嗎？需要含 troubleshooting 與背景知識嗎？」

## 輸出範例

完成時告知使用者：

```
✅ SOP 產生完成

📁 輸出位置：sop-storage/{sop-id}/versions/v1.0/
📄 主要文件：
   - document.docx（Word，可編輯）
   - document.pdf（PDF，可分發）
   - ir.yaml（IR 中繼層，更新時會用到）

📊 文件資訊：
   - 標題：{title}
   - 步驟數：{n} 步
   - Troubleshooting：{m} 項
   - 術語：{k} 個
   - 預估學習時間：{duration}

⚠️ 待補強項目（{x} 項）：
   {列出所有 needs_human_input: true 的項目}

🔍 建議的下一步：
   1. 開啟 document.docx 檢視內容
   2. 處理待補強項目
   3. 找一位新人試讀，確認可懂
```

## 重要原則

1. **不要編造**：原素材沒有的就標 needs_human_input，不要幻覺
2. **保持追溯**：每段內容都要能追到來源
3. **內訓視角**：寫的時候想像對象是入職第一天的新人
4. **Troubleshooting 是金礦**：訪談裡「之前有人弄錯⋯⋯」「要小心⋯⋯」這類句式都是 troubleshooting 素材
5. **語言**：所有產出文字一律繁體中文（zh-TW）

## 相關 Skills

需要用到：
- `docx` skill：產 Word 文件
- `pdf` skill：Word 轉 PDF
- `pdf-reading` skill：讀取輸入的 PDF 素材

## 不要做的事

- 不要直接把全部素材丟給 LLM 一次處理（信心評估會失準）
- 不要在第一版就追求完美，留人工 review 空間
- 不要為了精簡跳過 rationale 與 verification（內訓必要）
- 不要用順序編號當 step_id
