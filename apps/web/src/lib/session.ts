/**
 * Session lifetime rules, mirrored from the API.
 *
 * The server is the authority — it refuses an expired refresh token (idle) and
 * an over-age `sst` claim (absolute). These client-side copies exist so the UI
 * can log out *promptly* and warn first, instead of leaving a dead session on
 * screen until the next request happens to fail.
 *
 * Keep the numbers in step with SESSION_IDLE_TIMEOUT_MINUTES and
 * SESSION_ABSOLUTE_TIMEOUT_HOURS in the API's settings.
 */

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const IDLE_TIMEOUT_MS =
  num(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES, 40) * 60_000;

export const ABSOLUTE_TIMEOUT_MS =
  num(process.env.NEXT_PUBLIC_SESSION_ABSOLUTE_HOURS, 8) * 60 * 60_000;

/** How long before the idle deadline the "still there?" prompt appears. */
export const IDLE_WARNING_MS = 60_000;

/** Refresh the access token when it has this little life left. */
export const REFRESH_SKEW_MS = 90_000;

export const ACTIVITY_KEY = "beauty-commerce:auth:activity:v1";

export type LogoutReason = "idle" | "absolute" | "manual" | "revoked";

/** Query string the login page reads to explain why the user landed there. */
export function expiredParam(reason: LogoutReason): string {
  return reason === "manual" ? "" : `?expired=${reason}`;
}

/* ---------- JWT ---------- */

interface JwtClaims {
  exp?: number;
  iat?: number;
  /** Session start (epoch seconds) — anchors the absolute cap. */
  sst?: number;
  sid?: string;
  roles?: string[];
}

/**
 * Read a JWT payload WITHOUT verifying it.
 *
 * Only ever used for display and for deciding when to refresh. Never for an
 * access decision — the API verifies the signature on every request.
 */
export function readClaims(token: string): JwtClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JwtClaims;
  } catch {
    return null;
  }
}

/** Epoch ms when the session began, from the token's `sst`. */
export function sessionStartedAt(accessToken: string): number {
  const sst = readClaims(accessToken)?.sst;
  return typeof sst === "number" ? sst * 1000 : Date.now();
}

/** Epoch ms when this access token stops being accepted. */
export function accessTokenExpiresAt(accessToken: string): number {
  const exp = readClaims(accessToken)?.exp;
  return typeof exp === "number" ? exp * 1000 : 0;
}

/* ---------- activity ---------- */

/**
 * Last interaction, shared across tabs through localStorage so that being busy
 * in one tab keeps the others alive.
 */
export function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : Date.now();
  } catch {
    return Date.now();
  }
}

export function writeLastActivity(at = Date.now()): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    /* private mode — the server still enforces both deadlines */
  }
}

export function clearLastActivity(): void {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------- cookie mirror ---------- */

/**
 * Mirror the access token into an httpOnly cookie so Next.js middleware can
 * gate /admin before the page renders. Best-effort: the API is the real
 * boundary, and a failure here only costs the pre-render guard.
 */
export async function syncSessionCookie(accessToken: string | null): Promise<void> {
  try {
    await fetch("/api/session", {
      method: accessToken ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: accessToken ? JSON.stringify({ access_token: accessToken }) : undefined,
      keepalive: true,
    });
  } catch {
    /* offline or blocked — ignore */
  }
}
