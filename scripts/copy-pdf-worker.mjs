import { copyFileSync, existsSync } from "fs";
import path from "path";

const source = path.join(
  process.cwd(),
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
);
const target = path.join(process.cwd(), "public/pdf.worker.min.mjs");

if (existsSync(source)) {
  copyFileSync(source, target);
  console.log("pdf.worker.min.mjs скопирован в public/");
} else {
  console.warn("pdfjs-dist worker не найден — онлайн-читалка PDF может не заработать.");
}
