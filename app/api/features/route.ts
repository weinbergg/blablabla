import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/features";
import { featureAvailability } from "@/lib/feature-flags";
export async function GET() {
  return NextResponse.json(featureAvailability(getFeatureFlags(), await getCurrentUser()), { headers: { "Cache-Control": "private, no-store" } });
}
