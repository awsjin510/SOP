# 測試案例規格

## 測試策略

### 三層測試金字塔

```
        ┌─────────────┐
        │   E2E (5%)   │  完整流程，少量
        └─────────────┘
       ┌───────────────┐
       │ 整合測試 (15%) │  跨模組、跨服務
       └───────────────┘
      ┌─────────────────┐
      │ 單元測試 (80%)  │  個別函數、元件
      └─────────────────┘
```

### 工具

| 層 | 工具 |
|----|------|
| 單元測試 | Vitest |
| Vue 元件 | @vue/test-utils + Vitest |
| Cloud Functions | Firebase Functions Test SDK |
| 整合測試 | Firebase Emulator + Vitest |
| E2E | Playwright（推薦）或 Cypress |

## 必測案例

### Core Library 測試

#### TranscriptExtractor

```typescript
describe('TranscriptExtractor', () => {
  it('應該從訪談中識別操作步驟', async () => {
    const transcript = `
      Q: 請說明 EC2 啟動流程
      A: 首先到 EC2 console，點擊 Launch Instance...
    `;
    
    const result = await extractor.extract({ text: transcript, sourceFile: 'test.txt' });
    
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0].source_refs).toHaveLength(1);
    expect(result.steps[0].source_refs[0].source_file).toBe('test.txt');
  });
  
  it('應該抽取 troubleshooting', async () => {
    const transcript = '...如果遇到 SG 設定錯誤，可以...';
    const result = await extractor.extract({...});
    expect(result.troubleshooting.length).toBeGreaterThan(0);
  });
  
  it('資訊不足時應該標記 needs_human_input', async () => {
    const transcript = '簡短的訪談...';
    const result = await extractor.extract({...});
    
    const needsInput = result.steps.filter(s => s.needs_human_input);
    expect(needsInput.length).toBeGreaterThan(0);
  });
  
  it('每個 step 必須有 source_refs', async () => {
    const result = await extractor.extract({...});
    result.steps.forEach(step => {
      expect(step.source_refs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
```

#### IR Builder

```typescript
describe('IrBuilder', () => {
  it('應該合併多素材成單一 IR', async () => {
    const fragments = [
      transcriptFragment,
      documentFragment,
      screenshotFragment
    ];
    
    const ir = await builder.build({ meta, fragments });
    
    expect(ir.steps.length).toBeGreaterThan(0);
    expect(ir.sections.length).toBeGreaterThan(0);
  });
  
  it('應該配對截圖到步驟', async () => {
    const ir = await builder.build({...});
    
    const stepsWithScreenshots = ir.steps.filter(s => 
      s.actions.some(a => a.screenshot_refs?.length > 0)
    );
    expect(stepsWithScreenshots.length).toBeGreaterThan(0);
  });
  
  it('應該去除重複內容', async () => {
    // 兩個素材描述同一步驟
    const fragments = [
      { steps: [{ title: 'Launch EC2', ... }] },
      { steps: [{ title: '啟動 EC2 instance', ... }] },  // 內容相似
    ];
    
    const ir = await builder.build({ meta, fragments });
    
    // 應該被合併成 1 個 step，但有 2 個 source_refs
    const launchStep = ir.steps.find(s => s.title.includes('EC2'));
    expect(launchStep?.source_refs.length).toBe(2);
  });
});
```

#### Merger

```typescript
describe('Merger', () => {
  it('應該偵測來源矛盾', () => {
    const intents = [
      { type: 'modify_step', target: { step_id: 'step-1' }, after: '改用 IAM Role', source: 'doc1' },
      { type: 'modify_step', target: { step_id: 'step-1' }, after: '繼續用 IAM User', source: 'doc2' },
    ];
    
    const result = merger.merge(intents);
    
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].type).toBe('source_contradiction');
  });
  
  it('多源印證應該提升信心', () => {
    const intents = [
      { type: 'modify_step', target: { step_id: 'step-1' }, after: '改用 IAM Role', confidence: 0.7 },
      { type: 'modify_step', target: { step_id: 'step-1' }, after: '改用 IAM Role', confidence: 0.7 },
    ];
    
    const result = merger.merge(intents);
    
    expect(result.consolidated[0].confidence).toBeGreaterThan(0.7);
  });
  
  it('應該偵測截圖未更新', () => {
    const ir = {
      steps: [{
        step_id: 'step-1',
        actions: [{ text: '...', screenshot_refs: ['img-001'] }],
      }]
    };
    
    const intents = [
      { type: 'modify_step', target: { step_id: 'step-1' }, after: '...' },
      // 沒有對應的 replace_screenshot
    ];
    
    const issues = merger.checkCompleteness(intents, ir);
    
    expect(issues.some(i => i.type === 'screenshot_outdated')).toBe(true);
  });
});
```

