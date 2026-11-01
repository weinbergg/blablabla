// Invoked only by the separately approved production switch, after PM2 stops.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyReviewedMigration } from "../lib/db/release-transaction";

const [approval, target, backupPath, reportPath] = process.argv.slice(2);
if (process.argv.length !== 6 || approval !== "--apply-reviewed-production" || process.platform !== "linux" || process.getuid?.() !== 0 || target !== "/var/www/blabla/data/app.db") {
  throw Error("Only the explicit owner-approved production switch may invoke this command");
}
const root = "/srv/blabla-release-qhq2Vhh0/";
if (!backupPath?.startsWith(root) || !reportPath?.startsWith(root) || fs.realpathSync(backupPath) !== backupPath || fs.realpathSync(target) !== target || fs.realpathSync(path.dirname(reportPath)) !== path.dirname(reportPath)) {
  throw Error("Unexpected database/backup/report path");
}
const db = new Database(target, { fileMustExist: true });
const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
try {
  const report = applyReviewedMigration(db, backup);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(report));
} finally { backup.close(); db.close(); }
