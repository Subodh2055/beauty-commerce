"use client";

import { motion, useReducedMotion } from "motion/react";
import type { OrderDetail } from "@/lib/auth";
import { AlertIcon, CheckIcon, PackageIcon, TruckIcon } from "@/components/ui/icons";
import { label } from "./status-badge";

const STAGES = [
  { key: "placed", label: "Order placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

// How far each order status has travelled along STAGES (index of the last reached stage).
const REACHED: Record<string, number> = {
  PENDING_PAYMENT: 0,
  PAID: 1,
  PROCESSING: 1,
  SHIPPED: 2,
  DELIVERED: 3,
};
const STAGE_OF_STATUS: Record<string, number> = { PAID: 1, PROCESSING: 1, SHIPPED: 2, DELIVERED: 3 };

function when(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Tracking timeline: a four-stage stepper derived from the order status and its
 * history timestamps, then one card per seller shipment with tracking numbers.
 * Cancelled / failed / refunded orders show where they stopped and why.
 */
export function OrderTracking({ order }: { order: OrderDetail }) {
  const reduce = useReducedMotion();
  const stopped = ["CANCELLED", "PAYMENT_FAILED", "REFUNDED"].includes(order.status);

  // Timestamp of the first time the order reached each stage.
  const times: (string | null)[] = STAGES.map((_, i) =>
    i === 0 ? order.created_at : (order.history.find((h) => STAGE_OF_STATUS[h.status] === i)?.created_at ?? null),
  );
  // A stopped order reached as far as its history shows before it stopped.
  const reached = stopped
    ? Math.max(0, ...order.history.map((h) => STAGE_OF_STATUS[h.status] ?? 0))
    : (REACHED[order.status] ?? 0);
  const stopEvent = stopped ? [...order.history].reverse().find((h) => h.status === order.status) : null;
  const awaitingPayment = order.status === "PENDING_PAYMENT";

  return (
    <section aria-labelledby="tracking-title" className="rounded-panel border border-border bg-surface p-6 shadow-soft">
      <h2 id="tracking-title" className="mb-6 font-display text-2xl font-semibold">
        Tracking
      </h2>

      <ol className="relative grid gap-6 sm:grid-cols-4 sm:gap-2">
        {/* Connector: vertical on mobile, horizontal from sm. Filled with a transform. */}
        <div aria-hidden className="absolute bottom-4 left-4 top-4 w-0.5 -translate-x-1/2 bg-border sm:hidden">
          <motion.div
            className={`h-full w-full origin-top rounded-pill ${stopped ? "bg-danger" : "bg-accent"}`}
            initial={reduce ? false : { scaleY: 0 }}
            animate={{ scaleY: reached / (STAGES.length - 1) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          />
        </div>
        <div aria-hidden className="absolute inset-x-[12.5%] top-4 hidden h-0.5 -translate-y-1/2 bg-border sm:block">
          <motion.div
            className={`h-full w-full origin-left rounded-pill ${stopped ? "bg-danger" : "bg-accent"}`}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: reached / (STAGES.length - 1) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          />
        </div>
        {STAGES.map((s, i) => {
          const done = i <= reached;
          const current = i === reached && !stopped && order.status !== "DELIVERED";
          return (
            <li
              key={s.key}
              className="relative flex items-start gap-4 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
              aria-current={current ? "step" : undefined}
            >
              <motion.span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border-2 ${
                  done
                    ? stopped && i === reached
                      ? "border-danger bg-danger text-on-image"
                      : "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted"
                }`}
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 420, damping: 22 }}
              >
                {done ? (
                  stopped && i === reached ? <AlertIcon width={15} height={15} /> : <CheckIcon width={15} height={15} />
                ) : i === 2 ? (
                  <TruckIcon width={15} height={15} />
                ) : (
                  <PackageIcon width={15} height={15} />
                )}
                {current && !reduce && (
                  <span aria-hidden className="absolute inset-0 animate-ping rounded-pill border-2 border-accent opacity-40" />
                )}
              </motion.span>
              <div>
                <p className={`text-sm ${done ? "font-medium" : "text-muted"}`}>
                  {i === 1 && awaitingPayment ? "Awaiting payment" : s.label}
                </p>
                <p className="text-xs text-muted">{done ? (when(times[i]) ?? "") : current ? "In progress" : ""}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {stopped && (
        <p className="mt-6 flex items-start gap-2 rounded-card bg-danger-soft p-3 text-sm text-danger" role="status">
          <AlertIcon width={18} height={18} className="mt-0.5 shrink-0" />
          <span>
            {label(order.status)}
            {stopEvent?.note ? ` — ${stopEvent.note}` : ""}
            {stopEvent ? ` (${when(stopEvent.created_at)})` : ""}
          </span>
        </p>
      )}

      {order.shipments.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-2xs font-semibold tracking-eyebrow text-muted uppercase">
            {order.shipments.length > 1 ? `Shipments (${order.shipments.length})` : "Shipment"}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {order.shipments.map((s) => (
              <li key={s.id} className="rounded-card border border-border p-3.5 text-sm">
                <p className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.seller_name ?? "Beauty"}</span>
                  <span className="text-xs text-muted">{label(s.status)}</span>
                </p>
                {s.tracking_number ? (
                  <p className="mt-1 text-muted">
                    Tracking <span className="font-mono text-foreground select-all">{s.tracking_number}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">Tracking number appears once it ships.</p>
                )}
                {(s.delivered_at || s.shipped_at) && (
                  <p className="mt-0.5 text-xs text-muted">
                    {s.delivered_at ? `Delivered ${when(s.delivered_at)}` : `Shipped ${when(s.shipped_at)}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
