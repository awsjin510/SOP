# 匯流引擎（Merger）

## 用途

把四個抽取器各自產出的 change_intents 整合成單一清單，並進行衝突偵測與完整性檢查。

## 三個核心任務

1. **去重與合併**（Consolidation）：相同變更的多個來源合併
2. **衝突偵測**（Conflict Detection）：找出素材間矛盾
3. **完整性檢查**（Completeness Check）：找出「改一半」的問題

## 任務 1：去重與合併

### 何時應該合併？

兩個 change_intent 應該合併，當：
- 指向相同 `target.step_id` + `target.field`
- 描述語意相近
- 變更類型相同

### 合併邏輯

```python
def consolidate_intents(intents):
    """合併指向相同目標的變更意圖"""
    
    # 第一輪：依 target 分組
    groups = defaultdict(list)
    for intent in intents:
        key = (intent.target.step_id, intent.target.field, intent.type)
        groups[key].append(intent)
    
    # 第二輪：每組內檢查語意相似度
    consolidated = []
    for key, group in groups.items():
        if len(group) == 1:
            consolidated.append(group[0])
            continue
        
        # 用 Claude 判斷語意相似度
        if all_similar_semantics(group):
            merged = merge_intents(group)
            merged.consolidated = True
            merged.aggregated_confidence = boost_confidence(group)
            consolidated.append(merged)
        else:
            # 看似指向同一處但內容不同 → 衝突
            consolidated.extend(group)
            register_conflict(group, type="content_contradiction")
    
    return consolidated
```

### 信心提升公式

多源印證時，信心提升：

```
新信心 = min(0.99, 1 - ∏(1 - confidence_i))
```

範例：
- 三個來源信心分別為 0.85, 0.80, 0.70
- 新信心 = 1 - (0.15 × 0.20 × 0.30) = 1 - 0.009 = 0.991 → 0.99

但要注意：
- 同類型的多個來源（如三份不同的 meeting notes）信心提升較多
- 不同類型印證（修改清單 + PDF + 截圖）信心提升最多
- 如果其中一個信心極低（< 0.3），不算入印證

## 任務 2：衝突偵測

### 衝突類型 1：ambiguous_target（含糊目標）

**何時觸發**：
- change_intent.target.step_id == "UNKNOWN"
- 對映到多個候選且都低信心
- target 描述模糊（如「權限那段」對應多個 step）

**處理**：
```yaml
conflict:
  id: conflict-xxx
  type: ambiguous_target
  related_change_ids: [change-yyy]
  candidates: [step-A, step-B, step-C]
  suggested_resolution: "依描述內容推斷最可能是 step-B"
  needs_human_review: true
```

### 衝突類型 2：content_contradiction（素材間矛盾）

**何時觸發**：
- 多個 change_intent 指向相同 target 但內容矛盾
- 例：A 說「改用 IAM Role」，B 說「繼續用 IAM User」

**處理**：
```yaml
conflict:
  id: conflict-xxx
  type: content_contradiction
  related_change_ids: [change-A, change-B]
  sources_in_conflict:
    - source: {type: change_list, ref: "..."}
      says: "改用 IAM Role"
    - source: {type: meeting_notes, ref: "..."}
      says: "繼續用 IAM User"
  suggested_resolution: "..."
  needs_human_review: true
```

**自動建議邏輯**（僅供使用者參考，不自動套用）：

```yaml
auto_resolution_hints:
  by_recency: "較新的素材通常更可信"
  by_authority:
    - change_list >= meeting_notes      # 修改清單通常是定案
    - explicit_change >= implied_supplement
  by_specificity: "更具體的描述更可信"
```

### 衝突類型 3：cascade_inconsistency（連帶不一致）

**何時觸發**：改了 A 但 B 沒跟著改。

**範例**：
- 改了 step-3 改用 CLI（remove Console 操作）
- 但 step-5 還寫「承接前一步在 Console 完成的操作⋯」

**偵測邏輯**：

```python
def detect_cascade_inconsistency(intents, ir):
    issues = []
    for intent in intents:
        if intent.type != "modify_step":
            continue
        
        target_step = ir.steps.get(intent.target.step_id)
        
        # 找所有引用該步驟的其他內容
        references = find_references_to(target_step, ir)
        
        for ref in references:
            # 檢查 ref 內容是否與新內容一致
            if conflicts_with_new_content(ref, intent.change.new_content):
                issues.append(CascadeInconsistency(
                    main_change=intent,
                    affected=ref
                ))
    return issues
```

**常見 cascade 場景**：
- 修改步驟，但其他步驟引用其結果
- 修改 troubleshooting，但相關步驟未提及
- 改用新工具，但 prerequisites 沒更新

### 衝突類型 4：source_contradiction（同變更多源不同）

**何時觸發**：合併時發現多個來源描述同一變更但細節不同。

跟 content_contradiction 的差異：
- content_contradiction：明確兩個對立的變更主張
- source_contradiction：意圖相同但細節描述不一致

**範例**：
- 修改清單：「step-3 改用 CLI」
- 訪談：「step-3 改用 AWS CLI v2」
- PDF：「step-3 改用 AWS CLI v2 with profile」

意圖一致都是「改 CLI」，但細節（版本、profile）只有部分來源提到。

