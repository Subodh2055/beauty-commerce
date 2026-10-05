"use client";

import { useState, type FormEvent } from "react";
import { subscribeNewsletter } from "@/lib/api";
import { toast } from "@/lib/toast";
import { MailIcon, CheckIcon } from "@/components/ui/icons";

/** POSTs to /api/v1/newsletter/subscriptions (idempotent; same reply if already subscribed). */
export function NewsletterForm({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const res = await subscribeNewsletter(value, source);
      setDone(true);
      setEmail("");
      toast.success(res.message);
      window.setTimeout(() => setDone(false), 4000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't subscribe — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md gap-2">
      <label className="relative flex-1">
        <span className="sr-only">Email address</span>
        <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="focus-ring h-11 w-full rounded-full border border-border-strong bg-background pl-11 pr-4 text-sm placeholder:text-muted"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy || undefined}
        className="focus-ring inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {done ? (
            <>
              Subscribed <CheckIcon width={16} height={16} />
            </>
          ) : (
            "Subscribe"
          )}
      </button>
    </form>
  );
}
