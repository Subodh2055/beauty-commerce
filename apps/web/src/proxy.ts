/**
 * Server-side gate for /admin.
 *
 * Next 16 renamed the `middleware` file convention to `proxy`; this runs before
 * the route is rendered, same as before.
 *
 * AdminShell already redirects non-admins, but that happens after the page has
 * been sent and hydrated — the shell flashes first. This refuses the request up
 * front instead.
 *
 * It verifies by asking the API (`GET /auth/me` with the mirrored cookie)
 * rather than checking the JWT signature here. That keeps the signing secret
 * out of the web app entirely and makes the API the single authority: a token
 * that has been revoked, or whose session hit the idle or absolute timeout, is
 * rejected by the same code path that guards every other endpoint.
 *
 * Cost is one internal request per admin *navigation* — the matcher excludes
 * assets and data requests.
 */

import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "bc_at";
const ADMIN_ROLES = new Set(["STAFF", "ADMIN", "SUPER_ADMIN"]);

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api/v1";

function redirect(req: NextRequest, to: string) {
  const url = req.nextUrl.clone();
  const [pathname, query] = to.split("?");
  url.pathname = pathname;
  url.search = query ? `?${query}` : "";
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const next = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);

  if (!token) {
    // Not signed in, or the mirror lapsed while the tab sat idle. Either way
    // the client re-syncs the cookie on its next refresh; sending the user to
    // sign-in with ?next= brings them straight back.
    return redirect(req, `/login?next=${next}`);
  }

  let roles: string[] = [];
  try {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    // 401 covers an expired, revoked or forged token alike — we cannot tell
    // which from here, so use the neutral reason rather than claiming idle.
    if (res.status === 401) return redirect(req, `/login?expired=revoked&next=${next}`);
    if (!res.ok) throw new Error(`auth/me returned ${res.status}`);
    roles = ((await res.json()) as { roles?: string[] }).roles ?? [];
  } catch {
    // API unreachable or slow: fail closed rather than serve the admin shell.
    return redirect(req, `/login?next=${next}`);
  }

  if (!roles.some((r) => ADMIN_ROLES.has(r))) {
    return redirect(req, "/");
  }
  return NextResponse.next();
}

export const config = {
  // Admin pages only — without a matcher this would run on every request,
  // including static assets.
  matcher: ["/admin/:path*"],
};
