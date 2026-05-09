# IR（Intermediate Representation）設計

## 設計理念

IR 是整個系統的核心資料結構，所有輸入都會轉成 IR，所有輸出都從 IR 產生。

設計原則：

1. **完整性**：包含產出文件所需的所有資訊
2. **結構化**：YAML 格式，可被機器精確處理
3. **可追溯**：每段內容都能追溯到來源素材
4. **可演進**：欄位設計考慮未來擴充
5. **ID 穩定**：所有 step_id 跨版本保持一致（用 UUID 或內容 hash）

## ID 規則（重要）

**step_id 命名**：使用穩定的識別碼，**絕對不要用順序編號**。

推薦兩種做法：

**做法 A：UUID（建議）**
```
step_id: "step-a3f2c891"  # 隨機產生，永不變動
```

**做法 B：內容 hash + 短碼**
```
step_id: "step-ec2-launch-a3f2"  # 含語意 + 短 hash
```

**為什麼不能用順序編號？**
- 中間插入新步驟會導致所有後續步驟 ID 改變
- 變更紀錄會錯亂（v1.0 的 step-3 跟 v1.1 的 step-3 不是同一步）

**順序顯示給使用者看的部分**，由 `display_order` 欄位控制，跟 ID 解耦。

## IR 完整結構

```yaml
sop:
  # ========== 基本資訊 ==========
  metadata:
    sop_id: string              # 系統識別碼，跨版本不變
    title: string               # 文件標題
    version: string             # semver: 1.4.0
    target_audience: string     # 「新進員工 / 工作 0-3 個月」
    estimated_duration: string  # 「約 30 分鐘」
    difficulty: enum            # 初級 | 中級 | 進階
    category: string            # 「AWS 操作」「n8n 自動化」等
    tags: [string]
    authors: [string]
    last_updated: ISO8601       # 含 GMT+8 時區
    last_reviewed: ISO8601
    
  # ========== 背景與前置 ==========
  context:
    why_this_matters: string    # 為什麼新人要學這個（內訓關鍵欄位）
    learning_objectives: [string] # 讀完這份你會做什麼
    prerequisites:
      knowledge:                 # 前置知識
        - description: string
          recommended_resource: string  # 哪份文件可學到
      access:                    # 必要權限
        - resource: string       # 「AWS Console 存取權」
          how_to_request: string # 「向 IT 申請 cloud-team-readonly group」
      tools:                     # 必要工具
        - name: string
          version: string
          install_guide: string

  # ========== 術語表（內訓重要） ==========
  glossary:
    - term: string
      definition: string
      first_appears_in: step_id  # 第一次出現在哪步驟
      aliases: [string]          # 別名（術語對映用）

  # ========== 操作步驟 ==========
  steps:
    - id: step_id                # 穩定 ID，跨版本不變
      display_order: int         # 顯示順序（可變）
      title: string              # 步驟簡短標題
      description: string        # 一句話說明這步要做什麼
      
      # 給新人看的詳細版
      detailed_action: string    # 完整操作描述
      rationale: string          # 為什麼要這樣做（內訓重要）
      
      # 視覺輔助
      visual_refs:               # 對應的截圖
        - image_id: string       # 對映 assets/images.yaml
          caption: string
          highlight_areas: [...] # 截圖中要標紅框的區域
      
      # 程式碼或指令
      code_blocks:
        - language: string       # bash | python | yaml 等
          content: string
          explanation: string
      
      # 驗證與排錯
      verification:
        method: string           # 怎麼確認做對了
        expected_result: string  # 應該看到什麼
      common_mistakes:           # 從訪談挖出的常見錯誤
        - mistake: string
          fix: string
      tips: [string]             # 老手的 know-how
      
      # 安全與權限提示
      warnings: [string]         # 危險操作警告
      permissions_used: [string] # 這步驟需要的權限
      
      # 時間與難度（粒度）
      estimated_time: string     # 「約 5 分鐘」
      
      # 元資料
      version_added: string      # 這步驟在哪個版本加入
      last_modified: string      # 最後修改的版本
      source_refs:               # 這步驟資訊的來源
        - type: enum             # interview | doc | screenshot | manual
          file: string
          location: string       # line / page / image_id
          confidence: float

  # ========== 排解清單 ==========
  troubleshooting:
    - id: ts_id                  # 穩定 ID
      symptom: string            # 「出現 AccessDenied 錯誤」
      possible_causes: [string]
      solution: string
      related_steps: [step_id]   # 跟哪些步驟相關
      severity: enum             # info | warning | critical
      source_refs: [...]

  # ========== 進階學習 ==========
  further_reading:
    - title: string
      url: string
      description: string

  # ========== 變更紀錄 ==========
  changelog:
    - version: string
      date: ISO8601
      author: string
      summary: string            # 給管理者看的高階摘要
      changes:
        - type: enum             # added | modified | removed | restructured
          target: step_id | "metadata" | "troubleshooting"
          description: string
          rationale: string
      affected_sections: [string]
      requires_retraining: bool  # 是否需要重新訓練學員

  # ========== 品質檢查狀態 ==========
  quality_checks:
    last_checked: ISO8601
    issues:
      - type: string             # gap | inconsistency | outdated
        description: string
        severity: enum
        location: step_id
        status: enum             # open | acknowledged | resolved
```

