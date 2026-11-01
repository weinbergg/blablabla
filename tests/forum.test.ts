import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadModule } from "./support/isolated-db";
type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
function setup() {
  const f = fixture();
  f.sqlite.exec("INSERT INTO forum_topics(id,title,body,author_id,category,created_at) VALUES('topic','Question','A thoughtful question','owner','general',CURRENT_TIMESTAMP),('other-topic','Other','Other question','other','general',CURRENT_TIMESTAMP)");
  const mocks = { ...f.mocks, "./rooms": { getRoom: async () => null }, "@/lib/db/rooms": { getRoom: async () => null }, "@/lib/community-files": { listAttachments: async () => [] }, "@/lib/activity": { logActivity: () => {} } };
  const access = loadModule("lib/forum-access.ts", mocks);
  const forum = loadModule<{ getForumTopic: (id: string, user: string, options?: { page?: number; post?: string }) => Promise<{ page: number; pages: number; lastSeq: number; posts: { id: string; body: string; parentExcerpt: string; deletedAt: string | null }[] }>; setWatch: (id: string, topic: string, on: boolean) => Promise<void>; unreadForumCount: (user: { id: string; role: string }) => Promise<number> }>("lib/db/forum.ts", mocks);
  return { ...f, forum, mocks: { ...mocks, "@/lib/forum-access": access, "@/lib/db/forum": forum } };
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (method: string, value: unknown) => new Request("http://localhost", { method, body: JSON.stringify(value) });
test("discussion replies preserve reading source and bind attachments atomically", async t => {
  const f = setup(); t.after(() => f.sqlite.close());
  const route = loadModule<{ POST: Handler }>("app/api/forum/topics/[id]/posts/route.ts", f.mocks);
  f.sqlite.exec("INSERT INTO community_attachments(id,owner_id,kind) VALUES('mine','owner','image'),('foreign','other','image')");
  const bad = await route.POST(request("POST", { body: "A reply", attachmentIds: ["mine", "foreign"] }), context("topic"));
  assert.equal(bad.status, 400); assert.equal((f.sqlite.prepare("SELECT count(*) n FROM forum_posts").get() as { n: number }).n, 0);
  assert.equal((f.sqlite.prepare("SELECT parent_id FROM community_attachments WHERE id='mine'").get() as { parent_id: string | null }).parent_id, null);
  const anchor = { version: 1, documentId: "book", page: 1, exact: "An exact passage" };
  assert.equal((await route.POST(request("POST", { body: "Source mismatch", documentId: "other-book", anchor }), context("topic"))).status, 400);
  const good = await route.POST(request("POST", { body: "A reply", anchor, attachmentIds: ["mine"] }), context("topic"));
  assert.equal(good.status, 200);
  const row = f.sqlite.prepare("SELECT document_id,anchor_json,id FROM forum_posts").get() as { document_id: string; anchor_json: string; id: string };
  assert.equal(row.document_id, "book"); assert.equal(JSON.parse(row.anchor_json).exact, anchor.exact);
  assert.equal((await route.POST(request("POST", { body: "Foreign parent", parentId: row.id }), context("other-topic"))).status, 400);
});
test("pagination resolves exact post links and keeps replies to removed messages in place", async t => {
  const f = setup(); t.after(() => f.sqlite.close());
  const add = f.sqlite.prepare("INSERT INTO forum_posts(id,topic_id,author_id,body,parent_id,created_at) VALUES(?,'topic','other',?,?,CURRENT_TIMESTAMP)");
  for (let i = 1; i <= 25; i++) add.run(`post-${i}`, `Thought ${i}`, i === 25 ? "post-1" : null);
  const first = await f.forum.getForumTopic("topic", "owner"); assert.equal(first.posts.length, 20); assert.equal(first.pages, 2);
  const target = await f.forum.getForumTopic("topic", "owner", { post: "post-25" }); assert.equal(target.page, 2); assert.equal(target.posts.at(-1)?.parentExcerpt, "Thought 1");
  const route = loadModule<{ DELETE: Handler }>("app/api/forum/posts/[id]/route.ts", f.mocks);
  assert.equal((await route.DELETE(new Request("http://localhost", { method: "DELETE" }), context("post-1"))).status, 200);
  const after = await f.forum.getForumTopic("topic", "owner"); assert.equal(after.posts.length, 20); assert.equal(after.posts[0].body, "Сообщение удалено");
  assert.equal((f.sqlite.prepare("SELECT body FROM forum_posts WHERE id='post-1'").get() as { body: string }).body, "Thought 1");
});
test("watch notifications count real unseen replies and mark only the read portion", async t => {
  const f = setup(); t.after(() => f.sqlite.close());
  await f.forum.setWatch("owner", "topic", true);
  f.sqlite.exec("INSERT INTO forum_posts(id,topic_id,author_id,body) VALUES('one','topic','other','First'),('two','topic','other','Second'),('own','topic','owner','Own response')");
  const user = { id: "owner", role: "member" }; assert.equal(await f.forum.unreadForumCount(user), 2);
  const watch = loadModule<{ PUT: Handler }>("app/api/forum/topics/[id]/watch/route.ts", f.mocks);
  assert.equal((await watch.PUT(request("PUT", { seen: 1 }), context("topic"))).status, 200); assert.equal(await f.forum.unreadForumCount(user), 1);
  await watch.PUT(request("PUT", { seen: 3 }), context("topic")); assert.equal(await f.forum.unreadForumCount(user), 0);
});
test("topic moderation cannot be acquired through posting or an unrelated account", async t => {
  const f = setup(); t.after(() => f.sqlite.close());
  const route = loadModule<{ PATCH: Handler }>("app/api/forum/topics/[id]/route.ts", f.mocks);
  f.setUser({ id: "other", name: "Other", role: "member" });
  assert.equal((await route.PATCH(request("PATCH", { locked: true }), context("topic"))).status, 403);
  f.setUser({ id: "owner", name: "Owner", role: "member" });
  assert.equal((await route.PATCH(request("PATCH", { pinned: true }), context("topic"))).status, 403);
  assert.equal((await route.PATCH(request("PATCH", { locked: true }), context("topic"))).status, 200);
  const posts = loadModule<{ POST: Handler }>("app/api/forum/topics/[id]/posts/route.ts", f.mocks);
  assert.equal((await posts.POST(request("POST", { body: "Closed topic" }), context("topic"))).status, 403);
});
