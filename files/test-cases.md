# 測試案例清單

> 給 Claude Code 實作時參考的測試案例。
> 每個階段完成都應跑通對應的測試案例。

## 階段 1：基礎產生器測試

### TC-101：訪談逐字稿產生 SOP

**輸入**：
- 一份 1500-3000 字的訪談逐字稿
- 主題：AWS EC2 啟動操作
- 含：操作步驟、background、3-4 個 troubleshooting

**預期輸出**：
- 符合 schema 的 `ir.yaml`
- 至少 3 個 step
- 至少 2 個 troubleshooting
- 至少 3 個 glossary 項目
- 每段內容都有 source_refs

**通過標準**：
- [ ] schema 驗證通過
- [ ] step_id 是 UUID 或 hash 格式
- [ ] 沒有編造的內容（每段都能對到逐字稿原文）
- [ ] 模糊資訊有標 needs_human_input

### TC-102：Schema 驗證

**輸入**：故意做一份違反 schema 的 IR
**預期**：被偵測出錯誤、明確的錯誤訊息

## 階段 2：多素材整合測試

### TC-201：訪談 + 既有 Word 文件

**輸入**：
- 訪談逐字稿（內含經驗）
- 既有 Word 操作手冊（結構化但缺 rationale）

**預期**：
- 兩份素材整合成單一 IR
- Word 提供步驟骨架，逐字稿補 rationale
- 衝突的部分（例如步驟順序不同）標出

### TC-202：訪談 + PDF + 截圖

**輸入**：
- 訪談逐字稿
- PDF 政策文件
- 5-8 張操作截圖

**預期**：
- 截圖正確配對到對應步驟
- PDF 補進前置需求章節
- assets/images.yaml 正確建立

### TC-203：小新 → 小修循環

**輸入**：故意做一份「跳太快」的 IR（缺背景、缺 verification）
**預期**：
- 小新標出 gaps
- 小修從原素材補強
- 補不到的部分標 needs_human_input

## 階段 3：Word/PDF 輸出測試

### TC-301：Word 輸出

**輸入**：完整的 IR
**預期**：
- 產出符合模板規格的 Word 檔
- 目錄正確、頁碼連續
- 截圖嵌入正確、紅框標註出現
- 所有 callout box（rationale、warning）色塊正確
- 印刷預覽正常

### TC-302：PDF 輸出

**輸入**：上述 Word 檔
**預期**：
- 排版不跑掉
- 內嵌字型
- PDF 大綱對應目錄

### TC-303：列印友善模式

**輸入**：IR + `--print-friendly` 選項
**預期**：色塊變灰階，仍可辨識

## 階段 4：修改清單更新測試

### TC-401：Word 表格修改清單

**輸入**：
- 既有 IR（v1.0）
- Word 表格修改清單（5 項變更）

**預期**：
- 5 個 change_intents 正確產出
- 對映到正確的 step_id
- 信心 ≥ 0.85
- 機械合併產出 v1.1 的 IR

### TC-402：Word 追蹤修訂

**輸入**：
- 舊 SOP 的 Word 檔（含追蹤修訂）

**預期**：
- 信心 ≥ 0.95
- ins/del 正確對應到 add/modify/remove

### TC-403：Markdown 條列

**輸入**：純文字條列修改清單
**預期**：每條一個 change_intent，信心 0.7-0.85

### TC-404：含糊修改清單

**輸入**：
- 「權限那段要更新」（不指明步驟）

**預期**：
- 標 needs_human_review
- 列出可能的候選步驟

### TC-405：step_id 穩定性

**輸入**：
- v1.0 的 IR（5 個 step）
- 修改清單：在 step-2 後新增一個步驟

**預期**：
- v1.1 的 IR 中，原本 5 個 step 的 step_id **完全不變**
- 新增的 step 有新的 UUID
- display_order 正確調整

## 階段 5：多素材更新測試

### TC-501：四種素材混合輸入

**輸入**：
- 修改清單（Word 表格，3 項變更）
- 會議紀錄（含 2 項決議）
- AWS release note PDF（含 1 項相關變更）
- 5 張截圖（其中 2 張對應已有變更，3 張為新內容）

**預期**：
- 三類素材中提到「Console 改版」的內容合併為單一 change_intent
- aggregated_confidence ≥ 0.95
- 截圖正確配對
- 至少產出 1 個 cascade_inconsistency 警告

### TC-502：素材衝突

**輸入**：
- 修改清單說「改用 IAM Role」
- 會議紀錄說「繼續用 IAM User」

