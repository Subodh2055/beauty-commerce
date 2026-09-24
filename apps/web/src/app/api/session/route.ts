/**
 * Mirrors the browser's access token into an httpOnly cookie.
 *
 * Why this exists: tokens live in localStorage (see lib/auth.tsx), which
 * middleware running on the server cannot read. This cookie gives middleware
 * something to check so /admin can be refused before the page renders.
 *
 * The cookie is a convenience for routing only. It is never trusted on its own
 * — middleware hands it to the API for verification, and every admin endpoint
 * re-checks the bearer token anyway.
 */

import { NextResponse } from "next/server";

export const COOKIE_NAME = "bc_at";

/** Matches ACCESS_TOKEN_EXPIRE_MINUTES on the API, plus a little slack. */
const MAX_AGE_SECONDS = 6 * 60;

export async function POST(request: Request) {
  let token: unknown;
  try {
    token = ((await request.json()) as { access_token?: unknown }).access_token;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Shape check only — the API verifies the signature.
  if (typeof token !== "string" || token.split(".").length !== 3 || token.length > 4096) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
