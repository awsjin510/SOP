/**
 * 三層級 Changelog Word 渲染器（W9）。
 *
 * 結構：
 *   Tier 1：管理者摘要（counts、retraining flag、影響章節）
 *   Tier 2：審查者用變更清單（一行一變更，含 status）
 *   Tier 3：執行者用詳細 diff（before / after / source_refs / impact）
 *
 * 輸入：ChangeRecord（含 changeIntents / skippedIntents / conflicts / completenessIssues）。
 */
import type { ChangeIntent } from '@/core/ir/schemas';
import type { ChangeRecord } from '@/services/sop';

export interface ChangelogRenderInput {
  sopTitle: string;
  fromVersion: string;
  toVersion: string;
  appliedBy: string;
  appliedAt?: string; // ISO with +08:00；沒有就空字串
  change: ChangeRecord;
}

const COLORS = {
  PRIMARY: '1A2B4A',
  ACCENT: '4A3A6E',
  TEXT: '1F2937',
  TEXT_MUTED: '6B7280',
  BG_CARD: 'F9FAFB',
  BORDER: 'E5E7EB',
  ADDED: '10B981',
  REMOVED: 'EF4444',
  MODIFIED: 'F59E0B',
} as const;

const FONT = 'Noto Sans TC';

const INTENT_TYPE_LABEL: Record<string, string> = {
  add_step: '新增步驟',
  modify_step: '修改步驟',
  remove_step: '刪除步驟',
  reorder_step: '調整順序',
  add_tip: '新增提示',
  add_warning: '新增警示',
  add_glossary: '新增術語',
  modify_glossary: '修改術語',
  add_troubleshooting: '新增 troubleshooting',
  modify_troubleshooting: '修改 troubleshooting',
  remove_troubleshooting: '刪除 troubleshooting',
  modify_meta: '修改 meta',
  replace_screenshot: '替換截圖',
};

const STATUS_LABEL: Record<string, string> = {
  accepted: '✓ 已接受',
  modified: '✎ 已編輯',
  rejected: '✗ 已拒絕',
  skipped: '— 略過',
  pending: '? 未處理',
};

export async function renderChangelogDocx(input: ChangelogRenderInput): Promise<Blob> {
  const docx = await import('docx');
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    Table,
    TableRow,
    TableCell,
    BorderStyle,
    WidthType,
  } = docx;

  const sections = [
    ...renderCover(input, { Paragraph, TextRun, HeadingLevel, AlignmentType }),
    ...renderTier1Summary(input, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType }),
    ...renderTier2List(input, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType }),
    ...renderTier3Details(input, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType }),
  ];

  const doc = new Document({
    creator: 'SOP Web',
    title: `Changelog ${input.fromVersion} → ${input.toVersion}`,
    description: 'SOP 變更紀錄（三層級）',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: sections,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}

// ============================================================
// Cover
// ============================================================

interface DocxCoverFns {
  Paragraph: typeof import('docx').Paragraph;
  TextRun: typeof import('docx').TextRun;
  HeadingLevel: typeof import('docx').HeadingLevel;
  AlignmentType: typeof import('docx').AlignmentType;
}

function renderCover(
  input: ChangelogRenderInput,
  fns: DocxCoverFns,
): Array<InstanceType<typeof import('docx').Paragraph>> {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType } = fns;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({
          text: input.sopTitle,
          bold: true,
          size: 36,
          color: COLORS.PRIMARY,
          font: FONT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: '變更紀錄（Changelog）',
          size: 28,
          color: COLORS.ACCENT,
          font: FONT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: `v${input.fromVersion}  →  v${input.toVersion}`,
          size: 24,
          color: COLORS.TEXT,
          font: FONT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: `產生時間：${input.appliedAt ?? ''}    ·    審核者：${input.appliedBy}`,
          size: 18,
          color: COLORS.TEXT_MUTED,
          font: FONT,
          italics: true,
        }),
      ],
    }),
    sectionHeading('Tier 1：摘要', HeadingLevel, Paragraph, TextRun),
  ];
}