#### IR Validator

```typescript
describe('IR Validator', () => {
  it('應該通過合法的 IR', () => {
    const ir = validIrFixture;
    expect(() => validator.validate(ir)).not.toThrow();
  });
  
  it('應該拒絕缺少 source_refs 的 step', () => {
    const ir = { ...validIrFixture, steps: [{ ...validStep, source_refs: [] }] };
    expect(() => validator.validate(ir)).toThrow('source_refs');
  });
  
  it('應該拒絕無效的 step_id 格式', () => {
    const ir = { ...validIrFixture, steps: [{ ...validStep, step_id: 'invalid id' }] };
    expect(() => validator.validate(ir)).toThrow();
  });
});
```

### Vue 元件測試

#### FileUploader

```typescript
describe('FileUploader', () => {
  it('應該接受拖拉檔案', async () => {
    const wrapper = mount(FileUploader);
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    
    await wrapper.find('.dropzone').trigger('drop', {
      dataTransfer: { files: [file] }
    });
    
    expect(wrapper.emitted('files-added')).toBeTruthy();
    expect(wrapper.emitted('files-added')[0][0]).toContainEqual(
      expect.objectContaining({ name: 'test.txt' })
    );
  });
  
  it('應該拒絕不支援的檔案類型', async () => {
    const wrapper = mount(FileUploader);
    const file = new File([''], 'test.exe', { type: 'application/exe' });
    
    await wrapper.find('input[type=file]').trigger('change', {
      target: { files: [file] }
    });
    
    expect(wrapper.text()).toContain('不支援的檔案類型');
  });
  
  it('應該顯示檔案大小', async () => {
    const wrapper = mount(FileUploader);
    const file = new File(['x'.repeat(1024 * 1024)], 'test.txt');
    
    await wrapper.vm.addFile(file);
    
    expect(wrapper.text()).toContain('1.0 MB');
  });
});
```

#### ConfidenceIndicator

```typescript
describe('ConfidenceIndicator', () => {
  it.each([
    [0.95, 'high'],
    [0.75, 'medium'],
    [0.55, 'low'],
    [0.30, 'very-low'],
  ])('信心 %s 應該顯示為 %s 等級', (value, expectedLevel) => {
    const wrapper = mount(ConfidenceIndicator, { props: { value } });
    expect(wrapper.classes()).toContain(expectedLevel);
  });
});
```

#### ChangeCard

```typescript
describe('ChangeCard', () => {
  it('應該顯示變更內容', () => {
    const intent = {
      type: 'modify_step',
      description: '修改 SG 設定',
      before: '舊內容',
      after: '新內容',
      confidence: 0.92,
      source_refs: [{ source_file: 'doc.docx' }],
    };
    
    const wrapper = mount(ChangeCard, { props: { intent } });
    
    expect(wrapper.text()).toContain('修改 SG 設定');
    expect(wrapper.text()).toContain('0.92');
  });
  
  it('點擊接受應該 emit accept event', async () => {
    const wrapper = mount(ChangeCard, { props: {...} });
    await wrapper.find('[data-test=accept]').trigger('click');
    expect(wrapper.emitted('accept')).toBeTruthy();
  });
});
```

### Cloud Functions 測試

#### claudeProxy

```typescript
import { test } from 'firebase-functions-test';
import { claudeProxy } from '../src/claude-proxy';

const fft = test();

describe('claudeProxy', () => {
  it('未認證的請求應該被拒絕', async () => {
    await expect(
      fft.wrap(claudeProxy)({ data: { messages: [] }, auth: null })
    ).rejects.toThrow('需要登入');
  });
  
  it('應該記錄用量', async () => {
    const result = await fft.wrap(claudeProxy)({
      data: { messages: [{ role: 'user', content: 'hi' }] },
      auth: { uid: 'test-uid' }
    });
    
    // 檢查 usage_stats 是否寫入
    const stats = await db.doc(`usage_stats/test-uid_${currentMonth}`).get();
    expect(stats.exists).toBe(true);
  });
  
  it('超過月度上限應該拒絕', async () => {
    // mock 已達上限
    await db.doc(`usage_stats/test-uid_${currentMonth}`).set({
      estimatedCostUsd: 100,  // 超過 50
    });
    
    await expect(
      fft.wrap(claudeProxy)({ data: {...}, auth: { uid: 'test-uid' } })
    ).rejects.toThrow('月用量已達上限');
  });
  
  it('應該檢查速率限制', async () => {
    // 連續呼叫 11 次
    const calls = Array(11).fill(0).map(() => 
      fft.wrap(claudeProxy)({ data: {...}, auth: { uid: 'test-uid' } })
    );
    
    const results = await Promise.allSettled(calls);
    const rejected = results.filter(r => r.status === 'rejected');
    expect(rejected.length).toBeGreaterThanOrEqual(1);
  });
});
```

