# SOP 內訓文件產生與更新系統

> Claude Code 實作規格 v1.0
> 適用情境：CloudOrange 雲力橘子 內部員工訓練用 SOP 文件
> 主要技術：Claude Code Skills + docx skill + pdf-reading skill

## 系統概覽

本系統由兩個 Claude Code Skill 組成：

| Skill | 用途 | 觸發時機 |
|-------|------|---------|
| `sop-trainer` | 從多模態素材產生內訓 SOP | 第一次建立 SOP |
| `sop-updater` | 將更新素材套用到既有 SOP | SOP 需要修訂時 |

兩個 skill 共用一個 **IR（Intermediate Representation）** 中繼層，這是整個系統的骨幹。

## 核心設計原則

1. **IR 中繼層**：所有輸入 → IR → 多種輸出格式（Word/PDF/Markdown）
2. **分流抽取**：不同素材類型走不同處理路徑，最後匯流
3. **可追溯性**：每段內容都能追溯到原始素材
4. **人工閘門**：低信心變更與衝突一定要人工確認
5. **版本完整保留**：任何版本都可重生、可回滾、可 diff

## 目錄結構

```
sop-system/
├── README.md                          # 本檔
├── docs/
│   ├── architecture.md                # 系統架構詳解
│   ├── ir-design.md                   # IR schema 設計理念
│   └── implementation-roadmap.md      # 分階段實作指南
├── skills/
│   ├── sop-trainer/                   # 產生器 skill
│   │   ├── SKILL.md
│   │   ├── templates/
│   │   └── examples/
│   └── sop-updater/                   # 更新器 skill
│       ├── SKILL.md
│       ├── extractors/                # 四種素材抽取器
│       ├── merger/                    # 匯流引擎
│       └── templates/
├── schemas/
│   ├── ir-schema.yaml                 # IR 完整 schema
│   ├── change-intent-schema.yaml      # 變更意圖 schema
│   └── examples/                      # schema 範例
├── examples/
│   └── sample-update/                 # 完整的更新範例
└── tests/
    └── test-cases.md                  # 測試案例清單
```

## 給 Claude Code 的實作指引

請依照以下順序閱讀與實作：

1. **先讀 `docs/architecture.md`** 理解整體架構
2. **再讀 `docs/ir-design.md`** 理解 IR 設計
3. **檢視 `schemas/`** 內的 schema 與範例
4. **依 `docs/implementation-roadmap.md`** 分階段實作

## 實作環境假設

- 安裝位置：`~/.claude/skills/`（macOS 個人 skill）
- 依賴 skill：`docx`、`pdf-reading`、`pdf`（Anthropic 官方 skill）
- Python 環境：3.10+
- 主要套件：`pyyaml`, `python-docx`, `pypdf`, `Pillow`
- 儲存：本機檔案系統，未來可整合 Airtable / Google Drive

## 重要約定

- **語言**：所有產出文件使用**繁體中文**（zh-TW），程式註解可用英文
- **編碼**：所有檔案 UTF-8
- **時區**：時間戳一律 GMT+8（Taiwan Standard Time）
- **設計風格**：深色 accent，淺色為主底（內訓文件需要高可讀性）
- **檔名規則**：kebab-case，含版本號（如 `ec2-provisioning-v1.4.docx`）
