# SOP Updater：更新既有 SOP 的業務邏輯

> 這是「邏輯規格」，不是 Anthropic Skill 套件。Claude Code 應將此邏輯實作為 TypeScript 模組。

## 用途

更新既有 SOP：使用者上傳更新素材（修改清單、會議紀錄、新截圖、PDF 變更通知），系統識別變更意圖並安全地套用到新版本。

## 核心挑戰

- **跨版本 step_id 穩定**：修改後 step-3 還是 step-3
- **變更可追溯**：每個變更都有源 source_refs
- **衝突要被偵測**：同個 step 多個來源不同意見要顯示給使用者
- **完整性要被檢查**：改了文字但截圖沒換要提醒
- **變更可分層**：檢查、確認、套用、產 changelog 是分開的階段

## 輸入

```typescript
interface UpdateSopInput {
  sopId: string;
  fromVersion: string;       // 例 "1.2.0"
  
  materials: Array<{
    file: File | Blob;
    type: 'change_list' | 'text' | 'pdf' | 'screenshot';
    name: string;
  }>;
  
  changeSummary?: string;    // 使用者輸入的一句話描述
  jobId: string;
}
```

## 輸出

```typescript
interface UpdateSopOutput {
  sopId: string;
  newVersionId: string;
  newVersion: string;        // 例 "1.3.0"
  ir: IR;                    // 套用變更後的新 IR
  changeId: string;
  changelogDocxUrl: string;
  documentDocxUrl: string;   // 新版的 Word
  documentPdfUrl: string;
  
  appliedIntents: number;
  rejectedIntents: number;
  conflictsResolved: number;
}
```

## 處理流程

```
1. 讀取現有 IR（fromVersion）
2. 上傳更新素材
3. 分流抽取 change_intents
4. 匯流（去重、衝突偵測、完整性檢查）
5. 等待人工審核（暫停）
   ↓ 使用者審核完
6. 套用已確認的 intents
7. AI 潤飾連貫性
8. 渲染新版本
9. 產 changelog
10. 寫入 Firestore（新 version + change record）
```

## 關鍵設計：暫停在審核點

更新流程**不像建立流程那樣一氣呵成**。在第 4 步後系統會：

1. 將 status 設為 `awaiting_review`
2. 把 change_intents、conflicts、completeness_issues 寫入 job
3. 通知使用者前往審核
4. **等待使用者完成審核**
5. 使用者按「完成審核」後系統繼續第 6-10 步

這個暫停是用 Firestore 即時同步實現：
- UI 訂閱 job
- 看到 awaiting_review → 顯示「需要審核」
- 使用者操作後寫回 job
- 後端（Web Worker）也訂閱 job
- 看到 review_completed → 繼續處理

## 詳細步驟

### Step 1：讀取現有 IR

```typescript
const versionDoc = await getDoc(doc(db, 'sops', sopId, 'versions', `v${fromVersion}`));
const currentIr = versionDoc.data().ir;
```

如果 IR 太大存在 Storage：
```typescript
if (versionDoc.data().irStorageUrl) {
  currentIr = await downloadJson(versionDoc.data().irStorageUrl);
}
```

### Step 2：抽取 change_intents

每種素材有專屬抽取器，目標是產出 `ChangeIntent[]`。

#### ChangeListExtractor

處理 Word 表格、追蹤修訂、Markdown 條列。

主要難點：**對映到 step_id**

```typescript
// 修改清單可能寫「步驟 3」「第 3 個步驟」「Security Group 設定那段」
// 要對映到具體的 step_id（如 step-xyz123）

async function mapToStepId(
  description: string, 
  currentIr: IR
): Promise<string | null> {
  // 1. 先 fuzzy match 標題
  const titleMatch = currentIr.steps.find(s => 
    description.toLowerCase().includes(s.title.toLowerCase())
  );
  if (titleMatch) return titleMatch.step_id;
  
  // 2. 用 Claude 對映（給它整個 IR 結構讓它判斷）
  const result = await callClaude({
    system: 'You are an SOP step matcher...',
    user: `Description: ${description}\nIR steps: ${JSON.stringify(currentIr.steps.map(s => ({id: s.step_id, title: s.title})))}`
  });
  
  return parseStepId(result);
}
```

