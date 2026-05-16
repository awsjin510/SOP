# 部署指引

## 概覽

部署這個系統需要：

1. Firebase 專案
2. Anthropic API Key
3. GitHub repo（推薦，可做 CI/CD）

## 第一次部署（手動）

### 1. 建立 Firebase 專案

1. 前往 https://console.firebase.google.com
2. 點「新增專案」
3. 命名為 `sop-system`（或自訂）
4. 不啟用 Google Analytics（個人工具不需要）
5. 進入專案

### 2. 啟用 Firebase 服務

#### Authentication
- 左側選單 Build > Authentication
- 點「開始使用」
- Sign-in method 分頁
- 啟用「Google」provider
- 設定支援電子郵件（你的）

#### Firestore Database
- 左側選單 Build > Firestore Database
- 點「建立資料庫」
- 模式：選「在生產環境模式中啟動」（之後規則檔會處理）
- 位置：選 `asia-east1`（台灣）
- 建立

#### Storage
- 左側選單 Build > Storage
- 點「開始使用」
- 模式：生產環境模式
- 位置：與 Firestore 同（asia-east1）
- 完成

#### Functions
- 左側選單 Build > Functions
- **需要升級到 Blaze 方案**（綁信用卡，但個人用免費額度足夠）
- 個人使用 Functions 一個月不會超過免費額度，所以實際不會收費
- 設定預算告警 $1/月（保險）

### 3. 取得 Firebase 設定

- 專案設定（齒輪圖示）
- 一般 > 您的應用程式
- 加入應用程式 > Web（</> 圖示）
- 暱稱：sop-web
- 不勾選「設定 Firebase Hosting」
- 註冊
- 會看到 firebaseConfig 物件，**先複製下來**

### 4. 本地專案設定

```bash
# Clone 你的 repo（或本地建立）
git clone <your-repo-url> sop-web
cd sop-web

# 安裝 Firebase CLI（如果還沒）
npm install -g firebase-tools

# 登入 Firebase
firebase login

# 初始化 Firebase
firebase init

# 選擇：
# - Firestore
# - Functions
# - Hosting
# - Storage
# - Emulators

# 配置：
# - 使用既有專案 → 選你剛建立的
# - Firestore rules: firestore.rules
# - Functions: TypeScript
# - Hosting: dist 作為 public 目錄
# - Single-page app: Yes
# - Storage: storage.rules
```

### 5. 設定環境變數

```bash
# 在 .env.local（不要 commit）建立
cat > .env.local <<EOF
VITE_FIREBASE_API_KEY=<from firebaseConfig>
VITE_FIREBASE_AUTH_DOMAIN=<from firebaseConfig>
VITE_FIREBASE_PROJECT_ID=<from firebaseConfig>
VITE_FIREBASE_STORAGE_BUCKET=<from firebaseConfig>
VITE_FIREBASE_MESSAGING_SENDER_ID=<from firebaseConfig>
VITE_FIREBASE_APP_ID=<from firebaseConfig>
EOF

# 加入 .gitignore
echo ".env.local" >> .gitignore
```

### 6. 設定 Anthropic API Key

```bash
# 在 functions 目錄
cd functions

# 設定 secret
firebase functions:secrets:set ANTHROPIC_API_KEY
# 貼上你的 key 後 Enter

# 確認
firebase functions:secrets:access ANTHROPIC_API_KEY
```

### 7. 部署 Security Rules

```bash
# 部署 Firestore rules
firebase deploy --only firestore:rules

# 部署 Storage rules
firebase deploy --only storage
```

### 8. 部署 Functions

```bash
cd functions
npm install
npm run build
cd ..

firebase deploy --only functions
```

### 9. 部署前端

```bash
# Build
npm run build

# 部署
firebase deploy --only hosting
```

完成後會看到：
```
Hosting URL: https://your-app.web.app
```

## 自訂網域（可選）

### 1. Firebase Console

