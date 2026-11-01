import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { migrate } from "../lib/db/migrations";
import { channelPermissions, canAssignRole } from "../lib/channel-permissions";
import { plainDoc, safeHref, validateContent, videoEmbed } from "../lib/publication-content";
import { savePublication, RevisionConflict } from "../lib/publication-storage";
import { fixture, loadModule } from "./support/isolated-db";
import { publicRoomLink } from "../lib/publication-links";

test("event announcements use current public room metadata and respect paid shutdown", t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec("INSERT INTO seminars(id,slug,title,host_user_id,status,access_mode,price_kopeks) VALUES('room','reading','Reading','owner','open','open',0)");
  assert.equal(publicRoomLink(f.sqlite, "/seminars/reading", false)?.title, "Reading");
  f.sqlite.exec("UPDATE seminars SET access_mode='invite'"); assert.equal(publicRoomLink(f.sqlite, "/seminars/reading", true), null);
  f.sqlite.exec("UPDATE seminars SET access_mode='paid'"); assert.equal(publicRoomLink(f.sqlite, "/seminars/reading", false), null);
  assert.equal(publicRoomLink(f.sqlite, "https://external.example/seminars/reading", true), null);
});

const text = { version: 1, blocks: [{ id: "text", type: "text", doc: plainDoc("Текст публикации для проверки сохранения") }] };
test("channel roles separate publications, discussion and appointment privileges", () => {
  const channel = { ownerId: "owner", kind: "author", archived: 0 };
  const user = { id: "member", role: "member" };
  const editor = channelPermissions(channel, user, { role: "editor", legacyModeration: 0 });
  assert.equal(editor.publish, true); assert.equal(editor.moderate, false); assert.equal(editor.team, false);
  const moderator = channelPermissions(channel, user, { role: "moderator" });
  assert.equal(moderator.publish, false); assert.equal(moderator.readDrafts, false); assert.equal(moderator.moderate, true);
  const admin = channelPermissions(channel, user, { role: "admin" });
  assert.equal(canAssignRole(admin, null, "editor"), true); assert.equal(canAssignRole(admin, null, "admin"), false); assert.equal(canAssignRole(admin, "admin", null), false);
  const owner = channelPermissions(channel, { ...user, id: "owner" });
  assert.equal(canAssignRole(owner, null, "admin"), true); assert.equal(canAssignRole(owner, "owner", null), false);
  assert.equal(channelPermissions(channel, user, { role: "editor", legacyModeration: 1 }).moderate, true);
  assert.equal(channelPermissions({ ...channel, archived: 1 }, user, { role: "editor" }).publish, false);
  assert.equal(channelPermissions({ ...channel, kind: "news" }, user, { role: "admin" }).publish, false);
});

test("content rejects executable URLs, unknown versions and unbounded document trees", () => {
  assert.equal(safeHref("javascript:alert(1)"), null); assert.equal(safeHref("//evil.example"), null); assert.equal(safeHref("/\\evil.example"), null);
  assert.equal(safeHref("/documents/book?page=2"), "/documents/book?page=2");
  assert.equal(videoEmbed("https://youtube.com.evil.example/watch?v=abcdefghijk"), null);
  assert.equal(videoEmbed("https://youtu.be/abcdefghijk"), "https://www.youtube-nocookie.com/embed/abcdefghijk");
  assert.throws(() => validateContent({ ...text, version: 2 }));
  assert.throws(() => validateContent({ version: 1, blocks: [{ id: "a", type: "text", doc: { type: "doc", content: [{ type: "script" }] } }] }));
  assert.throws(() => validateContent({ version: 1, blocks: [{ id: "a", type: "link", href: "javascript:x", label: "x" }] }));
  assert.deepEqual(validateContent(text), text);
});

test("publication and attachments commit together; stale edits cannot overwrite content", t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec("INSERT INTO community_attachments(id,owner_id,kind) VALUES ('own','owner','image'),('foreign','other','image')");
  const content = { version: 1, blocks: [...text.blocks, { id: "gallery", type: "image", files: [{ id: "foreign", caption: "" }] }] };
  const count = () => (f.sqlite.prepare("SELECT count(*) AS n FROM channel_posts").get() as { n: number }).n;
  const before = count(); assert.throws(() => savePublication(f.sqlite, "channel", "owner", { content }), /доступа/); assert.equal(count(), before);
  content.blocks[1] = { id: "gallery", type: "image", files: [{ id: "own", caption: "" }] };
  const saved = savePublication(f.sqlite, "channel", "owner", { title: "Название", content, clientKey: "stable-client-key", published: false });
  assert.equal(saved.revision, 1); assert.equal((f.sqlite.prepare("SELECT parent_id FROM community_attachments WHERE id='own'").get() as { parent_id: string }).parent_id, saved.id);
  const retry = savePublication(f.sqlite, "channel", "owner", { title: "Повтор", content, clientKey: "stable-client-key" });
  assert.equal(retry.id, saved.id); assert.equal(count(), before + 1);
  const updated = savePublication(f.sqlite, "channel", "owner", { content: text, revision: 1, published: true }, saved.id);
  assert.equal(updated.revision, 2);
  assert.throws(() => savePublication(f.sqlite, "channel", "owner", { body: "stale", revision: 1 }, saved.id), RevisionConflict);
  assert.equal((f.sqlite.prepare("SELECT parent_id FROM community_attachments WHERE id='own'").get() as { parent_id: string | null }).parent_id, null);
  assert.equal((f.sqlite.prepare("SELECT published FROM channel_posts WHERE id=?").get(saved.id) as { published: number }).published, 1);
});