#### TextExtractor（更新用）

處理會議紀錄、變更說明文字檔。

關鍵：**判斷文字檔類型**
- 會議紀錄：找決議句型（「決議：」「會議結論：」「我們決定...」）
- Bug 報告：找症狀+解法句型
- 變更說明：找對照表句型

```typescript
async function detectTextType(text: string): Promise<'meeting' | 'bug_report' | 'change_note'> {
  const sample = text.slice(0, 500);
  const result = await callClaude({...});
  return result.type;
}
```

#### PdfExtractor（更新用）

處理廠商通知、release note。

關鍵：**術語對映**（廠商用語 → 內部 SOP 用語）

```
例：
- 廠商：「Network Security Profile」
- 內部 SOP：「Security Group」
這兩者要視為同個概念
```

#### ScreenshotExtractor（更新用）

處理新版操作畫面截圖。

關鍵：**視覺差異分析**

```typescript
// 新截圖 vs 既有 SOP 中的截圖
// 對應到具體的 step
// 發現是 UI 變動還是功能變動

interface ScreenshotChangeIntent extends ChangeIntent {
  type: 'replace_screenshot' | 'modify_step';
  visual_diff: {
    changed_regions: Array<{x, y, w, h, description: string}>;
    severity: 'cosmetic' | 'minor' | 'major';
  };
}
```

### Step 3：匯流（核心引擎）

把所有抽取器產出的 raw_intents 整合：

```typescript
class Merger {
  merge(rawIntents: ChangeIntent[][]): MergeResult {
    // 1. 扁平化
    const all = rawIntents.flat();
    
    // 2. 按目標分組
    const grouped = groupBy(all, intent => 
      `${intent.type}:${JSON.stringify(intent.target)}`
    );
    
    // 3. 對每組做去重與信心提升
    const consolidated: ChangeIntent[] = [];
    const conflicts: Conflict[] = [];
    
    for (const [key, group] of Object.entries(grouped)) {
      if (group.length === 1) {
        consolidated.push(group[0]);
      } else {
        const result = this.consolidate(group);
        if (result.type === 'merged') {
          consolidated.push(result.intent);
        } else if (result.type === 'conflict') {
          conflicts.push(result.conflict);
        }
      }
    }
    
    // 4. 完整性檢查
    const completenessIssues = this.checkCompleteness(consolidated);
    
    return { consolidated, conflicts, completenessIssues };
  }
  
  private consolidate(group: ChangeIntent[]): ConsolidationResult {
    // 多素材描述同一變更
    // 比對 after 是否一致
    
    const allAfter = group.map(i => i.after);
    const isConsistent = allAfter.every(a => 
      similarity(a, allAfter[0]) > 0.8
    );
    
    if (isConsistent) {
      // 合併：保留所有 source_refs，提升信心
      return {
        type: 'merged',
        intent: {
          ...group[0],
          source_refs: group.flatMap(i => i.source_refs),
          confidence: Math.min(0.95, 
            group[0].confidence + 0.1 * (group.length - 1)
          ),
        }
      };
    }
    
    // 不一致 = 衝突
    return {
      type: 'conflict',
      conflict: {
        intents: group,
        target: group[0].target,
        type: 'source_contradiction',
      }
    };
  }
}
```

### Step 3.1：衝突偵測（3 種類型）

```typescript
type ConflictType = 
  | 'source_contradiction'    // 多個來源說不同的事
  | 'temporal_conflict'        // 同一來源前後矛盾
  | 'semantic_inconsistency';  // 與既有 IR 邏輯衝突

interface Conflict {
  type: ConflictType;
  intents: ChangeIntent[];     // 衝突的 intents
  target: ChangeTarget;
  suggestion?: 'use_first' | 'use_latest' | 'use_highest_confidence' | 'manual';
  reason?: string;
}
```

