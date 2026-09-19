"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { roleLanding, useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Honour an explicit ?next=, otherwise send each role to its home.
  const next = params.get("next");
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
