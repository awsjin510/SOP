# PDF 抽取器（PDF Extractor）

## 用途

從 PDF 檔案抽取 change_intents。

PDF 是**最複雜**的素材類型，因為：
- 排版多元（單欄、雙欄、含表格、含圖片）
- 來源多元（廠商通知、政策公告、會議紀錄列印版）
- 可能是掃描版，需要 OCR
- 通常是「外部視角」，術語跟內部 SOP 不同

## PDF 類型分類

先判斷 PDF 屬於哪一類，再走對應流程：

| PDF 類型 | 特徵 | 處理策略 |
|---------|------|---------|
| `release_note` | 廠商發的版本更新通知 | 重點抽變更項，整合術語對映 |
| `policy_announcement` | 政策變更公告 | 重點抽影響範圍與生效日期 |
| `meeting_minutes_pdf` | 會議紀錄 PDF 化 | 走文字檔的 meeting_notes 流程 |
| `change_request` | 客戶/內部提交的變更需求 | 走修改清單流程 |
| `mixed_content` | 含表格、圖片、長文混排 | 分區塊處理 |
| `scanned` | 掃描版 PDF | OCR + 信心降低 |

## 處理流程

### 步驟 1：使用 pdf-reading skill

```python
# 透過 pdf-reading skill 取得結構化內容
content = read_pdf(file_path)
# 包含：
# - text_blocks: 文字塊（含位置、字型）
# - tables: 表格（結構化）
# - images: 嵌入的圖片
# - metadata: PDF metadata（作者、建立時間等）
```

### 步驟 2：判斷 PDF 類型

依下列訊號判斷：

```yaml
classification_signals:
  release_note:
    - 標題含「Release Note」「Update」「變更通知」「版本更新」
    - 含版本號（如 v2.0.0）
    - 含「新增」「修正」「Removed」「Deprecated」等關鍵字
    - 結構通常是條列式
  
  policy_announcement:
    - 標題含「政策」「公告」「規範」「Policy」
    - 含生效日期
    - 含「適用範圍」「影響對象」
  
  scanned:
    - 文字塊極少或無
    - 大量圖片（每頁一張大圖）
    - 文字解析率低
```

### 步驟 3：依類型抽取

#### 3.1 release_note 處理

廠商 release note 是 SOP 更新最常見的觸發來源（如 AWS、Microsoft 改版）。

**重點**：
1. **抽變更條目**：找「What's New」「Changes」「Updates」段落
2. **過濾無關項目**：只留與目標 SOP 相關的（用 SOP 內出現過的關鍵字篩）
3. **術語對映**（關鍵）

範例：
```
原文（AWS Release Note）：
"The AWS Management Console has been redesigned. The legacy services menu 
on the left side has been replaced by a new top search bar."

抽取後：
change_intent:
  type: modify_step
  target: { step_id: "step-login-aws-d4e1" }  # 透過內容比對找到
  change:
    description: "AWS Console 改版，左側選單改為頂部搜尋列"
    new_content: "..."
  sources:
    - type: pdf_release_note
      ref: "aws-console-2026-q2.pdf:page-2"
      confidence: 0.88
      excerpt: "The AWS Management Console has been redesigned..."
  rationale: "AWS 官方 2026 Q2 改版"
```

#### 3.2 policy_announcement 處理

政策變更影響範圍通常較廣，要產出**多個** change_intents：

```
原文：
"自 2026 年 6 月起，所有 EC2 實例必須啟用 IMDSv2，IMDSv1 將被淘汰。
影響：所有現有 SOP 中提及 metadata service 的部分都需更新。"

抽取後：
change_intent_1:
  type: modify_step
  target: { step_id: "step-xxx" }  # 找出所有提到 metadata service 的 step
  ...

change_intent_2:
  type: add_warning
  ...

# 額外產出影響評估
policy_impact_report:
  effective_date: "2026-06-01"
  affected_steps: [...]
  requires_retraining: true
```

#### 3.3 mixed_content 處理

含表格、圖片、長文混排的 PDF。

**分區塊處理**：
1. **表格** → 走修改清單流程
2. **嵌入圖片** → 抽出來當截圖素材處理
3. **長文** → 走文字檔流程

