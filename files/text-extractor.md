# 文字檔抽取器（Text Extractor）

## 用途

從文字檔（會議紀錄、變更說明、訪談逐字稿、對話片段等）抽取 change_intents。

文字檔比修改清單**結構化程度低、信心也較低**，但內容豐富、常含 rationale。

## 兩階段處理

### 階段 1：類型判斷

先判斷文字檔屬於哪種類型，再決定處理策略：

| 類型 | 特徵 | 信心起點 |
|------|------|---------|
| `change_note` | 已整理的變更說明（類似 release note） | 0.85 |
| `meeting_notes` | 會議紀錄，含「決議」「決定」字樣 | 0.75 |
| `interview` | 訪談逐字稿，含對話切換、口語化 | 0.65 |
| `conversation` | 對話片段（Slack / Telegram 匯出） | 0.55 |
| `unknown` | 無法明確判斷 | 0.40 |

**判斷依據**：

```yaml
classification_signals:
  change_note:
    - 標題含「變更」「修訂」「Changelog」「Release Note」
    - 條列結構明顯
    - 描述以動詞開頭（「修改」「新增」「移除」）
  
  meeting_notes:
    - 含「會議」「meeting」標題
    - 含日期、與會者
    - 含「決議」「待辦」「action item」字樣
  
  interview:
    - 含說話者標記（「A:」「B:」「訪談者:」「受訪者:」）
    - 含時間戳（「[00:12:34]」「12:34」）
    - 大量口語助詞（「啊」「嗯」「就是」「對啊」）
  
  conversation:
    - 含使用者名稱（「@xxx」「name >」）
    - 短訊息為主
    - 含 emoji、貼圖標記
```

### 階段 2：依類型抽取

#### 2.1 change_note 處理

最直接，當作半結構化的修改清單：
1. 找條列項目
2. 每項產生 change_intent
3. 信心可較高（0.75-0.90）

#### 2.2 meeting_notes 處理

關鍵動作：**只挖「決議」段落，忽略討論過程**

```yaml
extraction_rules:
  include:
    - 「決議」「決定」「結論」「待辦」標題下的內容
    - 動詞開頭的執行項（「將...改為...」「新增...」）
  
  exclude:
    - 「討論」「想法」「提案」段落（可能未定案）
    - 「待確認」「再討論」標記的項目
  
  flag_for_review:
    - 「下次再決定」「待確認」的項目（標 needs_human_review）
    - 與會者意見不一致的項目（標衝突）
```

範例：
```
原文：
> 【決議】
> 1. EC2 SOP 第 3 步驟的 Console 操作改用 CLI（小王負責修改）
> 2. 新增 timeout 排錯說明（待確認具體寫法）

抽取結果：
change_intent_1:
  type: modify_step
  target: { ... }  # 對映到第 3 步
  confidence: 0.85
  needs_human_review: false

change_intent_2:
  type: add_troubleshooting
  description: "新增 timeout 排錯說明"
  confidence: 0.6
  needs_human_review: true
  review_reason: "原文標記『待確認具體寫法』"
```

#### 2.3 interview 處理

訪談是**金礦但雜訊也多**。處理重點：

1. **段落分類**：操作描述 / 經驗分享 / 閒聊
2. **過濾雜訊**：只處理操作描述與經驗分享段落
3. **對比 SOP**：找出「老手講的跟舊 SOP 不同」的地方
4. **信心評估**：
   - 老手明確說「現在改成⋯⋯」→ 信心 0.75
   - 老手隨口提到「我都這樣⋯⋯」→ 信心 0.5（個人習慣，不一定是政策）
   - 老手講「以前是⋯⋯現在是⋯⋯」→ 信心 0.8（明確的演變）

5. **挖 troubleshooting**（重點）：
   - 「之前有人弄錯⋯⋯」「要小心⋯⋯」「如果跳出 XXX 錯誤⋯⋯」
   - 這類句式幾乎都是 troubleshooting 素材

#### 2.4 conversation 處理

對話片段最雜，處理重點：

1. 抽出所有提到「SOP」「文件」「步驟」「改」相關的訊息
2. 信心降低（0.5-0.7）
3. 大多需要人工審核

## 變更 vs. 補充的區分（重要）

文字檔常會混雜兩種訊息：

| 類型 | intent_type | 範例 |
|------|-------------|------|
| 明確變更 | `explicit_change` | 「改用 CLI」「新增這段說明」「移除過時內容」 |
| 隱含補充 | `implied_supplement` | 「順便提一下⋯」「建議可以加上⋯」「如果有空可以⋯」 |

**隱含補充**通常 `confidence < 0.7` 且 `needs_human_review: true`。

## 重點動詞與信心對應

```yaml
explicit_change_verbs:
  high_confidence:
    - 改成 / 改為 / 替換成 / 取代 / replace
    - 新增 / 加上 / 補上 / add
    - 移除 / 刪掉 / 拿掉 / remove / delete
    - 確認 / 已決定 / 拍板
  
  medium_confidence:
    - 應該要 / 建議 / 可以
    - 看看是不是要
    - 想一下要不要
  
  low_confidence_or_supplement:
    - 順便 / 對了
    - 如果有空
    - 我覺得 / 我認為
```

## 對話 / 多人發言處理

如果文字檔含多人發言，要記錄發言者：

```yaml
sources:
  - type: meeting_notes
    ref: "meeting-2026-05-03.txt:line-87"
    speaker: "team_lead"          # 發言者
    confidence: 0.85
```

如果發言者是**負責決策的人**（team lead、主管），信心可較高。
如果是**新人或不相關角色**的意見，信心降低。

## 與其他抽取器的差異

| 項目 | 修改清單抽取器 | 文字檔抽取器 |
|------|---------------|-------------|
| 信心起點 | 0.85 | 0.65 |
| 結構化程度 | 高 | 中-低 |
| 主要工作 | 對映到 step_id | 先過濾雜訊再抽取 |
| 常見問題 | 格式變異 | 內容歧義 |
| 自動處理比例 | 高 | 中 |

## 邊界案例

### 案例 1：訪談內容跟 SOP 完全不同

可能原因：受訪者描述的是不同流程或不同版本。
處理：拋出警告「此訪談內容與目標 SOP 對應度低」，要求確認。

### 案例 2：會議紀錄沒有明確決議

只有討論沒有結論。
處理：標記為「無可抽取的明確變更」，建議使用者補充正式變更說明。

### 案例 3：訪談提到要改但沒說怎麼改

例：「現在那個流程要改一下，但細節下次討論」
處理：產出 change_intent 但 `change.new_content: null`，標 `needs_human_review`。

### 案例 4：多份文字檔交叉引用

例：會議紀錄說「依照 release note 修改」。
處理：先各自抽取，匯流階段才整合。
