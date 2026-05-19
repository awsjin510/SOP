import type { IR, Step, TroubleshootingItem, GlossaryTerm } from '@/core/ir/schemas';

/**
 * 圖片資料解析函式：給定 image_id 回傳 bytes 與 contentType。
 * pipeline 用「先下載 storage → 再餵給渲染器」實作。
 */
export type ImageResolver = (imageId: string) => Promise<{
  bytes: Uint8Array;
  contentType: string;
} | null>;

export interface RenderOptions {
  resolveImage?: ImageResolver;
}

// 設計 token（與 design-system.md 對齊）— hex 不含 #
const COLORS = {
  PRIMARY: '1A2B4A',
  PRIMARY_LIGHT: '4A7AB8',
  ACCENT: '4A3A6E',
  ACCENT_LIGHT: '6E54AC',
  TEXT: '1F2937',
  TEXT_MUTED: '6B7280',
  BG_CARD: 'F9FAFB',
  BORDER: 'E5E7EB',
  WARNING: 'F59E0B',
  DANGER: 'EF4444',
  SUCCESS: '10B981',
} as const;

const FONT_BODY = 'Noto Sans TC';
const FONT_HEADING = 'Noto Sans TC';

/**
 * 把 IR 渲染成 Word 文件。
 *
 * - 封面頁（標題、適用對象、版本、時間）
 * - 每個 section 一個 H1
 * - 每個 step 排版成「卡片」（用表格實現邊框與底色）
 * - 截圖以 image_id 取自 imageAssets，下載 bytes 後嵌入
 * - Troubleshooting / Glossary 各自區塊
 */
