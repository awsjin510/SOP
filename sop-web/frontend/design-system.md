# 設計系統

## 設計理念

呼應 Jin 對深色 accent + 淺色底的偏好，整體風格：
- **專業、工程感**：讓使用者覺得「這是個正經工具」
- **清晰、好讀**：內訓場景強調可讀性
- **資訊密度適中**：不過簡也不雜亂
- **一致性**：所有元件遵循統一規則

## 顏色系統

### 主色調

```css
:root {
  /* === 主色（深藍）=== */
  --color-primary-50:  #F0F4FA;
  --color-primary-100: #DBE5F1;
  --color-primary-200: #B8CCE4;
  --color-primary-300: #94B2D6;
  --color-primary-400: #6B96C6;
  --color-primary-500: #4A7AB8;  /* 主色（按鈕、連結） */
  --color-primary-600: #2D5A99;
  --color-primary-700: #1A2B4A;  /* 深主色（標題、強調） */
  --color-primary-800: #0F1A30;
  --color-primary-900: #08111E;
  
  /* === 強調色（靛紫）=== */
  --color-accent-50:  #F5F3FA;
  --color-accent-100: #E8E2F1;
  --color-accent-200: #CFC1E2;
  --color-accent-300: #B5A0D2;
  --color-accent-400: #9079C0;
  --color-accent-500: #6E54AC;  /* 強調色 */
  --color-accent-600: #5A3F8E;
  --color-accent-700: #4A3A6E;  /* 深強調 */
  --color-accent-800: #2F2447;
  --color-accent-900: #1A1428;
  
  /* === 中性色 ===*/
  --color-gray-50:  #F9FAFB;
  --color-gray-100: #F3F4F6;
  --color-gray-200: #E5E7EB;
  --color-gray-300: #D1D5DB;
  --color-gray-400: #9CA3AF;
  --color-gray-500: #6B7280;
  --color-gray-600: #4B5563;
  --color-gray-700: #374151;
  --color-gray-800: #1F2937;
  --color-gray-900: #111827;
  
  /* === 語義色 === */
  --color-success: #10B981;
  --color-success-light: #D1FAE5;
  --color-warning: #F59E0B;
  --color-warning-light: #FEF3C7;
  --color-danger: #EF4444;
  --color-danger-light: #FEE2E2;
  --color-info: #0EA5E9;
  --color-info-light: #DBEAFE;
}
```

### 主題（Light Mode 為主）

```css
/* Light Mode */
:root {
  --bg-primary: var(--color-gray-50);
  --bg-secondary: #FFFFFF;
  --bg-tertiary: var(--color-gray-100);
  --bg-card: #FFFFFF;
  --bg-hover: var(--color-gray-100);
  
  --text-primary: var(--color-gray-900);
  --text-secondary: var(--color-gray-600);
  --text-muted: var(--color-gray-400);
  --text-inverse: #FFFFFF;
  --text-link: var(--color-primary-600);
  
  --border-default: var(--color-gray-200);
  --border-strong: var(--color-gray-300);
  --border-focus: var(--color-primary-500);
}

/* Dark Mode（使用者偏好深色）*/
[data-theme="dark"] {
  --bg-primary: var(--color-gray-900);
  --bg-secondary: var(--color-gray-800);
  --bg-tertiary: var(--color-gray-700);
  --bg-card: var(--color-gray-800);
  --bg-hover: var(--color-gray-700);
  
  --text-primary: var(--color-gray-50);
  --text-secondary: var(--color-gray-300);
  --text-muted: var(--color-gray-500);
  --text-inverse: var(--color-gray-900);
  --text-link: var(--color-primary-400);
  
  --border-default: var(--color-gray-700);
  --border-strong: var(--color-gray-600);
  --border-focus: var(--color-primary-400);
}
```

## 字型系統

```css
:root {
  /* 中文 */
  --font-cjk: 'Noto Sans TC', 'PingFang TC', '思源黑體', sans-serif;
  
  /* 英文 */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  
  /* Code */
  --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  
  /* 主要字型（中英混排）*/
  --font-primary: var(--font-sans), var(--font-cjk);
}

body {
  font-family: var(--font-primary);
  font-feature-settings: 'cv11', 'ss01', 'ss03';  /* Inter 的視覺優化 */
}

code, pre {
  font-family: var(--font-mono);
}
```

### 字級

```css
:root {
  --text-xs:   0.75rem;   /* 12px */
  --text-sm:   0.875rem;  /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg:   1.125rem;  /* 18px */
  --text-xl:   1.25rem;   /* 20px */
  --text-2xl:  1.5rem;    /* 24px */
  --text-3xl:  1.875rem;  /* 30px */
  --text-4xl:  2.25rem;   /* 36px */
  --text-5xl:  3rem;      /* 48px */
}
```

