import type { IR, Step, TroubleshootingItem, GlossaryTerm } from '@/core/ir/schemas';

export type ImageResolver = (imageId: string) => Promise<{
  bytes: Uint8Array;
  contentType: string;
} | null>;

export interface PdfRenderOptions {
  resolveImage?: ImageResolver;
  /**
   * 中文字型 URL（TTF/OTF）。Vite 環境會在第一次渲染時下載並快取。
   * 預設指向 jsDelivr 上的 Noto Sans CJK TC（首次 ~16MB；之後瀏覽器快取）。
   * 若在離線/受限環境，可指向自建的 CDN 或 public/fonts 內的檔案。
   */
  fontUrl?: string;
}

const DEFAULT_FONT_URL =
  'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf';

// PDF 專用 RGB 0–1
const RGB = {
  PRIMARY: { r: 0x1a / 255, g: 0x2b / 255, b: 0x4a / 255 },
  PRIMARY_LIGHT: { r: 0x4a / 255, g: 0x7a / 255, b: 0xb8 / 255 },
  ACCENT: { r: 0x4a / 255, g: 0x3a / 255, b: 0x6e / 255 },
  ACCENT_LIGHT: { r: 0x6e / 255, g: 0x54 / 255, b: 0xac / 255 },
  TEXT: { r: 0x1f / 255, g: 0x29 / 255, b: 0x37 / 255 },
  TEXT_MUTED: { r: 0x6b / 255, g: 0x72 / 255, b: 0x80 / 255 },
  BG_CARD: { r: 0xf9 / 255, g: 0xfa / 255, b: 0xfb / 255 },
  BORDER: { r: 0xe5 / 255, g: 0xe7 / 255, b: 0xeb / 255 },
  WARNING: { r: 0xf5 / 255, g: 0x9e / 255, b: 0x0b / 255 },
  DANGER: { r: 0xef / 255, g: 0x44 / 255, b: 0x44 / 255 },
  SUCCESS: { r: 0x10 / 255, g: 0xb9 / 255, b: 0x81 / 255 },
} as const;

/** 字型 bytes 共用記憶體快取，避免同 session 重複下載 */
let cachedFontBytes: Uint8Array | null = null;
let cachedFontPromise: Promise<Uint8Array> | null = null;

async function loadFontBytes(url: string): Promise<Uint8Array> {
  if (cachedFontBytes) return cachedFontBytes;
  if (cachedFontPromise) return cachedFontPromise;
  cachedFontPromise = (async () => {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`字型下載失敗 (${resp.status})：${url}`);
    }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    cachedFontBytes = bytes;
    return bytes;
  })();
  return cachedFontPromise;
}

/**
 * 從 IR 產出 PDF Blob。
 *
 * 設計：A4 直式，左/右/上/下 50pt 邊距。
 * 內容布局與 docx 一致：封面 → 目錄 → 章節 → 步驟卡片 → troubleshooting → glossary。
 */
