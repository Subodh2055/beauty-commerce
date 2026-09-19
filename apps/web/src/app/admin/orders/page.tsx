"use client";

import { useEffect, useState } from "react";
import { useAdmin, type AdminOrderRow } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge, PaymentStatusBadge, label } from "@/components/order/status-badge";
import { Button } from "@/components/ui/button";

const STATUSES = ["", "PENDING_PAYMENT", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

// Next statuses an admin can move each order to.
const NEXT: Record<string, string[]> = {
  PENDING_PAYMENT: ["PAID", "PROCESSING", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED", "REFUNDED"],
  PROCESSING: ["SHIPPED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
};

export default function AdminOrders() {
  const admin = useAdmin();
  const [rows, setRows] = useState<AdminOrderRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function reload(status: string) {
    try {
      const res = await admin.orders(status || undefined);
      setRows(res.items);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await admin.orders(filter || undefined);
        if (active) setRows(res.items);
      } catch {
        if (active) setRows([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function advance(id: string, status: string) {
    setBusy(id);
    try {
      await admin.setOrderStatus(id, status);
      await reload(filter);
      toast.success(`Order moved to ${status.replace(/_/g, " ").toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(id: string) {
    setBusy(id);
    try {
      await admin.markOrderPaid(id);
      await reload(filter);
      toast.success("Payment marked as received");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`focus-ring rounded-full border px-3 py-1 text-xs ${
              filter === s ? "border-foreground bg-foreground text-background" : "border-border hover:bg-surface-2"
            }`}
          >
            {s ? label(s) : "All"}
          </button>
        ))}
      </div>

      {!rows ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          No orders.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="p-3">
                    <p className="font-medium">{o.order_number}</p>
                    <p className="text-xs text-muted">
                      {new Date(o.created_at).toLocaleDateString("en-GB")} · {o.item_count} item{o.item_count === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="p-3 text-muted">{o.customer_email ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <OrderStatusBadge status={o.status} />
                      <PaymentStatusBadge status={o.payment_status} />
                    </div>
                  </td>
                  <td className="p-3 text-right font-medium tabular-nums">
                    {formatMoney(o.total, o.currency)}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {o.payment_status === "PENDING" &&
                        !["CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(o.status) && (
                          <Button
                            size="sm"
                            disabled={busy === o.id}
                            onClick={() => markPaid(o.id)}
                            className="h-8! px-3! text-xs"
                          >
                            Mark paid
                          </Button>
                        )}
                      {(NEXT[o.status] ?? []).map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant="outline"
                          disabled={busy === o.id}
                          onClick={() => advance(o.id, next)}
                          className="h-8! px-3! text-xs"
                        >
                          {label(next)}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
