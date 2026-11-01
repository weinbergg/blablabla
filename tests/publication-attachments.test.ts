import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadModule } from "./support/isolated-db";
import { savePublication } from "../lib/publication-storage";
import { channelMedia } from "../lib/channel-media";

test("private quote picker requires a session, ignores requested owner and obeys channel shutdown", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const anchor = JSON.stringify({ version: 1, documentId: "book", textVersion: null, exact: "Selected text", prefix: "", suffix: "", page: 4 });
  f.sqlite.prepare("UPDATE annotations SET text_anchor=?,body='Private comment' WHERE id='private'").run(anchor);
  type Route = { GET: (r: Request) => Promise<Response> };
  const route = loadModule<Route>("app/api/community/quotes/route.ts", f.mocks);
  const request = new Request("http://localhost/api/community/quotes?userId=owner");
  f.setUser(null); assert.equal((await route.GET(request)).status, 401);
  f.setUser({ id: "other", role: "member", name: "Other" });
  assert.deepEqual((await (await route.GET(request)).json()).quotes, []);
  f.setUser({ id: "owner", role: "member", name: "Owner" });
  const response = await route.GET(request), data = await response.json();
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(data.quotes.length, 1); assert.equal(data.quotes[0].comment, "Private comment");
  assert.equal(data.quotes[0].anchor.exact, "Selected text");
  assert.equal((f.sqlite.prepare("SELECT visibility FROM annotations WHERE id='private'").get() as { visibility: string }).visibility, "private");
  const closed = loadModule<Route>("app/api/community/quotes/route.ts", { ...f.mocks, "@/lib/features": { featureDenied: async () => Response.json({}, { status: 403 }) } });
  assert.equal((await closed.GET(request)).status, 403);
});

test("publication metadata comes from authorized files and library, not submitted claims", t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec("UPDATE documents SET file_type='epub',language='en' WHERE id='book'; INSERT INTO community_attachments(id,owner_id,kind,mime,size) VALUES ('file','owner','file','application/pdf',12345)");
  const saved = savePublication(f.sqlite, "channel", "owner", { content: { version: 1, blocks: [
    { id: "book-block", type: "book", documentId: "book", title: "Spoofed title", format: "pdf" },
    { id: "file-block", type: "file", fileId: "file", label: "Reading.pdf", mime: "text/html", size: 1 },
  ] } });
  const row = f.sqlite.prepare("SELECT content_json FROM channel_posts WHERE id=?").get(saved.id) as { content_json: string };
  const { blocks } = JSON.parse(row.content_json);
  assert.equal(blocks[0].title, "Book"); assert.equal(blocks[0].format, "epub");
  assert.equal(blocks[1].mime, "application/pdf"); assert.equal(blocks[1].size, 12345);
});

test("channel media uses existing references, excludes drafts and deleted posts, filters and paginates", t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const content = JSON.stringify({ version: 1, blocks: [
    { id: "quote", type: "quote", anchor: { exact: "Published quote" } },
    { id: "book", type: "book", documentId: "book" },
  ] });
  f.sqlite.prepare("UPDATE channel_posts SET content_json=?,slug=id").run(content);
  f.sqlite.exec("UPDATE channel_posts SET deleted_at='2026-10-23' WHERE id='closed'");
  assert.equal(channelMedia(f.sqlite, "channel", "all").items.length, 2);
  assert.equal(channelMedia(f.sqlite, "channel", "quote").items.length, 1);
  assert.equal(channelMedia(f.sqlite, "channel", "photo").items.length, 0);
  assert.equal(channelMedia(f.sqlite, "channel", "all", 2).items.length, 0);
  f.sqlite.exec("UPDATE channel_posts SET content_json=NULL,document_id='book' WHERE id='published'; INSERT INTO community_attachments(id,owner_id,kind,parent_type,parent_id,original_name) VALUES('image','owner','image','channel_post','published','Photo.png')");
  const legacy = channelMedia(f.sqlite, "channel", "all");
  assert.equal(legacy.items.length, 2);
  assert.equal(channelMedia(f.sqlite, "channel", "photo").items[0].block.type, "image");
  assert.equal((f.sqlite.prepare("SELECT count(*) n FROM community_attachments").get() as { n: number }).n, 1);
  f.sqlite.exec("UPDATE channels SET archived=1");
  assert.deepEqual(channelMedia(f.sqlite, "channel", "all").items, []);
});
