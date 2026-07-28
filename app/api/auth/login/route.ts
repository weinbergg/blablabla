import { NextResponse } from "next/server";
import {
  createSessionToken,
  passwordIsValid,
  SESSION_COOKIE,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    password?: unknown;
  } | null;

  if (
    typeof body?.password !== "string" ||
    !passwordIsValid(body.password)
  ) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return response;
}
