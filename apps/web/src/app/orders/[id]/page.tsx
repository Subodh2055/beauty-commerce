"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, useOrders, type OrderDetail } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/catalog/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge, PaymentStatusBadge, label } from "@/components/order/status-badge";

const CANCELLABLE = new Set(["PENDING_PAYMENT", "PROCESSING"]);

export default function OrderDetailPage() {
  const { user, ready } = useAuth();
  const { get, cancel } = useOrders();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const placed = search.get("placed") === "1";

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`/login?next=/orders/${params.id}`);
      return;
    }
    let active = true;
    (async () => {
      try {
        const o = await get(params.id);
        if (active) setOrder(o);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Order not found");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, router, params.id]);

  async function onCancel() {
    if (!confirm("Cancel this order? Stock will be released.")) return;
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

  if (error) {
    return (
      <div className="container-x py-10">
        <div className="rounded-3xl border border-dashed border-border p-16 text-center">
          <p className="mb-4 text-muted">{error}</p>
          <ButtonLink href="/orders">Back to orders</ButtonLink>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container-x py-10 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="container-x py-10">
      {placed && (
        <div className="mb-6 animate-fade-up rounded-2xl border border-success/30 bg-success/10 px-5 py-4 text-success">
          <p className="font-medium">Thank you! Your order is confirmed.</p>
          <p className="text-sm">Order {order.order_number} — we&apos;ll be in touch about delivery.</p>
        </div>
      )}

      <PageHeader
        title={order.order_number}
        crumbs={[{ href: "/orders", label: "Orders" }, { href: `/orders/${order.id}`, label: order.order_number }]}
        aside={
          <div className="flex flex-wrap gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment_status} />
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="mb-4 font-serif text-lg font-semibold">Items</h2>
            <ul className="divide-y divide-border">
              {order.items.map((it, i) => (
                <li key={i} className="flex gap-4 py-4">
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    {it.image_url && <Image src={it.image_url} alt="" fill sizes="64px" className="object-cover" />}
                  </div>
                  <div className="flex-1">
                    {it.slug ? (
                      <Link href={`/products/${it.slug}`} className="font-medium hover:text-accent">
                        {it.product_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{it.product_name}</span>
                    )}
                    <p className="text-sm text-muted">
                      {it.variant_name} · Qty {it.quantity}
                    </p>
                    <p className="mt-1 text-xs text-muted">SKU {it.sku}</p>
                  </div>
                  <span className="font-medium tabular-nums">{formatMoney(it.line_total, order.currency)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="mb-4 font-serif text-lg font-semibold">Timeline</h2>
            <ol className="space-y-4">
              {order.history.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <div>
                    <p className="text-sm font-medium">{label(h.status)}</p>
                    {h.note && <p className="text-sm text-muted">{h.note}</p>}
                    <p className="text-xs text-muted">
                      {new Date(h.created_at).toLocaleString("en-GB")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="h-fit space-y-6">
          <section className="rounded-3xl bg-surface-2 p-6">
            <h2 className="mb-3 font-serif text-lg font-semibold">Summary</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
              <Row label="Shipping" value={Number(order.shipping_fee) === 0 ? "Free" : formatMoney(order.shipping_fee, order.currency)} />
              <Row label="VAT (incl.)" value={formatMoney(order.tax_total, order.currency)} muted />
              <div className="border-t border-border pt-2">
                <Row label="Total" value={formatMoney(order.total, order.currency)} strong />
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">Payment: {label(order.payment_method)}</p>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-6 text-sm shadow-soft">
            <h2 className="mb-2 font-serif text-lg font-semibold">Shipping to</h2>
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
          </section>

          {CANCELLABLE.has(order.status) && (
            <Button variant="outline" className="w-full" onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel order"}
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className={`tabular-nums ${muted ? "text-muted" : ""}`}>{value}</dd>
    </div>
  );
}
