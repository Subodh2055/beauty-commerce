"use client";

import { useState } from "react";
import { useLoad } from "@/lib/use-load";
import { useVendorApi, type Payout, type PayoutDetail } from "@/lib/vendor";
import { formatMoney } from "@/lib/format";
import { useVendor } from "@/components/vendor/vendor-shell";
import { KpiCard } from "@/components/vendor/kpi-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletIcon } from "@/components/ui/icons";

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS = {
  PENDING: { label: "Scheduled", tone: "gold" },
  PAID: { label: "Paid", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;

export default function VendorPayoutsPage() {
  const api = useVendorApi();
  const { summary } = useVendor();
  const [openId, setOpenId] = useState<string | null>(null);
  const payouts = useLoad<Payout[]>("payouts", () => api.payouts().then((p) => p.items), []).data;
  const detail = useLoad<PayoutDetail | null>(openId ?? "", () => (openId ? api.payout(openId) : Promise.resolve(null))).data;

  const e = summary.earnings;
  const money = (n: number) => formatMoney(n);
  const paid = (payouts ?? []).filter((p) => p.status === "PAID");
  const gross = paid.reduce((n, p) => n + Number(p.gross_amount), 0);
  const commission = paid.reduce((n, p) => n + Number(p.commission_amount), 0);
  const net = gross - commission;
  const rate = summary.vendor.commission_rate;

  const columns: Column<Payout>[] = [
    { key: "date", header: "Created", cell: (p) => day(p.created_at) },
    {
      key: "status",
      header: "Status",
      cell: (p) => <Badge tone={STATUS[p.status]?.tone ?? "neutral"}>{STATUS[p.status]?.label ?? p.status}</Badge>,
    },
    { key: "orders", header: "Orders", align: "right", responsive: "hidden sm:table-cell", cell: (p) => p.order_count },
    { key: "gross", header: "Sales", align: "right", responsive: "hidden md:table-cell", cell: (p) => <span className="tabular-nums">{formatMoney(p.gross_amount, p.currency)}</span> },
    { key: "commission", header: "Commission", align: "right", responsive: "hidden md:table-cell", cell: (p) => <span className="tabular-nums">− {formatMoney(p.commission_amount, p.currency)}</span> },
    { key: "net", header: "You receive", align: "right", cell: (p) => <span className="font-semibold tabular-nums">{formatMoney(p.net_amount, p.currency)}</span> },
    {
      key: "open",
      header: <span className="sr-only">Details</span>,
      align: "right",
      cell: (p) => (
        <button
          type="button"
          onClick={() => setOpenId(p.id)}
          aria-haspopup="dialog"
          className="focus-ring cursor-pointer rounded-sm text-sm font-medium text-accent hover:underline"
        >
          Breakdown<span className="sr-only"> for payout created {day(p.created_at)}</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Payouts</h1>
        <p className="text-sm text-muted">
          Commission {rate ? `${Number(rate)}%` : "at the platform rate"}, snapshotted on each order at checkout. Delivered and
          paid orders are batched into payouts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Ready for payout" value={Number(e.ready_for_payout)} format={money} hint="Delivered and paid" icon={<WalletIcon width={18} height={18} />} />
        <KpiCard label="In progress" value={Number(e.in_progress)} format={money} hint="Sold, not yet delivered" />
        <KpiCard label="Scheduled" value={Number(e.in_pending_payouts)} format={money} hint="In a payout being sent" />
        <KpiCard label="Paid out" value={Number(e.paid_out)} format={money} hint="All time" />
      </div>

      <Card>
        <CardHeader title="Where your sales go" description="Across all paid payouts." />
        {payouts === null ? (
          <Skeleton className="h-16" />
        ) : gross === 0 ? (
          <p className="text-sm text-muted">Your first payout will show the split here.</p>
        ) : (
          <div>
            {/* Two segments differ by colour AND pattern; each is labelled with its amount. */}
            <div className="flex h-5 overflow-hidden rounded-pill" role="img" aria-label={`Of ${money(gross)} in sales, you received ${money(net)} and commission was ${money(commission)}.`}>
              <div className="h-full bg-chart-1" style={{ width: `${(net / gross) * 100}%` }} />
              <div
                className="h-full bg-chart-2"
                style={{
                  width: `${(commission / gross) * 100}%`,
                  backgroundImage: "repeating-linear-gradient(45deg, transparent 0 4px, var(--surface) 4px 6px)",
                }}
              />
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3" aria-hidden>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-chart-1" />
                <dt className="text-muted">You received</dt>
                <dd className="ml-auto font-semibold tabular-nums sm:ml-0">{money(net)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-sm bg-chart-2"
                  style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 2px, var(--surface) 2px 3px)" }}
                />
                <dt className="text-muted">Commission</dt>
                <dd className="ml-auto tabular-nums sm:ml-0">{money(commission)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-muted">Total sales</dt>
                <dd className="ml-auto tabular-nums sm:ml-0">{money(gross)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Card>

      <section aria-labelledby="payout-history" className="space-y-3">
        <h2 id="payout-history" className="font-display text-xl font-semibold">
          History
        </h2>
        <DataTable
          caption="Payout history"
          columns={columns}
          rows={payouts ?? []}
          rowKey={(p) => p.id}
          loading={payouts === null}
          empty={<EmptyState compact title="No payouts yet" description="Payouts appear once delivered orders are batched." icon={<WalletIcon width={24} height={24} />} />}
        />
      </section>

      <Drawer open={!!openId} onClose={() => setOpenId(null)} title="Payout breakdown" size="lg">
        {!detail ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-20" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                ["Sales", detail.gross_amount],
                ["Commission", `−${detail.commission_amount}`],
                ["You receive", detail.net_amount],
              ].map(([label, v]) => (
                <div key={label} className="rounded-card bg-surface-2 p-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-1 text-sm font-semibold tabular-nums">
                    {String(v).startsWith("−") ? `− ${formatMoney(String(v).slice(1), detail.currency)}` : formatMoney(v, detail.currency)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted">
              <Badge tone={STATUS[detail.status]?.tone ?? "neutral"}>{STATUS[detail.status]?.label}</Badge>{" "}
              {detail.paid_at ? `Paid ${day(detail.paid_at)}` : `Created ${day(detail.created_at)}`}
              {detail.reference ? ` · Ref ${detail.reference}` : ""}
            </p>
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Orders in this payout</caption>
                <thead className="bg-surface-2 text-2xs tracking-eyebrow text-muted uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">Order</th>
                    <th scope="col" className="px-3 py-2 text-right">Sales</th>
                    <th scope="col" className="px-3 py-2 text-right">Commission</th>
                    <th scope="col" className="px-3 py-2 text-right">Yours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {detail.lines.map((l) => (
                    <tr key={l.vendor_order_id}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {l.order_number}
                        <span className="block text-xs font-normal text-muted">Delivered {day(l.delivered_at)}</span>
                      </th>
                      <td className="px-3 py-2 text-right">{formatMoney(l.subtotal, detail.currency)}</td>
                      <td className="px-3 py-2 text-right">
                        − {formatMoney(l.commission_amount, detail.currency)}
                        {l.commission_rate && <span className="block text-xs text-muted">{Number(l.commission_rate)}%</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(l.vendor_earnings, detail.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
