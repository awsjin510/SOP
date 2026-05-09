# 三層級 Changelog 模板規格

## 用途

從 change_intents 自動產出三種角色適用的變更報告。

## 為什麼需要三層級？

| 角色 | 關心的問題 | 需要的資訊深度 |
|------|----------|--------------|
| 管理者 | 影響大不大？要不要重排訓練？ | 高階摘要、影響評估 |
| 訓練員 | 哪些步驟改了？怎麼跟學員說？ | 變更清單、訓練影響 |
| 工程師 | 實際每個字怎麼改的？ | 完整 diff、來源追溯 |

一份文件無法同時滿足三種需求，分三層提供。

## 整體結構

每份 changelog 是一個 Word 文件，含三個主要章節：

```
{sop_id}-changelog-v{from}-to-v{to}.docx
├── 封面
├── 第 1 章：管理者摘要（Executive Summary）       ← 管理者看這
├── 第 2 章：訓練員簡報（Trainer Brief）            ← 訓練員看這
├── 第 3 章：詳細變更紀錄（Detailed Changelog）     ← 工程師看這
├── 附錄 A：來源追溯
└── 附錄 B：未解決事項
```

## 第 1 章：管理者摘要

**目標**：1 頁，3 分鐘讀完。

### 內容欄位

```yaml
executive_summary:
  
  # 一句話摘要
  headline: "因應 AWS Console 改版，更新 EC2 啟動 SOP（v1.3 → v1.4）"
  
  # 變更原因
  why:
    - "AWS 2026 Q2 Console 改版，舊操作路徑失效"
    - "新增 SSO Session 過期排錯（依新人回饋）"
  
  # 影響範圍
  impact:
    sections_affected: ["第 1 章 登入", "第 2 章 AMI 選擇", "附錄 A 排錯"]
    steps_modified: 3
    steps_added: 0
    steps_removed: 0
    troubleshooting_added: 1
  
  # 訓練影響評估
  training_impact:
    requires_retraining: false
    rationale: "操作邏輯不變，僅介面路徑調整，現有受訓員工短暫適應即可"
    affected_trainees: "新訓中、近 30 天結訓者建議發送變更通知"
  
  # 需要採取的行動
  actions_required:
    - assignee: "訓練主管"
      action: "發送變更通知給近期結訓員工"
      due: "2026-05-15"
    - assignee: "雲端團隊"
      action: "確認所有客戶帳號已切換至新版 Console"
      due: "2026-05-20"
  
  # 風險與注意
  risks:
    - "若客戶帳號仍在舊版 Console（過渡期），需特別說明"
```

### Word 排版

- 使用色塊區隔（headline 用大字、影響範圍用 highlight box）
- 含一張總覽圖（影響範圍視覺化）
- 全章 1 頁內

## 第 2 章：訓練員簡報

**目標**：3 頁內，列出所有變更與訓練影響。

### 內容結構

```yaml
trainer_brief:
  
  # 變更項目表格（核心）
  changes_table:
    columns:
      - 變更類型     # 修改 / 新增 / 移除
      - 影響步驟     # 步驟 1.2 等
      - 變更摘要     # 一句話描述
      - 訓練影響     # 是 / 否 / 部分
      - 訓練建議     # 怎麼跟學員說
    
    rows:
      - type: "修改"
        steps: "步驟 1（登入 AWS Console）"
        summary: "新版 Console 改用頂部搜尋列，移除左側服務選單"
        training_impact: "部分"
        training_notes: |
          • 已結訓者：發送 1 分鐘短說明影片即可
          • 受訓中：直接帶過新版操作
          • 重點提醒：搜尋列在頂部、按 Enter 進入
      
      - type: "新增"
        steps: "排錯 - SSO Session 過期"
        summary: "新增 SSO 自動登出的處理說明"
        training_impact: "否"
        training_notes: "屬於問題排解，遇到時再參考即可"
  
  # 訓練輔助資源
  training_resources:
    - title: "新版 Console 操作影片（1:30）"
      url: "internal-wiki/training/aws-console-2026"
      provided: true
    - title: "舊新版對照表"
      provided: true
  
  # 關鍵變更亮點
  key_highlights:
    - "本次變更不影響操作邏輯，僅路徑變更"
    - "資安政策、權限要求皆不變"
    - "新人訓練時間估計：原 30 分 → 維持 30 分"
  
  # FAQ（從審核過程整理）
  anticipated_questions:
    - q: "舊版 Console 還能用嗎？"
      a: "AWS 已宣告 2026-08 完全下線，建議盡早適應新版"
    - q: "為什麼不直接改用 CLI？"
      a: "CLI 是進階課題，新人訓練仍以 Console 為主"
```

### Word 排版

- 表格為主視覺，使用顏色區分變更類型
- 重點資訊用 callout box
- 含 FAQ 章節

## 第 3 章：詳細變更紀錄

**目標**：完整資訊，工程師除錯與驗證用。

### 內容結構

