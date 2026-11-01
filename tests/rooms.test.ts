import assert from "node:assert/strict";
import test from "node:test";
import * as flags from "../lib/feature-flags";
import { roomAccess } from "../lib/room-access";
import { legacyDoc, validateContent } from "../lib/publication-content";
import { fixture, loadModule } from "./support/isolated-db";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
function roomFixture() {
  const f = fixture();
  f.sqlite.exec(`INSERT INTO seminars(id,slug,title,host_user_id,document_id,status,access_mode,room_enabled,price_kopeks,discussion_locked) VALUES('room','room','Room','owner','book','open','invite',1,0,0);
    INSERT INTO forum_topics(id,title,body,author_id,document_id,seminar_id) VALUES('room-topic','Room','Private programme','owner','book','room');
    INSERT INTO forum_posts(id,topic_id,author_id,body) VALUES('room-post','room-topic','owner','Private message');
    INSERT INTO users(id,name,role) VALUES('third','Third','member');`);
  const features = loadModule("lib/features.ts", { ...f.mocks, "./feature-flags": flags });
  const rooms = loadModule("lib/db/rooms.ts", f.mocks);
  const mocks = { ...f.mocks, "@/lib/features": features, "./features": features, "@/lib/db/rooms": rooms, "./db/rooms": rooms, "./auth": f.mocks["@/lib/auth"], "@/lib/activity": { logActivity: () => {} } };
  const api = loadModule("lib/room-api.ts", mocks);
  return { ...f, mocks: { ...mocks, "@/lib/room-api": api } };
}
const context = { params: Promise.resolve({ id: "room" }) };
const request = (method: string, body?: unknown) => new Request("http://localhost", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
test("legacy Markdown retains headings, emphasis, lists and safe links in the block editor", () => {
  const doc = legacyDoc("## Глава\n\n**Сильная** и *тихая* речь. [Книга](/documents/book)\n\n- один\n- два\n\n> Цитата");
  assert.equal(doc.content?.[0].type, "heading");
  assert.equal(doc.content?.[2].content?.length, 2);
  const serialized = JSON.stringify(doc);
  for (const type of ["bold", "italic", "link", "blockquote"]) assert(serialized.includes(`"${type}"`));
  assert.doesNotThrow(() => validateContent({ version: 1, blocks: [{ id: "legacy", type: "text", doc }] }));
});
test("room invitations, memberships, legacy tickets and bans protect all content", async t => {
  const f = roomFixture(); t.after(() => f.sqlite.close());
  const room = { id: "room", hostUserId: "owner", accessMode: "invite", priceKopeks: 0, status: "open", discussionLocked: 0 };
  const user = { id: "other", role: "member" };
  assert.equal(roomAccess(f.sqlite, room, null).preview, false);
  assert.equal(roomAccess(f.sqlite, room, user).read, false);
  f.sqlite.exec("INSERT INTO seminar_members(seminar_id,user_id,status) VALUES('room','other','invited')");
  assert.equal(roomAccess(f.sqlite, room, user).preview, true);
  assert.equal(roomAccess(f.sqlite, room, user).read, false);
  f.sqlite.exec("UPDATE seminar_members SET status='member'");
  assert.equal(roomAccess(f.sqlite, room, user).read, true);
  assert.equal(roomAccess(f.sqlite, { ...room, discussionLocked: 1 }, user).write, false);
  const access = loadModule<{ attachmentAccess: (file: object, viewer: { id: string; role: string } | null) => Promise<{ canRead: boolean }> }>("lib/community-access.ts", f.mocks);
  for (const [type, id] of [["seminar", "room"], ["topic", "room-topic"], ["post", "room-post"]]) {
    const file = { ownerId: "owner", parentType: type, parentId: id };
    assert.equal((await access.attachmentAccess(file, user)).canRead, true);
    assert.equal((await access.attachmentAccess(file, null)).canRead, false);
  }
  f.sqlite.exec("INSERT INTO seminar_tickets(id,seminar_id,user_id) VALUES('legacy','room','other'); UPDATE seminar_members SET status='banned'");
  assert.equal(roomAccess(f.sqlite, room, user).read, false);
  assert.equal((await access.attachmentAccess({ ownerId: "other", parentType: "post", parentId: "room-post" }, user)).canRead, false);
  f.sqlite.exec("UPDATE forum_posts SET deleted_at=CURRENT_TIMESTAMP WHERE id='room-post'");
  assert.equal((await access.attachmentAccess({ ownerId: "owner", parentType: "post", parentId: "room-post" }, { id: "owner", role: "member" })).canRead, false);
});
test("room routes reject outsiders, role escalation, foreign anchors and paid enrolment", async t => {
  const f = roomFixture(); t.after(() => f.sqlite.close());
  const messages = loadModule<{ GET: Handler; POST: Handler }>("app/api/seminars/[id]/messages/route.ts", f.mocks);
  const position = loadModule<{ PUT: Handler }>("app/api/seminars/[id]/position/route.ts", f.mocks);
  const join = loadModule<{ POST: Handler }>("app/api/seminars/[id]/join/route.ts", f.mocks);
  const members = loadModule<{ POST: Handler }>("app/api/seminars/[id]/members/route.ts", f.mocks);
  f.setUser({ id: "other", name: "Other", role: "member" });
  assert.equal((await messages.GET(request("GET"), context)).status, 403);
  assert.equal((await join.POST(request("POST", {}), context)).status, 403);
  f.sqlite.exec("INSERT INTO seminar_members(seminar_id,user_id,status) VALUES('room','other','invited')");
  assert.equal((await join.POST(request("POST", {}), context)).status, 200);
  assert.equal((await messages.GET(request("GET"), context)).status, 200);
  assert.equal((await messages.POST(request("POST", { body: "Hello", kind: "guidance" }), context)).status, 403);
  assert.equal((await messages.POST(request("POST", { body: "Hello", anchor: { version: 1, documentId: "other-book", exact: "Quote", page: 1 } }), context)).status, 400);
  assert.equal((await position.PUT(request("PUT", { documentId: "book", page: 3 }), context)).status, 403);
  assert.equal((await members.POST(request("POST", { userId: "third", action: "grant" }), context)).status, 403);
  assert.equal((await messages.POST(request("POST", { body: "A real question", kind: "question" }), context)).status, 201);
  f.setUser({ id: "third", name: "Third", role: "member" });
  f.sqlite.exec("UPDATE seminars SET access_mode='paid'");
  assert.equal((await join.POST(request("POST", {}), context)).status, 403);
  f.setUser({ id: "owner", name: "Owner", role: "member" });
  assert.equal((await position.PUT(request("PUT", { documentId: "book", page: 3 }), context)).status, 200);
  assert.equal((await messages.POST(request("POST", { body: "Read page three", kind: "guidance" }), context)).status, 201);
});
test("room membership also guards existing forum routes and feature shutdown", async t => {
  const f = roomFixture(); t.after(() => f.sqlite.close());
  const access = loadModule<{ forumAccess: (id: string, user: { id: string; role: string }) => Promise<{ read: boolean; write: boolean }> }>("lib/forum-access.ts", f.mocks);
  assert.equal((await access.forumAccess("room-topic", { id: "other", role: "member" })).read, false);
  f.sqlite.exec("INSERT INTO seminar_members(seminar_id,user_id,status) VALUES('room','other','member')");
  assert.equal((await access.forumAccess("room-topic", { id: "other", role: "member" })).write, true);
  const route = loadModule<{ PATCH: Handler }>("app/api/forum/posts/[id]/route.ts", { ...f.mocks, "@/lib/forum-access": access });
  f.setUser({ id: "other", name: "Other", role: "member" });
  assert.equal((await route.PATCH(request("PATCH", { body: "Hijack" }), { params: Promise.resolve({ id: "room-post" }) })).status, 403);
  f.sqlite.exec(`INSERT INTO site_settings(key,value) VALUES('feature_flags','{"modes":{"rooms":"off"}}')`);
  const messages = loadModule<{ GET: Handler }>("app/api/seminars/[id]/messages/route.ts", f.mocks);
  assert.equal((await messages.GET(request("GET"), context)).status, 403);
});
