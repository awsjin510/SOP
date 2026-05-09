---
name: sop-updater
description: 將更新素材（修改清單、文字檔、PDF 變更通知、新截圖）套用到既有 SOP，產出更新後的 SOP 與三層級變更報告。當使用者說「更新這份 SOP」「把這些變更套上去」「比對新舊版產出更新」「修訂 SOP」「SOP 要改版」「合併修改清單」時觸發。支援多種素材類型混合輸入，自動偵測衝突與完整性問題，並透過互動式審核確保品質。輸出為新版 Word/PDF 與三層級 changelog（管理者版、訓練員版、工程師版）。
---

# SOP 更新器

## 用途

把多模態的更新素材套用到既有 SOP，產出新版本。

**核心原則**：
1. **Diff-First**：只動該動的地方，沒動的步驟一字不改
2. **可追溯**：每項變更都記錄來源
3. **人工閘門**：低信心、有衝突、有完整性問題的地方一定要人工確認
4. **版本完整保留**：舊版永遠在 storage 中可取

## 工作流程

### 步驟 1：定位舊 SOP

詢問使用者要更新哪份 SOP，或從輸入素材自動判斷。

兩種情境：
- **本系統產的 SOP**：直接讀 `sop-storage/{sop-id}/current/ir.yaml`
- **外部 Word/PDF**：執行反向解析，重建 IR（標記不確定欄位）

### 步驟 2：收集更新素材

接收使用者的更新素材，分類：

```
update-materials/
├── change-lists/    # 修改清單（Word/Excel/Markdown）
├── text-files/      # 文字檔（會議紀錄、變更說明等）
├── pdfs/            # PDF（廠商通知、release note）
└── screenshots/     # 新截圖（含對比用的舊截圖）
```

### 步驟 3：分流抽取（產出 change_intents）

呼叫四個抽取器，每個產出獨立的 change_intents：

#### 3.1 修改清單抽取器
參照 `extractors/change-list-extractor.md`

優先策略：
1. Word 含追蹤修訂 → 抽 revision marks（信心 0.95+）
2. 含表格結構 → 解析表格欄位
3. 條列符號 → 條列解析
4. 自由文字 → 詢問或標記低信心

#### 3.2 文字檔抽取器
參照 `extractors/text-extractor.md`

兩階段：
1. 類型判斷（會議紀錄 / 變更說明 / 訪談 / 對話）
2. 依類型不同處理策略

關鍵：區分「明確變更」與「隱含補充」。

#### 3.3 PDF 抽取器
參照 `extractors/pdf-extractor.md`

依 PDF 類型處理：
- 純文字 → 走文字檔流程
- 含表格 → 保持表格結構
- 掃描 PDF → OCR 後信心降低
- 含截圖 → 抽出當截圖素材

整合術語對映表（`{sop-id}/terminology.yaml`）。

#### 3.4 截圖抽取器
參照 `extractors/screenshot-extractor.md`

四步驟：
1. **describe**：描述這張圖在做什麼
2. **match**：跟舊 SOP 步驟比對
3. **diff**：跟舊截圖做視覺差異描述
4. **intent**：產出變更意圖（包含是否需要文字也跟著改）

### 步驟 4：匯流（Merge）

參照 `merger/` 目錄下的所有規則。

#### 4.1 去重與合併
不同素材講同一個變更 → 合併成單一 change_intent，保留所有 sources，提升 confidence。

```yaml
- id: change-001
  type: modify_step
  target: {step_id: "step-a3f2c891"}
  sources:
    - {type: change_list, ref: "..."}
    - {type: meeting_notes, ref: "..."}
    - {type: screenshot, ref: "..."}
  aggregated_confidence: 0.97  # 多源印證提升
  consolidated: true
```

#### 4.2 衝突偵測
參照 `merger/conflict-detector.md`

三類衝突：
- `ambiguous_target`：不確定改哪一步
- `content_contradiction`：素材間矛盾
- `cascade_inconsistency`：改 A 但 B 沒跟著改

**所有衝突都要拋給人，不要自動解決。**

#### 4.3 完整性檢查
參照 `merger/completeness-checker.md`

檢查項目：
- 步驟改了，截圖沒換
- 步驟改了，前置需求沒更新
- 步驟改了，troubleshooting 還引用舊操作
- 新增權限，但 prerequisites 沒列

### 步驟 5：互動式審核（人工閘門）

使用 CLI 互動，**逐項確認**或**批次接受**：

```
🔍 偵測到 9 項變更意圖：

  [1] 修改 step-003：AWS Console 路徑變更（信心 92%）
  [2] 修改 step-004：新增權限檢查步驟（信心 85%）
  [3] 新增 troubleshooting：Timeout 錯誤處理（信心 95%）
  [4] ⚠️  含糊：「權限設定」可能指 step-2 或 step-5
  ...

? 確認以上變更？(全部接受 / 逐項審核 / 取消)
```

