"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useAdmin, type AdminStats } from "@/lib/auth";
import { useAdminApi } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useCan } from "@/lib/permissions";
import { formatMoney } from "@/lib/format";
import { LoadError, PageHeader, RequirePermission } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChatIcon,
  CheckIcon,
  ChevronIcon,
  PackageIcon,
  ReturnIcon,
  StoreIcon,
} from "@/components/ui/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface Queue {
  label: string;
  href: string;
  perm: string;
  icon: Icon;
  count: (api: ReturnType<typeof useAdminApi>) => Promise<number>;
  hint: string;
}

// Work waiting on someone, each linked to its pre-filtered list.
const QUEUES: Queue[] = [
  {
    label: "Orders to process",
    href: "/admin/orders",
    perm: "orders.view",
    icon: PackageIcon,
    count: (api) => api.count("/admin/orders", { status: "PROCESSING" }),
    hint: "Paid or cash on delivery, not shipped yet",
  },
  {
    label: "Return requests",
    href: "/admin/returns?status=REQUESTED",
    perm: "returns.view",
    icon: ReturnIcon,
    count: (api) => api.count("/admin/returns", { status: "REQUESTED" }),
    hint: "Waiting for approval",
  },
  {
    label: "Products to review",
    href: "/admin/moderation",
    perm: "moderation.view",
    icon: CheckIcon,
    count: (api) => api.count("/admin/moderation"),
    hint: "Submitted by vendors",
  },
  {
    label: "Vendor applications",
    href: "/admin/vendors?status=PENDING",
    perm: "vendors.view",
    icon: StoreIcon,
    count: (api) => api.count("/admin/vendors", { status: "PENDING" }),
    hint: "New sellers waiting",
  },
  {
    label: "Open tickets",
    href: "/admin/support?status=OPEN",
    perm: "support.view",
    icon: ChatIcon,
    count: (api) => api.count("/admin/support/tickets", { status: "OPEN" }),
    hint: "Customers waiting for a reply",
  },
];

export default function AdminDashboard() {
  return (
    <RequirePermission code="dashboard.view">
      <PageHeader title="Dashboard" description="What needs doing, and how the store is doing." />
      <AttentionQueues />
      <Stats />
    </RequirePermission>
  );
}

function AttentionQueues() {
  const api = useAdminApi();
  const { can } = useCan();
  const queues = QUEUES.filter((q) => can(q.perm));
  const { data } = useLoad(`queues:${queues.map((q) => q.label).join()}`, () =>
    Promise.all(queues.map((q) => q.count(api).catch(() => null))),
  );
  if (!queues.length) return null;

  return (
    <section aria-labelledby="queues-h" className="mb-8">
      <h2 id="queues-h" className="eyebrow mb-3">
        Needs attention
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {queues.map((q, i) => {
          const n = data?.[i];
          const I = q.icon;
          return (
            <li key={q.label}>
              <Link
                href={q.href}
                className="focus-ring group flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-hairline transition-shadow duration-(--duration-fast) hover:shadow-soft"
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill ${
                    n ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"
                  }`}
                  aria-hidden
                >
                  <I width={20} height={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{q.label}</span>
                  <span className="block text-xs text-muted">{q.hint}</span>
                </span>
                {data === null ? (
                  <Skeleton className="h-7 w-8" />
                ) : (
                  <span className="font-display text-2xl font-semibold tabular-nums">
                    {n ?? "—"}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
                <ChevronIcon width={16} height={16} className="text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stats() {
  const admin = useAdmin();
  const { data: stats, error, reload } = useLoad<AdminStats>("stats", () => admin.stats());
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Revenue (all time)", value: formatMoney(stats.revenue_total), accent: true },
    { label: "Total orders", value: String(stats.orders_total) },
    { label: "Open orders", value: String(stats.orders_open) },
    { label: "Products", value: `${stats.products_published}/${stats.products_total}`, sub: "published / total" },
    {
      label: "Low stock",
      value: String(stats.low_stock_variants),
      sub: stats.low_stock_variants > 0 ? "variants at 5 or fewer — restock soon" : "variants at 5 or fewer",
      warn: stats.low_stock_variants > 0,
    },
    { label: "Accounts", value: String(stats.customers_total) },
  ];

  return (
    <section aria-labelledby="stats-h">
      <h2 id="stats-h" className="eyebrow mb-3">
        At a glance
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-card border p-6 shadow-soft ${
              c.accent ? "border-accent/30 bg-accent-soft/40" : "border-border bg-surface"
            }`}
          >
            <p className="text-sm text-muted">{c.label}</p>
            <p className={`mt-1 font-display text-3xl font-semibold tabular-nums ${c.warn ? "text-danger" : ""}`}>
              {c.value}
            </p>
            {c.sub && <p className="mt-1 text-xs text-muted">{c.sub}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
