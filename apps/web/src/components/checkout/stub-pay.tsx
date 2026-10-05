"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, usePayments, type StubPayment } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon, CardIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Hosted page of the development payment gateway (PAYMENT_STUB_ENABLED). It
 * stands in for eSewa/Khalti/card pages: approving asks the API to sign a
 * provider callback and run it through the real verify → mark-paid path.
 * The API answers 404 when the stub is off, which this page reports.
 */
export function StubPay() {
  const ref = useSearchParams().get("ref") ?? "";
  const { user, ready } = useAuth();
  const payments = usePayments();
  const router = useRouter();
  const [payment, setPayment] = useState<StubPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pay" | "decline" | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/checkout/stub-pay?ref=${ref}`)}`);
      return;
    }
    let active = true;
    payments
      .stub(ref)
      .then((p) => active && setPayment(p))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Payment not found"));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, ref]);

  async function complete(succeeded: boolean) {
    setBusy(succeeded ? "pay" : "decline");
    try {
      const r = await payments.completeStub(ref, succeeded);
      if (succeeded) toast.success("Payment received");
      else toast.error("Payment declined");
      router.replace(`/orders/${r.order_id}${succeeded ? "?placed=1" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete payment");
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="container-x py-16">
        <EmptyState
          title="This payment link isn't valid"
          description={error}
          icon={<AlertIcon width={26} height={26} />}
          action={<ButtonLink href="/orders">Your orders</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-md overflow-hidden rounded-panel border border-border bg-surface shadow-lift">
        <p className="bg-warning-soft px-5 py-2.5 text-center text-xs font-medium text-warning">
          Test payment gateway — no real money moves
        </p>
        <div className="space-y-6 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-accent-soft text-accent">
              <CardIcon />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold">Complete your payment</h1>
              <p className="text-sm text-muted">Beauty · secure checkout</p>
            </div>
          </div>

          {payment ? (
            <dl className="space-y-2 rounded-card bg-surface-2 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Order</dt>
                <dd className="font-medium">{payment.order_number}</dd>
              </div>
              <div className="flex justify-between text-base">
                <dt className="text-muted">Amount</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</dd>
              </div>
            </dl>
          ) : (
            <Skeleton className="h-20" />
          )}

          {payment && payment.status !== "PENDING" ? (
            <div className="space-y-3 text-center">
              <p className="text-sm">This payment has already been {payment.status.toLowerCase()}.</p>
              <ButtonLink href={`/orders/${payment.order_id}`} className="w-full">
                View order
              </ButtonLink>
            </div>
          ) : (
            <div className="space-y-2">
              <Button size="lg" className="w-full" onClick={() => complete(true)} disabled={!payment || busy !== null}>
                {busy === "pay" ? "Processing…" : payment ? `Pay ${formatMoney(payment.amount, payment.currency)}` : "Pay"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => complete(false)} disabled={!payment || busy !== null}>
                {busy === "decline" ? "Declining…" : "Decline payment"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
