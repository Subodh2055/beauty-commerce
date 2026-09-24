"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { roleLanding, useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

const EXPIRY_NOTICE: Record<string, string> = {
  idle: "You were signed out after 40 minutes of inactivity.",
  absolute: "Your session reached its 8-hour limit. Please sign in again.",
  revoked: "Your session ended. Please sign in again.",
};

function SessionNotice({ reason }: { reason: string }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-2.5 text-sm text-foreground"
    >
      {EXPIRY_NOTICE[reason] ?? EXPIRY_NOTICE.revoked}
    </p>
  );
}

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Honour an explicit ?next=, otherwise send each role to its home.
  const next = params.get("next");
  // Set by the session-timeout guard and by middleware when it turns us away.
  const expired = params.get("expired");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(next || roleLanding(user));
  }, [ready, user, next, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const signedIn = await login(String(fd.get("email")), String(fd.get("password")));
      toast.success(signedIn.roles.some((r) => r !== "CUSTOMER") ? "Welcome back, admin" : "Welcome back");
      router.replace(next || roleLanding(signedIn));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Beauty Commerce account."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {expired && !error && <SessionNotice reason={expired} />}
        <FormError message={error} />
        <Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        <div className="text-right">
          <Link href="/forgot-password" className="text-xs text-muted hover:text-accent">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
