import assert from "node:assert/strict";
import test from "node:test";
import { commentRequest } from "../lib/comment-request";
import { fixture, loadModule } from "./support/isolated-db";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: unknown, method = "POST") => new Request("http://localhost/api/comments", {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("book comment API validates authentication, body, page and parent scope", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const { POST } = loadModule<{ POST: Handler }>("app/api/comments/route.ts", f.mocks);
  f.setUser(null);
  assert.equal((await POST(request({ documentId: "book", body: "hello" }), context(""))).status, 401);
  f.setUser({ id: "owner", name: "Owner", role: "member" });
  for (const payload of [null, { body: " " }, { body: "x".repeat(8001) }, { body: "ok", page: -1 }, { body: "ok", page: 1.5 }, { body: "ok", page: "3" }, { body: "ok", parentId: {} }]) {
    assert.equal((await POST(request({ documentId: "book", ...payload }), context(""))).status, 400);
  }
  f.sqlite.exec(`INSERT INTO comments (id,document_id,author_id,body,page,parent_id) VALUES
    ('root','book','other','Parent',8,NULL),('foreign','other-book','other','Other',1,NULL),('nested','book','other','Nested',8,'root')`);
  for (const parentId of ["missing", "foreign"]) {
    assert.equal((await POST(request({ documentId: "book", body: "reply", parentId }), context(""))).status, 404);
  }
  assert.equal((await POST(request({ documentId: "book", body: "reply", parentId: "nested" }), context(""))).status, 400);
  assert.equal((await POST(request({ documentId: "book", body: "reply", parentId: "root", annotationId: "public" }), context(""))).status, 404);
  const response = await POST(request({ documentId: "book", body: " reply ", parentId: "root", page: 2 }), context(""));
  assert.equal(response.status, 201);
  const { id } = await response.json();
  assert.deepEqual(f.sqlite.prepare("SELECT body,page,parent_id FROM comments WHERE id=?").get(id), { body: "reply", page: 8, parent_id: "root" });
  assert.equal((await POST(request({ documentId: "book", body: "reply", annotationId: "private" }), context(""))).status, 403);
});

test("deleting a comment preserves replies atomically and enforces ownership", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec(`INSERT INTO comments (id,document_id,author_id,body,page,parent_id) VALUES
    ('root','book','owner','Parent',8,NULL),('reply','book','other','Child',NULL,'root')`);
  const { DELETE } = loadModule<{ DELETE: Handler }>("app/api/comments/[id]/route.ts", f.mocks);
  assert.equal((await DELETE(new Request("http://localhost", { method: "DELETE" }), context("reply"))).status, 403);
  f.sqlite.exec("CREATE TRIGGER reject_delete BEFORE DELETE ON comments BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END");
  await assert.rejects(DELETE(new Request("http://localhost", { method: "DELETE" }), context("root")));
  assert.deepEqual(f.sqlite.prepare("SELECT parent_id FROM comments WHERE id='reply'").get(), { parent_id: "root" });
  f.sqlite.exec("DROP TRIGGER reject_delete");
  assert.equal((await DELETE(new Request("http://localhost", { method: "DELETE" }), context("root"))).status, 200);
  assert.deepEqual(f.sqlite.prepare("SELECT body,parent_id,page FROM comments WHERE id='reply'").get(), { body: "Child", parent_id: null, page: 8 });
});

test("document query excludes private annotation discussion from other readers", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec(`INSERT INTO comments (id,document_id,author_id,body,annotation_id) VALUES
    ('general','book','other','General',NULL),('open','book','other','Public','public'),('secret','book','other','Private','private')`);
  const { getDocumentComments } = loadModule<{ getDocumentComments: (id: string, viewer?: string | null) => Promise<{ id: string }[]> }>("lib/db/queries.ts", f.mocks);
  assert.deepEqual((await getDocumentComments("book")).map((item) => item.id).sort(), ["general", "open"]);
  assert.deepEqual((await getDocumentComments("book", "other")).map((item) => item.id).sort(), ["general", "open"]);
  assert.deepEqual((await getDocumentComments("book", "owner")).map((item) => item.id).sort(), ["general", "open", "secret"]);
});

type ChannelModule = {
  addChannelComment: (input: { postId: string; authorId: string; body: string }) => Promise<{ id: string; body: string; createdAt: string }>;
  listChannelComments: (id: string) => Promise<{ id: string }[]>;
  grantChannelModerator: (id: string, name: string) => Promise<{ userId: string; name: string }>;
};

test("channel comment API returns persisted text and blocks drafts, closed posts and oversized bodies", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const channels = loadModule<ChannelModule>("lib/db/channels.ts", f.mocks);
  const { POST } = loadModule<{ POST: Handler }>("app/api/channels/[id]/comments/route.ts", { ...f.mocks, "@/lib/db/channels": channels });
  for (const payload of [null, { postId: "published", body: {} }]) {
    assert.equal((await POST(request(payload), context("channel"))).status, 400);
  }
  assert.equal((await POST(request({ postId: "draft", body: "secret" }), context("channel"))).status, 404);
  assert.equal((await POST(request({ postId: "published", body: "text" }), context("other-channel"))).status, 404);
  assert.equal((await POST(request({ postId: "closed", body: "text" }), context("channel"))).status, 400);
  assert.equal((await POST(request({ postId: "published", body: "x".repeat(4001) }), context("channel"))).status, 400);
  const response = await POST(request({ postId: "published", body: " <b>hello</b>\r\nworld " }), context("channel"));
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.body, "hello\nworld");
  assert.deepEqual(f.sqlite.prepare("SELECT body,created_at FROM channel_comments WHERE id=?").get(saved.id), { body: saved.body, created_at: saved.createdAt });
  f.sqlite.exec("INSERT INTO channel_comments (id,post_id,author_id,body) VALUES ('hidden','draft','owner','secret')");
  assert.deepEqual((await channels.listChannelComments("channel")).map((item) => item.id), [saved.id]);
  assert.deepEqual(await channels.grantChannelModerator("channel", "Other"), { userId: "other", name: "Other", role: "editor" });
});

test("comment client rejects HTTP, malformed success and network failures", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const status of [401, 403, 500]) {
    globalThis.fetch = async () => Response.json({ error: `error-${status}` }, { status });
    await assert.rejects(commentRequest("/api/comments", {}), new RegExp(`error-${status}`));
  }
  globalThis.fetch = async () => new Response("upstream failure", { status: 502 });
  await assert.rejects(commentRequest("/api/comments", {}), /Не удалось сохранить/);
  globalThis.fetch = async () => new Response("not json", { status: 200 });
  await assert.rejects(commentRequest("/api/comments", {}), /не подтвердил сохранение/);
  for (const data of [{}, [], { ok: false }, { id: "" }]) {
    globalThis.fetch = async () => Response.json(data);
    await assert.rejects(commentRequest("/api/comments", {}), /не подтвердил сохранение/);
  }
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(commentRequest("/api/comments", {}), /Текст сохранён/);
  globalThis.fetch = async () => Response.json({ ok: true, id: "saved" }, { status: 201 });
  assert.deepEqual(await commentRequest("/api/comments", {}), { ok: true, id: "saved" });
});
