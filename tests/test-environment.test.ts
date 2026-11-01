import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { once } from "node:events";
import Database from "better-sqlite3";
import { initializeTestInstance } from "../scripts/test-instance";
import { migrations } from "../lib/db/migrations";
import { verifyPassword } from "../lib/password";
const require = createRequire(import.meta.url);
const { testRoot } = require("../deploy/test/paths.cjs");
const { environment } = require("../deploy/test/runtime.cjs");
const { createGate } = require("../deploy/test/gate.cjs");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const temporary = () => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "blabla-test-"));

test("fresh isolated fixture executes real migrations, verifies backups, preserves source and refuses reuse", async t => {
  const root = temporary(), bundle = temporary();
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(bundle, { recursive: true, force: true }); });
  const books = ["PDF", "EPUB", "TXT"].map(format => {
    const file = `fixture.${format.toLowerCase()}`, bytes = `Fixture ${format}`, hash = sha(bytes), id = `book-${format}`;
    fs.writeFileSync(path.join(bundle, file), bytes);
    return { id, file, sha256: hash, format, title: `Book ${format}`, language: "en", authors: "Test author", anchor: { version: 1, documentId: id, textVersion: `sha256:${hash}`, exact: bytes, prefix: "", suffix: "", page: 1 } };
  });
  fs.writeFileSync(path.join(bundle, "books.json"), JSON.stringify(books));
  const sourceHashes = books.map(b => sha(fs.readFileSync(path.join(bundle, b.file))));
  const marker = await initializeTestInstance(root, bundle);
  assert.equal(marker.counts.authorChannels, 2); assert.equal(marker.counts.posts, 9);
  assert.equal(testRoot(root), root);
  for (const name of ["app.db", "initial-backup.db"]) {
    const db = new Database(path.join(root, "data", name), { readonly: true });
    try {
      assert.equal(db.pragma("integrity_check", { simple: true }), "ok"); assert.deepEqual(db.pragma("foreign_key_check"), []);
      assert.deepEqual(db.prepare("SELECT id,checksum FROM schema_migrations ORDER BY id").all(), migrations.map(m => ({ id: m.id, checksum: sha(m.sql) })));
      assert.equal((db.prepare("SELECT count(*) n FROM users").get() as {n:number}).n, 3);
      assert.equal((db.prepare("SELECT count(*) n FROM documents").get() as {n:number}).n, 3);
      assert.equal((db.prepare("SELECT count(*) n FROM payments").get() as {n:number}).n, 0);
      const creds = JSON.parse(fs.readFileSync(path.join(root, "data/test-credentials.json"), "utf8"));
      for (const c of creds) assert(await verifyPassword(c.password, (db.prepare("SELECT password_hash FROM users WHERE id=?").get(c.id) as {password_hash:string}).password_hash));
    } finally { db.close(); }
  }
  for (const [i, book] of books.entries()) {
    assert.equal(sha(fs.readFileSync(path.join(bundle, book.file))), sourceHashes[i]);
    const copied = path.join(root, "public/uploads", book.file);
    assert.equal(sha(fs.readFileSync(copied)), book.sha256); assert.equal(fs.statSync(copied).nlink, 1);
  }
  assert.equal(fs.statSync(path.join(root, "data/test-credentials.json")).mode & 0o777, 0o600);
  await assert.rejects(initializeTestInstance(root, bundle), /already exists/);
  process.env.SMTP_HOST = "must-not-escape"; process.env.YOOKASSA_SECRET_KEY = "must-not-escape";
  t.after(() => { delete process.env.SMTP_HOST; delete process.env.YOOKASSA_SECRET_KEY; delete process.env.DATABASE_PATH; });
  const env = environment(root); assert.equal(env.SMTP_HOST, undefined); assert.equal(env.YOOKASSA_SECRET_KEY, undefined); assert.equal(env.DATABASE_PATH, path.join(root,"data/app.db"));
  process.env.DATABASE_PATH = "/var/www/blabla/data/app.db";
  assert.throws(() => environment(root), /Foreign DATABASE_PATH/);
  delete process.env.DATABASE_PATH;
  fs.writeFileSync(path.join(root, ".env.local"), "EXAMPLE=not-a-secret");
  assert.throws(() => environment(root), /environment files/); fs.unlinkSync(path.join(root, ".env.local"));
  fs.linkSync(path.join(root,"data/app.db"),path.join(root,"data/alias.db"));
  assert.throws(() => testRoot(root), /independent file/); fs.unlinkSync(path.join(root,"data/alias.db"));
  const file = path.join(root,"public/uploads",books[0].file); fs.unlinkSync(file); fs.symlinkSync(path.join(bundle,books[0].file),file);
  assert.throws(() => testRoot(root), /independent files/);
  assert.throws(() => testRoot(path.dirname(root), false), /Only/);
});

test("private gate protects every path and streams authorized requests without forwarding gate credentials", async t => {
  let calls = 0, received: http.IncomingHttpHeaders = {};
  const upstream = http.createServer((req,res) => {
    calls++; received = req.headers;
    if (req.headers.range) { res.writeHead(206,{ "content-range":"bytes 0-3/8", "set-cookie":"blabla_session=synthetic; Secure; HttpOnly", "cache-control":"public,max-age=900" }); res.end("part"); }
    else { res.setHeader("content-type","text/plain"); req.pipe(res); }
  }).listen(0,"127.0.0.1"); await once(upstream,"listening");
  const gate = createGate({ accounts: [{ user:"tester1",digest:sha("tester1:random-test-only-value") }], upstreamPort:(upstream.address() as {port:number}).port }).listen(0,"127.0.0.1"); await once(gate,"listening");
  t.after(() => { gate.closeAllConnections(); upstream.closeAllConnections(); gate.close(); upstream.close(); });
  const base = `http://127.0.0.1:${gate.address().port}`;
  for (const route of ["/", "/uploads/book.pdf", "/_next/static/app.js", "/api/documents/book", "/api/files/book", "/api/auth/login"]) assert.equal((await fetch(base+route)).status,401);
  assert.equal(calls,0);
  assert.equal((await fetch(base,{headers:{Authorization:"Basic "+Buffer.from("wrong:wrong").toString("base64")}})).status,401);
  const headers = {Authorization:"Basic "+Buffer.from("tester1:random-test-only-value").toString("base64")};
  const file = await fetch(base+"/api/files/book",{headers:{...headers,Range:"bytes=0-3","X-Forwarded-Host":"evil.invalid"}});
  assert.equal(file.status,206); assert.equal(await file.text(),"part"); assert.equal(file.headers.get("content-range"),"bytes 0-3/8"); assert.match(file.headers.get("set-cookie")!,/Secure; HttpOnly/); assert.equal(file.headers.get("cache-control"),"private, no-store");
  assert.equal(received.authorization,undefined); assert.equal(received["x-forwarded-host"],new URL(base).host);
  const post = await fetch(base+"/api/comment",{method:"POST",headers,body:"Saved only in test"}); assert.equal(await post.text(),"Saved only in test");
  const before = calls;
  for (const route of ["/api/billing/checkout", "/api/admin/billing/test-charge", "/api/events/checkout", "/api/cron/billing", "/api/%62illing/checkout"]) assert.equal((await fetch(base+route,{method:"POST",headers})).status,403);
  assert.equal(calls,before);
});
