import assert from "node:assert/strict";
import test from "node:test";
import * as flags from "../lib/feature-flags";
import { fixture, loadModule } from "./support/isolated-db";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
const context = { params: Promise.resolve({ id: "published" }) };
const request = (body: unknown) => new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) });
test("feature modes restrict guests, readers, testers and administrators; dependent sections stay closed", () => {
  const expected = { on: [true, true, true, true], testers: [false, false, true, true], admins: [false, false, false, true], off: [false, false, false, false] };
  const users = [null, { id: "reader", role: "member" }, { id: "tester", role: "member" }, { id: "admin", role: "admin" }];
  for (const [mode, results] of Object.entries(expected)) {
    for (const feature of flags.FEATURES) {
      const value = { modes: { ...flags.DEFAULT_FLAGS.modes, [feature.id]: mode as flags.FeatureMode }, testerIds: ["tester"] };
      assert.deepEqual(users.map(user => flags.flagAllows(value, feature.id, user)), results, `${feature.id}: ${mode}`);
    }
  }
  const allowed = flags.featureAvailability({ modes: { ...flags.DEFAULT_FLAGS.modes, channels: "off", rooms: "off" }, testerIds: [] }, users[3]);
  for (const key of ["channels", "feed", "channel_creation", "rooms", "room_creation"] as const) assert.equal(allowed[key], false);
});
test("administrators can change availability, validation protects settings and private tester IDs", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const features = loadModule("lib/features.ts", { ...f.mocks, "./feature-flags": flags });
  const mocks = { ...f.mocks, "@/lib/features": features };
  const admin = loadModule<{ PUT: Handler }>("app/api/admin/features/route.ts", mocks);
  const publicRoute = loadModule<{ GET: () => Promise<Response> }>("app/api/features/route.ts", mocks);
  const value = { modes: { ...flags.DEFAULT_FLAGS.modes, channels: "testers" }, testerIds: ["other"] };
  assert.equal((await admin.PUT(request(value), context)).status, 403);
  f.setUser({ id: "owner", name: "Admin", role: "admin" });
  for (const invalid of [{ ...value, modes: { channels: "off" } }, { ...value, testerIds: ["missing-user"] }, { ...value, modes: { ...value.modes, channels: "whatever" } }]) assert.equal((await admin.PUT(request(invalid), context)).status, 400);
  f.sqlite.exec("INSERT INTO site_settings(key,value) VALUES('billing', 'unchanged')");
  assert.equal((await admin.PUT(request(value), context)).status, 200);
  assert.deepEqual(f.sqlite.prepare("SELECT value FROM site_settings WHERE key='billing'").get(), { value: "unchanged" });
  f.setUser(null);
  const guest = await (await publicRoute.GET()).json();
  assert.equal(guest.channels, false); assert.equal(guest.feed, false); assert.equal(guest.testerIds, undefined);
  f.setUser({ id: "other", name: "Tester", role: "member" });
  assert.equal((await (await publicRoute.GET()).json()).channels, true);
});
test("shutdown protects existing API and bound attachments even for their owner, without deleting content", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const features = loadModule("lib/features.ts", { ...f.mocks, "./feature-flags": flags });
  const mocks = { ...f.mocks, "@/lib/features": features };
  const access = loadModule<{ attachmentAccess: (row: object, user: object) => Promise<{ canRead: boolean; canEdit: boolean }> }>("lib/community-access.ts", mocks);
  const route = loadModule<{ PUT: Handler; GET: Handler }>("app/api/channels/posts/[id]/interactions/route.ts", mocks);
  f.sqlite.exec(`INSERT INTO site_settings(key,value) VALUES('feature_flags','{"modes":{"channels":"off"}}')`);
  assert.equal((await route.GET(new Request("http://localhost"), context)).status, 403);
  assert.equal((await route.PUT(request({ action: "save", active: true }), context)).status, 403);
  assert.deepEqual(await access.attachmentAccess({ parentType: "channel_post", parentId: "published", ownerId: "owner" }, { id: "owner", role: "admin" }), { canRead: false, canEdit: false });
  assert.equal((f.sqlite.prepare("SELECT count(*) n FROM channel_posts").get() as { n: number }).n, 3);
  f.sqlite.exec(`UPDATE site_settings SET value='{"modes":{"channels":"on","comments":"off"}}' WHERE key='feature_flags'`);
  const read = await route.GET(new Request("http://localhost"), context);
  assert.equal(read.status, 200); assert.deepEqual(await read.json(), { comments: [] });
});
