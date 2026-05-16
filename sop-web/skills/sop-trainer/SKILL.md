# SOP Trainer：建立新 SOP 的業務邏輯

> 這是「邏輯規格」，不是 Anthropic Skill 套件。Claude Code 應將此邏輯實作為 TypeScript 模組。

## 用途

從零開始建立 SOP：使用者上傳訪談、文件、截圖等多種素材，系統整合產出符合內訓需求的 SOP。

## 輸入

```typescript
interface CreateSopInput {
  meta: {
    title: string;
    targetAudience: string;
    category?: string;
    difficulty: '初級' | '中級' | '進階';
    tags?: string[];
  };
  
  materials: Array<{
    file: File | Blob;
    type: 'transcript' | 'document' | 'screenshot' | 'text' | 'pdf';
    name: string;
  }>;
  
  jobId: string;            // 對應 processing_jobs
}
```

## 輸出

```typescript
interface CreateSopOutput {
  sopId: string;
  versionId: string;        // 永遠是 "v1.0.0"
  ir: IR;                   // 完整 IR
  documentDocxUrl: string;  // Storage URL
  documentPdfUrl: string;
  qualityIssues: QualityIssue[];
}
```

## 處理流程

```
1. 檔案上傳到 Storage
2. 分流抽取（每種素材一個抽取器）
3. IR 建構（合併多素材）
4. 內訓增強循環（小新-小修-小審）
5. 品質檢查
6. 文件渲染（Word + PDF）
7. 寫入 Firestore
```

## 詳細步驟

### Step 1：素材分流

依 `type` 決定用哪個抽取器：

| Type | Extractor | 主要用 Claude 的場景 |
|------|-----------|---------------------|
| transcript | TranscriptExtractor | 識別操作步驟、抽 troubleshooting |
| document | DocumentExtractor | 解析 docx 結構、抽 sections |
| screenshot | ScreenshotExtractor | Vision API 描述截圖 |
| text | TextExtractor | 自由文字判型後抽取 |
| pdf | PdfExtractor | 結構化抽取 PDF 內容 |

### Step 2：抽取器併行執行

```typescript
const extractorTasks = materials.map(material => {
  const extractor = getExtractor(material.type);
  return extractor.extract(material);
});

const extractedData = await Promise.all(extractorTasks);
```

每個抽取器產出局部 IR 片段。

### Step 3：IR Builder 合併

合併多個局部片段成單一 IR：

```typescript
const ir = await IrBuilder.build({
  meta: input.meta,
  fragments: extractedData,
  options: {
    deduplicateSteps: true,
    matchScreenshotsToSteps: true,
    inferSectionStructure: true,
  }
});
```

關鍵任務：
- **去重**：多素材描述同一步驟時合併（保留多個 source_refs）
- **截圖配對**：每個 step 配對相關截圖
- **章節推斷**：從步驟內容推斷章節結構

### Step 4：內訓增強循環（多代理）

呼叫 3 個 AI 角色循環增強：

```typescript
async function enhanceForTraining(ir: IR): Promise<IR> {
  let currentIr = ir;
  let iteration = 0;
  const MAX_ITERATIONS = 3;
  
  while (iteration < MAX_ITERATIONS) {
    // 小新（NewbieSimulator）：以新人視角找問題
    const newbieFeedback = await simulateNewbieReading(currentIr);
    
    if (newbieFeedback.issues.length === 0) break;
    
    // 小修（Enhancer）：補強內容
    currentIr = await enhanceContent(currentIr, newbieFeedback);
    
    // 小審（Reviewer）：檢查補強品質
    const reviewerFeedback = await reviewEnhancement(currentIr);
    
    if (reviewerFeedback.allPassed) break;
    
    iteration++;
  }
  
  return currentIr;
}
```

#### 小新（NewbieSimulator）的 prompt

```
你是一位剛入職 0-3 個月的新人，正在閱讀這份 SOP。
你的特性：
- 不熟悉專業術語（除非已被解釋）
- 不知道為什麼要做某些動作
- 對於模糊的描述會卡住
- 沒有經驗判斷預期結果

請以新人視角閱讀以下 SOP，列出你會卡住的地方：

[IR JSON]

回覆 JSON 格式：
{
  "issues": [
    {
      "step_id": "...",
      "type": "missing_purpose | unclear_action | undefined_term | no_expected_result | ...",
      "description": "我不懂為什麼要..."
    }
  ]
}
```

#### 小修（Enhancer）的 prompt

```
你是一位資深的內訓設計師，擅長把技術文件改寫成新人友善的格式。
針對以下問題，請補強原始 SOP：

問題清單：
[NewbieFeedback]

原始 SOP：
[IR JSON]

請：
1. 為每個 step 補上 purpose（如果缺少）
2. 為模糊的 actions 加上 tips
3. 為提及但未定義的術語建立 glossary
4. 加上 expected_result（如果可從上下文推斷）

重要：不要編造原素材沒有的內容！如果某資訊不確定，標 needs_human_input: true。

回覆完整的 enhanced IR JSON。
```

#### 小審（Reviewer）的 prompt

```
你是品管審核者，請檢查補強後的 SOP 是否：
1. 沒有編造原素材沒有的內容
2. source_refs 都正確指向原素材
3. 標記為 needs_human_input 的項目合理
4. 連貫性、語氣一致

[Enhanced IR]

[Original Source Materials Summary]

回覆 JSON：
{
  "all_passed": true/false,
  "issues": [
    {
      "step_id": "...",
      "type": "fabricated | wrong_source_ref | inconsistent_tone | ...",
      "description": "..."
    }
  ]
}
```

