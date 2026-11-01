import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadModule } from "./support/isolated-db";

type Viewer = { id: string; role: string } | null;
type Row = { id?: string; ownerId: string; parentId: string | null; parentType: string | null };
type AccessModule = { attachmentAccess: (row: Row, user: Viewer) => Promise<{ canRead: boolean; canEdit: boolean }> };
type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
const owner = { id: "owner", role: "member" };
const other = { id: "other", role: "member" };
const admin = { id: "admin", role: "admin" };
const publicFile = { ownerId: "owner", parentId: "published", parentType: "channel_post" };

test("attachments follow draft visibility, moderator rights and revocation", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const { attachmentAccess: access } = loadModule<AccessModule>("lib/community-access.ts", f.mocks);
  assert.deepEqual(await access(publicFile, null), { canRead: true, canEdit: false });
  assert.deepEqual(await access(publicFile, other), { canRead: true, canEdit: false });
  assert.deepEqual(await access(publicFile, owner), { canRead: true, canEdit: true });
  const draft = { ...publicFile, parentId: "draft" };
  assert.deepEqual(await access(draft, other), { canRead: false, canEdit: false });
  assert.deepEqual(await access(draft, admin), { canRead: true, canEdit: true });
  f.sqlite.exec("INSERT INTO channel_moderators (channel_id,user_id) VALUES ('channel','other')");
  assert.deepEqual(await access(draft, other), { canRead: true, canEdit: true });
  f.sqlite.exec("DELETE FROM channel_moderators WHERE user_id='other'");
  assert.deepEqual(await access(draft, other), { canRead: false, canEdit: false });
  f.sqlite.exec("UPDATE channels SET archived=1 WHERE id='channel'");
  assert.deepEqual(await access(publicFile, null), { canRead: false, canEdit: false });
});

test("unbound, missing-parent and unknown-parent attachments stay private", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const { attachmentAccess: access } = loadModule<AccessModule>("lib/community-access.ts", f.mocks);
  const unbound = { ...publicFile, parentId: null, parentType: null };
  assert.deepEqual(await access(unbound, owner), { canRead: true, canEdit: true });
  for (const row of [unbound, { ...publicFile, parentId: "missing" }, { ...publicFile, parentType: "unknown" }]) {
    assert.deepEqual(await access(row, other), { canRead: false, canEdit: false });
    assert.deepEqual(await access(row, null), { canRead: false, canEdit: false });
  }
  f.sqlite.exec("INSERT INTO forum_topics(id,author_id) VALUES ('topic','owner'); INSERT INTO seminars(id,status,host_user_id) VALUES ('seminar','draft','owner')");
  assert.deepEqual(await access({ ...publicFile, parentType: "topic", parentId: "topic" }, other), { canRead: true, canEdit: false });
  assert.deepEqual(await access({ ...publicFile, parentType: "seminar", parentId: "seminar" }, other), { canRead: false, canEdit: false });
});

test("marks API rejects foreign writes and draft reads; preserves saved marks", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const access = loadModule<AccessModule>("lib/community-access.ts", f.mocks);
  const files = { getOwnedAttachment: async (id: string) => id === "file" ? publicFile : { ...publicFile, parentId: "draft" } };
  const { GET, PUT } = loadModule<{ GET: Handler; PUT: Handler }>("app/api/community/files/[id]/marks/route.ts", {
    ...f.mocks, "@/lib/community-access": access, "@/lib/community-files": files,
  });
  const context = { params: Promise.resolve({ id: "file" }) };
  const body = { marks: { notes: [{ id: "note", x: 0.1, y: 0.2, text: "Owner's note" }] } };
  const put = () => new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) });
  assert.equal((await PUT(put(), context)).status, 200);
  const saved = f.sqlite.prepare("SELECT payload FROM community_marks WHERE attachment_id='file'").get();
  f.setUser({ ...other, name: "Other" });
  assert.equal((await PUT(put(), context)).status, 403);
  assert.deepEqual(f.sqlite.prepare("SELECT payload FROM community_marks WHERE attachment_id='file'").get(), saved);
  assert.equal((await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "draft-file" }) })).status, 404);
  assert.equal((await (await GET(new Request("http://localhost"), context)).json()).canEdit, false);
  f.setUser(null);
  assert.equal((await PUT(put(), context)).status, 401);
});

test("deriving a file cannot attach media to another user's publication", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const access = loadModule<AccessModule>("lib/community-access.ts", f.mocks);
  let saves = 0;
  const { POST } = loadModule<{ POST: Handler }>("app/api/community/files/[id]/derive/route.ts", {
    ...f.mocks, "@/lib/community-access": access,
    "@/lib/community-files": {
      getOwnedAttachment: async () => publicFile,
      saveCommunityFile: async () => { saves += 1; },
    },
  });
  f.setUser({ ...other, name: "Other" });
  assert.equal((await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "file" }) })).status, 403);
  assert.equal(saves, 0);
});

test("Unicode attachment names produce valid HTTP headers and no reusable private cache", () => {
  const f = fixture();
  try {
    const fileServe = loadModule("lib/file-serve.ts", { ...f.mocks, "next/server": { NextResponse: Response } });
    const { attachmentResponse } = loadModule<{ attachmentResponse: (bytes: Buffer, row: { mime: string; originalName: string; kind: string }) => Response }>("lib/community-files.ts", {
      ...f.mocks, "next/server": { NextResponse: Response }, "@/lib/file-serve": fileServe,
    });
    const response = attachmentResponse(Buffer.from("text"), { mime: "text/plain", originalName: "Книга.txt", kind: "file" });
    assert.equal(response.headers.get("Content-Disposition"), "attachment; filename=\"_____.txt\"; filename*=UTF-8''%D0%9A%D0%BD%D0%B8%D0%B3%D0%B0.txt");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  } finally { f.sqlite.close(); }
});
