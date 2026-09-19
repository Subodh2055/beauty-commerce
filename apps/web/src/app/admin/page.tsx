"use client";

import { useEffect, useState } from "react";
import { useAdmin, type AdminStats } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboard() {
  const admin = useAdmin();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await admin.stats();
        if (active) setStats(s);
      } catch {
        /* shell guards access; ignore here */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    { label: "Revenue", value: formatMoney(stats.revenue_total), accent: true },
    { label: "Total orders", value: String(stats.orders_total) },
    { label: "Open orders", value: String(stats.orders_open) },
    { label: "Products", value: `${stats.products_published}/${stats.products_total}`, sub: "published / total" },
    { label: "Low stock", value: String(stats.low_stock_variants), sub: "variants ≤ 5", warn: stats.low_stock_variants > 0 },
    { label: "Customers", value: String(stats.customers_total) },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-2xl border p-6 shadow-soft ${
            c.accent ? "border-accent/30 bg-accent-soft/40" : "border-border bg-surface"
          }`}
        >
          <p className="text-sm text-muted">{c.label}</p>
          <p className={`mt-1 font-serif text-3xl font-semibold ${c.warn ? "text-danger" : ""}`}>
            {c.value}
          </p>
          {c.sub && <p className="mt-1 text-xs text-muted">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}
