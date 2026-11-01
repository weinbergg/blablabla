import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { processConfig, appendStatic, memoryForBuild } = require("../deploy/production-update.cjs");

test("VPS build refuses missing or inadequate memory and swap before stopping production", () => {
  assert.throws(() => memoryForBuild("MemAvailable: 1279999 kB\nSwapFree: 2097152 kB\n"), /1250 MiB/);
  assert.throws(() => memoryForBuild("MemAvailable: 2000000 kB\nSwapFree: 1048575 kB\n"), /swap/);
  assert.throws(() => memoryForBuild(""), /Build requires/);
  assert.doesNotThrow(() => memoryForBuild("MemAvailable: 1280000 kB\nSwapFree: 1048576 kB\n"));
});

test("PM2 switch preserves billing/session environment and changes only the approved application", () => {
  const original = { pm2_env: { exec_mode: "fork_mode", exec_interpreter: "/usr/bin/node", args: ["start"], env: {
    NODE_ENV: "production", YOOKASSA_SECRET_KEY: "synthetic-secret", SESSION_SECRET: "synthetic-session", PORT: "3000", PM2_HOME: "/root/.pm2", pm_id: "0",
  }, node_args: ["--max-old-space-size=640"], kill_timeout: 8000 } };
  const copy = structuredClone(original), config = processConfig(original, "/private/release");
  assert.deepEqual(original, copy);
  assert.equal(config.apps.length, 1); assert.equal(config.apps[0].name, "blabla");
  assert.equal(config.apps[0].env.YOOKASSA_SECRET_KEY, "synthetic-secret");
  assert.equal(config.apps[0].env.SESSION_SECRET, "synthetic-session");
  assert.equal(config.apps[0].env.PM2_HOME, undefined);
  assert.deepEqual(config.apps[0].args, ["start", "--hostname", "127.0.0.1", "--port", "3000"]);
  assert.deepEqual(config.apps[0].node_args, original.pm2_env.node_args);
});

test("static publication keeps old chunks, uses readable new directories and rejects collisions/symlinks", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blabla-static-release-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source"), dest = path.join(root, "dest");
  fs.mkdirSync(path.join(source, "chunks/new"), { recursive: true }); fs.mkdirSync(dest);
  fs.writeFileSync(path.join(source, "chunks/new/page.js"), "new-js"); fs.writeFileSync(path.join(dest, "old.js"), "old-js");
  assert.equal(appendStatic(source, dest), 1);
  assert.deepEqual(fs.readdirSync(dest), ["old.js"], "prepare must not publish assets");
  const mask = process.umask(0o077);
  try { appendStatic(source, dest, true); } finally { process.umask(mask); }
  assert.equal(fs.readFileSync(path.join(dest, "old.js"), "utf8"), "old-js");
  assert.equal(fs.statSync(path.join(dest, "chunks/new")).mode & 0o777, 0o755);
  assert.equal(fs.statSync(path.join(dest, "chunks/new/page.js")).mode & 0o777, 0o644);
  appendStatic(source, dest, true);
  fs.writeFileSync(path.join(source, "chunks/new/page.js"), "collision");
  assert.throws(() => appendStatic(source, dest, true), /collision/);
  assert.equal(fs.readFileSync(path.join(dest, "chunks/new/page.js"), "utf8"), "new-js");
  fs.unlinkSync(path.join(source, "chunks/new/page.js")); fs.symlinkSync(path.join(dest, "old.js"), path.join(source, "bad.js"));
  assert.throws(() => appendStatic(source, dest), /symlink/);
});

for (const hasFailedApp of [false, true]) test(`code rollback handles ${hasFailedApp ? "failed" : "missing"} new PM2 process without touching SQLite`, () => {
  const commands: string[][] = [], files: string[] = [];
  const state = { code: "/private/release", oldConfig: "/private/previous-pm2.json", phase: "started" };
  const fakeRequire = (name: string) => {
    if (name === "node:fs") return {
      readFileSync: () => "1234", writeFileSync: (file: string) => files.push(file), renameSync: (from: string, to: string) => files.push(from, to),
    };
    if (name === "node:child_process") return { spawnSync: (exe: string, args: string[]) => {
      commands.push([exe, ...args]);
      return { status: 0, stdout: args[0] === "jlist" ? JSON.stringify(hasFailedApp ? [{ name: "blabla", pm2_env: { pm_cwd: state.code } }] : []) : "" };
    } };
    return require(name);
  };
  const loaded = { exports: {} as { restoreCode: (value: typeof state) => void } };
  vm.runInNewContext(fs.readFileSync("deploy/production-update.cjs", "utf8"), { require: fakeRequire, module: loaded, __dirname: path.resolve("deploy"), process: { kill: () => {} }, console });
  loaded.exports.restoreCode(state);
  assert.equal(state.phase, "rolled-back");
  assert.deepEqual(commands.map(c => c.slice(1)), [ ["jlist"], ...(hasFailedApp ? [["delete", "blabla"]] : []), ["start", state.oldConfig, "--only", "blabla"], ["save"] ]);
  assert(files.every(file => file.endsWith("production-update.json") || file.endsWith("production-update.json.tmp")));
});

