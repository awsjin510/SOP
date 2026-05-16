# Components 規格

> 詳細元件清單與 props/events 介面。

## 元件分類

```
src/components/
├── common/           # 共用元件
├── upload/           # 上傳相關
├── job/              # 任務進度
├── review/           # 審核介面
├── sop/              # SOP 顯示
├── version/          # 版本管理
└── layout/           # 佈局元件
```

## common/

### `<AppHeader>`

頂部導覽列。

```typescript
interface Props {
  // 無
}

interface Events {
  // 無
}

// 內部使用 useAuthStore() 取使用者資訊
```

### `<ConfidenceIndicator>`

```typescript
interface Props {
  value: number;          // 0-1
  showValue?: boolean;    // 是否顯示數字（預設 true）
  size?: 'sm' | 'md' | 'lg';
}
```

### `<EmptyState>`

```typescript
interface Props {
  icon?: string;          // lucide icon name
  title: string;
  description?: string;
  actionLabel?: string;
  actionTo?: string;      // router path
}

interface Events {
  action: () => void;
}
```

### `<LoadingSpinner>`

```typescript
interface Props {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}
```

### `<ErrorBanner>`

```typescript
interface Props {
  type: 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  dismissible?: boolean;
  retryable?: boolean;
}

interface Events {
  dismiss: () => void;
  retry: () => void;
}
```

### `<DiffViewer>`

```typescript
interface Props {
  before: string;
  after: string;
  mode?: 'unified' | 'split';
  language?: string;      // syntax highlight
}
```

實作建議：用 `diff` 套件產 diff，自己渲染或用 `vue-diff`。

### `<SearchBar>`

```typescript
interface Props {
  placeholder?: string;
  modelValue: string;
  debounceMs?: number;    // 預設 300
}

interface Events {
  'update:modelValue': (value: string) => void;
  search: (value: string) => void;
}
```

## upload/

### `<FileUploader>`

```typescript
interface Props {
  accept?: string[];      // ['.txt', '.docx', ...]
  maxSize?: number;       // bytes，預設 50MB
  maxTotal?: number;      // bytes，預設 200MB
  multiple?: boolean;     // 預設 true
}

interface Events {
  'files-added': (files: UploadedFile[]) => void;
  'file-removed': (fileId: string) => void;
  error: (error: string) => void;
}

interface UploadedFile {
  id: string;
  file: File;
  type: ExtractorType;    // 自動分類
  preview?: string;       // 縮圖（圖片類）
}
```

### `<FileTypeSelector>`

讓使用者調整上傳檔案的類型分類。

```typescript
interface Props {
  files: UploadedFile[];
}

interface Events {
  'type-changed': (fileId: string, newType: ExtractorType) => void;
}
```

### `<UploadProgress>`

```typescript
interface Props {
  files: Array<{
    id: string;
    name: string;
    size: number;
    progress: number;     // 0-100
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    error?: string;
  }>;
}
```

## job/

### `<ProgressBar>`

```typescript
interface Props {
  value: number;          // 0-100
  max?: number;           // 預設 100
  label?: string;
  showPercent?: boolean;
  variant?: 'primary' | 'success' | 'warning' | 'danger';
}
```

### `<SubtaskList>`

顯示處理任務的子步驟。

```typescript
interface Props {
  subtasks: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: Date;
    completedAt?: Date;
    message?: string;
  }>;
}
```

### `<TimeEstimate>`

```typescript
interface Props {
  estimatedSeconds: number;
  elapsed?: number;       // 已花時間（秒）
}
```

### `<CostTracker>`

顯示當次處理的累積成本。

```typescript
interface Props {
  estimatedCost: number;  // USD
  monthlyTotal?: number;
  monthlyLimit?: number;
}
```

### `<LogViewer>`

即時日誌顯示。

```typescript
interface Props {
  logs: Array<{
    timestamp: Date;
    level: 'info' | 'warning' | 'error';
    message: string;
  }>;
  autoScroll?: boolean;
  maxLines?: number;      // 預設 50
}
```

