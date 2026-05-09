# 內訓 SOP Word 文件模板規格

## 用途

定義 sop-trainer 與 sop-updater 最終輸出的 Word 文件結構與樣式。

## 設計原則

1. **新人友善**：高可讀性、充足留白、清晰層級
2. **內訓導向**：含背景、含 rationale、含驗證方式
3. **品牌一致**：呼應 CloudOrange 風格（深色 accent + 淺色底）
4. **印刷友善**：能 A4 印出、墨水成本合理

## 文件結構

```
{sop_id}-v{version}.docx
├── 封面頁
├── 目錄頁
├── 1. 學習目標（learning_objectives）
├── 2. 為什麼要學這個（why_this_matters）
├── 3. 前置需求（prerequisites）
├── 4. 名詞解釋（glossary）           ← 新人友善：放前面
├── 5. 操作步驟（steps）               ← 主體
├── 6. 排解清單（troubleshooting）
├── 7. 進階學習資源（further_reading）
├── 8. 變更紀錄（最近 3 次）
└── 封底（含文件資訊、聯絡方式）
```

## 各章節樣式

### 封面頁

```yaml
cover_page:
  layout: "全頁，垂直置中"
  
  elements:
    - type: "logo"
      position: "top-center"
      content: "CloudOrange / 雲力橘子"
    
    - type: "title"
      content: "{title}"
      style: "32pt, 思源黑體 Bold, 深藍 #1A2B4A"
    
    - type: "subtitle"
      content: "標準作業程序"
      style: "16pt, 思源黑體 Light, 灰色"
    
    - type: "metadata_box"
      style: "圓角 box, 淺藍底 #F0F4F8"
      content:
        - 版本：{version}
        - 適用對象：{target_audience}
        - 預估學習時間：{estimated_duration}
        - 難度：{difficulty}
        - 最後更新：{last_updated}
    
    - type: "footer"
      content: "本文件僅供內訓使用 | © {year} CloudOrange Digital"
```

### 目錄頁

- 自動產生
- 含頁碼
- 章節階層用縮排表示

### 第 1 章：學習目標

```
[圖示：🎯 目標]

讀完本份文件，你將能夠：

  ✓ {objective_1}
  ✓ {objective_2}
  ✓ {objective_3}
```

樣式：
- 標題 20pt 深藍
- 條列符號用對勾，綠色 #10B981
- 條列項目 12pt

### 第 2 章：為什麼要學這個

```
[圖示：💡 重要性]

{why_this_matters}
（一段或多段敘述）
```

樣式：
- 引用框（左側深藍粗線）
- 內容 12pt，行距 1.6

### 第 3 章：前置需求

分三個子章節：

```
3.1 必備知識
┌──────────────────────────────────────┐
│ ☐ {description}                       │
│   建議資源：{recommended_resource}    │
└──────────────────────────────────────┘

3.2 必要權限
┌──────────────────────────────────────┐
│ ☐ {resource}                          │
│   申請方式：{how_to_request}          │
└──────────────────────────────────────┘

3.3 必要工具
┌──────────────────────────────────────┐
│ ☐ {name} (v{version})                 │
│   安裝指南：{install_guide}           │
└──────────────────────────────────────┘
```

樣式：
- checkbox 設計，新人可勾選
- 每項用淡灰底 box

### 第 4 章：名詞解釋

```
{term}（{aliases}）
    {definition}
    [首次出現於：{first_appears_in 對應的步驟標題}]
```

樣式：
- 術語用粗體 + 主色
- 別名用括號、灰色
- 定義縮排
- 「首次出現於」用小字、斜體

### 第 5 章：操作步驟（核心）

每個步驟用「**卡片式**」排版：