```yaml
detailed_changelog:
  
  # 每個 change_intent 一個區塊
  changes:
    - id: "change-001"
      type: "modify_step"
      target: "step-login-aws-d4e1"
      
      summary: "AWS Console 改版，登入後操作變更"
      
      # Before / After Diff（核心）
      diff:
        field: "detailed_action"
        before: |
          1. 開啟瀏覽器到 https://cloudorange.awsapps.com/start
          2. 用公司 Email 登入 SSO
          3. 在帳號清單中選擇要操作的客戶帳號
          4. 點選「Management Console」
        after: |
          1. 開啟瀏覽器到 https://cloudorange.awsapps.com/start
          2. 用公司 Email 登入 SSO
          3. 在帳號清單中選擇要操作的客戶帳號
          4. 點選「Management Console」
          5. 進入 Console 後，使用頂部搜尋列尋找服務（舊版的左側「服務」選單已移除）
      
      rationale: "AWS 2026 Q2 Console 改版"
      
      sources:
        - type: "change_list"
          ref: "modifications-2026-05.docx:row-1"
          confidence: 0.95
        - type: "pdf_release_note"
          ref: "aws-console-2026-q2-changes.pdf:page-2"
          confidence: 0.92
      
      aggregated_confidence: 0.97
      
      cascade_effects:
        - "step-ami-select-b8c1.detailed_action 連帶更新"
        - "ts-cant-ssh.solution 連帶更新"
      
      reviewer: "jin"
      reviewed_at: "2026-05-09T14:30:00+08:00"
```

### Word 排版

- 每個變更一張卡片
- Diff 用 monospace + 紅綠對比
- 含完整 source_refs 表格

## 附錄 A：來源追溯

列出本次更新使用的所有素材：

```yaml
source_materials:
  - file: "modifications-2026-05.docx"
    type: "修改清單"
    contributed_changes: ["change-001", "change-003"]
    received_at: "2026-05-08T10:00:00+08:00"
    received_from: "雲端團隊"
  
  - file: "team-meeting-2026-05-03.txt"
    type: "會議紀錄"
    contributed_changes: ["change-003"]
    received_at: "2026-05-04T09:00:00+08:00"
  
  - file: "aws-console-2026-q2-changes.pdf"
    type: "AWS Release Note"
    contributed_changes: ["change-001"]
    received_at: "2026-05-01T00:00:00+08:00"
    source: "AWS 官方"
  
  - file: "screenshots/new-console-*.png"
    type: "截圖"
    count: 4
    contributed_changes: ["change-001", "change-002"]
```

## 附錄 B：未解決事項

列出**這次更新中跳過或暫緩**的項目：

```yaml
deferred_items:
  - related_change_id: "change-004"
    description: "IPv6 設定可能需要更新（單一來源、模糊提及）"
    reason_deferred: "信心不足，需要與發文者確認"
    suggested_action: "下次更新前釐清是否為正式政策"
    deferred_by: "jin"
    deferred_at: "2026-05-09T14:35:00+08:00"
  
  - issue_id: "completeness-001"
    description: "step-ami-select 的截圖仍為舊版 Console"
    reason_deferred: "尚未取得新版截圖"
    suggested_action: "請小王在客戶 sandbox 環境拍攝後補入"
```

## 從 change_intents 自動產生

整個 changelog 都是從 change_intents 自動產生，不需手寫。

關鍵對映：

| changelog 欄位 | 來自 change_intent 的⋯ |
|---------------|---------------------|
| executive_summary.headline | 從多個 change.description 摘要 |
| executive_summary.impact | 從 change_intents 統計 |
| executive_summary.actions_required | 從 needs_human_review 與 completeness_issues |
| trainer_brief.changes_table | 一個 change_intent 一列 |
| detailed_changelog.changes | 直接從 change_intents 展開 |
| 附錄 A | 從所有 change_intents.sources 去重 |
| 附錄 B | 從 review_status: deferred 與 completeness_issues |

## Word 模板設計要點

### 視覺風格

- 主色：深藍 (#1A2B4A) + 強調色（依不同章節）
  - 第 1 章管理者摘要：深綠強調（嚴肅）
  - 第 2 章訓練員簡報：橘色強調（行動）
  - 第 3 章詳細紀錄：深藍強調（資訊）
- 字體：思源黑體（中文）+ Inter（英文）
- 內文 11pt，標題 14-20pt
- 行距 1.5

### 元素標準

```yaml
elements:
  
  # 變更類型標籤
  change_type_badges:
    added: {color: "#10B981", label: "新增"}
    modified: {color: "#3B82F6", label: "修改"}
    removed: {color: "#EF4444", label: "移除"}
    restructured: {color: "#8B5CF6", label: "重構"}
  
  # 嚴重程度標籤
  severity_badges:
    critical: {color: "#DC2626"}
    high: {color: "#F97316"}
    medium: {color: "#FACC15"}
    low: {color: "#94A3B8"}
  
  # 信心顯示
  confidence_indicator:
    high: "●●●● （0.85+）"
    medium: "●●●○ （0.65-0.85）"
    low: "●●○○ （0.45-0.65）"
    very_low: "●○○○ （<0.45）"
  
  # Diff 區塊
  diff_block:
    style: "monospace, 10pt"
    removed_bg: "#FEE2E2"
    added_bg: "#D1FAE5"
    line_prefix:
      removed: "-"
      added: "+"
      unchanged: " "
```

## 使用 docx skill 產生

Word 檔透過 docx skill 產生，建議流程：

1. 把 changelog 內容組成 IR-like 結構
2. 載入 `templates/changelog-template.docx`（含樣式定義）
3. 用 docx skill 的填充功能產出最終檔案
4. PDF 從 Word 轉換

## 簡化版（單獨輸出）

有時使用者只需要某一層的內容（如只給訓練主管看）：

```bash
sop-gen changelog ec2-provisioning --from v1.3 --to v1.4 --level executive
sop-gen changelog ec2-provisioning --from v1.3 --to v1.4 --level trainer
sop-gen changelog ec2-provisioning --from v1.3 --to v1.4 --level engineer
sop-gen changelog ec2-provisioning --from v1.3 --to v1.4 --level all  # 預設
```