## review/

### `<ChangeCard>`

審核介面的變更卡片（最重要的元件之一）。

```typescript
interface Props {
  intent: ChangeIntent;
  expanded?: boolean;
}

interface Events {
  accept: (intent: ChangeIntent) => void;
  reject: (intent: ChangeIntent) => void;
  edit: (intent: ChangeIntent, modified: ChangeIntent) => void;
  skip: (intent: ChangeIntent) => void;
}
```

內部結構：
```
┌─────────────────────────────────────┐
│ [類型 badge] [target] [信心]         │
├─────────────────────────────────────┤
│ 標題 / 描述                          │
│                                     │
│ <DiffViewer />                      │
│                                     │
│ [▾ 來源 (n)]                        │
│   <SourceList />                    │
│                                     │
│ [▾ 連帶影響]                         │
│   <ImpactList />                    │
├─────────────────────────────────────┤
│ [接受] [編輯] [拒絕] [跳過]           │
└─────────────────────────────────────┘
```

### `<ConflictCard>`

```typescript
interface Props {
  conflict: Conflict;
}

interface Events {
  resolve: (conflict: Conflict, choice: ResolutionChoice) => void;
}

type ResolutionChoice = 
  | { type: 'choose_intent'; intentId: string }
  | { type: 'manual_edit'; content: string }
  | { type: 'skip' };
```

### `<CompletenessCard>`

```typescript
interface Props {
  issue: CompletenessIssue;
  context?: {
    availableScreenshots?: Array<{id: string, url: string, description: string}>;
  };
}

interface Events {
  resolve: (issue: CompletenessIssue, choice: any) => void;
}
```

### `<SourceList>`

```typescript
interface Props {
  sources: SourceRef[];
  expandable?: boolean;
}
```

### `<ReviewProgress>`

```typescript
interface Props {
  total: number;
  processed: number;
  accepted: number;
  rejected: number;
  modified: number;
  skipped: number;
}
```

### `<BatchActions>`

```typescript
interface Props {
  pendingItems: ChangeIntent[];
  thresholds?: {
    confidenceHigh?: number;     // 預設 0.85
    confidenceVeryHigh?: number; // 預設 0.95
  };
}

interface Events {
  'batch-accept': (intents: ChangeIntent[]) => void;
  'batch-reject': (intents: ChangeIntent[]) => void;
}
```

## sop/

### `<SopCard>`

Dashboard 上的 SOP 卡片。

```typescript
interface Props {
  sop: SopDoc;
  variant?: 'compact' | 'full';
}

interface Events {
  view: (sop: SopDoc) => void;
  update: (sop: SopDoc) => void;
  download: (sop: SopDoc) => void;
}
```

### `<SopHeader>`

詳細頁的標題區。

```typescript
interface Props {
  sop: SopDoc;
  currentVersion?: VersionDoc;
}

interface Events {
  update: () => void;
  download: (format: 'docx' | 'pdf') => void;
}
```

### `<SopMeta>`

SOP 元資訊顯示。

```typescript
interface Props {
  sop: SopDoc;
  showAll?: boolean;
}
```

### `<SopPreview>`

線上預覽 SOP 內容（從 IR 渲染）。

```typescript
interface Props {
  ir: IR;
  highlightStepId?: string;
}
```

### `<StepView>`

單一步驟的顯示。

```typescript
interface Props {
  step: Step;
  showSourceRefs?: boolean;
  showConfidence?: boolean;
}
```

### `<TroubleshootingView>`

```typescript
interface Props {
  items: TroubleshootingItem[];
}
```

### `<GlossaryView>`

```typescript
interface Props {
  terms: GlossaryTerm[];
  searchable?: boolean;
}
```

## version/

### `<VersionList>`

版本歷史列表。