#### source_contradiction
兩份素材對同個東西有不同意見：
```
- 修改清單：「改用 IAM Role」
- 會議紀錄：「繼續用 IAM User」
```

建議：採信新的 / 信心高的，但顯示給使用者選。

#### temporal_conflict
同份素材前後不一致：
```
會議紀錄第 1 段：「決議改用 IAM Role」
會議紀錄第 5 段：「再考慮一下，先暫緩」
```

建議：標為待確認，使用者必選。

#### semantic_inconsistency
變更與既有 IR 邏輯衝突：
```
要求：刪除 step-3
但 step-5 引用 step-3 的結果
```

建議：先處理依賴。

### Step 3.2：完整性檢查（7 種類型）

```typescript
type CompletenessIssueType = 
  | 'screenshot_outdated'        // 文字改了但截圖沒換
  | 'glossary_missing'           // 提到新術語但沒定義
  | 'reference_broken'           // 引用已刪除的 step
  | 'troubleshooting_orphan'     // 移除 step 但 troubleshooting 還引用
  | 'training_impact'            // 重大變更可能需要重新訓練
  | 'audience_mismatch'          // 改的內容不適合目標對象
  | 'cross_step_inconsistency';  // 跨步驟不一致
```

每種類型有檢查邏輯：

```typescript
function checkScreenshotOutdated(
  intent: ChangeIntent, 
  ir: IR
): CompletenessIssue | null {
  if (intent.type !== 'modify_step') return null;
  
  const step = ir.steps.find(s => s.step_id === intent.target.step_id);
  if (!step) return null;
  
  // 文字變了，但 screenshot_refs 沒變
  const hasScreenshots = step.actions.some(a => 
    a.screenshot_refs && a.screenshot_refs.length > 0
  );
  
  // 是否在 raw_intents 中有對這個 step 的截圖更新？
  const hasScreenshotUpdate = ir.allIntents.some(i =>
    i.type === 'replace_screenshot' && i.target.step_id === step.step_id
  );
  
  if (hasScreenshots && !hasScreenshotUpdate) {
    return {
      type: 'screenshot_outdated',
      target: step.step_id,
      severity: 'high',
      message: `step-${step.step_id} 的文字已修改，但截圖未更新`,
      suggestions: [
        '從上傳的截圖找替代',
        '保留舊圖，標記為「待更新」',
        '跳過'
      ],
    };
  }
  
  return null;
}
```

### Step 4：暫停等待審核

```typescript
// 寫入 job
await updateDoc(doc(db, 'processing_jobs', jobId), {
  status: 'awaiting_review',
  intermediate: {
    changeIntents: consolidatedIntents,
    conflicts,
    completenessIssues,
  },
  awaiting_review_at: serverTimestamp(),
});

// Worker 暫停，等待 UI 更新 status 為 review_completed
await waitForReviewCompletion(jobId);
```

### Step 5：套用已確認的 intents

```typescript
function applyIntents(currentIr: IR, intents: ChangeIntent[]): IR {
  let newIr = deepClone(currentIr);
  
  for (const intent of intents) {
    if (intent.status !== 'accepted' && intent.status !== 'modified') continue;
    
    switch (intent.type) {
      case 'add_step':
        newIr.steps.push(buildNewStep(intent));
        break;
      
      case 'modify_step':
        const idx = newIr.steps.findIndex(s => s.step_id === intent.target.step_id);
        if (idx >= 0) {
          newIr.steps[idx] = applyModification(newIr.steps[idx], intent);
        }
        break;
      
      case 'remove_step':
        newIr.steps = newIr.steps.filter(s => s.step_id !== intent.target.step_id);
        break;
      
      // ... 其他類型
    }
  }
  
  return newIr;
}
```

### Step 6：AI 潤飾連貫性

```
變更套用後可能有違和：
- 用詞前後不一致（「IAM Role」「IAM 角色」混用）
- 章節之間銜接突兀
- 新增內容與舊內容語氣不同
```

呼叫 Claude 做最後潤飾：

