"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, useOrders, type OrderSummary } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/catalog/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/order/status-badge";
import { ChevronIcon } from "@/components/ui/icons";

export default function OrdersPage() {
  const { user, ready } = useAuth();
  const { list } = useOrders();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login?next=/orders");
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await list();
        if (active) setOrders(res.items);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load orders");
          setOrders([]);
        }
      }
    })();
    return () => {
      active = false;
    };
    // list() is stable per render; refetch only when auth state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, router]);

  return (
    <div className="container-x py-10">
      <PageHeader title="Your orders" crumbs={[{ href: "/orders", label: "Orders" }]} />

      {orders === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-16 text-center">
          <p className="mb-4 text-muted">{error ?? "You haven't placed any orders yet."}</p>
          <ButtonLink href="/products">Start shopping</ButtonLink>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="group focus-ring flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{o.order_number}</span>
                    <OrderStatusBadge status={o.status} />
                    <PaymentStatusBadge status={o.payment_status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {new Date(o.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {o.item_count} item{o.item_count === 1 ? "" : "s"} · {o.payment_method}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</span>
                <ChevronIcon className="text-muted transition-transform group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
