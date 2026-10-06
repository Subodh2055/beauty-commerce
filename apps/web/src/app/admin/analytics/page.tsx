"use client";

import { useState } from "react";
import { useAdminApi, type AdminAnalytics, type Ranked } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { formatMoney } from "@/lib/format";
import { DateRangePicker, daysIn, lastDays, type DateRange } from "@/components/admin/date-range-picker";
import { LoadError, PageHeader, RequirePermission, fmtDate, relTime } from "@/components/admin/ui";
import { statusLabel } from "@/components/admin/status";
import { KpiCard } from "@/components/vendor/kpi-card";
import { SalesChart } from "@/components/vendor/sales-chart";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartIcon, InfoIcon } from "@/components/ui/icons";

const num = (s: string) => Number(s);

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  return (
    <RequirePermission code="analytics.view">
      <PageHeader
        title="Analytics"
        description="Sales across the marketplace. Days are UTC; closed days come from the nightly rollup, today is live."
      />
      <div className="mb-6">
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <Report range={range} />
    </RequirePermission>
  );
}

function Report({ range }: { range: DateRange }) {
  const api = useAdminApi();
  const { data, error, reload } = useLoad(`analytics:${range.start}:${range.end}`, () =>
    api.analytics(range.start, range.end),
  );

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <ReportSkeleton />;

  const money = (n: number) => formatMoney(n, data.currency);
  const t = data.totals;
  const p = data.previous;
  const empty = t.orders === 0 && num(t.refunds) === 0 && t.new_customers === 0;

  return (
    <div className="space-y-6" aria-live="polite" aria-busy={false}>
      <p className="text-sm text-muted">
        {fmtDate(data.start)} – {fmtDate(data.end)} ({daysIn(range)} days), compared with{" "}
        {fmtDate(data.previous_start)} – {fmtDate(data.previous_end)}.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Revenue" value={num(t.revenue)} previous={num(p.revenue)} format={money} />
        <KpiCard label="Orders" value={t.orders} previous={p.orders} format={(n) => Math.round(n).toLocaleString()} />
        <KpiCard label="Average order" value={num(t.aov)} previous={num(p.aov)} format={money} />
        <KpiCard
          label="Refunds"
          value={num(t.refunds)}
          previous={num(p.refunds)}
          format={money}
          lowerIsBetter
        />
        <KpiCard label="Units sold" value={t.units} previous={p.units} format={(n) => Math.round(n).toLocaleString()} />
        <KpiCard
          label="New accounts"
          value={t.new_customers}
          previous={p.new_customers}
          format={(n) => Math.round(n).toLocaleString()}
        />
      </div>

      {empty ? (
        <EmptyState
          icon={<ChartIcon width={26} height={26} />}
          title="No sales in this range"
          description="Try a longer range. Orders appear here once they're paid or accepted for cash on delivery."
        />
      ) : (
        <>
          <Card padding="lg">
            <h2 className="mb-4 font-display text-xl font-semibold">Revenue and orders per day</h2>
            <SalesChart
              series={data.series.map((d) => ({
                date: d.date,
                revenue: d.revenue,
                earnings: d.refunds,
                orders: d.orders,
                units: d.units,
              }))}
              currency={data.currency}
              earningsLabel="Refunds"
            />
          </Card>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <RankedTable title="Top products" rows={data.top_products} money={money} kind="product" />
            <RankedTable title="Top vendors" rows={data.top_vendors} money={money} kind="vendor" />
            <StatusBreakdown data={data} money={money} />
            <Card padding="lg">
              <h2 className="mb-4 font-display text-xl font-semibold">Payment methods</h2>
              <BarList
                rows={data.payment_methods.map((m) => ({
                  label: m.method,
                  value: num(m.value),
                  detail: `${m.orders} order${m.orders === 1 ? "" : "s"} · ${money(num(m.value))}`,
                }))}
              />
            </Card>
          </div>
        </>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <InfoIcon width={14} height={14} aria-hidden />
        {data.source.rolled_up_days} day{data.source.rolled_up_days === 1 ? "" : "s"} from the nightly rollup,{" "}
        {data.source.live_days} computed live · generated {relTime(data.generated_at)}
      </p>
    </div>
  );
}

function RankedTable({
  title,
  rows,
  money,
  kind,
}: {
  title: string;
  rows: Ranked[];
  money: (n: number) => string;
  kind: "product" | "vendor";
}) {
  return (
    <Card padding="lg">
      <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing sold in this range.</p>
      ) : (
        // Focusable so keyboard users can scroll it sideways on narrow screens.
        <div className="focus-ring overflow-x-auto rounded-sm" tabIndex={0} role="region" aria-label={title}>
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-left text-2xs tracking-eyebrow text-muted uppercase">
                <th scope="col" className="py-2 pr-3">
                  {kind === "product" ? "Product" : "Vendor"}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {kind === "product" ? "Units" : "Orders"}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  Revenue
                </th>
                {kind === "vendor" && (
                  <th scope="col" className="py-2 text-right">
                    Commission
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row" className="max-w-56 truncate py-2 pr-3 text-left font-normal">
                    {r.name}
                  </th>
                  <td className="py-2 pr-3 text-right">{kind === "product" ? r.units : r.orders}</td>
                  <td className="py-2 pr-3 text-right">{money(num(r.revenue))}</td>
                  {kind === "vendor" && (
                    <td className="py-2 text-right">{r.commission ? money(num(r.commission)) : "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function StatusBreakdown({ data, money }: { data: AdminAnalytics; money: (n: number) => string }) {
  return (
    <Card padding="lg">
      <h2 className="mb-4 font-display text-xl font-semibold">Orders by status</h2>
      <BarList
        rows={data.by_status.map((s) => ({
          label: statusLabel("order", s.status),
          value: s.count,
          detail: `${s.count} · ${money(num(s.value))}`,
        }))}
      />
    </Card>
  );
}

/** Horizontal bars with the figure written out: length is never the only cue. */
function BarList({ rows }: { rows: { label: string; value: number; detail: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">Nothing in this range.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>{r.label}</span>
            <span className="tabular-nums text-muted">{r.detail}</span>
          </div>
          <div className="h-2 rounded-pill bg-surface-2" aria-hidden>
            <div className="h-2 rounded-pill bg-chart-1" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy aria-label="Loading analytics">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