### 行高

```css
:root {
  --leading-tight:   1.25;
  --leading-normal:  1.5;
  --leading-relaxed: 1.625;
  --leading-loose:   1.75;
}

/* 預設規則 */
body { line-height: var(--leading-normal); }
h1, h2, h3, h4, h5, h6 { line-height: var(--leading-tight); }
.prose { line-height: var(--leading-relaxed); }
```

## 間距系統

用 4px 基準：

```css
:root {
  --space-0: 0;
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.25rem;  /* 20px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-10: 2.5rem;  /* 40px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */
}
```

## 圓角

```css
:root {
  --radius-sm: 0.25rem;   /* 4px */
  --radius-md: 0.5rem;    /* 8px */
  --radius-lg: 0.75rem;   /* 12px */
  --radius-xl: 1rem;      /* 16px */
  --radius-full: 9999px;
}
```

## 陰影

```css
:root {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}
```

## 元件規格

### Button

```vue
<!-- Primary -->
<button class="btn btn-primary">主要按鈕</button>

<!-- Secondary -->
<button class="btn btn-secondary">次要按鈕</button>

<!-- Ghost -->
<button class="btn btn-ghost">幽靈按鈕</button>

<!-- Danger -->
<button class="btn btn-danger">危險按鈕</button>

<!-- 含圖示 -->
<button class="btn btn-primary">
  <Icon name="plus" />
  新增 SOP
</button>
```

樣式（Tailwind）：
```css
.btn {
  @apply px-4 py-2 rounded-md font-medium transition-colors 
         focus:outline-none focus:ring-2 focus:ring-offset-2;
}
.btn-primary {
  @apply bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500;
}
.btn-secondary {
  @apply bg-white text-gray-700 border border-gray-300 
         hover:bg-gray-50 focus:ring-primary-500;
}
.btn-ghost {
  @apply text-gray-700 hover:bg-gray-100;
}
.btn-danger {
  @apply bg-danger text-white hover:bg-red-700 focus:ring-red-500;
}
```

### Card

```vue
<div class="card">
  <div class="card-header">
    <h3>標題</h3>
  </div>
  <div class="card-body">
    內容
  </div>
  <div class="card-footer">
    操作
  </div>
</div>
```

```css
.card {
  @apply bg-white rounded-lg shadow-md border border-gray-200;
}
.card-header {
  @apply px-6 py-4 border-b border-gray-200;
}
.card-body {
  @apply p-6;
}
.card-footer {
  @apply px-6 py-4 border-t border-gray-200 bg-gray-50;
}
```

### Form Input

```vue
<div class="form-field">
  <label class="form-label">標籤</label>
  <input class="form-input" />
  <p class="form-help">輔助說明</p>
  <p class="form-error">錯誤訊息</p>
</div>
```

```css
.form-field { @apply mb-4; }
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input {
  @apply w-full px-3 py-2 border border-gray-300 rounded-md
         focus:outline-none focus:ring-2 focus:ring-primary-500 
         focus:border-primary-500;
}
.form-help { @apply mt-1 text-sm text-gray-500; }
.form-error { @apply mt-1 text-sm text-danger; }
```

### Badge

```vue
<!-- 狀態標籤 -->
<span class="badge badge-success">成功</span>
<span class="badge badge-warning">警告</span>
<span class="badge badge-danger">危險</span>
<span class="badge badge-info">資訊</span>

<!-- 變更類型 -->
<span class="badge change-add">新增</span>
<span class="badge change-modify">修改</span>
<span class="badge change-remove">移除</span>
```

```css
.badge {
  @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium;
}
.badge-success { @apply bg-green-100 text-green-800; }
.badge-warning { @apply bg-yellow-100 text-yellow-800; }
.badge-danger { @apply bg-red-100 text-red-800; }
.badge-info { @apply bg-blue-100 text-blue-800; }

.change-add { @apply bg-green-100 text-green-800; }
.change-modify { @apply bg-blue-100 text-blue-800; }
.change-remove { @apply bg-red-100 text-red-800; }
```

### Confidence Indicator（信心指示器）

```vue
<ConfidenceIndicator :value="0.92" />
```

