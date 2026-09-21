import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadLimitBytes } from "@/lib/roles";
import { UploadTooLargeError, stageUpload } from "@/lib/staged-upload";

export const runtime = "nodejs";
export const maxDuration = 3600;
/** Never let a framework/CDN layer buffer or cache this — the body is the file. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const name = new URL(request.url).searchParams.get("name") ?? "upload.bin";
  const maxBytes = uploadLimitBytes(user.role);

  try {
    const staged = await stageUpload(request.body, name, maxBytes);
    return NextResponse.json({ token: staged.token, name: staged.name, size: staged.size });
  } catch (error) {
    if (error instanceof UploadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось принять файл." },
      { status: 400 },
    );
  }
}