### Firestore Rules 測試

```typescript
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

describe('Firestore Rules', () => {
  let testEnv;
  
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'test',
      firestore: { rules: readFileSync('firestore.rules', 'utf8') }
    });
  });
  
  it('使用者只能讀自己的 SOP', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    const bob = testEnv.authenticatedContext('bob').firestore();
    
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('sops/sop-1').set({ owner: 'alice' });
    });
    
    await assertSucceeds(alice.doc('sops/sop-1').get());
    await assertFails(bob.doc('sops/sop-1').get());
  });
  
  it('未認證的使用者不能讀任何資料', async () => {
    const guest = testEnv.unauthenticatedContext().firestore();
    await assertFails(guest.collection('sops').get());
  });
});
```

### 整合測試

#### 完整建立流程

```typescript
describe('Create SOP Flow (Integration)', () => {
  beforeAll(async () => {
    // 啟動 emulator
  });
  
  it('應該從上傳到完成走完整個流程', async () => {
    // 1. 登入
    const user = await signInTestUser();
    
    // 2. 上傳檔案
    const jobId = await sopService.createSop({
      meta: { title: 'Test SOP', ... },
      materials: [
        { file: testTranscriptFile, type: 'transcript', name: 'test.txt' }
      ]
    });
    
    // 3. 等待處理完成
    const finalJob = await waitForJobStatus(jobId, 'awaiting_review');
    
    // 4. 通過審核
    await jobService.submitReview(jobId, { ... });
    
    // 5. 等待最終完成
    const completedJob = await waitForJobStatus(jobId, 'completed');
    
    // 6. 驗證
    expect(completedJob.result.sopId).toBeDefined();
    
    const sop = await getDoc(doc(db, 'sops', completedJob.result.sopId));
    expect(sop.exists()).toBe(true);
  }, 600000);  // 10 分鐘 timeout
});
```

### E2E 測試（Playwright）

```typescript
import { test, expect } from '@playwright/test';

test.describe('User Journey', () => {
  test('登入並建立第一份 SOP', async ({ page }) => {
    // 1. 開首頁
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('CloudOrange SOP');
    
    // 2. 登入（用測試帳號）
    await page.click('text=Google 登入');
    // ... handle OAuth flow
    
    // 3. Dashboard 應該空
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=還沒有 SOP')).toBeVisible();
    
    // 4. 點建立
    await page.click('text=新增 SOP');
    
    // 5. 上傳檔案
    await page.setInputFiles('input[type=file]', 'tests/fixtures/test-transcript.txt');
    await page.click('text=下一步');
    
    // 6. 確認分類
    await expect(page.locator('text=訪談逐字稿')).toBeVisible();
    await page.click('text=下一步');
    
    // 7. 設定基本資訊
    await page.fill('[name=title]', 'Test SOP');
    await page.click('text=下一步');
    
    // 8. 啟動處理
    await page.click('text=開始處理');
    
    // 9. 等待進度頁
    await expect(page).toHaveURL(/\/job\//);
    
    // 10. 等待審核狀態（mock or real）
    await expect(page.locator('text=需要您的審核')).toBeVisible({ timeout: 600000 });
  });
});
```

## 測試資料（Fixtures）

```
tests/fixtures/
├── transcripts/
│   ├── short-interview.txt
│   ├── long-interview.txt
│   └── messy-interview.txt
├── documents/
│   ├── manual.docx
│   ├── change-list.docx
│   └── meeting-notes.txt
├── screenshots/
│   ├── ui-old.png
│   └── ui-new.png
├── pdfs/
│   ├── release-note.pdf
│   └── manual.pdf
└── ir-samples/
    ├── valid-ir.json
    ├── valid-update-ir.json
    └── invalid-ir-missing-source.json
```

## CI/CD 中的測試

GitHub Actions 應該跑：

```yaml
- name: Unit tests
  run: npm run test
  
- name: Type check
  run: npm run typecheck
  
- name: Functions tests
  run: cd functions && npm run test
  
- name: Firestore Rules tests
  run: npm run test:rules
  
- name: E2E tests (only on PR)
  if: github.event_name == 'pull_request'
  run: npm run test:e2e
```

## 覆蓋率目標

- Core Library：> 80%（業務邏輯重要）
- Services：> 70%
- Vue 元件：> 60%（互動部分）
- Cloud Functions：> 70%

不強求 100%，但關鍵邏輯（schema 驗證、合併引擎、衝突偵測）要接近 100%。
