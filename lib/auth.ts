import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "blabla_admin";

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "blablablarden";
}

function sessionSecret() {
  return process.env.SESSION_SECRET || "local-development-secret";
}

export function createSessionToken() {
  return createHmac("sha256", sessionSecret())
    .update(`blabla:${adminPassword()}`)
    .digest("hex");
}

export function passwordIsValid(candidate: string) {
  const expected = Buffer.from(adminPassword());
  const actual = Buffer.from(candidate);

  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

export async function isAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const expected = createSessionToken();

  if (!token || token.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