```
┌─────────────────────────────────────────────────────────┐
│  步驟 {display_order}：{title}                  ⏱ {time} │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📋 這步要做什麼                                          │
│  {description}                                           │
│                                                          │
│  ─────────────────────────────────                      │
│                                                          │
│  🔧 詳細操作                                              │
│  {detailed_action}                                       │
│                                                          │
│  [截圖區]                                                │
│  ┌──────────────────────────────┐                       │
│  │ [image with red box highlights]│                     │
│  └──────────────────────────────┘                       │
│  圖：{caption}                                           │
│                                                          │
│  ─────────────────────────────────                      │
│                                                          │
│  💡 為什麼要這樣做                                        │
│  {rationale}                                             │
│                                                          │
│  ─────────────────────────────────                      │
│                                                          │
│  [Code Block 區，如有]                                   │
│  ```bash                                                 │
│  {code_content}                                          │
│  ```                                                     │
│  ↑ {code_explanation}                                    │
│                                                          │
│  ─────────────────────────────────                      │
│                                                          │
│  ✅ 怎麼確認做對了                                        │
│  做法：{verification.method}                             │
│  應看到：{verification.expected_result}                  │
│                                                          │
│  ─────────────────────────────────                      │
│                                                          │
│  ⚠️ 常見錯誤                                              │
│  • {mistake_1} → {fix_1}                                 │
│  • {mistake_2} → {fix_2}                                 │
│                                                          │
│  💎 老手提示                                              │
│  • {tip_1}                                               │
│  • {tip_2}                                               │
│                                                          │
│  🚨 警告                                                  │
│  {warning_1}                                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

樣式重點：

```yaml
step_card:
  border: "深藍 1.5pt, 圓角 4pt"
  header:
    background: "深藍漸層 #1A2B4A → #2D4A7A"
    text_color: "白色"
    font: "思源黑體 Bold, 16pt"
  
  section_dividers: "細灰線, 0.5pt"
  
  icons:
    description: "📋"
    detailed_action: "🔧"
    rationale: "💡"
    verification: "✅"
    common_mistakes: "⚠️"
    tips: "💎"
    warnings: "🚨"
  
  highlight_boxes:
    rationale: 
      background: "#FFFBEB"  # 淡黃，引人注意
      border_left: "4pt solid #F59E0B"
    verification:
      background: "#F0FDF4"  # 淡綠
      border_left: "4pt solid #10B981"
    warnings:
      background: "#FEF2F2"  # 淡紅
      border_left: "4pt solid #EF4444"
    tips:
      background: "#F0F9FF"  # 淡藍
      border_left: "4pt solid #0EA5E9"
  
  code_blocks:
    background: "#1F2937"
    text_color: "#F9FAFB"
    font: "JetBrains Mono, 10pt"
    border_radius: "4pt"
```

#### 截圖呈現

```yaml
screenshot:
  max_width: "16cm"  # 內距後的可用寬度
  alignment: "center"
  
  # 紅框標註
  highlight_overlay:
    box_color: "#EF4444"
    box_width: "2pt"
    label_position: "above-right"
    label_style: "white text on red background"
  
  caption:
    style: "italic, 10pt, 灰色"
    prefix: "圖：步驟 {n}-{m}"
```

#### 步驟之間的銜接

每個步驟卡片之間留 1 行空白，並用「→」箭頭視覺暗示流程性。

### 第 6 章：排解清單

每個 troubleshooting 用表格呈現：

```
┌────────────────────────────────────────────────────────┐
│ {symptom}                              [severity badge] │
├────────────────────────────────────────────────────────┤
│                                                         │
│ 🔍 可能原因                                              │
│ • {cause_1}                                             │
│ • {cause_2}                                             │
│                                                         │
│ 🛠 解決方法                                              │
│ {solution}                                              │
│                                                         │
│ 📍 相關步驟：{related_steps 連結}                        │
└────────────────────────────────────────────────────────┘
```

severity badge：
- critical：紅底白字
- warning：橘底白字
- info：藍底白字

### 第 7 章：進階學習資源

簡單條列：

```
📚 進階學習

  • {title}
    {description}
    🔗 {url}
