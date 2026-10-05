"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useVendorApi, type VendorOrder, type VendorOrderStatus } from "@/lib/vendor";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useVendor } from "@/components/vendor/vendor-shell";
import { OrderStatusPill, orderStatusLabel } from "@/components/vendor/status-pill";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckIcon, PackageIcon, TruckIcon } from "@/components/ui/icons";

/** The seller pipeline. Each stage knows its single next step. */
const STAGES: { status: VendorOrderStatus; title: string; empty: string }[] = [
  { status: "PROCESSING", title: "New", empty: "No new orders. Nice work." },
  { status: "PACKED", title: "Packed", empty: "Nothing waiting for the courier." },
  { status: "SHIPPED", title: "Shipped", empty: "Nothing in transit." },
  { status: "DELIVERED", title: "Delivered", empty: "No deliveries yet." },
];
const OTHER: VendorOrderStatus[] = ["PENDING", "CANCELLED", "REFUNDED"];

const NEXT: Partial<Record<VendorOrderStatus, { to: VendorOrderStatus; label: string }>> = {
  PROCESSING: { to: "PACKED", label: "Mark packed" },
  PACKED: { to: "SHIPPED", label: "Mark shipped" },
  SHIPPED: { to: "DELIVERED", label: "Mark delivered" },
};

type Board = Record<VendorOrderStatus, VendorOrder[] | null>;
const EMPTY_BOARD = Object.fromEntries(
  [...STAGES.map((s) => s.status), ...OTHER].map((s) => [s, null]),
) as Board;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function VendorOrdersPage() {
  const api = useVendorApi();
  const { readOnly, refresh } = useVendor();
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [open, setOpen] = useState<VendorOrder | null>(null);
  const [view, setView] = useState("pipeline");

  const loadStatus = useCallback(
    async (status: VendorOrderStatus) => {
      try {
        const page = await api.orders({ status, size: 50 });
        setBoard((b) => ({ ...b, [status]: page.items }));
      } catch {
        setBoard((b) => ({ ...b, [status]: [] }));
      }
    },
    [api],
  );

  useEffect(() => {
    [...STAGES.map((s) => s.status), ...OTHER].forEach((s) => void loadStatus(s));
  }, [loadStatus]);

  /** Optimistic move: the card jumps columns immediately; reverts if refused. */
  async function advance(order: VendorOrder, to: VendorOrderStatus, tracking?: string) {
    const from = order.status;
    const moved = { ...order, status: to, tracking_number: tracking || order.tracking_number };
    setBoard((b) => ({
      ...b,
      [from]: (b[from] ?? []).filter((o) => o.id !== order.id),
      [to]: [moved, ...(b[to] ?? [])],
    }));
    setOpen((o) => (o?.id === order.id ? moved : o));
    try {
      const saved = await api.setOrderStatus(order.id, to, tracking);
      setBoard((b) => ({ ...b, [to]: (b[to] ?? []).map((o) => (o.id === saved.id ? saved : o)) }));
      setOpen((o) => (o?.id === saved.id ? saved : o));
      toast.success(`${order.order_number} marked ${orderStatusLabel(to).toLowerCase()}`);
      void refresh();
    } catch (err) {
      setBoard((b) => ({
        ...b,
        [to]: (b[to] ?? []).filter((o) => o.id !== order.id),
        [from]: [order, ...(b[from] ?? [])],
      }));
      setOpen((o) => (o?.id === order.id ? order : o));
      toast.error(err instanceof Error ? err.message : "Couldn't update the order");
    }
  }

  const otherOrders = OTHER.flatMap((s) => board[s] ?? []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold">Orders</h1>
        <p className="text-sm text-muted">
          New → Packed → Shipped → Delivered. Payouts include an order once it&apos;s delivered and paid.
        </p>
      </div>

      <Tabs
        label="Order views"
        value={view}
        onChange={setView}
        items={[
          {
            id: "pipeline",
            label: "Pipeline",
            content: (
              <ol
                className="no-scrollbar -mx-4 grid snap-x snap-mandatory auto-cols-[85%] grid-flow-col gap-4 overflow-x-auto px-4 pb-2 sm:auto-cols-[46%] xl:mx-0 xl:grid-flow-row xl:grid-cols-4 xl:px-0"
                aria-label="Order pipeline"
              >
                {STAGES.map((stage) => {
                  const orders = board[stage.status];
                  return (
                    <li key={stage.status} className="snap-start">
                      <section aria-labelledby={`col-${stage.status}`} className="flex h-full flex-col rounded-card bg-surface-2 p-3">
                        <h2 id={`col-${stage.status}`} className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                          {stage.title}
                          <span className="rounded-pill bg-surface px-2 py-0.5 text-xs tabular-nums">
                            {orders?.length ?? "…"}
                            <span className="sr-only"> orders</span>
                          </span>
                        </h2>
                        {orders === null ? (
                          <div className="space-y-2">
                            <Skeleton className="h-28" />
                            <Skeleton className="h-28" />
                          </div>
                        ) : orders.length === 0 ? (
                          <p className="px-1 py-6 text-center text-xs text-muted">{stage.empty}</p>
                        ) : (
                          <ul className="space-y-2">
                            {orders.map((o) => (
                              <OrderCard
                                key={o.id}
                                order={o}
                                readOnly={readOnly}
                                onOpen={() => setOpen(o)}
                                onAdvance={(to) => (to === "SHIPPED" ? setOpen(o) : advance(o, to))}
                              />
                            ))}
                          </ul>
                        )}
                      </section>
                    </li>
                  );
                })}
              </ol>
            ),
          },
          {
            id: "other",
            label: `Unpaid & cancelled (${otherOrders.length})`,
            content:
              otherOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Nothing here.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {otherOrders.map((o) => (
                    <OrderCard key={o.id} order={o} readOnly onOpen={() => setOpen(o)} onAdvance={() => {}} />
                  ))}
                </ul>
              ),
          },
        ]}
      />

      <OrderDrawer order={open} readOnly={readOnly} onClose={() => setOpen(null)} onAdvance={advance} />
    </div>
  );
}