**預期**：
- 偵測 source_contradiction
- 拋給使用者解決，不自動套用

### TC-503：純截圖配對

**輸入**：
- 既有 IR（含 5 個截圖）
- 4 張新截圖（不附文字說明）

**預期**：
- 每張截圖嘗試配對
- 配對信心 < 0.7 的標 needs_human_review
- 找不到對應的標「無法自動配對」

### TC-504：完整性檢查

**輸入**：
- 修改清單只改了 step-3 的文字
- 但 step-3 的截圖還是舊的

**預期**：
- 偵測 screenshot_outdated
- severity: high
- 提示需要新截圖

## 階段 6：三層級 changelog 測試

### TC-601：完整 changelog

**輸入**：v1.3 → v1.4 的 9 個 change_intents
**預期**：
- 三章節的 Word 檔
- 第 1 章 1 頁
- 第 2 章含表格
- 第 3 章含完整 diff
- 附錄含來源追溯與未解決事項

### TC-602：單層輸出

**輸入**：上述 + `--level executive`
**預期**：只產出第 1 章內容

### TC-603：行動項目正確產生

**輸入**：含「需要重訓」的變更
**預期**：executive_summary.actions_required 自動產生

## 階段 7：端對端整合測試

### TC-701：完整生命週期

**步驟**：
1. 從訪談逐字稿產生 v1.0
2. 用修改清單更新到 v1.1
3. 用會議紀錄 + 截圖更新到 v1.2
4. 用 PDF release note 更新到 v1.3

**預期**：
- 每個版本的檔案都在 sop-storage 中
- 跨版本 step_id 穩定
- v1.3 從 v1.0 的 diff 可重建（用 changes/ 目錄）

### TC-702：版本回溯

**步驟**：從 v1.3 想看 v1.1 的內容
**預期**：能正確讀取 v1.1 的 Word 與 IR

### TC-703：跨版本 diff

**步驟**：請系統產生「v1.0 vs v1.3」的綜合 diff
**預期**：合併三個 changelog 的內容

## 邊界案例測試（任意階段）

### 邊界 1：空輸入
- 空文字檔
- 0 字節 PDF
- 沒有變更項的修改清單

### 邊界 2：超大輸入
- 100 頁 PDF
- 50 個步驟的 SOP
- 100 張截圖

### 邊界 3：非法內容
- PDF 含密碼保護
- 損毀的 Word 檔
- 不是 PNG/JPG 的圖片

### 邊界 4：特殊字元
- SOP 含 emoji
- 中英日韓文混雜
- HTML 標籤殘留

### 邊界 5：時區與日期
- 不同時區的時間戳
- 跨年的版本
- 未來日期（誤植）

## 範例素材建議

建議在 `tests/sample-materials/` 下準備：

```
tests/sample-materials/
├── transcripts/
│   ├── interview-aws-ec2.txt        # 階段 1 主測試
│   ├── interview-n8n-workflow.txt
│   └── meeting-minutes-2026-04.txt
├── docs/
│   ├── old-aws-manual.docx
│   └── company-security-policy.pdf
├── change-lists/
│   ├── modifications-table.docx     # 階段 4
│   ├── modifications-tracked.docx   # Word 追蹤修訂
│   ├── modifications-ambiguous.md   # 含糊清單
│   └── modifications-list.md
├── screenshots/
│   ├── aws-console-old/
│   ├── aws-console-new/
│   └── unrelated/                   # 配對失敗測試
└── pdfs/
    ├── aws-release-note-2026q2.pdf
    └── policy-update.pdf
```

## 測試框架建議

```python
# tests/conftest.py
import pytest
import yaml
from pathlib import Path

@pytest.fixture
def sample_ir():
    return yaml.safe_load(
        Path("schemas/examples/sample-ir.yaml").read_text()
    )

@pytest.fixture
def sample_change_intents():
    return yaml.safe_load(
        Path("schemas/examples/sample-change-intents.yaml").read_text()
    )

# 範例測試
def test_ir_schema_validation(sample_ir):
    from sop_system.validators import validate_ir
    assert validate_ir(sample_ir) == True

def test_step_id_stability_after_update(sample_ir):
    """更新後 step_id 必須穩定"""
    original_ids = [s["id"] for s in sample_ir["sop"]["steps"]]
    
    # 模擬更新（在第 2 步後新增步驟）
    updated = apply_change(sample_ir, INSERT_AFTER_STEP_2)
    
    new_ids = [s["id"] for s in updated["sop"]["steps"] 
                if s["id"] in original_ids]
    
    assert original_ids == new_ids, "原有 step_id 不能改變"
```