function sectionHeading(
  text: string,
  HeadingLevel: typeof import('docx').HeadingLevel,
  Paragraph: typeof import('docx').Paragraph,
  TextRun: typeof import('docx').TextRun,
): InstanceType<typeof import('docx').Paragraph> {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 200 },
    children: [
      new TextRun({
        text,
        bold: true,
        color: COLORS.PRIMARY,
        size: 28,
        font: FONT,
      }),
    ],
  });
}

// ============================================================
// Tier 1：Summary
// ============================================================

interface DocxBlockFns extends DocxCoverFns {
  Table: typeof import('docx').Table;
  TableRow: typeof import('docx').TableRow;
  TableCell: typeof import('docx').TableCell;
  BorderStyle: typeof import('docx').BorderStyle;
  WidthType: typeof import('docx').WidthType;
}

function renderTier1Summary(
  input: ChangelogRenderInput,
  fns: Omit<DocxBlockFns, 'AlignmentType'> & {
    AlignmentType?: typeof import('docx').AlignmentType;
  },
): Array<
  | InstanceType<typeof import('docx').Paragraph>
  | InstanceType<typeof import('docx').Table>
> {
  const { Paragraph, TextRun, Table, TableRow, TableCell, BorderStyle, WidthType } = fns;
  const ch = input.change;
  const stats = sumStats(ch.changeIntents, ch.skippedIntents ?? []);
  const sectionsAffected = countAffectedSections(ch.changeIntents);
  const stepsAffected = countAffectedSteps(ch.changeIntents);
  const needsRetraining = ch.changeIntents.some(
    (i) => i.impact?.needs_retraining === true,
  );
  const breaking = ch.changeIntents.some(
    (i) => i.impact?.breaking_change === true,
  );

  const rows: Array<[string, string]> = [
    ['變更項目總數', `${stats.applied} / ${stats.total}（含跳過 ${stats.skipped} 項）`],
    [
      'add / modify / remove / reorder',
      `${stats.added} / ${stats.modified} / ${stats.removed} / ${stats.reordered}`,
    ],
    ['影響步驟', String(stepsAffected)],
    ['影響章節', String(sectionsAffected)],
    ['是否需要重新訓練', needsRetraining ? '是 ⚠' : '否'],
    ['含 breaking change', breaking ? '是 ⚠' : '否'],
  ];

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            kvCell(label, true, { TableCell, Paragraph, TextRun, BorderStyle, WidthType }),
            kvCell(value, false, { TableCell, Paragraph, TextRun, BorderStyle, WidthType }),
          ],
        }),
    ),
  });

  const out: Array<
    | InstanceType<typeof import('docx').Paragraph>
    | InstanceType<typeof import('docx').Table>
  > = [summaryTable];

  // 衝突 / 完整性提醒
  const conflictsCount = (ch.conflicts ?? []).length;
  const issuesCount = (ch.completenessIssues ?? []).length;
  if (conflictsCount > 0 || issuesCount > 0) {
    out.push(
      new Paragraph({
        spacing: { before: 200, after: 50 },
        children: [
          new TextRun({
            text: `審核中處理了 ${conflictsCount} 組衝突、${issuesCount} 項完整性問題。詳見變更紀錄文件。`,
            italics: true,
            color: COLORS.TEXT_MUTED,
            font: FONT,
          }),
        ],
      }),
    );
  }

  return out;
}

function kvCell(
  text: string,
  isLabel: boolean,
  fns: {
    TableCell: typeof import('docx').TableCell;
    Paragraph: typeof import('docx').Paragraph;
    TextRun: typeof import('docx').TextRun;
    BorderStyle: typeof import('docx').BorderStyle;
    WidthType: typeof import('docx').WidthType;
  },
): InstanceType<typeof import('docx').TableCell> {
  const { TableCell, Paragraph, TextRun, BorderStyle, WidthType } = fns;
  return new TableCell({
    width: { size: isLabel ? 30 : 70, type: WidthType.PERCENTAGE },
    shading: isLabel ? { fill: COLORS.BG_CARD } : undefined,
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
    borders: defaultBorders(BorderStyle),
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: isLabel,
            color: isLabel ? COLORS.TEXT_MUTED : COLORS.TEXT,
            font: FONT,
          }),
        ],
      }),
    ],
  });
}

function defaultBorders(BorderStyle: typeof import('docx').BorderStyle) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: COLORS.BORDER };
  return { top: b, bottom: b, left: b, right: b };
}

