import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isUploadedFile, saveCommunityFile } from "@/lib/community-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!isUploadedFile(file) || file.size === 0) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }
  try {
    const saved = await saveCommunityFile({ userId: user.id, file });
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить файл" },
      { status: 400 },
    );
  }
}
