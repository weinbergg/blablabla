// Local packaging only. Never connects to the VPS or imports the application DB.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { migrations } from "../lib/db/migrations";
import { legacyBaseline } from "../lib/db/legacy-baseline";

const files = [
  "deploy/release.sh", "deploy/production-update.cjs", "scripts/backup-sqlite.cjs",
  "scripts/release-database.ts", "lib/db/release-transaction.ts", "lib/db/verification.ts",
  "lib/db/migrations.ts", "lib/db/legacy-baseline.ts", "lib/db/legacy-baseline.sql",
];
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const output = path.resolve("data/implementation-checks");
fs.mkdirSync(output, { recursive: true });
const directory = fs.mkdtempSync(path.join(output, "production-kit-"));
fs.chmodSync(directory, 0o700);
for (const name of files) {
  const target = path.join(directory, name);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(name, target); fs.chmodSync(target, 0o600);
}
fs.writeFileSync(path.join(directory, "release-kit.json"), JSON.stringify({
  purpose: "Owner-operated release using the already-uploaded Linux artifact",
  artifactSha256: "6c51386d60a4d7cdc989c699189a46b4dbca4966948c05b39c4bcfa27edc532d",
  migrationPlan: [legacyBaseline, ...migrations.map(m => ({ id: m.id, checksum: sha(m.sql) }))],
}, null, 2), { mode: 0o600 });
files.push("release-kit.json");
fs.writeFileSync(path.join(directory, "SHA256SUMS"), files.map(name => `${sha(fs.readFileSync(path.join(directory, name)))}  ${name}\n`).join(""), { mode: 0o600 });
const archive = path.join(output, "production-release-kit.tar.gz");
execFileSync("tar", ["-czf", archive, "-C", directory, ...files, "SHA256SUMS"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
fs.chmodSync(archive, 0o600);
const checksum = sha(fs.readFileSync(archive));
fs.writeFileSync(`${archive}.sha256`, `${checksum}  production-release-kit.tar.gz\n`, { mode: 0o600 });
console.log(JSON.stringify({ archive, sha256: checksum, bytes: fs.statSync(archive).size, files: files.length + 1, networkUsed: false }));
