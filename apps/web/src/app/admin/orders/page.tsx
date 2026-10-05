"use client";

import { useEffect, useState } from "react";
import { useAdmin, type AdminOrderRow } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { OrderStatusBadge, PaymentStatusBadge, label } from "@/components/order/status-badge";
import { Button } from "@/components/ui/button";
import { RequirePermission } from "@/components/admin/ui";
import { useCan } from "@/lib/permissions";

const STATUSES = ["", "PENDING_PAYMENT", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

// Next statuses an admin can move each order to.
const NEXT: Record<string, string[]> = {
  PENDING_PAYMENT: ["PAID", "PROCESSING", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED", "REFUNDED"],
  PROCESSING: ["SHIPPED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
};

function AdminOrdersPage() {
  const { can } = useCan();
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

  const columns: Column<AdminOrderRow>[] = [
    {
      key: "order",
      header: "Order",
      cell: (o) => (
        <>
          <p className="font-medium">{o.order_number}</p>
          <p className="text-xs text-muted">
            {new Date(o.created_at).toLocaleDateString("en-GB")} · {o.item_count} item
            {o.item_count === 1 ? "" : "s"}
          </p>
        </>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      responsive: "hidden md:table-cell",
      cell: (o) => <span className="text-muted">{o.customer_email ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => (
        <div className="flex flex-col items-start gap-1">
          <OrderStatusBadge status={o.status} />
          <PaymentStatusBadge status={o.payment_status} />
        </div>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      className: "font-medium tabular-nums",
      cell: (o) => formatMoney(o.total, o.currency),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (o) =>
        !can("orders.edit") ? null : (
        <div className="flex flex-wrap gap-1">
          {o.payment_status === "PENDING" &&
            !["CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(o.status) && (
              <Button size="sm" loading={busy === o.id} onClick={() => markPaid(o.id)} className="h-8! px-3! text-xs">
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
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <FilterChips
        label="Filter by status"
        value={filter}
        onChange={setFilter}
        options={STATUSES.map((s) => ({ value: s, label: s ? label(s) : "All" }))}
      />
      <DataTable
        caption="Orders"
        columns={columns}
        rows={rows ?? []}
        rowKey={(o) => o.id}
        loading={!rows}
        empty={
          <EmptyState
            compact
            title="No orders"
            description={filter ? "Nothing in this status right now." : "Orders will appear here as customers check out."}
          />
        }
      />
    </div>
  );
}

export default function AdminOrders() {
  return (
    <RequirePermission code="orders.view">
      <AdminOrdersPage />
    </RequirePermission>
  );
}