審核選項：
- `(a)` 接受
- `(r)` 拒絕
- `(e)` 編輯內容
- `(s)` 跳過（之後再處理）

衝突處理選單：
```
[衝突 1] modifications.docx 與 meeting-notes.txt 對 IAM 處理意見不同
   (a) 採用 modifications.docx 的版本
   (b) 採用 meeting-notes.txt 的版本
   (c) 我來手動決定
```

### 步驟 6：套用變更

#### 6.1 機械合併
按 change_intents 直接套用到舊 IR：
- `add` → 在 steps 陣列中插入（用 display_order 控制位置）
- `modify` → 替換指定欄位
- `remove` → 標記為 removed（軟刪除，保留歷史）
- `restructure` → 大規模重組（需 metadata 額外處理）

#### 6.2 AI 潤飾
檢查連貫性：
- 改完後前後步驟銜接還順嗎？
- 新增段落跟原文風格一致嗎？
- 術語是否需要在更早的位置定義？

**只動連貫性相關的字句，不要改變更已套用的核心內容。**

#### 6.3 更新 metadata
- 版本號 +1（依 changes 規模決定 major/minor/patch）
- last_updated 改為現在（GMT+8）
- 為新步驟加 `version_added`
- 為修改步驟更新 `last_modified`

### 步驟 7：產出三層級 changelog

參照 `templates/changelog-template.docx`

#### 7.1 管理者層級（Executive Summary）
- 一頁式
- 影響範圍（哪幾章節、幾個步驟）
- 是否需要重新訓練學員
- 主要變更原因

#### 7.2 訓練員層級（Trainer Brief）
- 變更項目表格（類型 / 影響步驟 / 是否影響訓練）
- 每項變更的訓練說明建議

#### 7.3 工程師層級（Detailed Diff）
- 完整的 before/after diff
- 每項變更的 source_refs
- 連帶影響說明

### 步驟 8：輸出與儲存

```
sop-storage/{sop-id}/
├── versions/v1.4/
│   ├── ir.yaml
│   ├── document.docx
│   ├── document.pdf
│   └── source-materials/  # 本次更新使用的素材
├── changes/
│   ├── v1.3-to-v1.4.yaml          # 完整 change_intents 紀錄
│   └── v1.3-to-v1.4-changelog.docx # 三層級報告
└── current → versions/v1.4
```

完成時告知使用者：

```
✅ SOP 更新完成（v1.3 → v1.4）

📁 新版位置：sop-storage/{sop-id}/versions/v1.4/

📊 變更摘要：
   - 修改 {n} 個步驟
   - 新增 {m} 個 troubleshooting
   - 移除 {k} 個過時內容
   - 影響章節：{sections}
   - 需要重新訓練：{是 / 否}

📄 產出檔案：
   - document.docx / .pdf（新版 SOP）
   - changelog-v1.3-to-v1.4.docx（三層級變更報告）
   - source-mapping.yaml（變更追溯）

🔍 處理結果：
   - 自動套用：{x} 項
   - 人工確認：{y} 項
   - 拒絕：{z} 項
```

## 觸發詞細則

明確觸發：
- 「更新 SOP」「修訂 SOP」「SOP 要改版」
- 「把這些變更套到 SOP」
- 「合併修改清單到 SOP」
- 「比對新舊版產出更新」

弱觸發（要先確認）：
- 「改一下 SOP」（可能是錯字修正，問清楚範圍）
- 「重寫這份 SOP」（可能是要重新產生而非更新）

## 重要原則

1. **絕對不要全文重寫**：只動該動的地方，沒動的步驟一字不改
2. **step_id 必須穩定**：跨版本永遠不變，新增步驟用新 UUID
3. **拒絕自動解決衝突**：寧可慢，不可錯
4. **每項變更必有 source**：沒來源的「變更」是幻覺，要拒絕
5. **完整性優先於進度**：寧可標記完整性問題卡住，不可放行有問題的版本
6. **語言**：所有面向使用者的文字、最終文件都用繁體中文（zh-TW）

## 相關 Skills

- `docx` skill：產 Word
- `pdf` skill：轉 PDF
- `pdf-reading` skill：讀 PDF 素材
- `sop-trainer` skill：第一次產生時用

## 不要做的事

- 不要把所有素材丟給一個大 prompt 處理
- 不要為了快跳過衝突偵測
- 不要在抽取階段就合併（先各自抽取再匯流）
- 不要重新編號 step_id
- 不要在沒有 source_refs 的情況下套用變更
