"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useVendorApi, type VendorAnalytics } from "@/lib/vendor";
import { formatMoney } from "@/lib/format";
import { useVendor } from "@/components/vendor/vendor-shell";
import { KpiCard } from "@/components/vendor/kpi-card";
import { SalesChart } from "@/components/vendor/sales-chart";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertIcon, PackageIcon, TruckIcon, WalletIcon } from "@/components/ui/icons";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

export default function VendorOverviewPage() {
  const api = useVendorApi();
  const { summary } = useVendor();
  const [days, setDays] = useState("30");
  const [data, setData] = useState<VendorAnalytics | null>(null);

  useEffect(() => {
    let active = true;
    api
      .analytics(Number(days))
      .then((d) => active && setData(d))
      .catch(() => active && setData(null));
    return () => {
      active = false;
    };
  }, [api, days]);

  const money = (n: number) => formatMoney(n, data?.currency ?? "NPR");
  const int = (n: number) => Math.round(n).toLocaleString("en-IN");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Overview</h1>
          <p className="text-sm text-muted">How your store is doing.</p>
        </div>
        <FilterChips label="Period" options={RANGES} value={days} onChange={setDays} />
      </div>

      {summary.orders_to_ship > 0 && (
        <Link
          href="/vendor/orders"
          className="focus-ring flex items-center gap-3 rounded-card bg-accent-soft p-4 text-sm transition-colors hover:bg-accent-soft/70"
        >
          <TruckIcon className="shrink-0 text-accent" />
          <span className="flex-1">
            <span className="font-semibold">{summary.orders_to_ship}</span> order
            {summary.orders_to_ship === 1 ? " is" : "s are"} waiting to be packed or shipped.
          </span>
          <span className="font-medium text-accent">Open orders →</span>
        </Link>
      )}

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Revenue"
            value={Number(data.totals.revenue)}
            previous={Number(data.previous.revenue)}
            format={money}
          />
          <KpiCard
            label="Your earnings"
            value={Number(data.totals.earnings)}
            previous={Number(data.previous.earnings)}
            format={money}
            icon={<WalletIcon width={18} height={18} />}
          />
          <KpiCard label="Orders" value={data.totals.orders} previous={data.previous.orders} format={int} />
          <KpiCard
            label="Average order"
            value={Number(data.totals.avg_order_value)}
            previous={Number(data.previous.avg_order_value)}
            format={money}
          />
        </div>
      )}

      <Card>
        <CardHeader title="Sales" description={`Last ${days} days, after cancellations.`} />
        {data ? <SalesChart series={data.series} currency={data.currency} /> : <Skeleton className="h-64" />}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Top products"
            description="By units sold this period."
            action={
              <Link href="/vendor/products" className="focus-ring rounded-sm text-sm text-accent hover:underline">
                All products
              </Link>
            }
          />
          {!data ? (
            <Skeleton className="h-48" />
          ) : data.top_products.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No sales in this period yet.</p>
          ) : (
            <ol className="space-y-3">
              {data.top_products.map((p, i) => {
                const max = data.top_products[0].units || 1;
                return (
                  <li key={p.product_id} className="flex items-center gap-3">
                    <span className="w-4 text-sm font-semibold text-muted tabular-nums">{i + 1}</span>
                    <div className="relative h-11 w-9 shrink-0 overflow-hidden rounded-control bg-surface-2">
                      {p.image_url && <Image src={p.image_url} alt="" fill sizes="36px" className="object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      {/* Bar length mirrors the number beside it; the number carries the meaning. */}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
                        <div
                          className="h-full origin-left rounded-pill bg-chart-1"
                          style={{ transform: `scaleX(${p.units / max})` }}
                        />
                      </div>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <p className="font-medium">{p.units} sold</p>
                      <p className="text-xs text-muted">{money(Number(p.revenue))}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Low stock"
            description={data ? `Variants with ${data.low_stock_threshold} or fewer left.` : undefined}
            action={
              <Link href="/vendor/inventory?low=1" className="focus-ring rounded-sm text-sm text-accent hover:underline">
                Inventory
              </Link>
            }
          />
          {!data ? (
            <Skeleton className="h-48" />
          ) : data.low_stock.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
              <PackageIcon width={18} height={18} /> Everything is well stocked.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.low_stock.map((v) => (
                <li key={v.variant_id} className="flex items-center gap-3 py-2.5">
                  <AlertIcon
                    width={16}
                    height={16}
                    className={v.stock_quantity === 0 ? "text-danger" : "text-warning"}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.product_name}</p>
                    <p className="text-xs text-muted">
                      {v.variant_name} · {v.sku}
                    </p>
                  </div>
                  <span
                    className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                      v.stock_quantity === 0 ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                    }`}
                  >
                    {v.stock_quantity === 0 ? "Out of stock" : `${v.stock_quantity} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/vendor/products/new">Add a product</ButtonLink>
        <ButtonLink href={`/products?vendor=${summary.vendor.slug}`} variant="outline">
          View your storefront
        </ButtonLink>
      </div>
    </div>
  );
}