```typescript
interface Props {
  versions: VersionDoc[];
  currentVersionId?: string;
  selectable?: boolean;   // 可選兩個比較
}

interface Events {
  view: (version: VersionDoc) => void;
  compare: (v1: VersionDoc, v2: VersionDoc) => void;
}
```

### `<VersionTimeline>`

時間軸式呈現。

```typescript
interface Props {
  versions: VersionDoc[];
  changes: ChangeDoc[];
}
```

### `<VersionDiff>`

兩版本對照。

```typescript
interface Props {
  fromVersion: VersionDoc;
  toVersion: VersionDoc;
  change: ChangeDoc;
  mode?: 'unified' | 'split';
}
```

### `<ChangelogView>`

```typescript
interface Props {
  change: ChangeDoc;
  fromVersion: VersionDoc;
  toVersion: VersionDoc;
  level?: 'summary' | 'list' | 'detail';  // 三層級
}
```

## layout/

### `<MainLayout>`

主要頁面佈局（含 header）。

```typescript
interface Props {
  title?: string;
}
```

```vue
<template>
  <div class="layout">
    <AppHeader />
    <main class="main-content">
      <slot />
    </main>
    <ToastContainer />
  </div>
</template>
```

### `<AuthLayout>`

公開頁面佈局（不需登入）。

### `<StepWizard>`

多步驟表單容器。

```typescript
interface Props {
  steps: Array<{
    id: string;
    title: string;
    component?: Component;
  }>;
  currentStep: number;
}

interface Events {
  next: () => void;
  prev: () => void;
  cancel: () => void;
  submit: () => void;
}
```

## 元件實作優先順序

依 Roadmap 階段：

**W1 必要**：
- AppHeader, MainLayout, AuthLayout
- LoadingSpinner, ErrorBanner

**W2 必要**：
- 所有 Core Library，無 Vue 元件

**W3 必要**：
- FileUploader, UploadProgress
- ProgressBar, SubtaskList
- StepView (簡化版)

**W4 必要**：
- FileTypeSelector
- StepWizard
- SopMeta

**W5 必要**：
- SopPreview, StepView 完整版
- TroubleshootingView, GlossaryView

**W6 必要**：
- DiffViewer
- 簡單的 ChangeCard

**W7 必要**：
- 完整 ChangeCard
- ConflictCard, CompletenessCard
- SourceList

**W8 必要**：
- BatchActions, ReviewProgress
- 鍵盤快捷鍵

**W9 必要**：
- VersionList, VersionTimeline
- VersionDiff, ChangelogView

**W10 必要**：
- 全部優化
- 響應式調整

## 元件命名約定

- 檔名：PascalCase.vue（例：`ChangeCard.vue`）
- 根目錄：依分類放（例：`components/review/ChangeCard.vue`）
- 全域註冊：避免（用按需 import）

## Storybook（可選）

如果使用 Storybook：
- 每個元件有對應 `.stories.ts`
- 展示各種 props 組合
- 方便孤立開發

```typescript
// ChangeCard.stories.ts
export default {
  title: 'Review/ChangeCard',
  component: ChangeCard,
};

export const Modify = {
  args: {
    intent: {
      type: 'modify_step',
      // ...
    }
  }
};

export const HighConfidence = { ... };
export const Conflict = { ... };
```

## 元件測試

每個重要元件都要有測試（vitest + @vue/test-utils）：

```typescript
import { mount } from '@vue/test-utils';
import ChangeCard from './ChangeCard.vue';

describe('ChangeCard', () => {
  it('renders intent details', () => {
    const intent = mockIntent();
    const wrapper = mount(ChangeCard, { props: { intent } });
    expect(wrapper.text()).toContain(intent.description);
  });
  
  it('emits accept on accept button click', async () => {
    const wrapper = mount(ChangeCard, { props: { intent: mockIntent() } });
    await wrapper.find('[data-testid=accept]').trigger('click');
    expect(wrapper.emitted('accept')).toHaveLength(1);
  });
});
```