```

### 第 8 章：變更紀錄（最近 3 次）

表格呈現：

```
┌─────────┬────────────┬──────────────────────────┬────────┐
│ 版本    │ 日期       │ 變更摘要                 │ 重訓?  │
├─────────┼────────────┼──────────────────────────┼────────┤
│ 1.3.0   │ 2026-04-15 │ 更新 SG 設定章節...      │ 否     │
│ 1.2.0   │ 2026-02-10 │ 新增 AMI 選擇章節...     │ 否     │
│ 1.1.0   │ 2026-01-05 │ 首次新增 troubleshoot... │ 否     │
└─────────┴────────────┴──────────────────────────┴────────┘

完整變更紀錄請參考 changelog 檔案
```

### 封底

```
─────────────────────────────────────────
本文件版本：v{version}
產生時間：{generated_at}
聯絡：{authors}

[CloudOrange Logo]
雲力橘子數位股份有限公司
─────────────────────────────────────────
```

## 頁首頁尾

```yaml
header:
  left: "{title}"
  right: "v{version}"
  style: "10pt 灰色, 細線 underline"

footer:
  left: "CloudOrange 內訓文件"
  center: ""
  right: "第 {page} / {total_pages} 頁"
  style: "9pt 灰色"
```

## 字型與字級

```yaml
typography:
  cjk_font: "思源黑體 / Noto Sans TC"
  english_font: "Inter"
  monospace_font: "JetBrains Mono"
  
  sizes:
    h1_chapter: "20pt Bold"
    h2_section: "16pt Bold"
    h3_subsection: "14pt Bold"
    body: "11pt Regular"
    small: "9pt Regular"
    code: "10pt Monospace"
  
  line_height:
    body: 1.6
    headings: 1.3
    code: 1.4
```

## 顏色系統

```yaml
colors:
  primary: "#1A2B4A"        # 深藍（主色）
  primary_light: "#2D4A7A"
  
  accent: "#4A3A6E"         # 靛紫（次主色）
  
  semantic:
    success: "#10B981"      # 綠（驗證、達成）
    warning: "#F59E0B"      # 橘（警告、提示）
    danger: "#EF4444"       # 紅（錯誤、危險）
    info: "#0EA5E9"         # 藍（資訊、提示）
  
  backgrounds:
    page: "#FFFFFF"
    card: "#FFFFFF"
    code: "#1F2937"
    rationale_highlight: "#FFFBEB"
    verification_highlight: "#F0FDF4"
    warning_highlight: "#FEF2F2"
    tip_highlight: "#F0F9FF"
  
  text:
    primary: "#1F2937"
    secondary: "#6B7280"
    muted: "#9CA3AF"
    inverse: "#FFFFFF"
```

## 列印考量

- 預設配色適合螢幕閱讀
- 提供 `--print-friendly` 選項：所有色塊改為灰階、降低色彩飽和度
- 截圖確保黑白印出仍可辨識
- 重要資訊不只靠顏色區分（也有圖示與文字）

## 實作建議

### 用 docx skill 產出

1. 不要硬寫整份 Word 的 XML，太脆弱
2. 用 python-docx 程式化建構
3. 把樣式定義（顏色、字級、border）抽成 constants
4. 把每個元素（step card、callout box）寫成 helper function

### 模板檔案

預先做一份 `training-sop-template.docx`：
- 含封面、頁首頁尾、樣式定義（Heading 1-3、Code、Quote 等）
- python-docx 開啟此模板做為起點，append 內容

### 檢查清單

每份產出的 Word 文件要通過：
- [ ] 目錄正確、頁碼連續
- [ ] 所有截圖正確嵌入、不超出頁面
- [ ] Code block 不被切斷在頁尾
- [ ] 字型在沒有思源黑體的電腦也能 fallback
- [ ] 列印預覽正常（A4 直式）
- [ ] PDF 轉檔後排版不跑掉

## 與 PDF 輸出的關係

PDF 從 Word 轉換產生（用 pdf skill 或 LibreOffice）：

```bash
# 兩種輸出在同個 IR 來源產生
sop-gen render --ir ir.yaml --format docx,pdf
```

PDF 額外處理：
- 加入 PDF 大綱（bookmarks）對應目錄
- 確保超連結可點
- 內嵌字型（避免別人開啟字型不對）