export async function renderPdf(
  ir: IR,
  options: PdfRenderOptions = {},
): Promise<Blob> {
  const pdfLib = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const {
    PDFDocument,
    StandardFonts,
    rgb,
    PageSizes,
  } = pdfLib;

  const doc = await PDFDocument.create();
  doc.setTitle(ir.meta.title);
  doc.setAuthor('CloudOrange · 雲力橘子');
  doc.setCreator('SOP Web');
  doc.registerFontkit(fontkit);

  let bodyFont: import('pdf-lib').PDFFont;
  let boldFont: import('pdf-lib').PDFFont;
  let usingFallback = false;

  // 嘗試載入 CJK 字型；失敗時退回 Helvetica（英文友善但中文會缺字）
  try {
    const fontBytes = await loadFontBytes(options.fontUrl ?? DEFAULT_FONT_URL);
    // OTF/TTF 不分粗細，這裡 bold 用同一份字並由 pdf-lib drawText 加粗（fake bold）
    bodyFont = await doc.embedFont(fontBytes, { subset: true });
    boldFont = bodyFont;
  } catch (err) {
    console.warn('[pdf] CJK 字型下載失敗，退回 Helvetica：', err);
    bodyFont = await doc.embedFont(StandardFonts.Helvetica);
    boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    usingFallback = true;
  }

  // ---------- canvas / cursor 工具 ----------

  const PAGE_W = PageSizes.A4[0];
  const PAGE_H = PageSizes.A4[1];
  const MARGIN = 50;
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  let page = doc.addPage(PageSizes.A4);
  let y = PAGE_H - MARGIN;

  function ensureSpace(needed: number): void {
    if (y - needed < MARGIN) {
      page = doc.addPage(PageSizes.A4);
      y = PAGE_H - MARGIN;
    }
  }

  function color(c: { r: number; g: number; b: number }) {
    return rgb(c.r, c.g, c.b);
  }

  /**
   * 把長字串依寬度折行。bodyFont 不一定支援每個字元，所以用簡易等寬估算當保險。
   */
  function wrapText(
    text: string,
    fontObj: import('pdf-lib').PDFFont,
    fontSize: number,
    maxWidth: number,
  ): string[] {
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      let current = '';
      for (const ch of para) {
        const next = current + ch;
        let width: number;
        try {
          width = fontObj.widthOfTextAtSize(next, fontSize);
        } catch {
          // CJK 字符不在 Helvetica fallback 中時會丟錯
          width = next.length * fontSize * 0.6;
        }
        if (width > maxWidth && current.length > 0) {
          lines.push(current);
          current = ch;
        } else {
          current = next;
        }
      }
      if (current.length > 0) lines.push(current);
      else lines.push('');
    }
    return lines;
  }

  /**
   * 安全 drawText：碰到字型不支援的字符時改畫 placeholder。
   */
  function safeDrawText(
    text: string,
    opts: {
      x: number;
      y: number;
      size: number;
      font: import('pdf-lib').PDFFont;
      color: ReturnType<typeof color>;
    },
  ): void {
    try {
      page.drawText(text, opts);
    } catch {
      // 萬一字型不支援；換成「□」之類的 placeholder
      const safe = text
        .split('')
        .map((c) => {
          try {
            opts.font.widthOfTextAtSize(c, opts.size);
            return c;
          } catch {
            return '?';
          }
        })
        .join('');
      page.drawText(safe, opts);
    }
  }

  function drawWrapped(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof color>;
      indent?: number;
      lineHeight?: number;
      bottomMargin?: number;
    } = {},
  ): void {
    if (!text) return;
    const size = opts.size ?? 11;
    const fontObj = opts.bold ? boldFont : bodyFont;
    const lh = opts.lineHeight ?? size * 1.4;
    const indent = opts.indent ?? 0;
    const lines = wrapText(text, fontObj, size, CONTENT_W - indent);
    for (const line of lines) {
      ensureSpace(lh);
      safeDrawText(line, {
        x: MARGIN + indent,
        y: y - size,
        size,
        font: fontObj,
        color: opts.color ?? color(RGB.TEXT),
      });
      y -= lh;
    }
    if (opts.bottomMargin) y -= opts.bottomMargin;
  }

  function drawHr(): void {
    ensureSpace(20);
    page.drawLine({
      start: { x: MARGIN, y: y - 4 },
      end: { x: PAGE_W - MARGIN, y: y - 4 },
      thickness: 0.5,
      color: color(RGB.BORDER),
    });
    y -= 16;
  }

  function newPage(): void {
    page = doc.addPage(PageSizes.A4);
    y = PAGE_H - MARGIN;
  }

  // ---------- cover ----------

  y -= 200;
  drawWrapped('CloudOrange · 雲力橘子', {
    size: 12,
    color: color(RGB.ACCENT),
    bottomMargin: 20,
  });
  drawWrapped(ir.meta.title, {
    size: 28,
    bold: true,
    color: color(RGB.PRIMARY),
    bottomMargin: 8,
  });
  drawWrapped('內訓 SOP', {
    size: 12,
    color: color(RGB.TEXT_MUTED),
    bottomMargin: 40,
  });
  drawWrapped(`適用對象：${ir.meta.target_audience}`, {
    size: 11,
    color: color(RGB.TEXT),
    bottomMargin: 4,
  });
  if (ir.meta.estimated_duration_minutes) {
    drawWrapped(`預估時間：${ir.meta.estimated_duration_minutes} 分鐘`, {
      size: 11,
      color: color(RGB.TEXT),
      bottomMargin: 4,
    });
  }
  if (ir.meta.difficulty) {
    drawWrapped(`難度：${ir.meta.difficulty}`, {
      size: 11,
      color: color(RGB.TEXT),
      bottomMargin: 4,
    });
  }
  drawWrapped(`版本 ${ir.version} · 更新 ${formatDate(ir.meta.updated_at)}`, {
    size: 9,
    color: color(RGB.TEXT_MUTED),
    bottomMargin: 0,
  });

  if (usingFallback) {
    y -= 30;
    drawWrapped(
      '⚠️  CJK font load failed, falling back to ASCII rendering. Chinese characters may appear as placeholders. See Word version for full CJK support.',
      { size: 8, color: color(RGB.WARNING) },
    );
  }

  newPage();

  // ---------- TOC ----------

  drawWrapped('目錄', {
    size: 18,
    bold: true,
    color: color(RGB.PRIMARY),
    bottomMargin: 14,
  });
  drawHr();
  for (let i = 0; i < ir.sections.length; i++) {
    const s = [...ir.sections].sort((a, b) => a.order - b.order)[i]!;
    drawWrapped(`${i + 1}. ${s.title}`, {
      size: 11,
      color: color(RGB.TEXT),
      bottomMargin: 4,
    });
  }
  newPage();

  // ---------- sections + steps ----------

  const sortedSections = [...ir.sections].sort((a, b) => a.order - b.order);
  for (const section of sortedSections) {
    drawWrapped(`${section.order + 1}. ${section.title}`, {
      size: 18,
      bold: true,
      color: color(RGB.PRIMARY),
      bottomMargin: 6,
    });
    if (section.description) {
      drawWrapped(section.description, {
        size: 11,
        color: color(RGB.TEXT_MUTED),
        bottomMargin: 8,
      });
    }
    drawHr();

    const stepsInSection = ir.steps
      .filter((s) => s.section_id === section.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const step of stepsInSection) {
      await drawStepCard(step);
    }
  }

  // 孤兒 steps
  const sectionIds = new Set(ir.sections.map((s) => s.id));
  const orphans = ir.steps.filter((s) => !sectionIds.has(s.section_id));
  if (orphans.length > 0) {
    newPage();
    drawWrapped('未分類步驟', {
      size: 18,
      bold: true,
      color: color(RGB.PRIMARY),
      bottomMargin: 14,
    });
    for (const step of orphans) {
      await drawStepCard(step);
    }
  }

  // ---------- troubleshooting ----------

  if (ir.troubleshooting && ir.troubleshooting.length > 0) {
    newPage();
    drawWrapped('Troubleshooting', {
      size: 20,
      bold: true,
      color: color(RGB.ACCENT),
      bottomMargin: 14,
    });
    drawHr();
    for (const t of ir.troubleshooting) {
      drawTroubleshooting(t);
    }
  }

  // ---------- glossary ----------

  if (ir.glossary && ir.glossary.length > 0) {
    newPage();
    drawWrapped('術語表', {
      size: 20,
      bold: true,
      color: color(RGB.ACCENT),
      bottomMargin: 14,
    });
    drawHr();
    for (const g of ir.glossary) {
      drawGlossary(g);
    }
  }

  const bytes = await doc.save();
  // pdf-lib 回傳的 Uint8Array<ArrayBufferLike>；複製到一個正規的 ArrayBuffer 給 Blob
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new Blob([buf], { type: 'application/pdf' });

  // ============================================================
  // 子流程
  // ============================================================

  async function drawStepCard(step: Step): Promise<void> {
    ensureSpace(60);
    // 卡片左側 accent bar
    const cardTop = y;
    drawWrapped(step.title + (step.needs_human_input ? '   ⚠️ 待確認' : ''), {
      size: 14,
      bold: true,
      color: color(RGB.PRIMARY),
      indent: 12,
      bottomMargin: 4,
    });

    if (step.purpose) {
      drawWrapped(`為什麼  ${step.purpose}`, {
        size: 11,
        color: color(RGB.TEXT),
        indent: 12,
        bottomMargin: 6,
      });
    }
    if (step.preconditions && step.preconditions.length > 0) {
      drawWrapped('前置條件', { size: 11, bold: true, color: color(RGB.PRIMARY), indent: 12, bottomMargin: 4 });
      for (const p of step.preconditions) {
        drawWrapped(`•  ${p}`, { size: 11, color: color(RGB.TEXT), indent: 24, bottomMargin: 2 });
      }
    }
    if (step.actions.length > 0) {
      drawWrapped('操作', { size: 11, bold: true, color: color(RGB.PRIMARY), indent: 12, bottomMargin: 4 });
      for (let i = 0; i < step.actions.length; i++) {
        const action = step.actions[i]!;
        drawWrapped(`${i + 1}.  ${action.text}`, {
          size: 11,
          color: color(RGB.TEXT),
          indent: 24,
          bottomMargin: 2,
        });
        if (action.command) {
          drawWrapped(action.command, {
            size: 9,
            color: color(RGB.PRIMARY),
            indent: 36,
            bottomMargin: 4,
          });
        }
        if (action.screenshot_refs && action.screenshot_refs.length > 0 && options.resolveImage) {
          for (const imageId of action.screenshot_refs) {
            await drawScreenshot(imageId);
          }
        }
      }
    }
    if (step.expected_result) {
      drawWrapped(`預期結果  ${step.expected_result}`, {
        size: 11,
        color: color(RGB.SUCCESS),
        indent: 12,
        bottomMargin: 6,
      });
    }
    if (step.tips && step.tips.length > 0) {
      drawWrapped('Tips', { size: 11, bold: true, color: color(RGB.ACCENT), indent: 12, bottomMargin: 4 });
      for (const t of step.tips) {
        drawWrapped(`💡 ${t}`, { size: 11, color: color(RGB.TEXT), indent: 24, bottomMargin: 2 });
      }
    }
    if (step.warnings && step.warnings.length > 0) {
      drawWrapped('警示', { size: 11, bold: true, color: color(RGB.WARNING), indent: 12, bottomMargin: 4 });
      for (const w of step.warnings) {
        drawWrapped(`⚠️ ${w}`, { size: 11, color: color(RGB.TEXT), indent: 24, bottomMargin: 2 });
      }
    }
    if (step.common_mistakes && step.common_mistakes.length > 0) {
      drawWrapped('新人常犯', { size: 11, bold: true, color: color(RGB.DANGER), indent: 12, bottomMargin: 4 });
      for (const m of step.common_mistakes) {
        drawWrapped(`•  ${m}`, { size: 11, color: color(RGB.TEXT), indent: 24, bottomMargin: 2 });
      }
    }

    // 卡片左邊的 accent bar
    const cardBottom = y;
    page.drawRectangle({
      x: MARGIN,
      y: cardBottom,
      width: 4,
      height: cardTop - cardBottom,
      color: color(RGB.PRIMARY_LIGHT),
    });

    y -= 12; // 卡片之間的 padding
  }

  async function drawScreenshot(imageId: string): Promise<void> {
    if (!options.resolveImage) return;
    try {
      const img = await options.resolveImage(imageId);
      if (!img) return;
      let pdfImage;
      if (img.contentType === 'image/png') {
        pdfImage = await doc.embedPng(img.bytes);
      } else if (img.contentType === 'image/jpeg' || img.contentType === 'image/jpg') {
        pdfImage = await doc.embedJpg(img.bytes);
      } else {
        // pdf-lib 不直接支援 webp；當作不能嵌入
        drawWrapped(`[截圖 ${imageId} - 不支援的格式 ${img.contentType}]`, {
          size: 9,
          color: color(RGB.TEXT_MUTED),
          indent: 24,
        });
        return;
      }
      const maxWidth = CONTENT_W - 24;
      const ratio = pdfImage.width / pdfImage.height;
      const drawWidth = Math.min(maxWidth, 360);
      const drawHeight = drawWidth / ratio;
      ensureSpace(drawHeight + 8);
      page.drawImage(pdfImage, {
        x: MARGIN + 24,
        y: y - drawHeight,
        width: drawWidth,
        height: drawHeight,
      });
      y -= drawHeight + 8;
    } catch (err) {
      console.warn('[pdf] image embed failed', imageId, err);
      drawWrapped(`[截圖載入失敗：${imageId}]`, {
        size: 9,
        color: color(RGB.TEXT_MUTED),
        indent: 24,
      });
    }
  }

  function drawTroubleshooting(t: TroubleshootingItem): void {
    drawWrapped(`症狀：${t.symptom}${t.severity ? `   (${t.severity})` : ''}`, {
      size: 12,
      bold: true,
      color: color(RGB.DANGER),
      bottomMargin: 4,
    });
    if (t.cause) {
      drawWrapped(`原因  ${t.cause}`, {
        size: 11,
        color: color(RGB.TEXT),
        bottomMargin: 2,
      });
    }
    if (t.solution) {
      drawWrapped(`解法  ${t.solution}`, {
        size: 11,
        color: color(RGB.SUCCESS),
        bottomMargin: 8,
      });
    }
    drawHr();
  }

  function drawGlossary(g: GlossaryTerm): void {
    drawWrapped(
      `${g.term}${g.aliases && g.aliases.length > 0 ? `  (${g.aliases.join(' / ')})` : ''}`,
      {
        size: 12,
        bold: true,
        color: color(RGB.PRIMARY),
        bottomMargin: 2,
      },
    );
    drawWrapped(g.definition, {
      size: 11,
      color: color(RGB.TEXT),
      bottomMargin: 8,
    });
  }
}

function formatDate(iso: string): string {
  return iso.split('T')[0] ?? iso;
}
