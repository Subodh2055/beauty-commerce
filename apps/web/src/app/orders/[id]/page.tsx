"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAuth, useOrders, type OrderDetail } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { AccountShell } from "@/components/account/account-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge, PaymentStatusBadge, label } from "@/components/order/status-badge";
import { ReturnRequests } from "@/components/order/return-request";
import { OrderTracking } from "@/components/order/order-tracking";
import { confirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";

const CANCELLABLE = new Set(["PENDING_PAYMENT", "PROCESSING"]);

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <OrderView />
    </Suspense>
  );
}

function OrderSkeleton() {
  return (
    <div className="container-x space-y-4 py-10">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </div>
  );
}

function OrderView() {
  const { user, ready } = useAuth();
  const { get, cancel } = useOrders();
  const params = useParams<{ id: string }>();
  const placed = useSearchParams().get("placed") === "1";
  const reduce = useReducedMotion();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    get(params.id)
      .then((o) => active && setOrder(o))
      .catch((err) => active && setError(err instanceof Error ? err.message : "Order not found"));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, params.id]);

  async function onCancel() {
    const ok = await confirmDialog({
      title: "Cancel this order?",
      description: "Your items will be released and any payment refunded.",
      confirmLabel: "Cancel order",
      cancelLabel: "Keep order",
      tone: "danger",
    });
    if (!ok) return;
    setCancelling(true);
    try {
      setOrder(await cancel(params.id));
      toast.success("Order cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setCancelling(false);
    }
  }

  const crumbs = [
    { href: "/account", label: "Account" },
    { href: "/orders", label: "Orders" },
    { href: `/orders/${params.id}`, label: order?.order_number ?? "Order" },
  ];

  return (
    <AccountShell
      title={order?.order_number ?? "Order"}
      crumbs={crumbs}
      aside={
        order && (
          <div className="flex flex-wrap gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment_status} />
          </div>
        )
      }
    >
      {error ? (
        <EmptyState
          title="We couldn't open this order"
          description={error}
          icon={<AlertIcon width={26} height={26} />}
          action={<ButtonLink href="/orders">Back to orders</ButtonLink>}
        />
      ) : !order ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-6">
          {placed && order.status !== "PAYMENT_FAILED" && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="flex items-start gap-3 rounded-card border border-success/30 bg-success-soft px-5 py-4 text-success"
              role="status"
            >
              <CheckIcon className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Thank you! Your order is confirmed.</p>
                <p className="text-sm">
                  Order {order.order_number} — we&apos;ll email you as it moves, and you can follow it right here.
                </p>
              </div>
            </motion.div>
          )}

          <OrderTracking order={order} />

          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <section aria-labelledby="items-title" className="rounded-panel border border-border bg-surface p-6 shadow-soft">
                <h2 id="items-title" className="mb-4 font-display text-xl font-semibold">
                  Items
                </h2>
                <ul className="divide-y divide-border">
                  {order.items.map((it, i) => (
                    <li key={i} className="flex gap-4 py-4">
                      <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-control bg-surface-2">
                        {it.image_url && <Image src={it.image_url} alt="" fill sizes="64px" className="object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        {it.slug ? (
                          <Link href={`/products/${it.slug}`} className="focus-ring rounded-sm font-medium hover:text-accent">
                            {it.product_name}
                          </Link>
                        ) : (
                          <span className="font-medium">{it.product_name}</span>
                        )}
                        <p className="text-sm text-muted">
                          {it.variant_name} · Qty {it.quantity}
                        </p>
                        {order.status === "DELIVERED" && it.slug && (
                          <Link
                            href={`/products/${it.slug}#reviews-heading`}
                            className="focus-ring mt-1 inline-block rounded-sm text-sm font-medium text-accent hover:underline"
                          >
                            Write a review
                          </Link>
                        )}
                      </div>
                      <span className="font-medium tabular-nums">{formatMoney(it.line_total, order.currency)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <ReturnRequests order={order} />

              <section aria-labelledby="activity-title" className="rounded-panel border border-border bg-surface p-6 shadow-soft">
                <h2 id="activity-title" className="mb-4 font-display text-xl font-semibold">
                  Activity
                </h2>
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {[...order.history].reverse().map((h, i) => (
                    <li key={i} className="relative">
                      <span
                        aria-hidden
                        className={`absolute -left-6.25 top-1.5 h-2.5 w-2.5 rounded-pill ring-4 ring-surface ${i === 0 ? "bg-accent" : "bg-border-strong"}`}
                      />
                      <p className="text-sm font-medium">{label(h.status)}</p>
                      {h.note && <p className="text-sm text-muted">{h.note}</p>}
                      <p className="text-xs text-muted">
                        <time dateTime={h.created_at}>{new Date(h.created_at).toLocaleString("en-GB")}</time>
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <aside className="h-fit space-y-6">
              <section className="rounded-panel bg-surface-2 p-6">
                <h2 className="mb-3 font-display text-xl font-semibold">Summary</h2>
                <dl className="space-y-2 text-sm">
                  <Row label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
                  {Number(order.discount_total) > 0 && (
                    <Row label="Discount" value={`− ${formatMoney(order.discount_total, order.currency)}`} />
                  )}
                  <Row
                    label="Shipping"
                    value={Number(order.shipping_fee) === 0 ? "Free" : formatMoney(order.shipping_fee, order.currency)}
                  />
                  <Row
                    label={taxAdded(order) ? "VAT" : "VAT (incl.)"}
                    value={formatMoney(order.tax_total, order.currency)}
                    muted={!taxAdded(order)}
                  />
                  <div className="border-t border-border pt-2">
                    <Row label="Total" value={formatMoney(order.total, order.currency)} strong />
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted">Payment: {label(order.payment_method)}</p>
              </section>

              <section className="rounded-panel border border-border bg-surface p-6 text-sm shadow-soft">
                <h2 className="mb-2 font-display text-xl font-semibold">Shipping to</h2>
                <p className="font-medium">{order.ship_recipient}</p>
                <p className="text-muted">{order.ship_phone}</p>
                <p className="mt-1">
                  {order.ship_line1}
                  {order.ship_line2 ? `, ${order.ship_line2}` : ""}
                </p>
                <p>
                  {order.ship_city}
                  {order.ship_state ? `, ${order.ship_state}` : ""} {order.ship_postal_code ?? ""}
                </p>
                <p>{order.ship_country}</p>
                {order.customer_note && <p className="mt-2 text-muted">“{order.customer_note}”</p>}
              </section>

              {CANCELLABLE.has(order.status) && (
                <Button variant="outline" className="w-full" onClick={onCancel} disabled={cancelling}>
                  {cancelling ? "Cancelling…" : "Cancel order"}
                </Button>
              )}
            </aside>
          </div>
        </div>
      )}
    </AccountShell>
  );
}

/** Tax was charged on top (prices set to exclude tax) when the total includes it. */
function taxAdded(o: OrderDetail): boolean {
  const base = Number(o.subtotal) - Number(o.discount_total) + Number(o.shipping_fee);
  return Number(o.tax_total) > 0 && Math.abs(Number(o.total) - base - Number(o.tax_total)) < 0.01;
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className={`tabular-nums ${muted ? "text-muted" : ""}`}>{value}</dd>
    </div>
  );
}