function OrderCard({
  order: o,
  readOnly,
  onOpen,
  onAdvance,
}: {
  order: VendorOrder;
  readOnly: boolean;
  onOpen: () => void;
  onAdvance: (to: VendorOrderStatus) => void;
}) {
  const next = NEXT[o.status];
  const units = o.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <li className="rounded-control border border-border bg-surface p-3 shadow-soft">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="focus-ring -m-1 block w-[calc(100%+0.5rem)] cursor-pointer rounded-control p-1 text-left"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{o.order_number}</span>
          <span className="text-xs text-muted">{date(o.created_at)}</span>
        </span>
        <span className="mt-1 block text-xs text-muted">
          {units} item{units === 1 ? "" : "s"} · {o.ship_recipient}, {o.ship_city}
        </span>
        <span className="mt-1.5 flex items-center justify-between">
          <OrderStatusPill status={o.status} />
          <span className="text-sm font-medium tabular-nums">{formatMoney(o.vendor_earnings)}</span>
        </span>
      </button>
      {next && !readOnly && (
        <Button size="sm" variant="outline" className="mt-2.5 w-full" onClick={() => onAdvance(next.to)}>
          {next.label}
        </Button>
      )}
    </li>
  );
}

function OrderDrawer({
  order,
  readOnly,
  onClose,
  onAdvance,
}: {
  order: VendorOrder | null;
  readOnly: boolean;
  onClose: () => void;
  onAdvance: (o: VendorOrder, to: VendorOrderStatus, tracking?: string) => Promise<void>;
}) {
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<VendorOrder | null>(order);
  // Keep the last order on screen while the drawer animates closed.
  if (order && order !== shown) {
    setShown(order);
    setTracking(order.tracking_number ?? "");
  }
  const o = order ?? shown;
  const next = o ? NEXT[o.status] : undefined;

  async function act(e?: FormEvent) {
    e?.preventDefault();
    if (!o || !next) return;
    setBusy(true);
    await onAdvance(o, next.to, next.to === "SHIPPED" ? tracking.trim() : undefined);
    setBusy(false);
  }

  return (
    <Drawer open={!!order} onClose={onClose} title={o ? `Order ${o.order_number}` : "Order"} size="lg">
      {o && (
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusPill status={o.status} />
            <span className="text-xs text-muted">Placed {date(o.created_at)}</span>
            <span className="text-xs text-muted">· Payment {o.payment_status.toLowerCase()}</span>
          </div>

          <ol className="grid grid-cols-4 gap-1 text-center text-2xs" aria-label="Fulfilment progress">
            {STAGES.map((s, i) => {
              const idx = STAGES.findIndex((x) => x.status === o.status);
              const done = idx >= i;
              return (
                <li key={s.status} aria-current={idx === i ? "step" : undefined}>
                  <span
                    className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-pill border-2 ${
                      done ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted"
                    }`}
                  >
                    {done ? <CheckIcon width={13} height={13} /> : i === 2 ? <TruckIcon width={13} height={13} /> : <PackageIcon width={13} height={13} />}
                  </span>
                  <span className={done ? "font-semibold" : "text-muted"}>{s.title}</span>
                </li>
              );
            })}
          </ol>

          <section aria-labelledby="od-items">
            <h3 id="od-items" className="mb-2 text-sm font-semibold">
              Items to pack
            </h3>
            <ul className="divide-y divide-border rounded-card border border-border">
              {o.items.map((it, i) => (
                <li key={i} className="flex items-center gap-3 p-3">
                  <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-control bg-surface-2">
                    {it.image_url && <Image src={it.image_url} alt="" fill sizes="44px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{it.product_name}</p>
                    <p className="text-xs text-muted">
                      {it.variant_name} · {it.sku}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold">× {it.quantity}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="od-ship" className="text-sm">
            <h3 id="od-ship" className="mb-1 font-semibold">
              Ship to
            </h3>
            <p>
              {o.ship_recipient} · <a href={`tel:${o.ship_phone}`} className="text-accent underline-offset-4 hover:underline">{o.ship_phone}</a>
            </p>
            <p className="text-muted">
              {o.ship_line1}
              {o.ship_line2 ? `, ${o.ship_line2}` : ""}, {o.ship_city}
              {o.ship_state ? `, ${o.ship_state}` : ""} {o.ship_postal_code ?? ""}
            </p>
            {o.tracking_number && (
              <p className="mt-1">
                Tracking <span className="font-mono select-all">{o.tracking_number}</span>
              </p>
            )}
          </section>

          <section aria-labelledby="od-money">
            <h3 id="od-money" className="mb-2 text-sm font-semibold">
              Your earnings
            </h3>
            <dl className="space-y-1.5 rounded-card bg-surface-2 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Items subtotal</dt>
                <dd className="tabular-nums">{formatMoney(o.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Commission{o.commission_rate ? ` (${Number(o.commission_rate)}%)` : ""}</dt>
                <dd className="tabular-nums">− {formatMoney(o.commission_amount)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                <dt>You receive</dt>
                <dd className="tabular-nums">{formatMoney(o.vendor_earnings)}</dd>
              </div>
            </dl>
            <p className="mt-1.5 text-xs text-muted">{o.paid_out ? "Included in a payout." : "Paid out after delivery."}</p>
          </section>

          {next && !readOnly && (
            <form onSubmit={act} className="space-y-3 border-t border-border pt-5">
              {next.to === "SHIPPED" && (
                <Input
                  label="Tracking number"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  hint="Optional, but customers love it — it appears on their order page."
                  maxLength={100}
                />
              )}
              <Button type="submit" className="w-full" loading={busy}>
                {next.label}
              </Button>
            </form>
          )}
        </div>
      )}
    </Drawer>
  );
}