### Step 5：品質檢查

最後檢查：
- 所有 step 的 source_refs 至少有一個
- 截圖配對覆蓋率（>= 80%）
- 沒有空欄位
- 章節結構合理

```typescript
function checkQuality(ir: IR): QualityIssue[] {
  const issues: QualityIssue[] = [];
  
  // 檢查 source_refs
  ir.steps.forEach(step => {
    if (step.source_refs.length === 0) {
      issues.push({
        type: 'missing_source_ref',
        target: step.step_id,
        severity: 'high',
        message: `步驟 "${step.title}" 缺少素材依據`
      });
    }
  });
  
  // 檢查截圖配對
  const stepsWithScreenshots = ir.steps.filter(
    s => s.actions.some(a => a.screenshot_refs && a.screenshot_refs.length > 0)
  );
  const coverage = stepsWithScreenshots.length / ir.steps.length;
  if (coverage < 0.5) {
    issues.push({
      type: 'low_screenshot_coverage',
      severity: 'medium',
      message: `截圖配對率僅 ${(coverage * 100).toFixed(0)}%`
    });
  }
  
  // ... 其他檢查
  
  return issues;
}
```

### Step 6：文件渲染

```typescript
const docxBlob = await renderDocx(ir);
const pdfBlob = await renderPdf(ir);

const docxUrl = await uploadToStorage(docxBlob, 
  `users/${uid}/sops/${sopId}/versions/v1.0.0/document.docx`);
const pdfUrl = await uploadToStorage(pdfBlob,
  `users/${uid}/sops/${sopId}/versions/v1.0.0/document.pdf`);
```

### Step 7：寫入 Firestore

```typescript
const batch = writeBatch(db);

// SOP 主文件
batch.set(doc(db, 'sops', sopId), {
  id: sopId,
  sopId: sopId,
  owner: uid,
  members: [],
  visibility: 'private',
  ...irToSopDoc(ir),
  currentVersion: '1.0.0',
  totalVersions: 1,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  status: 'active',
});

// 版本文件
batch.set(doc(db, 'sops', sopId, 'versions', 'v1.0.0'), {
  id: 'v1.0.0',
  version: '1.0.0',
  ir: ir,
  documentDocxUrl: docxUrl,
  documentPdfUrl: pdfUrl,
  sourceMaterialsUrls: materialUrls,
  createdAt: serverTimestamp(),
  createdBy: uid,
  qualityIssues: issues.length,
  needsRetraining: false,
});

await batch.commit();
```

## 對外的 TypeScript 介面

```typescript
// src/core/sop-trainer/index.ts

export class SopTrainer {
  constructor(
    private readonly extractors: ExtractorRegistry,
    private readonly irBuilder: IrBuilder,
    private readonly enhancer: TrainingEnhancer,
    private readonly renderer: DocumentRenderer,
    private readonly storage: StorageService,
    private readonly firestore: FirestoreService,
    private readonly progressReporter: ProgressReporter,
  ) {}
  
  async createSop(input: CreateSopInput): Promise<CreateSopOutput> {
    this.progressReporter.update(input.jobId, { progress: 0, currentStep: '上傳素材' });
    
    // 1. 上傳
    const materialUrls = await this.uploadMaterials(input.materials);
    this.progressReporter.update(input.jobId, { progress: 10 });
    
    // 2. 分流抽取
    this.progressReporter.update(input.jobId, { currentStep: '分析素材' });
    const fragments = await this.extractAll(input.materials);
    this.progressReporter.update(input.jobId, { progress: 40 });
    
    // 3. IR Builder
    this.progressReporter.update(input.jobId, { currentStep: '建構 SOP 結構' });
    const draftIr = await this.irBuilder.build({
      meta: input.meta,
      fragments,
    });
    this.progressReporter.update(input.jobId, { progress: 60 });
    
    // 4. 內訓增強
    this.progressReporter.update(input.jobId, { currentStep: '內訓增強' });
    const enhancedIr = await this.enhancer.enhance(draftIr);
    this.progressReporter.update(input.jobId, { progress: 80 });
    
    // 5. 品質檢查
    const qualityIssues = this.checkQuality(enhancedIr);
    
    // 6. 渲染
    this.progressReporter.update(input.jobId, { currentStep: '產出文件' });
    const { docxUrl, pdfUrl } = await this.render(enhancedIr);
    this.progressReporter.update(input.jobId, { progress: 95 });
    
    // 7. 寫入
    const { sopId, versionId } = await this.persist(
      enhancedIr, materialUrls, docxUrl, pdfUrl
    );
    this.progressReporter.update(input.jobId, { 
      progress: 100, 
      status: 'completed',
      result: { sopId, versionId }
    });
    
    return { sopId, versionId, ir: enhancedIr, documentDocxUrl: docxUrl, documentPdfUrl: pdfUrl, qualityIssues };
  }
}
```

## 錯誤處理

每個階段都要 try-catch，失敗時：
1. 寫入 `processing_jobs.error`
2. 設 status: 'failed'
3. 保留中間產物（方便除錯）
4. 不刪除已上傳的素材（使用者可重試）

## 效能目標

對於「2-3 份素材，總大小 < 10MB」的常見輸入：
- 抽取階段：< 2 分鐘
- IR 建構：< 30 秒
- 內訓增強（3 輪）：< 3 分鐘
- 文件渲染：< 30 秒
- **總計：< 10 分鐘**

如果超過，要在 UI 顯示「處理時間較長，請耐心等候」。