### 步驟 4：術語對映

PDF 來源常用外部術語，要對映到內部術語。

讀取 `sop-storage/{sop-id}/terminology.yaml`：

```yaml
terminology_map:
  - canonical: "EC2 開機腳本"     # 內部術語
    aliases:
      - "Launch Template"          # AWS 官方
      - "啟動模板"                 # AWS 中文版
      - "EC2 啟動配置"
    sop_steps_using_this: ["step-xxx"]
  
  - canonical: "堡壘機"
    aliases:
      - "Bastion Host"
      - "Jump Server"
      - "跳板機"
```

抽取階段自動做術語替換，並記錄：

```yaml
change_intent:
  ...
  terminology_normalized:
    - {original: "Launch Template", normalized: "EC2 開機腳本"}
```

如果 PDF 出現**新術語**（不在對映表），要：
1. 標記為 `glossary_addition_suggested`
2. 提示使用者「是否要把這個術語加入 glossary 與 terminology_map」

### 步驟 5：圖片處理

PDF 內嵌的圖片可能是新版操作畫面，要抽出來：

```python
images = extract_images_from_pdf(pdf_path)
for img in images:
    # 把圖片儲存到 update-materials/screenshots-from-pdf/
    save_path = f"screenshots-from-pdf/page-{img.page}-{img.id}.png"
    
    # 後續走截圖抽取器流程
    screenshot_intents = process_as_screenshot(save_path, source_pdf=pdf_path)
```

### 步驟 6：掃描 PDF 的 OCR 處理

如果偵測到是掃描 PDF：

```yaml
scanned_pdf_handling:
  - 用 OCR 工具（pdf-reading skill 內建）抽文字
  - 信心統一降低 30%
  - 標記每個 change_intent 含 ocr_used: true
  - 強烈建議使用者人工確認
```

## 信心評估規則

```yaml
confidence_rules:
  base_by_type:
    release_note: 0.85
    policy_announcement: 0.85
    change_request: 0.80
    meeting_minutes_pdf: 0.70
    mixed_content: 0.65
    scanned: 0.55
  
  modifiers:
    - condition: "原文明確指向特定步驟"
      adjustment: "+0.10"
    - condition: "含明確日期或版本號"
      adjustment: "+0.05"
    - condition: "需要 OCR"
      adjustment: "-0.20"
    - condition: "術語對映後仍模糊"
      adjustment: "-0.10"
    - condition: "多個 step 都符合描述"
      adjustment: "-0.15"
```

## 與既有 SOP 內容的相關性篩選

PDF 通常包含大量無關內容（如 AWS release note 涵蓋幾百項變更，但只有 2-3 項跟你的 SOP 相關）。

**相關性篩選**：
1. 從舊 IR 抽出所有「關鍵字」（步驟標題、術語、code blocks 中的指令名）
2. 在 PDF 文字中搜尋這些關鍵字
3. 只處理含關鍵字的段落

```python
def filter_relevant_sections(pdf_content, ir):
    keywords = extract_keywords_from_ir(ir)
    # 包括：step titles, glossary terms, code commands, image captions
    
    relevant_sections = []
    for section in pdf_content.sections:
        if any(kw in section.text.lower() for kw in keywords):
            relevant_sections.append(section)
    
    return relevant_sections
```

## 邊界案例

### 案例 1：PDF 是另一份 SOP（外部範本）

可能原因：使用者把另一份 SOP 當作「更新參考」上傳。
處理：偵測到內容像 SOP 而非變更說明時，主動詢問「這是要做為新版 SOP 取代舊版？還是要參考內容做更新？」

### 案例 2：PDF 含密集表格（如費率表、權限矩陣）

處理：保持表格結構抽取，可能整張表格作為一個 change（如「更新 IAM 權限矩陣表」）。

### 案例 3：PDF 含外文（英文為主）

處理：保留原文，但 change_intent 的 description 用繁體中文撰寫，excerpt 保留原文。

### 案例 4：PDF 大小超過處理上限

處理：先做 TOC 分析，請使用者指定要處理哪些章節。