// ============================================================
// Tier 2：Change list
// ============================================================

function renderTier2List(
  input: ChangelogRenderInput,
  fns: Omit<DocxBlockFns, 'AlignmentType'>,
): Array<
  | InstanceType<typeof import('docx').Paragraph>
  | InstanceType<typeof import('docx').Table>
> {
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } = fns;
  const ch = input.change;

  const out: Array<
    | InstanceType<typeof import('docx').Paragraph>
    | InstanceType<typeof import('docx').Table>
  > = [sectionHeading('Tier 2：變更清單', HeadingLevel, Paragraph, TextRun)];

  if (ch.changeIntents.length === 0 && (ch.skippedIntents ?? []).length === 0) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '本次無變更項目。',
            italics: true,
            color: COLORS.TEXT_MUTED,
            font: FONT,
          }),
        ],
      }),
    );
    return out;
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: ['#', '類型', '狀態', '描述', '信心']
      .map(
        (h) =>
          new TableCell({
            shading: { fill: COLORS.BG_CARD },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            borders: defaultBorders(BorderStyle),
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: h,
                    bold: true,
                    color: COLORS.PRIMARY,
                    font: FONT,
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
      ),
  });

  const dataRows = [
    ...ch.changeIntents.map((intent, idx) =>
      buildRow(idx + 1, intent, intent.status ?? 'accepted', {
        TableCell,
        TableRow,
        Paragraph,
        TextRun,
        BorderStyle,
      }),
    ),
    ...(ch.skippedIntents ?? []).map(({ intent }, idx) =>
      buildRow(ch.changeIntents.length + idx + 1, intent, 'skipped', {
        TableCell,
        TableRow,
        Paragraph,
        TextRun,
        BorderStyle,
      }),
    ),
  ];

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
  );
  return out;
}

function buildRow(
  idx: number,
  intent: ChangeIntent,
  status: string,
  fns: {
    TableCell: typeof import('docx').TableCell;
    TableRow: typeof import('docx').TableRow;
    Paragraph: typeof import('docx').Paragraph;
    TextRun: typeof import('docx').TextRun;
    BorderStyle: typeof import('docx').BorderStyle;
  },
): InstanceType<typeof import('docx').TableRow> {
  const { TableCell, TableRow, Paragraph, TextRun, BorderStyle } = fns;
  const cells = [
    String(idx),
    INTENT_TYPE_LABEL[intent.type] ?? intent.type,
    STATUS_LABEL[status] ?? status,
    intent.description,
    `${Math.round(intent.confidence * 100)}%`,
  ];
  return new TableRow({
    children: cells.map(
      (c) =>
        new TableCell({
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          borders: defaultBorders(BorderStyle),
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: c, color: COLORS.TEXT, font: FONT, size: 18 }),
              ],
            }),
          ],
        }),
    ),
  });
}

// ============================================================
// Tier 3：Details
// ============================================================

function renderTier3Details(
  input: ChangelogRenderInput,
  fns: Omit<DocxBlockFns, 'AlignmentType'>,
): Array<
  | InstanceType<typeof import('docx').Paragraph>
  | InstanceType<typeof import('docx').Table>
> {
  const { Paragraph, TextRun, HeadingLevel } = fns;
  const ch = input.change;
  const out: Array<
    | InstanceType<typeof import('docx').Paragraph>
    | InstanceType<typeof import('docx').Table>
  > = [sectionHeading('Tier 3：詳細變更', HeadingLevel, Paragraph, TextRun)];

  if (ch.changeIntents.length === 0) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '無詳細變更內容。',
            italics: true,
            color: COLORS.TEXT_MUTED,
            font: FONT,
          }),
        ],
      }),
    );
    return out;
  }

  ch.changeIntents.forEach((intent, idx) => {
    out.push(...renderIntentDetail(idx + 1, intent, fns));
  });

  return out;
}

