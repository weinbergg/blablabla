import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "blabla_session";

/**
 * Soft maintenance gate. Full lock uses MAINTENANCE_MODE=1.
 * Admins (cookie present + path allowlist) still reach /admin and APIs;
 * role is checked server-side on those routes. Here we only skip the
 * redirect for signed-in users hitting admin/auth/status paths, and for
 * everyone we always allow the maintenance page + Next static assets.
 */
export function middleware(request: NextRequest) {
  const locked = ["1", "true", "yes", "on"].includes(
    (process.env.MAINTENANCE_MODE || "").trim().toLowerCase(),
  );
  if (!locked) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (
    pathname === "/maintenance" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/uploads/") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname.startsWith("/api/status") ||
    pathname.startsWith("/api/auth/")
  ) {
    return NextResponse.next();
  }

  // Signed-in users can still hit admin + APIs (role checks stay server-side).
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession && (pathname.startsWith("/admin") || pathname.startsWith("/api/"))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
