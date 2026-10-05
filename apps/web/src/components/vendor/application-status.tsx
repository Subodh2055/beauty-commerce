"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { useVendorApi, VendorApiError, type Vendor } from "@/lib/vendor";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertIcon, CheckIcon, ClockIcon } from "@/components/ui/icons";

const POLL_MS = 30_000;

/**
 * Where a seller application stands. Pending applications re-check every 30 s
 * while the tab is visible, so approval shows up without a reload.
 */
export function ApplicationStatus() {
  const { user, ready } = useAuth();
  const api = useVendorApi();
  const justSent = useSearchParams().get("submitted") === "1";
  const reduce = useReducedMotion();
  const [vendor, setVendor] = useState<Vendor | null | undefined>(undefined);

  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    const check = () =>
      api
        .me()
        .then((v) => active && setVendor(v))
        .catch((e) => active && e instanceof VendorApiError && e.status === 404 && setVendor(null));
    void check();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [ready, user, api]);

  if (!ready || vendor === undefined) return <Skeleton className="h-96 rounded-panel" />;

  if (vendor === null) {
    return (
      <Card padding="lg" className="text-center">
        <h1 className="font-display text-3xl font-semibold">Sell on Beauty</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">
          You don&apos;t have a seller account yet. Apply in a few minutes — we review every store by hand.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/vendor/apply">Start your application</ButtonLink>
          <ButtonLink href="/sell" variant="outline">
            How selling works
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const steps = [
    { label: "Application sent", done: true, when: vendor.created_at },
    {
      label: vendor.status === "REJECTED" ? "Not approved" : "Review",
      done: vendor.status !== "PENDING",
      current: vendor.status === "PENDING",
      failed: vendor.status === "REJECTED",
      when: vendor.reviewed_at,
    },
    { label: "Start selling", done: vendor.status === "APPROVED" || vendor.status === "SUSPENDED" },
  ];

  return (
    <Card padding="lg">
      {justSent && vendor.status === "PENDING" && (
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-2 rounded-card bg-success-soft p-3 text-sm text-success"
          role="status"
        >
          <CheckIcon width={16} height={16} /> Thanks — your application is in.
        </motion.p>
      )}

      <p className="eyebrow">Seller application</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">
        {vendor.status === "PENDING" && "We're reviewing your store"}
        {vendor.status === "APPROVED" && "You're approved — welcome!"}
        {vendor.status === "REJECTED" && "Your application wasn't approved"}
        {vendor.status === "SUSPENDED" && "Your store is suspended"}
      </h1>
      <p className="mt-1 text-muted">{vendor.name}</p>

      <ol className="my-8 space-y-0" aria-label="Application progress">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0" aria-current={s.current ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span aria-hidden className={`absolute left-4 top-8 h-[calc(100%-2rem)] w-0.5 -translate-x-1/2 ${s.done ? "bg-accent" : "bg-border"}`} />
            )}
            <span
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border-2 ${
                s.failed
                  ? "border-danger bg-danger-soft text-danger"
                  : s.done
                    ? "border-accent bg-accent text-accent-foreground"
                    : s.current
                      ? "border-accent text-accent"
                      : "border-border text-muted"
              }`}
            >
              {s.failed ? <AlertIcon width={14} height={14} /> : s.done ? <CheckIcon width={14} height={14} /> : <ClockIcon width={14} height={14} />}
              {s.current && !reduce && <span aria-hidden className="absolute inset-0 animate-ping rounded-pill border-2 border-accent opacity-30" />}
            </span>
            <div className="pt-1">
              <p className={`text-sm ${s.done || s.current ? "font-medium" : "text-muted"}`}>
                {s.label}
                {s.current && <span className="sr-only"> (in progress)</span>}
              </p>
              {s.when && (
                <p className="text-xs text-muted">
                  {new Date(s.when).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {vendor.status === "PENDING" && (
        <div className="space-y-3 rounded-card bg-surface-2 p-4 text-sm">
          <p className="font-medium">What happens next</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>We check your details, usually within two working days.</li>
            <li>We&apos;ll email {vendor.contact_email} with the decision.</li>
            <li>This page updates by itself — no need to refresh.</li>
          </ul>
        </div>
      )}
      {vendor.status === "REJECTED" && (
        <div className="space-y-4">
          {vendor.status_reason && (
            <p className="rounded-card bg-danger-soft p-4 text-sm text-danger">Reviewer&apos;s note: {vendor.status_reason}</p>
          )}
          <ButtonLink href="/vendor/apply">Update and re-apply</ButtonLink>
        </div>
      )}
      {(vendor.status === "APPROVED" || vendor.status === "SUSPENDED") && (
        <ButtonLink href="/vendor">Go to seller centre</ButtonLink>
      )}
    </Card>
  );
}
