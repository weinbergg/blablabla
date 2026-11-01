import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { attachmentAccess } from "@/lib/community-access";
import {
  bindAttachments,
  getOwnedAttachment,
  isUploadedFile,
  saveCommunityFile,
  type AttachmentParent,
} from "@/lib/community-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Сохраняет кадр/рисунок как новый файл в той же нити. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const source = await getOwnedAttachment(id);
  if (!source) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const access = await attachmentAccess(source, user);
  if (!access.canRead) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
  if (!access.canEdit) return NextResponse.json({ error: "Нельзя изменять чужое вложение" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!isUploadedFile(file) || file.size === 0) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  try {
    const saved = await saveCommunityFile({ userId: user.id, file });
    const parentType = source.parentType as AttachmentParent | null;
    if (parentType && source.parentId) {
      await bindAttachments({
        userId: user.id,
        ids: [saved.id],
        parentType,
        parentId: source.parentId,
      });
    }
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить кадр" },
      { status: 400 },
    );
  }
}