```typescript
const polishedIr = await callClaude({
  system: '你是專業文件編輯，要把以下 SOP 潤飾為連貫一致的文件。注意：1) 不要改變實質內容；2) 統一用詞；3) 平滑銜接；4) 保留所有 source_refs。',
  user: `[New IR after applying changes]`,
});
```

### Step 7：寫入 Firestore

```typescript
const newVersion = bumpVersion(fromVersion, intents);  // 1.2.0 → 1.3.0
const versionId = `v${newVersion}`;
const changeId = nanoid();

const batch = writeBatch(db);

// 新版本
batch.set(doc(db, 'sops', sopId, 'versions', versionId), {
  id: versionId,
  version: newVersion,
  ir: polishedIr,
  documentDocxUrl,
  documentPdfUrl,
  fromVersion,
  changeId,
  createdAt: serverTimestamp(),
  createdBy: uid,
  changeSummary: input.changeSummary,
});

// 變更紀錄
batch.set(doc(db, 'sops', sopId, 'changes', changeId), {
  id: changeId,
  fromVersion,
  toVersion: newVersion,
  changeIntents: intents,
  conflicts: conflictsResolution,
  completenessIssues: completenessResolution,
  changelogDocxUrl,
  stats: { ... },
  createdAt: serverTimestamp(),
});

// 更新 SOP 主檔
batch.update(doc(db, 'sops', sopId), {
  currentVersion: newVersion,
  totalVersions: increment(1),
  updatedAt: serverTimestamp(),
});

await batch.commit();
```

## Semver bump 規則

```typescript
function bumpVersion(from: string, intents: ChangeIntent[]): string {
  const [major, minor, patch] = from.split('.').map(Number);
  
  const hasBreakingChange = intents.some(i => i.impact?.breaking_change);
  const hasNewSteps = intents.some(i => i.type === 'add_step');
  const hasOnlyTypoFixes = intents.every(i => 
    i.type === 'modify_step' && !i.impact?.needs_retraining
  );
  
  if (hasBreakingChange) {
    return `${major + 1}.0.0`;
  } else if (hasNewSteps) {
    return `${major}.${minor + 1}.0`;
  } else {
    return `${major}.${minor}.${patch + 1}`;
  }
}
```

## 三層級 Changelog

產 Word 文件，包含：

### 第一層：摘要（給管理者）
- 本次更新項目數
- 重要程度
- 是否需要重訓
- 影響章節

### 第二層：變更清單（給審查者）
- 列表式：每個 intent 一行
- 顯示 status（accepted / modified / rejected）

### 第三層：詳細 diff（給執行者）
- 每個變更的 before / after
- source_refs 完整列出
- 連帶影響說明

## 對外的 TypeScript 介面

```typescript
// src/core/sop-updater/index.ts

export class SopUpdater {
  async updateSop(input: UpdateSopInput): Promise<UpdateSopOutput> {
    // 1. 讀取現有 IR
    const currentIr = await this.loadCurrentIr(input.sopId, input.fromVersion);
    
    // 2-3. 抽取與匯流
    const { intents, conflicts, completenessIssues } = await this.analyzeChanges(
      currentIr, input.materials
    );
    
    // 4. 等待審核
    const reviewed = await this.waitForReview(
      input.jobId, intents, conflicts, completenessIssues
    );
    
    // 5. 套用
    const newIr = this.applyIntents(currentIr, reviewed.intents);
    
    // 6. 潤飾
    const polishedIr = await this.polish(newIr);
    
    // 7-9. 渲染與 changelog
    const { docxUrl, pdfUrl, changelogUrl } = await this.renderAll(
      polishedIr, currentIr, reviewed.intents
    );
    
    // 10. 寫入
    return await this.persist(
      input.sopId, input.fromVersion, polishedIr, 
      reviewed.intents, docxUrl, pdfUrl, changelogUrl
    );
  }
}
```

## 效能目標

對「2-3 份更新素材，總大小 < 5MB」：
- 抽取與匯流：< 2 分鐘
- 等待審核：依使用者操作
- 套用 + 潤飾：< 1 分鐘
- 渲染：< 30 秒
- **不含審核時間：< 5 分鐘**