## 關鍵欄位說明

### `rationale`（為什麼這樣做）

這是內訓 SOP 與一般操作手冊最大的差異欄位。每個重要步驟都應該有，幫助新人建立判斷力。

範例：
```yaml
- id: step-a3f2c891
  title: 設定 Security Group 入站規則只開放必要 port
  detailed_action: "在 SG 設定中只開放 22 port 給堡壘機 IP"
  rationale: |
    開放過多 port 會擴大攻擊面。我們公司資安政策要求最小權限原則，
    所有對外服務必須走 ALB，EC2 不直接對外。22 port 也只給堡壘機，
    不給 0.0.0.0/0，避免成為 brute force 目標。
```

### `source_refs`（來源追溯）

**每個來自外部素材的內容都必須有 source_refs**。這是更新功能能正確運作的基礎。

```yaml
source_refs:
  - type: interview
    file: "interview-2026-04-15-mr-wang.txt"
    location: "line-87 to line-95"
    confidence: 0.9
  - type: doc
    file: "old-aws-manual.docx"
    location: "page-3"
    confidence: 0.85
```

### `image_id`（視覺資源）

截圖**永遠用 ID 引用**，不要直接用檔名。這樣截圖更新時只要替換對應檔案即可，IR 不用改。

```yaml
visual_refs:
  - image_id: "img-aws-console-ec2-list"
    caption: "EC2 實例列表，注意右上角的「啟動執行個體」按鈕"
    highlight_areas:
      - {x: 720, y: 80, width: 140, height: 40, label: "啟動按鈕"}
```

對應的 `assets/images.yaml`：
```yaml
images:
  img-aws-console-ec2-list:
    file: "assets/images/aws-console-ec2-list-v2.png"
    captured_at: "2026-05-09T14:30:00+08:00"
    captured_by: "jin"
    description: "AWS Console 改版後的 EC2 列表頁"
    superseded_by: null  # 如果這張被新圖取代，記在這
```

### `version_added` / `last_modified`

每個步驟都記錄它的版本歷程：

```yaml
- id: step-a3f2c891
  title: ...
  version_added: "1.0.0"
  last_modified: "1.4.0"  # 最後一次有實質變更的版本
```

這對更新時的 diff 顯示非常重要。

## 一份完整的 IR 範例

見 `schemas/examples/sample-ir.yaml`。

## 反向解析：從舊 SOP 重建 IR

更新功能會用到「從舊 Word/PDF 解析回 IR」。這個過程要注意：

1. **保留原 step_id**：如果該 SOP 是用本系統產的，IR 應該還在儲存區，直接讀；如果是外部來的，要為每個步驟產生新的穩定 ID（用內容 hash）
2. **標記不確定的欄位**：例如 `rationale` 在原文件可能沒有，要留 null 而非幻覺
3. **保留原文位置**：在 `source_refs` 記錄抽取自原文的哪一段
