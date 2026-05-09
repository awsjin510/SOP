# 修改清單抽取器（Change List Extractor）

## 用途

把使用者提供的修改清單轉成 change_intents。

修改清單是**最常見、信心最高**的更新素材類型（人已經整理過要改什麼），但**格式變異很大**。

## 支援的格式

### 格式 A：Word 表格

```
| 項次 | 步驟 | 原內容 | 新內容 | 備註 |
|------|------|--------|--------|------|
| 1    | 第3步 | ...    | ...    | ...  |
```

**處理方式**：
1. 用 docx skill 讀取，找出表格
2. 識別欄位（容忍中英、空白、變體）
3. 每列產生一個 change_intent
4. 信心通常 0.85-0.95

**欄位識別規則**：
| 概念 | 可能標題 |
|------|---------|
| 項次 | 編號、序號、項次、No., # |
| 目標 | 步驟、章節、位置、Section, Step |
| 原內容 | 原內容、舊內容、修改前、Before, Original |
| 新內容 | 新內容、修改後、After, New |
| 變更類型 | 類型、動作、Action |
| 原因 | 備註、原因、Reason, Note |

### 格式 B：Word 追蹤修訂

直接修改舊 SOP，用 Word 的「追蹤修訂」功能標出變動。

**處理方式**：
1. 用 docx skill 讀取 `<w:ins>`（新增）和 `<w:del>`（刪除）標籤
2. 對應到 IR 中的位置（透過內容比對）
3. **信心極高**（0.95+），因為人已明確標出

**特殊處理**：
- 連續的 `del + ins` = `modify`
- 單獨 `ins` = `add`
- 單獨 `del` = `remove`
- 註解（`<w:comment>`）= rationale 或 review notes

### 格式 C：Markdown / 純文字條列

```markdown
- 第 3 步驟改用 CLI 指令，原本的 Console 操作移除
- 新增 timeout 錯誤的 troubleshooting
- 移除過時的 IAM Policy 範例
```

**處理方式**：
1. 找條列符號（`-`, `*`, `1.`, `（一）`等）
2. 每條一個 change_intent
3. 信心 0.7-0.85（依描述明確度）

### 格式 D：Excel 表格

跟 Word 表格類似，用 xlsx skill 讀取。

### 格式 E：自由文字

「這次要改的有 EC2 啟動那段，現在要用新的 AMI ID...」

**處理方式**：
1. 信心降低（0.5-0.7）
2. 主動標記 `needs_human_review: true`
3. 拋出來請使用者確認

## 處理流程

### 步驟 1：格式判斷

```python
def detect_format(file_path):
    if file_path.endswith('.docx'):
        # 檢查是否含追蹤修訂
        if has_revision_marks(file_path):
            return 'word_revisions'
        # 檢查是否含表格
        if has_tables(file_path):
            return 'word_table'
        return 'word_freetext'
    if file_path.endswith('.xlsx'):
        return 'excel_table'
    if file_path.endswith('.md') or file_path.endswith('.txt'):
        if has_list_markers(content):
            return 'markdown_list'
        return 'plain_text'
```

### 步驟 2：抽取（依格式）

每種格式有專屬的抽取邏輯，產出粗略的變更清單。

### 步驟 3：對映到 IR

每個變更要找到對應的 step_id：

```yaml
# 抽取階段的中間結果（含原文表述）
raw_change:
  raw_target_text: "第 3 步" 或 "Security Group 設定" 或 "step-3"
  ...

# 對映階段：找到實際 step_id
mapping_strategy:
  - by_display_order:    # 「第 3 步」→ display_order: 3
      confidence: 0.85
  - by_title_match:      # 「Security Group 設定」→ 標題含此字串的 step
      confidence: 0.90
  - by_step_id:          # 「step-3」→ 直接對應
      confidence: 0.95
  - by_content_search:   # 找原文中該關鍵字出現的 step
      confidence: 0.70
```

**多策略並行，取信心最高者**。如果多個策略指向不同 step 或都低信心，標 `needs_human_review`。

### 步驟 4：產出 change_intents

依 schema 產出最終 YAML，每個來源的 confidence 分別記錄。

## 對使用者的提示

如果修改清單格式辨識度低，**不要硬解**，主動詢問：

```
我看到 modifications.docx 是自由文字格式，
建議改用以下格式之一以提升正確率：

1. 表格式：包含「目標步驟」「原內容」「新內容」三欄
2. 條列式：每條變更獨立一行，明確指出步驟編號
3. 直接在 SOP 上用 Word 追蹤修訂（最推薦）

要繼續用現有格式處理嗎？（可能需要較多人工確認）
```

## 信心等級對應

| 來源情境 | 信心範圍 |
|---------|---------|
| Word 追蹤修訂 + 註解清楚 | 0.95-0.98 |
| 結構化表格、欄位完整 | 0.85-0.95 |
| 結構化表格、缺欄位 | 0.75-0.85 |
| Markdown 條列、明確指步驟編號 | 0.80-0.90 |
| Markdown 條列、模糊指稱 | 0.65-0.75 |
| 自由文字、明確 | 0.60-0.75 |
| 自由文字、含糊 | 0.40-0.60 |

## 邊界案例

### 案例 1：「第 3 步」但 SOP 沒有第 3 步

可能原因：使用者用的是別版 SOP 的編號。
處理：標 `needs_human_review`，列出 SOP 現有所有步驟讓使用者選。

### 案例 2：修改清單描述的內容跟 SOP 對不上

可能原因：使用者改的是別份 SOP，或 SOP 已經更新過。
處理：拋出警告，要求確認。

### 案例 3：一個變更項描述了多個變更

例：「第 3 步改用 CLI，順便把第 4 步的截圖也換掉」

處理：拆成兩個 change_intent，但記錄它們同源。

### 案例 4：變更類型不明確

例：「IAM Role 那邊處理一下」

處理：信心降到 0.5 以下，必須人工確認。
