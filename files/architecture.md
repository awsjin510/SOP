# 系統架構

## 整體資料流

```
┌─────────────────────────────────────────────────────────────┐
│                      sop-trainer（產生）                     │
│                                                              │
│  訪談逐字稿 ─┐                                                │
│  混亂文件   ─┼──→ 結構化抽取 ──→ IR ──→ 內訓增強 ──→ Word/PDF │
│  截圖/錄影  ─┘                    │                          │
│                                   ▼                          │
│                                 儲存                          │
│                          versions/v1.0/ir.yaml               │
└─────────────────────────────────────────────────────────────┘

                            │
                            ▼ （SOP 需要更新時）

┌─────────────────────────────────────────────────────────────┐
│                      sop-updater（更新）                     │
│                                                              │
│  舊 SOP ──→ 載入舊 IR                                         │
│                                                              │
│  修改清單 ─┐                                                  │
│  文字檔   ─┼─→ 分流抽取 ─→ change_intents ─→ 匯流 ─┐         │
│  PDF      ─┤                                       │          │
│  截圖     ─┘                                       ▼          │
│                                          智慧合併引擎         │
│                                                    │          │
│                                                    ▼          │
│                                           人工審核閘門        │
│                                                    │          │
│                                                    ▼          │
│                                       新 IR + changelog       │
│                                                    │          │
│                                                    ▼          │
│                                          Word/PDF + 變更報告 │
└─────────────────────────────────────────────────────────────┘
```

## 模組分層

### Layer 1：Skill 層（使用者直接觸發）

兩個 skill 是使用者與系統的入口：

- `sop-trainer`：透過自然語言觸發（「幫我做成 SOP」「整理成內訓文件」）
- `sop-updater`：透過自然語言觸發（「更新這份 SOP」「把這些變更套上去」）

### Layer 2：抽取器層（針對素材類型）

每種素材有專屬抽取器，獨立可測：

**sop-trainer 的抽取器**：
- `transcript-extractor`：訪談逐字稿
- `document-extractor`：Word/PDF/Notion 既有文件
- `visual-extractor`：截圖與錄影關鍵幀

**sop-updater 的抽取器**：
- `change-list-extractor`：修改清單（Word/Excel/Markdown）
- `text-extractor`：文字檔（會議紀錄、變更說明等）
- `pdf-extractor`：PDF 檔案（廠商通知、release note）
- `screenshot-extractor`：截圖（含視覺差異分析）

### Layer 3：核心引擎層

**對 sop-trainer**：
- `ir-builder`：建構 IR
- `enhancer`：內訓增強（小新 + 小修循環）
- `reviewer`：最終檢查

**對 sop-updater**：
- `merger`：機械合併
- `conflict-detector`：衝突偵測
- `completeness-checker`：完整性檢查
- `polisher`：AI 潤飾連貫性

### Layer 4：輸出層

- `docx-renderer`：透過 docx skill 產 Word
- `pdf-renderer`：透過 pdf skill 產 PDF
- `changelog-renderer`：產三層級變更報告

## 儲存設計

```
sop-storage/
├── {sop-id}/                          # 每份 SOP 一個資料夾
│   ├── meta.yaml                      # 基本資訊、版本清單
│   ├── versions/
│   │   ├── v1.0/
│   │   │   ├── ir.yaml                # IR 中繼層
│   │   │   ├── document.docx          # 輸出文件
│   │   │   ├── document.pdf
│   │   │   └── source-materials/      # 該版本使用的原始素材
│   │   ├── v1.1/
│   │   └── v1.2/
│   ├── changes/
│   │   ├── v1.0-to-v1.1.yaml         # change_intents 紀錄
│   │   ├── v1.0-to-v1.1-report.docx  # 三層級 changelog
│   │   └── ...
│   ├── assets/
│   │   ├── images/                    # 截圖（用 image_id 命名）
│   │   │   ├── img-001.png
│   │   │   └── img-002.png
│   │   └── images.yaml                # image_id → 描述對映
│   ├── terminology.yaml               # 術語對映表
│   └── current → versions/v1.2       # symlink 指向最新版
```

## 關鍵資料模型

### IR（Intermediate Representation）

詳見 `docs/ir-design.md` 與 `schemas/ir-schema.yaml`。

核心結構：
```yaml
sop:
  metadata: {...}        # 基本資訊
  context: {...}         # 為什麼學這個、前置需求
  glossary: [...]        # 術語表
  steps: [...]           # 操作步驟（每步驟含詳細欄位）
  troubleshooting: [...] # 排解清單
  changelog: [...]       # 變更紀錄
```

### change_intents（變更意圖）

詳見 `schemas/change-intent-schema.yaml`。

核心結構：
```yaml
change_intents:
  - id: change-001
    type: add | modify | remove | restructure | metadata
    target: {step_id, field}
    change: {old_content, new_content, description}
    sources: [{type, ref, confidence}]
    aggregated_confidence: 0.95
    needs_human_review: false
```

## 關鍵設計決策

### 為什麼要 IR 中繼層？

1. **多格式輸出**：同一份 IR 可以產 Word / PDF / Markdown / Notion
2. **更新可追蹤**：IR 是結構化的，可以做精確 diff
3. **版本可重生**：保留 IR 就能重新產出該版本的文件
4. **跨工具整合**：未來要接 Airtable / n8n 都很方便

### 為什麼要分流抽取？

直覺上把所有素材丟給一個大 prompt 讓 Claude 處理最簡單，但實務上：

1. **信心評估會失準**：不同素材類型的可信度本就不同
2. **來源追溯會失蹤**：合併處理後不知道哪段話來自哪份素材
3. **除錯困難**：出問題不知道是哪個環節的錯
4. **無法獨立優化**：想改善 PDF 處理會動到其他流程

分流抽取雖然多寫程式碼，但**可控、可測、可漸進改善**。

### 為什麼要人工閘門？

內訓文件的特殊性：
- 讀者是新人，沒有判斷力
- 一個錯誤會被多人學起來
- 修正成本遠高於人工審核成本

因此設計上**寧可慢一點，不可錯一點**。所有低信心、有衝突、有完整性問題的地方都要人工確認。

### 為什麼三層級 changelog？

不同角色關心的層次不同：
- **管理者**：這次更新影響範圍多大？要不要重排訓練？
- **訓練員**：哪些步驟改了？要怎麼跟學員說明？
- **工程師**：實際上每個字怎麼改的？

一份文件無法同時滿足三種需求，分三層提供。

## 與既有工具的整合方向

（這些是未來擴充方向，第一階段不實作）

- **Airtable**：IR 與 change_intents 存進 Airtable，做版本管理與檢視
- **n8n**：透過 webhook 觸發更新流程
- **Telegram bot**：審核通知與互動式確認
- **Google Drive**：素材輸入來源、最終文件儲存
- **Notion**：另一種輸出格式