export async function renderDocx(
  ir: IR,
  options: RenderOptions = {},
): Promise<Blob> {
  // lazy import — docx 套件較大
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
    PageBreak,
    ImageRun,
    TabStopType,
    TabStopPosition,
    convertInchesToTwip,
    ShadingType,
  } = docx;

  // 資源解析快取，避免同一張圖載多次
  const imageCache = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async function loadImage(imageId: string) {
    if (imageCache.has(imageId)) return imageCache.get(imageId)!;
    if (!options.resolveImage) return null;
    const data = await options.resolveImage(imageId);
    if (data) imageCache.set(imageId, data);
    return data;
  }

  // ---------- helpers ----------

  const makeText = (
    text: string,
    opts: { bold?: boolean; color?: string; size?: number; italic?: boolean } = {},
  ): InstanceType<typeof TextRun> =>
    new TextRun({
      text,
      bold: opts.bold,
      italics: opts.italic,
      color: opts.color,
      size: opts.size,
      font: FONT_BODY,
    });

  const heading = (
    text: string,
    level: 'h1' | 'h2' | 'h3' | 'h4' = 'h2',
    color: string = COLORS.PRIMARY,
  ): InstanceType<typeof Paragraph> =>
    new Paragraph({
      heading:
        level === 'h1'
          ? HeadingLevel.HEADING_1
          : level === 'h2'
            ? HeadingLevel.HEADING_2
            : level === 'h3'
              ? HeadingLevel.HEADING_3
              : HeadingLevel.HEADING_4,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text,
          bold: true,
          color,
          font: FONT_HEADING,
        }),
      ],
    });

  const para = (
    text: string,
    opts: { bold?: boolean; color?: string; italic?: boolean } = {},
  ): InstanceType<typeof Paragraph> =>
    new Paragraph({
      spacing: { after: 80 },
      children: [makeText(text, opts)],
    });

  const bulletList = (
    items: string[],
    bullet: string = '•',
  ): InstanceType<typeof Paragraph>[] =>
    items.map(
      (item) =>
        new Paragraph({
          indent: { left: convertInchesToTwip(0.25) },
          spacing: { after: 60 },
          children: [makeText(`${bullet}  ${item}`)],
        }),
    );

  // ---------- cover page ----------

  const coverChildren: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [
        new TextRun({
          text: 'CloudForce · 雲力橘子',
          size: 24,
          color: COLORS.ACCENT,
          font: FONT_HEADING,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 240 },
      children: [
        new TextRun({
          text: ir.meta.title,
          bold: true,
          size: 56,
          color: COLORS.PRIMARY,
          font: FONT_HEADING,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 600 },
      children: [
        new TextRun({
          text: '內訓 SOP',
          size: 20,
          color: COLORS.TEXT_MUTED,
          font: FONT_HEADING,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      children: [
        makeText('適用對象：', { bold: true, color: COLORS.PRIMARY }),
        makeText(ir.meta.target_audience),
      ],
    }),
  ];

  if (ir.meta.estimated_duration_minutes) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          makeText('預估時間：', { bold: true, color: COLORS.PRIMARY }),
          makeText(`${ir.meta.estimated_duration_minutes} 分鐘`),
        ],
      }),
    );
  }

  if (ir.meta.difficulty) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          makeText('難度：', { bold: true, color: COLORS.PRIMARY }),
          makeText(ir.meta.difficulty),
        ],
      }),
    );
  }

  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 60 },
      children: [
        makeText(`版本 ${ir.version}`, { color: COLORS.TEXT_MUTED }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [
        makeText(formatDate(ir.meta.updated_at), { color: COLORS.TEXT_MUTED }),
      ],
    }),
    // 強制換頁
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ---------- TOC ----------

  const tocChildren: InstanceType<typeof Paragraph>[] = [heading('目錄', 'h1')];
  ir.sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((s, idx) => {
      tocChildren.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          spacing: { after: 60 },
          children: [
            makeText(`${idx + 1}. ${s.title}`, { color: COLORS.TEXT }),
          ],
        }),
      );
    });
  tocChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // ---------- sections + steps ----------

  const bodyChildren: (
    | InstanceType<typeof Paragraph>
    | InstanceType<typeof Table>
  )[] = [];

  const sortedSections = [...ir.sections].sort((a, b) => a.order - b.order);

  for (const section of sortedSections) {
    bodyChildren.push(heading(`${section.order + 1}. ${section.title}`, 'h1'));
    if (section.description) {
      bodyChildren.push(para(section.description, { italic: true }));
    }
    const stepsInSection = ir.steps
      .filter((s) => s.section_id === section.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const step of stepsInSection) {
      const cells = await renderStepCard(step);
      bodyChildren.push(makeStepCardTable(cells));
      bodyChildren.push(new Paragraph({ spacing: { after: 200 } }));
    }
  }

  // 沒指派 section 的孤兒
  const sectionIds = new Set(ir.sections.map((s) => s.id));
  const orphanSteps = ir.steps.filter((s) => !sectionIds.has(s.section_id));
  if (orphanSteps.length > 0) {
    bodyChildren.push(heading('未分類步驟', 'h1'));
    for (const step of orphanSteps) {
      const cells = await renderStepCard(step);
      bodyChildren.push(makeStepCardTable(cells));
    }
  }

  // ---------- troubleshooting ----------

  if (ir.troubleshooting && ir.troubleshooting.length > 0) {
    bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));
    bodyChildren.push(heading('Troubleshooting', 'h1', COLORS.ACCENT));
    for (const t of ir.troubleshooting) {
      bodyChildren.push(...renderTroubleshooting(t));
    }
  }

  // ---------- glossary ----------

  if (ir.glossary && ir.glossary.length > 0) {
    bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));
    bodyChildren.push(heading('術語表', 'h1', COLORS.ACCENT));
    for (const g of ir.glossary) {
      bodyChildren.push(...renderGlossary(g));
    }
  }

  // ---------- assemble ----------

  const doc = new Document({
    creator: 'CloudForce · 雲力橘子',
    title: ir.meta.title,
    styles: {
      default: {
        document: {
          run: { font: FONT_BODY, size: 22 }, // 11pt = 22 half-points
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: [...coverChildren, ...tocChildren, ...bodyChildren],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;

  // ============================================================
  // step card rendering（用 table 模擬卡片）
  // ============================================================

  async function renderStepCard(step: Step): Promise<
    InstanceType<typeof Paragraph>[]
  > {
    const out: InstanceType<typeof Paragraph>[] = [];

    out.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: step.title,
            bold: true,
            size: 28,
            color: COLORS.PRIMARY,
            font: FONT_HEADING,
          }),
          ...(step.needs_human_input
            ? [makeText('  ⚠️ 待確認', { color: COLORS.WARNING, bold: true })]
            : []),
        ],
      }),
    );

    if (step.purpose) {
      out.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            makeText('為什麼  ', { bold: true, color: COLORS.ACCENT }),
            makeText(step.purpose),
          ],
        }),
      );
    }

    if (step.preconditions && step.preconditions.length > 0) {
      out.push(para('前置條件', { bold: true, color: COLORS.PRIMARY }));
      out.push(...bulletList(step.preconditions));
    }

    if (step.actions.length > 0) {
      out.push(para('操作', { bold: true, color: COLORS.PRIMARY }));
      for (let i = 0; i < step.actions.length; i++) {
        const action = step.actions[i]!;
        out.push(
          new Paragraph({
            indent: { left: convertInchesToTwip(0.25) },
            spacing: { after: 40 },
            children: [
              makeText(`${i + 1}.  `, { bold: true, color: COLORS.ACCENT }),
              makeText(action.text),
            ],
          }),
        );
        if (action.command) {
          out.push(
            new Paragraph({
              indent: { left: convertInchesToTwip(0.5) },
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: action.command,
                  font: 'Consolas',
                  size: 20,
                  color: '0E1828',
                }),
              ],
              shading: {
                type: ShadingType.SOLID,
                color: 'F3F4F6',
                fill: 'F3F4F6',
              },
            }),
          );
        }
        // 嵌入截圖
        if (action.screenshot_refs && action.screenshot_refs.length > 0) {
          for (const imageId of action.screenshot_refs) {
            const imgData = await loadImage(imageId);
            if (!imgData) continue;
            try {
              out.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 120, after: 120 },
                  children: [
                    new ImageRun({
                      data: imgData.bytes,
                      transformation: { width: 500, height: 300 },
                      type:
                        imgData.contentType === 'image/jpeg'
                          ? 'jpg'
                          : imgData.contentType === 'image/webp'
                            ? 'png' // docx ImageRun 不直接支援 webp，當 png 嘗試
                            : 'png',
                    }),
                  ],
                }),
              );
            } catch (err) {
              // 嵌入失敗時退回顯示 image_id
              out.push(
                para(`[截圖載入失敗：${imageId}]`, { color: COLORS.TEXT_MUTED, italic: true }),
              );
              console.warn('[docx] image embed failed', imageId, err);
            }
          }
        }
      }
    }

    if (step.expected_result) {
      out.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          children: [
            makeText('預期結果  ', { bold: true, color: COLORS.SUCCESS }),
            makeText(step.expected_result),
          ],
        }),
      );
    }

    if (step.tips && step.tips.length > 0) {
      out.push(para('Tips', { bold: true, color: COLORS.ACCENT }));
      out.push(...bulletList(step.tips, '💡'));
    }

    if (step.warnings && step.warnings.length > 0) {
      out.push(para('警示', { bold: true, color: COLORS.WARNING }));
      out.push(...bulletList(step.warnings, '⚠️'));
    }

    if (step.common_mistakes && step.common_mistakes.length > 0) {
      out.push(para('新人常犯', { bold: true, color: COLORS.DANGER }));
      out.push(...bulletList(step.common_mistakes));
    }

    if (step.needs_human_input && step.human_input_reason) {
      out.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [
            makeText(`⚠️ 待人工確認：${step.human_input_reason}`, {
              italic: true,
              color: COLORS.WARNING,
            }),
          ],
        }),
      );
    }

    return out;
  }

  function makeStepCardTable(
    children: InstanceType<typeof Paragraph>[],
  ): InstanceType<typeof Table> {
    const cellBorder = {
      style: BorderStyle.SINGLE,
      size: 4,
      color: COLORS.BORDER,
    };
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: {
                type: ShadingType.SOLID,
                color: COLORS.BG_CARD,
                fill: COLORS.BG_CARD,
              },
              borders: {
                top: cellBorder,
                bottom: cellBorder,
                left: { ...cellBorder, color: COLORS.PRIMARY_LIGHT, size: 12 },
                right: cellBorder,
              },
              margins: {
                top: 200,
                bottom: 200,
                left: 240,
                right: 240,
              },
              children,
            }),
          ],
        }),
      ],
    });
  }

  function renderTroubleshooting(t: TroubleshootingItem): InstanceType<typeof Paragraph>[] {
    const out: InstanceType<typeof Paragraph>[] = [];
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [
          new TextRun({
            text: `症狀：${t.symptom}`,
            bold: true,
            color: COLORS.DANGER,
            font: FONT_HEADING,
            size: 26,
          }),
          ...(t.severity
            ? [makeText(`  ${t.severity}`, { color: COLORS.WARNING })]
            : []),
        ],
      }),
    );
    if (t.cause) {
      out.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            makeText('原因  ', { bold: true, color: COLORS.PRIMARY }),
            makeText(t.cause),
          ],
        }),
      );
    }
    if (t.solution) {
      out.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            makeText('解法  ', { bold: true, color: COLORS.SUCCESS }),
            makeText(t.solution),
          ],
        }),
      );
    }
    return out;
  }

  function renderGlossary(g: GlossaryTerm): InstanceType<typeof Paragraph>[] {
    return [
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({
            text: g.term,
            bold: true,
            color: COLORS.PRIMARY,
            font: FONT_HEADING,
            size: 24,
          }),
          ...(g.aliases && g.aliases.length > 0
            ? [
                makeText(`  (${g.aliases.join(' / ')})`, {
                  color: COLORS.TEXT_MUTED,
                }),
              ]
            : []),
        ],
      }),
      para(g.definition),
    ];
  }
}

function formatDate(iso: string): string {
  return iso.split('T')[0] ?? iso;
}
