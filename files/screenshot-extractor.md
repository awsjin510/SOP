# 截圖抽取器（Screenshot Extractor）

## 用途

從新截圖產生 change_intents，並做視覺差異分析。

截圖是**最需要上下文**的素材類型，**幾乎不能單獨使用**。

## 三種使用情境

### 情境 A：截圖跟在文字素材後面（常見）

```
update-materials/
├── change-list/modifications.docx     # 提到「step-3 的 Console 操作要改」
└── screenshots/new-console-step3.png  # 對應的新截圖
```

**處理方式**：截圖**綁定到該變更項**作為視覺證據。
- 信心可借用文字素材的信心
- 主要工作是「描述新截圖、判斷是否與步驟相符」

### 情境 B：純截圖批次上傳

```
update-materials/
└── screenshots/
    ├── new-001.png
    ├── new-002.png
    └── new-003.png
```

**處理方式**：完全靠視覺內容**主動配對**到舊 SOP 的步驟。
- 信心通常較低（0.6-0.8）
- 需要看舊 IR 中所有截圖的描述做比對
- 可能配錯，必須人工確認

### 情境 C：對比截圖（舊 vs. 新）

```
update-materials/
└── screenshots/
    ├── old/step-3-old.png
    └── new/step-3-new.png
```

**處理方式**：直接做視覺差異分析，產出明確的變更說明。
- 信心高（0.85+）
- 自動偵測「文字描述需要連帶更新」

## 處理流程：四步驟

### 步驟 1：describe（描述）

讓 Claude 看圖，產生詳細描述：

```yaml
screenshot_description:
  file: "new-console-step3.png"
  description: |
    這張截圖顯示 AWS Management Console 的 EC2 服務頁面。
    使用者位於「執行個體」（Instances）列表頁。
    上方有頂部搜尋列（顯示輸入「EC2」），右上角有「啟動執行個體」按鈕（橘色）。
    左側沒有舊版的服務選單。
    顯示語言：繁體中文。
  
  detected_elements:
    ui_framework: "AWS Console (2026 redesigned version)"
    screen_purpose: "EC2 instance management"
    visible_actions: ["啟動執行個體", "操作", "重新整理"]
    visible_data: "5 個現有執行個體列表"
  
  text_content:        # OCR 抽取的文字
    - "EC2"
    - "啟動執行個體"
    - "執行個體 ID"
    - ...
```

### 步驟 2：match（配對）

跟舊 SOP 步驟比對，找最可能對應的步驟：

```yaml
matching:
  candidate_steps:
    - step_id: "step-login-aws-d4e1"
      similarity: 0.4
      reason: "提到 AWS Console，但這步是登入，截圖是 EC2 列表頁"
    - step_id: "step-ami-select-b8c1"
      similarity: 0.85
      reason: "舊步驟的截圖也是 EC2 列表頁，且都顯示啟動按鈕"
    - step_id: "step-sg-config-a3f2"
      similarity: 0.2
      reason: "舊步驟是 SG 設定頁，與此截圖不同"
  
  best_match:
    step_id: "step-ami-select-b8c1"
    confidence: 0.85
    reasoning: "視覺內容與舊版 step-ami-select 高度吻合，且都顯示啟動實例的入口"
```

### 步驟 3：diff（視覺差異）

如果有對應的舊截圖，做差異描述：

```yaml
visual_diff:
  old_image: "img-ami-select-v1.png"
  new_image: "new-console-step3.png"
  
  layout_changes:
    - "頂部從導覽列改為搜尋列"
    - "服務選單從左側移除"
    - "啟動按鈕位置從右下移到右上"
  
  color_changes:
    - "頂部主色從橘色改為深藍色"
  
  text_changes:
    - {old: "Launch Instance", new: "啟動執行個體"}
    - {old: "Services", new: "(已移除，改用搜尋)"}
  
  data_changes:
    - "顯示的執行個體數量不同（無關，可忽略）"
  
  significant_changes:        # 會影響 SOP 描述的變更
    - "服務選單已移除，舊 SOP 描述『點選左側服務選單』需要更新"
    - "按鈕文字改為繁體中文，舊 SOP 若引用英文按鈕名需要更新"
```

### 步驟 4：intent（產出變更意圖）

整合上述資訊產出 change_intent：

```yaml
change_intent:
  id: "change-xxx"
  type: "update_screenshot"      # 或 modify_step（若連帶要改文字）
  target:
    step_id: "step-ami-select-b8c1"
  change:
    description: "更新 AWS Console 改版後的 EC2 列表畫面"
    new_content:
      image_id: "img-ami-select-v2"
      caption: "新版 Console 的 EC2 執行個體列表（2026 改版）"
      replaces: "img-ami-select-v1"
    text_updates_required:       # 標記出文字也要改
      - field: "detailed_action"
        old_phrase: "點選左側『服務』選單"
        suggested_new: "在頂部搜尋列輸入 'EC2' 並按 Enter"
  sources:
    - type: "screenshot"
      ref: "new-console-step3.png"
      confidence: 0.85
  aggregated_confidence: 0.85
  requires_text_update: true     # 重要：文字要連帶更新
  intent_type: "explicit_change"
  needs_human_review: false
```

