"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { ButtonLink } from "@/components/ui/button";

type State = "verifying" | "ok" | "error";

export default function VerifyEmailPage() {
  const { verifyEmail } = useAuth();
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>(token ? "verifying" : "error");
  const [message, setMessage] = useState(
    token ? "" : "This verification link is missing its token.",
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const msg = await verifyEmail(token);
        if (active) {
          setState("ok");
          setMessage(msg);
        }
      } catch (err) {
        if (active) {
          setState("error");
          setMessage(err instanceof Error ? err.message : "This link is invalid or has expired.");
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthCard
      title={state === "ok" ? "Email verified" : state === "error" ? "Verification failed" : "Verifying…"}
      subtitle={
        state === "verifying"
          ? "Confirming your email address…"
          : message || undefined
      }
    >
      {state === "ok" && (
        <ButtonLink href="/account" size="lg" className="w-full">
          Go to my account
        </ButtonLink>
      )}
      {state === "error" && (
        <div className="space-y-3">
          <ButtonLink href="/account" variant="outline" className="w-full">
            Back to account
          </ButtonLink>
          <p className="text-center text-xs text-muted">
            You can request a new link from your account page.
          </p>
        </div>
      )}
    </AuthCard>
  );
}
