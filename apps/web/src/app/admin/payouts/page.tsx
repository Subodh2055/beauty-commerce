"use client";

import { Suspense, useState } from "react";
import { useAdminApi, type Payout, type VendorBalance } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useUrlState } from "@/lib/use-url-state";
import { useCan } from "@/lib/permissions";
import { errorText } from "@/lib/http";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader, Pager, RequirePermission, fmtDate } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { promptDialog } from "@/components/ui/prompt";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletIcon } from "@/components/ui/icons";

const SIZE = 20;

export default function PayoutsPage() {
  return (
    <RequirePermission code="payouts.view">
      <PageHeader
        title="Payouts"
        description="Vendors are owed their earnings on delivered, paid sub-orders (sale minus the commission snapshotted at checkout)."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Payouts />
      </Suspense>
    </RequirePermission>
  );
}

function Payouts() {
  const api = useAdminApi();
  const { can } = useCan();
  const { get, set, page } = useUrlState();
  const status = get("status");
  const balances = useLoad("balances", () => api.balances());
  const vendors = useLoad("vendor-names", () => api.vendors({ size: 100 }));
  const payouts = useLoad(JSON.stringify([status, page]), () =>
    api.payouts({ status: status || undefined, page, size: SIZE }),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const name = (id: string) => vendors.data?.items.find((v) => v.id === id)?.name ?? "Vendor";

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      balances.reload();
      payouts.reload();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function generate(b: VendorBalance) {
    const ok = await confirmDialog({
      title: `Create a payout for ${b.vendor_name}?`,
      description: `${b.eligible_orders} delivered order${b.eligible_orders === 1 ? "" : "s"}: ${formatMoney(b.gross_amount)} sales − ${formatMoney(b.commission_amount)} commission = ${formatMoney(b.net_amount)} to pay. Pay it, then mark it paid with the transfer reference.`,
      confirmLabel: "Create payout",
    });
    if (ok) await act(b.vendor_id, () => api.createPayout(b.vendor_id), "Payout created");
  }

  async function markPaid(p: Payout) {
    const reference = await promptDialog({
      title: `Mark ${formatMoney(p.net_amount, p.currency)} paid to ${name(p.vendor_id)}?`,
      description: "Only after the money has left the account. The vendor sees this reference.",
      label: "Bank or wallet transfer reference",
      required: true,
      minLength: 1,
      confirmLabel: "Mark paid",
    });
    if (reference) await act(p.id, () => api.markPayoutPaid(p.id, reference), "Payout marked paid");
  }

  async function cancel(p: Payout) {
    const ok = await confirmDialog({
      title: "Cancel this payout?",
      description: "Its orders go back to the vendor's balance, ready for the next payout.",
      confirmLabel: "Cancel payout",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (ok) await act(p.id, () => api.cancelPayout(p.id), "Payout cancelled");
  }

  const balanceCols: Column<VendorBalance>[] = [
    { key: "vendor", header: "Vendor", cell: (b) => <span className="font-medium">{b.vendor_name}</span> },
    { key: "orders", header: "Orders", align: "right", cell: (b) => b.eligible_orders },
    { key: "gross", header: "Sales", align: "right", cell: (b) => formatMoney(b.gross_amount), responsive: "hidden md:table-cell" },
    { key: "commission", header: "Commission", align: "right", cell: (b) => formatMoney(b.commission_amount), responsive: "hidden md:table-cell" },
    { key: "net", header: "To pay", align: "right", cell: (b) => <span className="font-semibold tabular-nums">{formatMoney(b.net_amount)}</span> },
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (b) =>
        can("payouts.create") ? (
          <Button size="sm" variant="secondary" loading={busy === b.vendor_id} onClick={() => generate(b)}>
            Create payout
          </Button>
        ) : null,
    },
  ];

  const payoutCols: Column<Payout>[] = [
    { key: "vendor", header: "Vendor", cell: (p) => name(p.vendor_id) },
    { key: "status", header: "Status", cell: (p) => <StatusBadge kind="payout" status={p.status} /> },
    { key: "orders", header: "Orders", align: "right", cell: (p) => p.order_count, responsive: "hidden sm:table-cell" },
    { key: "net", header: "Amount", align: "right", cell: (p) => <span className="tabular-nums">{formatMoney(p.net_amount, p.currency)}</span> },
    {
      key: "when",
      header: "Created / paid",
      cell: (p) => (
        <span className="text-xs">
          {fmtDate(p.created_at)}
          {p.paid_at && <span className="block text-muted">paid {fmtDate(p.paid_at)} · {p.reference}</span>}
        </span>
      ),
      responsive: "hidden md:table-cell",
    },
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (p) =>
        p.status === "PENDING" && can("payouts.edit") ? (
          <span className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => cancel(p)} disabled={busy === p.id}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => markPaid(p)} loading={busy === p.id}>
              Mark paid
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-8">
      <section aria-labelledby="owed-h">
        <h2 id="owed-h" className="mb-3 font-display text-xl font-semibold">
          Owed now
        </h2>
        {balances.error ? (
          <LoadError error={balances.error} onRetry={balances.reload} />
        ) : (
          <DataTable
            caption="Vendor balances ready for payout"
            columns={balanceCols}
            rows={balances.data ?? []}
            rowKey={(b) => b.vendor_id}
            loading={!balances.data}
            empty={<EmptyState compact icon={<WalletIcon width={22} height={22} />} title="Nobody is owed anything right now" />}
          />
        )}
      </section>
      <section aria-labelledby="payouts-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="payouts-h" className="font-display text-xl font-semibold">
            Payouts
          </h2>
          <FilterChips
            label="Payout status"
            options={[
              { value: "", label: "All" },
              { value: "PENDING", label: "To pay" },
              { value: "PAID", label: "Paid" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
            value={status}
            onChange={(v) => set({ status: v || null })}
          />
        </div>
        {payouts.error ? (
          <LoadError error={payouts.error} onRetry={payouts.reload} />
        ) : (
          <>
            <DataTable
              caption="Payouts"
              columns={payoutCols}
              rows={payouts.data?.items ?? []}
              rowKey={(p) => p.id}
              loading={!payouts.data}
              empty={<EmptyState compact icon={<WalletIcon width={22} height={22} />} title="No payouts yet" />}
            />
            {payouts.data && <Pager page={page} size={SIZE} total={payouts.data.total} onPage={(p) => set({ page: String(p) })} />}
          </>
        )}
      </section>
    </div>
  );
}
