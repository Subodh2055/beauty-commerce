"use client";

import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { MailIcon } from "@/components/ui/icons";

/**
 * V1: client-only capture. Wire to an /api/v1 newsletter endpoint (or n8n
 * marketing workflow) when the subscriptions feature lands.
 */
export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setDone(true);
    toast.success("You're on the list — thank you!");
    setEmail("");
    window.setTimeout(() => setDone(false), 3000);
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
          className="focus-ring h-11 w-full rounded-full border border-border bg-background pl-11 pr-4 text-sm placeholder:text-muted"
        />
      </label>
      <button
        type="submit"
        className="focus-ring h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        {done ? "Subscribed ✓" : "Subscribe"}
      </button>
    </form>
  );
}
