import { execFile } from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Converts a DjVu file to a PDF using djvulibre's `ddjvu`, so the same
 * pdf.js-based reader can be used for every scanned book regardless of the
 * original format. Requires `ddjvu` on the server
 * (`apt install djvulibre-bin` / `brew install djvulibre`).
 *
 * Output is verified (magic bytes + pdfinfo) because a half-written PDF from
 * a killed/failed ddjvu is what made "DJVU books" look randomly broken in
 * the browser after bulk imports.
 */
export async function convertDjvuToPdf(inputPath: string, outputPath: string) {
  const attempts: string[][] = [
    // Balanced: readable scans without multi‑hundred‑MB image PDFs that choke pdf.js
    ["-format=pdf", "-quality=85", inputPath, outputPath],
    // Fallback: lossless-ish if the first pass fails on odd DjVu bundles
    ["-format=pdf", "-quality=100", inputPath, outputPath],
    ["-format=pdf", inputPath, outputPath],
  ];

  let lastError: unknown;
  for (const args of attempts) {
    try {
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
      await execFileAsync("ddjvu", args, {
        maxBuffer: 1024 * 1024 * 64,
        timeout: 10 * 60 * 1000,
      });
      await assertReadablePdf(outputPath);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  await fs.rm(outputPath, { force: true }).catch(() => undefined);
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(`Не удалось сконвертировать DjVu в PDF. ${detail}`.trim());
}

async function assertReadablePdf(filePath: string) {
  const stat = await fs.stat(filePath);
  if (stat.size < 1024) {
    throw new Error("получен слишком маленький PDF");
  }
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    if (buf.toString("utf8") !== "%PDF-") {
      throw new Error("файл не начинается с %PDF-");
    }
  } finally {
    await fh.close();
  }
  try {
    await execFileAsync("pdfinfo", [filePath], {
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
  } catch {
    throw new Error("pdfinfo не смог прочитать результат конвертации");
  }
}
