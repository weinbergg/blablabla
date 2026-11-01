import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadModule } from "./support/isolated-db";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

test("annotated export enforces login, download rights and quota before generating a file", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  let allowed = true;
  let quota = true;
  let generated = 0;
  let recorded = 0;
  const fileServe = loadModule("lib/file-serve.ts", { ...f.mocks, "next/server": { NextResponse: Response } });
  const { GET } = loadModule<{ GET: Handler }>("app/api/documents/[id]/download-annotated/route.ts", {
    ...f.mocks,
    "next/server": { NextResponse: Response },
    "fs/promises": { stat: async () => ({ size: 100 }) },
    "@/lib/file-serve": fileServe,
    "@/lib/file-access": { clientIpFrom: () => null },
    "@/lib/db/queries": {
      getDocumentById: async () => ({ id: "book", title: "Книга.pdf", fileType: "PDF", fileUrl: "/uploads/book.pdf" }),
      getDocumentAnnotations: async (_id: string, viewer: string) => { assert.equal(viewer, "owner"); return [{ id: "note" }]; },
    },
    "@/lib/db/billing": { getEntitlements: async () => ({}), recordDownload: async () => { recorded += 1; } },
    "@/lib/db/settings": { getSiteConfig: async () => ({}) },
    "@/lib/entitlements": { hasFeature: () => allowed },
    "@/lib/download-quota": { assertDownloadUnits: async () => quota ? { ok: true } : { ok: false, response: Response.json({}, { status: 429 }) } },
    "@/lib/pdf-export": { exportPdfWithAnnotations: async () => { generated += 1; return Buffer.from("%PDF-test"); } },
  });
  const invoke = () => GET(new Request("http://localhost"), { params: Promise.resolve({ id: "book" }) });
  f.setUser(null);
  assert.equal((await invoke()).status, 401);
  f.setUser({ id: "owner", name: "Owner", role: "member" });
  allowed = false;
  assert.equal((await invoke()).status, 403);
  allowed = true; quota = false;
  assert.equal((await invoke()).status, 429);
  assert.equal(generated, 0);
  assert.equal(recorded, 0);
  quota = true;
  const response = await invoke();
  assert.equal(response.status, 200);
  assert.match(decodeURIComponent(response.headers.get("Content-Disposition") ?? ""), /Книга \(с пометками\)\.pdf/);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(generated, 1);
  assert.equal(recorded, 1);
});

test("forwarding cannot bypass channel publication entitlement", async (t) => {
  const f = fixture(); t.after(() => f.sqlite.close());
  let created = 0;
  const { POST } = loadModule<{ POST: Handler }>("app/api/channels/forward/route.ts", {
    ...f.mocks,
    "@/lib/db/billing": { getEntitlements: async () => ({}) },
    "@/lib/entitlements": { hasFeature: () => false },
    "@/lib/db/channels": {
      getChannelByOwner: async () => ({ id: "channel" }),
      createPost: async () => { created += 1; },
    },
  });
  const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ title: "Title", excerpt: "body" }) }), { params: Promise.resolve({ id: "" }) });
  assert.equal(response.status, 403);
  assert.equal(created, 0);
});
