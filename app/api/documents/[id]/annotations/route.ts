import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentAnnotations } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * Пометки книги отдельно от HTML страницы: сначала лёгкие булавки,
 * потом те, что открывают вторую книгу. Сам файл к этому не привязан.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tierParam = new URL(request.url).searchParams.get("tier");
  const tier = tierParam === "linked" ? "linked" : "pins";
  const user = await getCurrentUser();
  const items = await getDocumentAnnotations(id, user?.id ?? null, tier);
  return NextResponse.json({ items });
}