for (const failure of ["backup", "migration", "start", null]) test(`release ${failure ? `failure at ${failure} restores old code` : "completes after backup and migration"}`, async () => {
  const original = { name: "blabla", pid: 123, pm2_env: { exec_mode: "fork_mode", exec_interpreter: "/usr/bin/node", pm_cwd: "/var/www/blabla", args: ["start"], env: { NODE_ENV: "production" } } };
  const state = { phase: "prepared", originalPid: 123, environments: [], work: "/private/work", code: "/private/code", oldConfig: "/private/previous.json", newConfig: "/private/next.json" };
  let running: typeof original | null = original;
  let saved = structuredClone(state);
  const calls: string[] = [], writes: string[] = [];
  const fakeRequire = (name: string) => {
    if (name === "node:fs") return {
      readFileSync: (file: string) => file.endsWith("pm2.pid") ? "99" : file === state.oldConfig ? JSON.stringify(processConfig(original, "/var/www/blabla")) : JSON.stringify(state),
      writeFileSync: (file: string, value: string) => { writes.push(file); saved = JSON.parse(value); },
      renameSync: (from: string, to: string) => writes.push(from, to),
      readdirSync: () => [],
    };
    if (name === "node:child_process") return { spawnSync: (exe: string, args: string[]) => {
      const call = [exe, ...args].join(" "); calls.push(call);
      if (exe.endsWith("systemctl")) return { status: 3, stdout: "inactive\n" };
      if (args.includes("scripts/backup-sqlite.cjs")) return { status: failure === "backup" ? 1 : 0, stdout: JSON.stringify({ backupPath: "/private/backup.db" }) };
      if (args.includes("scripts/release-database.ts")) return { status: failure === "migration" ? 1 : 0, stdout: "{}" };
      if (args[0] === "jlist") return { status: 0, stdout: JSON.stringify(running ? [running] : []) };
      if (args[0] === "delete") running = null;
      if (args[0] === "start") {
        if (args[1] === state.newConfig && failure === "start") return { status: 1 };
        running = { ...original, pm2_env: { ...original.pm2_env, pm_cwd: args[1] === state.newConfig ? state.code : "/var/www/blabla" } };
      }
      return { status: 0, stdout: "" };
    } };
    return require(name);
  };
  const loaded = { exports: {} as { apply: () => Promise<void> } };
  vm.runInNewContext(fs.readFileSync("deploy/production-update.cjs", "utf8") + `
    preflight = () => original;
    otherDatabaseUsers = () => [];
    healthy = async () => 'checked HTML';
    checkHttpsAssets = () => 2;
    module.exports.apply = apply;
  `, { require: fakeRequire, module: loaded, original, __dirname: path.resolve("deploy"), process: { execPath: "/usr/bin/node", kill: () => {} }, console: { log() {}, error() {} } });
  if (failure) await assert.rejects(loaded.exports.apply(), /failed/); else await loaded.exports.apply();
  assert.equal(saved.phase, failure ? "rolled-back" : "complete");
  assert.equal(running!.pm2_env.pm_cwd, failure ? "/var/www/blabla" : state.code);
  const stop = calls.findIndex(c => c.endsWith("stop blabla")), backup = calls.findIndex(c => c.includes("scripts/backup-sqlite.cjs")), migration = calls.findIndex(c => c.includes("scripts/release-database.ts"));
  assert(stop >= 0 && backup > stop);
  if (failure === "backup") assert.equal(migration, -1); else assert(migration > backup);
  assert(writes.every(file => /production-update\.json(?:\.tmp)?$/.test(file)), "rollback must never overwrite a database or user files");
  assert(calls.every(c => !c.includes("delete all") && !c.includes("pkill") && !c.includes("db:push")));
});
