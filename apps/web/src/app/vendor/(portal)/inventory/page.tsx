"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useVendorApi, type InventoryRow, type Page } from "@/lib/vendor";
import { formatMoney } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { toast } from "@/lib/toast";
import { useVendor } from "@/components/vendor/vendor-shell";
import { ProductStatusPill } from "@/components/vendor/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

const SIZE = 50;

export default function InventoryPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Inventory />
    </Suspense>
  );
}

function Inventory() {
  const api = useVendorApi();
  const { readOnly, refresh } = useVendor();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const lowOnly = sp.get("low") === "1";
  const q = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [search, setSearch] = useState(q);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  const { data, update } = useLoad<Page<InventoryRow>>(
    JSON.stringify([q, lowOnly, page]),
    () => api.inventory({ q: q || undefined, low_only: lowOnly, page, size: SIZE }),
    { items: [], total: 0, page: 1, size: SIZE },
  );

  useEffect(() => {
    if (search === q) return;
    const t = window.setTimeout(() => setParams({ q: search.trim() || null }), 300);
    return () => window.clearTimeout(t);
  }, [search, q, setParams]);

  /** Optimistic stock edit: update the row now, roll back if the API refuses. */
  async function saveStock(row: InventoryRow, value: number) {
    const before = row.stock_quantity;
    const patch = (n: number) =>
      update((d) => ({
          ...d,
          items: d.items.map((r) => (r.variant_id === row.variant_id ? { ...r, stock_quantity: n, low: n <= 5 } : r)),
        }));
    patch(value);
    try {
      await api.setStock(row.variant_id, value, "Updated in seller centre");
      toast.success(`${row.product_name} · ${row.variant_name}: ${value} in stock`);
      void refresh();
    } catch (err) {
      patch(before);
      toast.error(err instanceof Error ? err.message : "Couldn't update stock");
    }
  }

  const columns: Column<InventoryRow>[] = [
    {
      key: "product",
      header: "Product",
      cell: (r) => (
        <div className="min-w-48">
          <Link href={`/vendor/products/${r.product_id}`} className="focus-ring rounded-sm font-medium hover:text-accent">
            {r.product_name}
          </Link>
          <p className="text-xs text-muted">
            {r.variant_name} · {r.sku}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", responsive: "hidden md:table-cell", cell: (r) => <ProductStatusPill status={r.product_status} /> },
    {
      key: "price",
      header: "Price",
      align: "right",
      responsive: "hidden sm:table-cell",
      cell: (r) => <span className="tabular-nums">{formatMoney(r.price)}</span>,
    },
    {
      key: "stock",
      header: "In stock",
      align: "right",
      cell: (r) => <StockCell row={r} disabled={readOnly} onSave={(n) => saveStock(r, n)} />,
    },
  ];

  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold">Inventory</h1>
        <p className="text-sm text-muted">Stock changes go live straight away — no review needed. Lowest stock first.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search by product, size or SKU</span>
          <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product, size or SKU"
            className="focus-ring h-10 w-full rounded-pill border border-border-strong bg-surface pl-10 pr-4 text-sm placeholder:text-muted"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setParams({ low: e.target.checked ? "1" : null })}
            className="h-4 w-4 accent-accent"
          />
          Low stock only (5 or fewer)
        </label>
      </div>

      <DataTable
        caption="Stock per size"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.variant_id}
        loading={!data}
        rowClassName={(r) => (r.stock_quantity === 0 ? "bg-danger-soft/40" : "")}
        empty={
          <EmptyState
            compact
            title={lowOnly ? "Nothing is running low" : "No sizes found"}
            description={lowOnly ? "Every size has more than 5 in stock." : "Add products to start tracking stock."}
          />
        }
      />

      {data && pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <p className="text-muted">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })}>
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

/** Stock with a level marker (icon-free text + colour) and an inline editor. */
function StockCell({ row, disabled, onSave }: { row: InventoryRow; disabled: boolean; onSave: (n: number) => void }) {
  const [value, setValue] = useState(String(row.stock_quantity));
  const [prev, setPrev] = useState(row.stock_quantity);
  if (row.stock_quantity !== prev) {
    setPrev(row.stock_quantity);
    setValue(String(row.stock_quantity));
  }
  const n = Number(value);
  const valid = /^\d+$/.test(value) && n <= 1_000_000;
  const changed = valid && n !== row.stock_quantity;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (changed) onSave(n);
  }

  const level =
    row.stock_quantity === 0 ? { text: "Out", cls: "bg-danger-soft text-danger" }
    : row.low ? { text: "Low", cls: "bg-warning-soft text-warning" }
    : null;

  return (
    <form onSubmit={submit} className="inline-flex items-center justify-end gap-2">
      {level && <span className={`rounded-pill px-2 py-0.5 text-2xs font-semibold ${level.cls}`}>{level.text}</span>}
      <label className="sr-only" htmlFor={`stock-${row.variant_id}`}>
        Stock for {row.product_name}, {row.variant_name}
      </label>
      <input
        id={`stock-${row.variant_id}`}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
        inputMode="numeric"
        disabled={disabled}
        aria-invalid={!valid || undefined}
        className="focus-ring h-9 w-20 rounded-control border border-border-strong bg-surface px-2 text-right text-sm tabular-nums"
      />
      <Button type="submit" size="sm" variant={changed ? "primary" : "ghost"} disabled={!changed || disabled}>
        Save
      </Button>
    </form>
  );
}