**處理**：取最完整的版本，保留所有來源；信心不衝突。

## 任務 3：完整性檢查

### 檢查項目清單

```yaml
completeness_checks:

  # 截圖未隨步驟更新
  - id: check-screenshot-outdated
    trigger: "step 的 detailed_action 改變，但 visual_refs 中的截圖未變"
    severity: 依改動程度（layout 改 → high；只是文字 → medium）
    auto_fixable: false
  
  # 前置需求未更新
  - id: check-prerequisites-outdated
    trigger: "新增的步驟提及新工具/權限，但 prerequisites 未列"
    severity: medium
    auto_fixable: true（可自動補進 prerequisites）
  
  # troubleshooting 引用舊操作
  - id: check-troubleshooting-outdated
    trigger: "troubleshooting 的 solution 提到的操作與更新後的 step 不符"
    severity: high
    auto_fixable: false
  
  # 新術語未加 glossary
  - id: check-glossary-missing
    trigger: "變更內容引入了 glossary 中沒有的新術語"
    severity: low
    auto_fixable: true
  
  # 相關步驟不一致
  - id: check-related-steps-inconsistent
    trigger: "step 引用其他 step 的內容，但被引用方已變更"
    severity: high
    auto_fixable: false
  
  # 安全警告連帶遺漏
  - id: check-warnings-missing
    trigger: "新增權限或操作，但缺對應安全警告"
    severity: medium
    auto_fixable: false（需要人工判斷）
  
  # 估計時間需重算
  - id: check-time-recalc
    trigger: "步驟內容增減超過 30%，但 estimated_time 未變"
    severity: low
    auto_fixable: false
```

### 自動修復 vs. 人工處理

```yaml
auto_fixable:
  - 把新工具加進 prerequisites.tools
  - 把新權限加進 prerequisites.access
  - 把新術語加進 glossary（用標準定義模板，標 needs_human_review）

needs_human_input:
  - 截圖更新
  - troubleshooting 重寫
  - 跨步驟一致性調整
  - 時間估計
```

**自動修復的內容也要標 `auto_fixed: true` 並列入審核項目**，使用者可以選擇接受或修改。

## 匯流階段的輸出

匯流完成後產出：

```yaml
merged_result:
  meta:
    from_version: "1.3.0"
    to_version: "1.4.0"
    merged_at: "2026-05-09T14:00:00+08:00"
  
  change_intents: [...]              # 經過合併的變更意圖
  conflicts: [...]                   # 待解決的衝突
  completeness_issues: [...]         # 完整性問題
  
  statistics:
    total_raw_intents: 14            # 原始抽取總數
    consolidated: 9                  # 合併後數量
    auto_applicable: 5               # 可自動套用
    needs_human_review: 4            # 需要審核
    conflicts_count: 2
    completeness_issues_count: 3
```

## 互動式審核流程

匯流完成後進入互動式審核：

### 步驟 1：總覽
```
🔍 匯流完成

  • 14 項原始變更 → 合併為 9 項唯一變更
  • 3 項變更有多源印證（信心提升至 0.95+）
  • 5 項可自動套用
  • 4 項需要人工確認
  • 2 項衝突需要解決
  • 3 項完整性問題

? 開始審核？(批次接受可自動的 / 逐項審核 / 取消)
```

### 步驟 2：先處理衝突
衝突必先解決，否則無法繼續。

```
[衝突 1/2] content_contradiction
  modifications.docx 與 meeting-notes.txt 對 IAM 處理意見不同
  
  (a) 採用 modifications.docx 的版本（建議：日期較新）
  (b) 採用 meeting-notes.txt 的版本
  (c) 我來手動編輯
  (d) 跳過此變更
> 
```

### 步驟 3：審核變更意圖
依信心降冪呈現，高信心快速通過：

```
[變更 1/9] modify_step → step-login-aws-d4e1
  描述：AWS Console 改版，登入後操作變更
  信心：0.97（多源印證）
  
  Diff:
  -    4. 點選「Management Console」
  +    4. 點選「Management Console」
  +    5. 進入 Console 後，使用頂部搜尋列尋找服務
  
  (a) 接受  (e) 編輯  (r) 拒絕  (d) 詳細資訊
> a
```

### 步驟 4：處理完整性問題

```
[完整性 1/3] screenshot_outdated（severity: high）
  step-ami-select 的截圖仍是舊版 Console 介面
  
  自動修復：不可（需要新截圖）
  
  (a) 從上傳的截圖找替代（建議：new-console-002.png）
  (b) 暫時保留舊圖，標記為「待更新」
  (c) 跳過
> 
```

## 設計原則

1. **保守原則**：不確定就標 needs_human_review，寧可慢不可錯
2. **追溯原則**：合併後仍保留所有 sources，可追到原始素材
3. **可解釋原則**：每個自動決定都要有 reasoning，使用者隨時可看到「為什麼系統這樣判斷」
4. **可逆原則**：審核中的選擇要可以反悔（用 deferred 狀態）

## 不要做的事

- 不要自動解決衝突（即使建議很明顯）
- 不要在合併階段改寫變更內容（純整合，不潤飾）
- 不要把信心極低的變更也算入印證
- 不要讓自動修復覆寫 needs_human_review 的標記
