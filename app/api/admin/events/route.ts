import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createCampaign,
  createSeminar,
  listAllCampaigns,
  listAllSeminars,
} from "@/lib/db/events";
import { rublesToKopeks } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }
  const [seminars, campaigns] = await Promise.all([listAllSeminars(), listAllCampaigns()]);
  return NextResponse.json({ seminars, campaigns });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    kind?: "seminar" | "campaign";
    title?: string;
    summary?: string;
    body?: string;
    location?: string;
    startsAt?: string;
    priceRubles?: number;
    discountPercent?: number;
    seatLimit?: number | null;
    goalRubles?: number;
    documentId?: string | null;
    status?: string;
  } | null;

  try {
    if (body?.kind === "seminar") {
      const seminar = await createSeminar({
        title: body.title ?? "",
        summary: body.summary,
        body: body.body,
        location: body.location,
        startsAt: body.startsAt,
        priceKopeks: rublesToKopeks(body.priceRubles ?? 2000),
        discountPercent: body.discountPercent,
        seatLimit: body.seatLimit,
        status: body.status === "open" ? "open" : "draft",
      });
      return NextResponse.json({ seminar }, { status: 201 });
    }
    if (body?.kind === "campaign") {
      const campaign = await createCampaign({
        title: body.title ?? "",
        summary: body.summary,
        body: body.body,
        goalKopeks: rublesToKopeks(body.goalRubles ?? 0),
        documentId: body.documentId,
        status: body.status === "open" ? "open" : "draft",
      });
      return NextResponse.json({ campaign }, { status: 201 });
    }
    return NextResponse.json({ error: "Нужно указать seminar или campaign" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить" },
      { status: 400 },
    );
  }
}