function renderIntentDetail(
  idx: number,
  intent: ChangeIntent,
  fns: Omit<DocxBlockFns, 'AlignmentType'>,
): Array<InstanceType<typeof import('docx').Paragraph>> {
  const { Paragraph, TextRun, HeadingLevel } = fns;
  const out: Array<InstanceType<typeof import('docx').Paragraph>> = [];

  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: `${idx}. ${INTENT_TYPE_LABEL[intent.type] ?? intent.type}`,
          bold: true,
          color: COLORS.ACCENT,
          font: FONT,
          size: 24,
        }),
        ...(intent.target.step_id
          ? [
              new TextRun({
                text: `  ${intent.target.step_id}`,
                color: COLORS.TEXT_MUTED,
                font: 'Consolas',
                size: 18,
              }),
            ]
          : []),
      ],
    }),
  );

  out.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: intent.description, color: COLORS.TEXT, font: FONT }),
      ],
    }),
  );

  if (intent.before) {
    out.push(labelLine('原本', intent.before, COLORS.REMOVED, fns));
  }
  if (intent.after) {
    out.push(labelLine('變更為', intent.after, COLORS.ADDED, fns));
  }
  if (intent.user_modification?.after && intent.user_modification.after !== intent.after) {
    out.push(labelLine('使用者編輯後', intent.user_modification.after, COLORS.MODIFIED, fns));
  }
  if (intent.rationale) {
    out.push(labelLine('理由', intent.rationale, COLORS.TEXT_MUTED, fns));
  }

  // Impact tags
  const impactTags: string[] = [];
  if (intent.impact?.breaking_change) impactTags.push('breaking change');
  if (intent.impact?.needs_retraining) impactTags.push('需重訓');
  if (intent.impact?.needs_screenshot_update) impactTags.push('需更新截圖');
  if (impactTags.length > 0) {
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `影響：${impactTags.join('、')}`,
            color: COLORS.MODIFIED,
            font: FONT,
            italics: true,
          }),
        ],
      }),
    );
  }

  // Source refs
  out.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: '來源：',
          bold: true,
          color: COLORS.TEXT_MUTED,
          font: FONT,
          size: 18,
        }),
      ],
    }),
  );
  intent.source_refs.forEach((r) => {
    const parts = [r.source_file];
    if (r.location) parts.push(r.location);
    if (r.excerpt) parts.push(`「${r.excerpt}」`);
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        indent: { left: 200 },
        children: [
          new TextRun({
            text: '· ' + parts.join(' · '),
            color: COLORS.TEXT_MUTED,
            font: FONT,
            size: 18,
          }),
        ],
      }),
    );
  });

  return out;
}

function labelLine(
  label: string,
  value: string,
  color: string,
  fns: { Paragraph: typeof import('docx').Paragraph; TextRun: typeof import('docx').TextRun },
): InstanceType<typeof import('docx').Paragraph> {
  const { Paragraph, TextRun } = fns;
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({
        text: `${label}：`,
        bold: true,
        color: COLORS.TEXT_MUTED,
        font: FONT,
        size: 18,
      }),
      new TextRun({ text: value, color, font: FONT, size: 18 }),
    ],
  });
}

// ============================================================
// Stat helpers
// ============================================================

interface IntentStats {
  total: number;
  applied: number;
  skipped: number;
  added: number;
  modified: number;
  removed: number;
  reordered: number;
}

function sumStats(
  intents: ChangeIntent[],
  skipped: Array<{ intent: ChangeIntent; reason: string }>,
): IntentStats {
  const stats: IntentStats = {
    total: intents.length + skipped.length,
    applied: intents.length,
    skipped: skipped.length,
    added: 0,
    modified: 0,
    removed: 0,
    reordered: 0,
  };
  for (const i of intents) {
    if (i.type.startsWith('add_')) stats.added += 1;
    else if (i.type.startsWith('modify_')) stats.modified += 1;
    else if (i.type.startsWith('remove_')) stats.removed += 1;
    else if (i.type === 'reorder_step') stats.reordered += 1;
  }
  return stats;
}

function countAffectedSteps(intents: ChangeIntent[]): number {
  const ids = new Set<string>();
  for (const i of intents) {
    if (i.target.step_id) ids.add(i.target.step_id);
    i.impact?.affected_steps?.forEach((id) => ids.add(id));
  }
  return ids.size;
}

function countAffectedSections(intents: ChangeIntent[]): number {
  const ids = new Set<string>();
  for (const i of intents) {
    if (i.target.section_id) ids.add(i.target.section_id);
    i.impact?.affected_sections?.forEach((id) => ids.add(id));
  }
  return ids.size;
}