test("moderator cannot modify a publication through its API", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec("INSERT INTO channel_moderators(channel_id,user_id,role,legacy_moderation) VALUES('channel','other','moderator',0)");
  f.setUser({ id: "other", name: "Other", role: "member" });
  const channels = loadModule("lib/db/channels.ts", f.mocks);
  type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  const route = loadModule<{ PATCH: Handler; DELETE: Handler; GET: Handler }>("app/api/channels/posts/[id]/route.ts", { ...f.mocks, "@/lib/db/channels": channels });
  const context = { params: Promise.resolve({ id: "published" }) };
  assert.equal((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "Bad edit" }) }), context)).status, 403);
  assert.equal((await route.DELETE(new Request("http://localhost", { method: "DELETE" }), context)).status, 403);
  assert.equal((await route.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "draft" }) })).status, 404);
  assert.equal((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ commentsOpen: false, title: "Mixed privilege escalation" }) }), context)).status, 403);
  assert.equal((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ commentsOpen: false }) }), context)).status, 200);
  assert.equal((f.sqlite.prepare("SELECT comments_open n FROM channel_posts WHERE id='published'").get() as { n: number }).n, 0);
  f.sqlite.exec("UPDATE channel_moderators SET role='editor' WHERE user_id='other'");
  assert.equal((await route.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "draft" }) })).status, 200);
});

test("social reports use the existing private feedback workflow and reject hidden posts", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec("UPDATE channels SET slug='channel'; UPDATE channel_posts SET slug=id");
  const route = loadModule<{ POST: (request: Request) => Promise<Response> }>("app/api/reports/route.ts", f.mocks);
  const report = (targetId: string) => route.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ targetType: "channel_post", targetId, reason: "Spam" }) }));
  assert.equal((await report("draft")).status, 404);
  assert.equal((await report("published")).status, 201);
  assert.equal((await report("published")).status, 201);
  const rows = f.sqlite.prepare("SELECT author_id,body,status FROM feedback").all() as { author_id: string; body: string; status: string }[];
  assert.equal(rows.length, 1); assert.equal(rows[0].author_id, "owner"); assert.equal(rows[0].status, "new"); assert(rows[0].body.includes("/channels/channel/published"));
  f.setUser(null); assert.equal((await report("published")).status, 401);
});

test("additive migration preserves legacy data and privileges and is repeatable", t => {
  const db = new Database(":memory:"); t.after(() => db.close());
  db.exec(`CREATE TABLE forum_watches(user_id TEXT,topic_id TEXT); CREATE TABLE forum_topics(id TEXT PRIMARY KEY); CREATE TABLE documents(id TEXT PRIMARY KEY); CREATE TABLE seminars(id TEXT PRIMARY KEY); CREATE TABLE forum_posts(id TEXT PRIMARY KEY); CREATE TABLE annotations(id TEXT PRIMARY KEY);
    CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE channels(id TEXT PRIMARY KEY);
    CREATE TABLE channel_posts(id TEXT PRIMARY KEY, channel_id TEXT, author_id TEXT, body TEXT);
    CREATE TABLE channel_comments(id TEXT PRIMARY KEY); CREATE TABLE channel_moderators(channel_id TEXT,user_id TEXT);
    INSERT INTO users VALUES('reader'); INSERT INTO channels VALUES('channel');
    INSERT INTO channel_posts VALUES('post','channel','reader','Existing body'); INSERT INTO channel_moderators VALUES('channel','reader');`);
  assert.equal(migrate(db).length, 3); assert.equal(migrate(db).length, 0);
  assert.deepEqual(db.prepare("SELECT body,content_json,revision FROM channel_posts").get(), { body: "Existing body", content_json: null, revision: 1 });
  assert.deepEqual(db.prepare("SELECT role,legacy_moderation FROM channel_moderators").get(), { role: "editor", legacy_moderation: 1 });
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
});
