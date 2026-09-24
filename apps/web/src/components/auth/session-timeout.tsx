"use client";

/**
 * Idle and absolute session timeouts, client side.
 *
 * The API enforces both deadlines regardless — this exists so the user is
 * signed out *when it happens* (and warned a minute beforehand) rather than
 * discovering it when their next click fails.
 *
 * Three jobs:
 *   1. record interaction (throttled, shared across tabs via localStorage)
 *   2. tick once a second: warn, then sign out, on whichever deadline is nearer
 *   3. keep the access token — and the middleware's cookie mirror — fresh while
 *      the user is active, and stop the moment they go idle
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  ABSOLUTE_TIMEOUT_MS,
  ACTIVITY_KEY,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  REFRESH_SKEW_MS,
  accessTokenExpiresAt,
  readLastActivity,
  writeLastActivity,
  type LogoutReason,
} from "@/lib/session";
import { Button } from "@/components/ui/button";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "focus"] as const;
/** Don't write to localStorage on every mousemove. */
const ACTIVITY_WRITE_THROTTLE_MS = 15_000;

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function SessionTimeout() {
  const { user, ready, sessionStartedAt, accessToken, expire, refreshTokens } = useAuth();
  const router = useRouter();

  const [warningLeft, setWarningLeft] = useState<number | null>(null);
  const lastWrite = useRef(0);
  const refreshing = useRef(false);

  const active = ready && !!user;

  /* --- 1. record activity ------------------------------------------------ */
  useEffect(() => {
    if (!active) return;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWrite.current = now;
      writeLastActivity(now);
    };
    for (const e of ACTIVITY_EVENTS) {
      window.addEventListener(e, onActivity, { passive: true });
    }
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
    };
  }, [active]);

  /* Another tab's activity counts as ours. */
  useEffect(() => {
    if (!active) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY) setWarningLeft(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [active]);

  const signOut = useCallback(
    (reason: LogoutReason) => {
      setWarningLeft(null);
      expire(reason);
      router.replace(`/login?expired=${reason}`);
    },
    [expire, router],
  );

  /* --- 2 & 3. deadlines and token upkeep --------------------------------- */
  useEffect(() => {
    if (!active) return;

    const tick = () => {
      const now = Date.now();
      const idleDeadline = readLastActivity() + IDLE_TIMEOUT_MS;
      const absoluteDeadline = (sessionStartedAt ?? now) + ABSOLUTE_TIMEOUT_MS;

      if (now >= absoluteDeadline) return signOut("absolute");
      if (now >= idleDeadline) return signOut("idle");

      // Warn on whichever deadline arrives first.
      const soonest = Math.min(idleDeadline, absoluteDeadline);
      const left = soonest - now;
      setWarningLeft(left <= IDLE_WARNING_MS ? left : null);

      // Keep the token (and the middleware cookie) alive only while active.
      const expiresAt = accessToken ? accessTokenExpiresAt(accessToken) : 0;
      const stale = expiresAt > 0 && expiresAt - now <= REFRESH_SKEW_MS;
      if (stale && !refreshing.current && left > IDLE_WARNING_MS) {
        refreshing.current = true;
        void refreshTokens()
          .catch(() => signOut("idle"))
          .finally(() => {
            refreshing.current = false;
          });
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active, sessionStartedAt, accessToken, refreshTokens, signOut]);

  const staySignedIn = useCallback(() => {
    writeLastActivity();
    lastWrite.current = Date.now();
    setWarningLeft(null);
    void refreshTokens().catch(() => signOut("idle"));
  }, [refreshTokens, signOut]);

  if (!active || warningLeft === null) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-lift animate-scale-in">
        <h2 id="session-timeout-title" className="font-serif text-xl font-semibold">
          Still there?
        </h2>
        <p className="mt-2 text-sm text-muted">
          You&rsquo;ll be signed out in{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {formatLeft(warningLeft)}
          </span>{" "}
          for security.
        </p>
        <div className="mt-5 flex gap-2">
          <Button onClick={staySignedIn} className="flex-1">
            Stay signed in
          </Button>
          <Button variant="outline" onClick={() => signOut("manual")}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
