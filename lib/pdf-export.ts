import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { PDFDocument, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { AnchorRect } from "@/lib/db/queries";

export type ExportAnnotation = {
  authorName: string;
  page: number;
  x: number;
  y: number;
  shape: string;
  color: string;
  body: string;
  visibility: "public" | "private";
  anchorRects: AnchorRect[] | null;
};

const DRAWING_VIEWBOX = { w: 260, h: 150 };

function parseDrawingPaths(body: string): string[] | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed && Array.isArray(parsed.paths)) return parsed.paths.filter((p: unknown) => typeof p === "string");
  } catch {
    /* not a drawing payload */
  }
  return null;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = parseInt(normalized, 16) || 0;
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\r/g, "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/**
 * Stamps every visible sticker onto its page (a numbered dot, plus a soft
 * highlight over any anchored passage) and appends a readable "Пометки"
 * appendix with the full text of each one, in reading order.
 */
export async function exportPdfWithAnnotations(
  filePath: string,
  annotations: ExportAnnotation[],
  documentTitle: string,
): Promise<Uint8Array> {
  const bytes = await fs.readFile(filePath);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  pdf.registerFontkit(fontkit);

  const fontsDir = path.join(process.cwd(), "assets", "fonts");
  const [regularBytes, boldBytes] = await Promise.all([
    fs.readFile(path.join(fontsDir, "pt-sans-regular.ttf")),
    fs.readFile(path.join(fontsDir, "pt-sans-bold.ttf")),
  ]);
  const font = await pdf.embedFont(regularBytes);
  const boldFont = await pdf.embedFont(boldBytes);

  const pageCount = pdf.getPageCount();
  const numbered: [ExportAnnotation, number][] = [];
  let counter = 0;

  for (const annotation of annotations) {
    if (annotation.page < 1 || annotation.page > pageCount) continue;
    counter += 1;
    numbered.push([annotation, counter]);

    const page = pdf.getPage(annotation.page - 1);
    const { width, height } = page.getSize();
    const color = hexToRgb(annotation.color);

    if (annotation.anchorRects) {
      for (const rect of annotation.anchorRects) {
        page.drawRectangle({
          x: (rect.x / 1000) * width,
          y: height - (rect.y / 1000) * height - (rect.h / 1000) * height,
          width: (rect.w / 1000) * width,
          height: (rect.h / 1000) * height,
          color,
          opacity: 0.22,
        });
      }
    }

    const cx = (annotation.x / 1000) * width;
    const cy = height - (annotation.y / 1000) * height;
    page.drawCircle({ x: cx, y: cy, size: 7.5, color, borderColor: rgb(1, 1, 1), borderWidth: 1 });
    const label = String(counter);
    page.drawText(label, {
      x: cx - font.widthOfTextAtSize(label, 7) / 2,
      y: cy - 2.5,
      size: 7,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
  }

  if (numbered.length > 0) {
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 56;
    const maxWidth = pageWidth - margin * 2;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    function ensureSpace(lineHeight: number) {
      if (cursorY - lineHeight < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        cursorY = pageHeight - margin;
      }
    }

    page.drawText(`Пометки — ${documentTitle}`, {
      x: margin,
      y: cursorY,
      size: 16,
      font: boldFont,
      color: rgb(0.09, 0.13, 0.17),
      maxWidth,
    });
    cursorY -= 30;

    for (const [annotation, number] of numbered) {
      ensureSpace(20);
      const header = `${number}. стр. ${annotation.page} · ${annotation.authorName} · ${
        annotation.visibility === "private" ? "лично" : "публично"
      }`;
      page.drawText(header, { x: margin, y: cursorY, size: 10.5, font: boldFont, color: hexToRgb(annotation.color) });
      cursorY -= 16;

      if (annotation.shape === "drawing") {
        const drawingPaths = parseDrawingPaths(annotation.body);
        if (drawingPaths && drawingPaths.length) {
          const scale = Math.min(1, maxWidth / DRAWING_VIEWBOX.w);
          const drawnHeight = DRAWING_VIEWBOX.h * scale;
          ensureSpace(drawnHeight + 6);
          const color = hexToRgb(annotation.color);
          const top = cursorY;
          for (const d of drawingPaths) {
            page.drawSvgPath(d, {
              x: margin,
              y: top,
              scale,
              borderColor: color,
              borderWidth: 1.4 / scale,
            });
          }
          cursorY -= drawnHeight + 6;
        } else {
          page.drawText("(пустой рисунок)", { x: margin, y: cursorY, size: 10.5, font, color: rgb(0.1, 0.1, 0.1) });
          cursorY -= 14;
        }
      } else {
        const bodyText =
          annotation.shape === "formula" ? `Формула: ${annotation.body || "—"}` : annotation.body || "(без текста)";
        for (const line of wrapText(bodyText, font, 10.5, maxWidth)) {
          ensureSpace(14);
          page.drawText(line, { x: margin, y: cursorY, size: 10.5, font, color: rgb(0.1, 0.1, 0.1) });
          cursorY -= 14;
        }
      }
      cursorY -= 10;
    }
  }

  return pdf.save();
}
