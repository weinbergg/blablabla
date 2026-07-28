import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Converts a DjVu file to a PDF using djvulibre's `ddjvu`, so the same
 * pdf.js-based reader can be used for every scanned book regardless of the
 * original format. Requires `ddjvu` to be installed on the server
 * (`apt install djvulibre-bin` / `brew install djvulibre`).
 */
export async function convertDjvuToPdf(inputPath: string, outputPath: string) {
  await execFileAsync("ddjvu", ["-format=pdf", inputPath, outputPath], {
    maxBuffer: 1024 * 1024 * 32,
  });
}
