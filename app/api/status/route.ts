import { NextResponse } from "next/server";
import { getMaintenanceStatus } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getMaintenanceStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