實作：
```vue
<template>
  <span class="confidence" :class="level">
    <span class="dots">{{ filled }}{{ empty }}</span>
    <span class="value">({{ value.toFixed(2) }})</span>
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ value: number }>();

const level = computed(() => {
  if (props.value >= 0.85) return 'high';
  if (props.value >= 0.65) return 'medium';
  if (props.value >= 0.45) return 'low';
  return 'very-low';
});

const filled = computed(() => '●'.repeat(Math.ceil(props.value * 4)));
const empty = computed(() => '○'.repeat(4 - Math.ceil(props.value * 4)));
</script>

<style scoped>
.confidence.high .dots { @apply text-green-600; }
.confidence.medium .dots { @apply text-yellow-600; }
.confidence.low .dots { @apply text-orange-600; }
.confidence.very-low .dots { @apply text-red-600; }
.confidence .value { @apply text-gray-500 ml-1 text-sm; }
</style>
```

### Diff Block

```vue
<DiffBlock 
  :before="oldContent" 
  :after="newContent" 
  unified="true"
/>
```

樣式：
```css
.diff-line-removed {
  @apply bg-red-50 text-red-900 px-2 py-1 font-mono text-sm;
}
.diff-line-removed::before {
  content: '- ';
  @apply text-red-600 font-bold;
}
.diff-line-added {
  @apply bg-green-50 text-green-900 px-2 py-1 font-mono text-sm;
}
.diff-line-added::before {
  content: '+ ';
  @apply text-green-600 font-bold;
}
.diff-line-unchanged {
  @apply px-2 py-1 font-mono text-sm text-gray-700;
}
.diff-line-unchanged::before {
  content: '  ';
}
```

### Progress Bar

```vue
<ProgressBar :value="72" :max="100" />
```

```vue
<template>
  <div class="progress-container">
    <div class="progress-bar" :style="{ width: percent + '%' }" />
    <span class="progress-text">{{ percent }}%</span>
  </div>
</template>

<style scoped>
.progress-container {
  @apply w-full bg-gray-200 rounded-full h-2 overflow-hidden;
}
.progress-bar {
  @apply h-full bg-primary-500 rounded-full transition-all duration-300;
}
.progress-text {
  @apply text-sm text-gray-600;
}
</style>
```

### Toast 通知

用 vue-sonner 或 自製：

```vue
<Toast type="success" message="SOP 已成功建立" />
```

四種類型：
- success（綠）
- warning（橘）
- danger（紅）
- info（藍）

### Modal / Dialog

用 shadcn-vue 的 Dialog：
- 用於確認危險操作（刪除、覆寫）
- 用於設定精靈
- 用於詳細資訊展開

## Layout

### 主要 Layout

```
┌─────────────────────────────────────────┐
│ Header (sticky, 64px)                   │
│ Logo │ Nav │ User Menu                  │
├─────────────────────────────────────────┤
│                                         │
│                                         │
│         Main Content                    │
│         (max-width: 1280px)             │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

### 元件層級

```
App
├── AppHeader（每頁都有）
├── RouterView
│   ├── LandingPage
│   ├── LoginPage
│   ├── DashboardPage
│   │   └── SopList
│   ├── NewSopPage
│   │   └── FileUploader
│   ├── JobProgressPage
│   │   ├── ProgressBar
│   │   └── SubtaskList
│   ├── ReviewInterface
│   │   ├── ChangeCard
│   │   ├── ConflictCard
│   │   └── CompletenessCard
│   ├── SopDetailPage
│   │   ├── SopHeader
│   │   ├── VersionList
│   │   └── ChangeHistory
│   ├── VersionDiffPage
│   │   └── DiffViewer
│   └── SettingsPage
└── ToastContainer
```

## 響應式斷點

```css
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
}
```

但主要針對 1280px 以上設計（內部工具，桌面為主）。

## 動畫

```css
:root {
  --transition-fast: 150ms ease-in-out;
  --transition-normal: 250ms ease-in-out;
  --transition-slow: 400ms ease-in-out;
}

/* 預設 */
* { transition-property: background-color, border-color, color, opacity, transform; }
```

## 無障礙

- 所有互動元素都要有 hover / focus 狀態
- 顏色對比通過 WCAG AA（4.5:1）
- 圖示按鈕要有 aria-label
- 表單輸入要有 label
- 鍵盤可導覽

## 圖示

使用 lucide-vue-next：

```vue
<script setup>
import { Plus, Edit, Trash, Check, X } from 'lucide-vue-next';
</script>

<template>
  <Plus class="w-5 h-5" />
</template>
```

預設大小：
- 內聯小圖示：16px
- 一般圖示：20px
- 大圖示：24px

## Tailwind 配置

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F0F4FA',
          // ...
          700: '#1A2B4A',
          // ...
        },
        accent: {
          // ...
          700: '#4A3A6E',
          // ...
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans TC', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```