## 視覺指紋（用於配對）

為了讓配對更精準，可以為每張截圖計算「視覺指紋」：

```yaml
visual_fingerprint:
  dominant_colors: ["#FF9900", "#232F3E"]   # 主色
  layout_zones:                              # 主要區塊位置
    - {position: "top", height: "10%", role: "navigation"}
    - {position: "left", width: "20%", role: "menu"}
    - {position: "main", role: "content"}
  ui_pattern: "AWS Console 2024"             # 識別出的 UI 模式
  text_density: "medium"
```

新截圖的指紋與舊 SOP 中所有截圖的指紋比對，找最相似的。**指紋只是初篩，最終配對還是要靠 Claude 看圖判斷**。

## 截圖配對失敗的處理

### 失敗情境 1：找不到對應步驟

```yaml
match_result:
  best_match: null
  candidates: []
  reason: "視覺內容與舊 SOP 中所有截圖差異過大"

handling:
  - 標記為「無法自動配對」
  - 列出新截圖的描述給使用者
  - 詢問「這張截圖對應哪個步驟？是否為全新步驟？」
```

### 失敗情境 2：多個候選都接近

```yaml
match_result:
  candidates:
    - step_id: "step-A"
      similarity: 0.78
    - step_id: "step-B"
      similarity: 0.76
  
handling:
  - 標 needs_human_review: true
  - 兩個候選都列給使用者選
```

### 失敗情境 3：截圖品質差

模糊、解析度太低、被裁切。

```yaml
handling:
  - 信心降低
  - 主動提示「此截圖品質不佳，建議重新提供高解析度版本」
```

## 連帶影響偵測（重要）

截圖變更很常會牽動文字變更。要主動偵測：

```yaml
cascade_detection_rules:
  - if: "新截圖的 UI 框架與舊截圖不同"
    then: "整個步驟的 detailed_action 可能都要重寫"
    severity: "high"
  
  - if: "舊 SOP 文字中提到的元素（按鈕名、選單）在新截圖中不存在"
    then: "該段文字描述需要更新"
    severity: "high"
  
  - if: "新截圖文字語言與舊截圖不同（如英文→中文）"
    then: "舊 SOP 引用的元素名稱可能要對應新語言"
    severity: "medium"
  
  - if: "新截圖出現舊截圖沒有的警告/錯誤訊息"
    then: "可能需要新增 troubleshooting"
    severity: "medium"
```

每偵測到一項都產生對應的 `completeness_issue`。

## 多張截圖的整合

如果使用者上傳多張截圖：

1. **先各自處理**：每張獨立 describe → match → diff → intent
2. **再做去重**：可能有兩張截圖都對應同一步驟（保留品質較好的）
3. **找連續性**：如果多張是同一操作流程的不同步驟，要對應到連續的 step

```yaml
sequence_detection:
  detected_sequence:
    - {file: "new-001.png", matches: "step-A", order: 1}
    - {file: "new-002.png", matches: "step-B", order: 2}
    - {file: "new-003.png", matches: "step-C", order: 3}
  
  inference: "這三張是同一操作流程的連續截圖"
```

## image_id 命名規則

新截圖的 image_id 命名要可讀且有版本：

```yaml
naming_convention: "img-{topic}-{description}-v{version}"

範例:
  - img-aws-console-ec2-list-v2
  - img-sso-login-v1
  - img-sg-config-rules-v3

避免:
  - screenshot1, IMG_2342（沒語意）
  - new-pic（不知道是哪個版本）
```

## 邊界案例

### 案例 1：截圖含敏感資訊

可能含真實帳號 ID、IP、客戶名稱。

處理：
1. **抽取階段**：偵測可能的敏感資訊（用 regex 找 AWS 帳號 ID 格式、IP、Email）
2. 警告使用者「截圖可能含敏感資訊，建議遮罩後再使用」
3. 不強制阻擋，但要提醒

### 案例 2：截圖是手機拍的螢幕（不是直接 print screen）

處理：
1. 偵測（畫面有反光、傾斜、邊框）
2. 信心降低
3. 建議使用者用 print screen 重拍

### 案例 3：截圖含自訂註解（如紅色箭頭、黃色螢光筆）

處理：
1. 把註解視為「使用者已標出重點」
2. 在 highlight_areas 中保留這些區域
3. 信心可提升（已有人工強調）