- Hosting > 自訂網域
- 加入網域：例如 `sop.cloudorange.tw`
- 依照指示在 DNS 加 TXT 記錄驗證
- 加 A / AAAA 記錄指向 Firebase

### 2. 等待 SSL（24 小時內）

Firebase 會自動配置 Let's Encrypt 憑證。

## CI/CD 自動部署（推薦）

### 1. 建立 GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Firebase

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Functions deps
        run: cd functions && npm ci
      
      - name: Build frontend
        run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
      
      - name: Deploy to Firebase
        uses: w9jds/firebase-action@master
        with:
          args: deploy --only hosting,functions,firestore:rules,storage
        env:
          GCP_SA_KEY: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
```

### 2. 設定 Service Account

- Firebase Console > 專案設定 > 服務帳戶
- 產生新私密金鑰 → 下載 JSON

### 3. GitHub Secrets

在 repo Settings > Secrets and variables > Actions：

加入以下 secrets：
- `FIREBASE_SERVICE_ACCOUNT`：JSON 整個內容
- `VITE_FIREBASE_API_KEY` 等：對應 firebaseConfig

## 本地開發（用 Emulator）

開發時不要直接打到正式 Firebase，用 Emulator：

```bash
# 啟動所有 emulator
firebase emulators:start

# 同時啟動前端
npm run dev
```

`src/firebase/config.ts` 偵測 dev mode：

```typescript
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

Emulator UI：http://localhost:4000

## 監控與維護

### 1. 用量監控

Firebase Console：
- Hosting：頻寬使用
- Firestore：讀寫次數、儲存空間
- Storage：儲存空間、下載量
- Functions：調用次數、執行時間

### 2. 錯誤監控

Cloud Logging：
- Firebase Console > Functions > 日誌
- 過濾 severity = ERROR

可選：整合 Sentry。

### 3. 預算告警

- Firebase Console > 設定 > 用量與帳單
- 設定 Budget alert：$5/月
- 50%、80%、100% 通知

### 4. Anthropic 用量

在 Anthropic Console：
- 設定每月 billing limit
- 開啟用量通知

## 災難復原

### 資料備份

Firestore 自動有 PITR（Point-in-Time Recovery），但只 7 天。

長期備份：

```bash
# 手動匯出
gcloud firestore export gs://your-backup-bucket/backups/$(date +%Y%m%d) \
  --project=your-project-id
```

設定排程備份（可選）：

```typescript
// functions/src/backup.ts
export const scheduledBackup = onSchedule(
  { schedule: 'every monday 02:00', timeZone: 'Asia/Taipei' },
  async () => {
    const today = new Date().toISOString().slice(0, 10);
    await admin.firestore().exportDocuments(`gs://backup-bucket/${today}`);
  }
);
```

### Storage 備份

```bash
gsutil -m cp -r gs://your-app.appspot.com gs://your-backup-bucket/storage/
```

## 升級與更新

### 升級依賴

```bash
# 前端
npm outdated
npm update

# Functions
cd functions
npm outdated
npm update
```

### 升級 Firebase SDK

```bash
npm install firebase@latest firebase-admin@latest firebase-functions@latest
```

### 升級 Node 版本

修改 `functions/package.json`：
```json
"engines": { "node": "22" }
```

部署：`firebase deploy --only functions`。

## 常見問題

### 部署 Functions 失敗

- 檢查 Node.js 版本（用 nvm 切換）
- 檢查 `functions/lib` 是否有 build 結果
- 檢查 secret 是否設定

### 前端登入失敗

- 檢查 Firebase Console > Auth > Sign-in method 是否啟用 Google
- 檢查網域是否在 Auth 的授權網域中

### Firestore 寫入失敗

- 檢查 Security Rules
- 用 Emulator 測試 Rules：`firebase emulators:start --only firestore`

### 用量警告

- 檢查是否有無限循環的 listener
- 檢查 query 是否有正確的 limit
- 檢查 Cloud Function 是否被頻繁調用
