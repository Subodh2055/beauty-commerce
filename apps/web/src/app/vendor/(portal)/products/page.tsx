"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useVendorApi, type Page, type ProductSort, type ProductStatus, type VendorProductRow } from "@/lib/vendor";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useLoad } from "@/lib/use-load";
import { useVendor } from "@/components/vendor/vendor-shell";
import { ProductStatusPill, productStatusLabel } from "@/components/vendor/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button, ButtonLink } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

const STATUSES: (ProductStatus | "")[] = ["", "DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"];
const SORTS: ProductSort[] = ["updated", "updated_asc", "name", "name_desc", "price_asc", "price_desc", "stock_asc", "stock_desc"];
const SIZE = 20;

export default function VendorProductsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Products />
    </Suspense>
  );
}

/** Product catalogue. Search, status, sort and page live in the URL (shareable, back-button safe). */
function Products() {
  const api = useVendorApi();
  const { summary, readOnly, refresh } = useVendor();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const status = (STATUSES.find((s) => s === sp.get("status")) ?? "") as ProductStatus | "";
  const sort = SORTS.find((s) => s === sp.get("sort")) ?? "updated";
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(q);
  const [busy, setBusy] = useState(false);

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

  const { data, reload } = useLoad<Page<VendorProductRow>>(
    JSON.stringify([q, status, sort, page]),
    () => api.products({ q: q || undefined, status: status || undefined, sort, page, size: SIZE }),
    { items: [], total: 0, page: 1, size: SIZE },
  );

  // Debounced search → URL.
  useEffect(() => {
    if (search === q) return;
    const t = window.setTimeout(() => setParams({ q: search.trim() || null }), 300);
    return () => window.clearTimeout(t);
  }, [search, q, setParams]);

  async function runBulk(action: "submit" | "archive" | "delete") {
    const ids = [...selected];
    if (action === "delete") {
      const ok = await confirmDialog({
        title: `Delete ${ids.length} product${ids.length === 1 ? "" : "s"}?`,
        description: "Only drafts and rejected products can be deleted; others are skipped. This can't be undone.",
        confirmLabel: "Delete",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await api.bulk(action, ids);
      const verb = { submit: "submitted for review", archive: "archived", delete: "deleted" }[action];
      if (res.done.length) toast.success(`${res.done.length} product${res.done.length === 1 ? "" : "s"} ${verb}`);
      if (res.failed.length) {
        const sample = res.failed[0].reason;
        toast.error(`${res.failed.length} skipped — ${sample}${res.failed.length > 1 ? " (and others)" : ""}`);
      }
      setSelected(new Set(res.failed.map((f) => f.id)));
      reload();
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBusy(false);
    }
  }

  const counts = summary.products_by_status;
  const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;
  const byId = new Map(data?.items.map((p) => [p.id, p]) ?? []);

  const columns: Column<VendorProductRow>[] = [
    {
      key: "name",
      header: "Product",
      sort: { asc: "name", desc: "name_desc" },
      cell: (p) => (
        <div className="flex min-w-56 items-center gap-3">
          <div className="relative h-12 w-10 shrink-0 overflow-hidden rounded-control bg-surface-2">
            {p.image_url && <Image src={p.image_url} alt="" fill sizes="40px" className="object-cover" />}
          </div>
          <div className="min-w-0">
            <Link href={`/vendor/products/${p.id}`} className="focus-ring block truncate rounded-sm font-medium hover:text-accent">
              {p.name}
            </Link>
            <p className="text-xs text-muted">
              {p.sku} · {p.variant_count} size{p.variant_count === 1 ? "" : "s"}
            </p>
            {p.status === "REJECTED" && p.rejection_reason && (
              <p className="mt-0.5 line-clamp-1 text-xs text-danger">“{p.rejection_reason}”</p>
            )}
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (p) => <ProductStatusPill status={p.status} /> },
    {
      key: "price",
      header: "Price",
      align: "right",
      sort: { asc: "price_asc", desc: "price_desc" },
      cell: (p) => <span className="tabular-nums">{formatMoney(p.base_price, p.currency)}</span>,
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      sort: { asc: "stock_asc", desc: "stock_desc" },
      cell: (p) => (
        <span className={`tabular-nums ${p.total_stock === 0 ? "font-semibold text-danger" : p.total_stock <= 5 ? "font-semibold text-warning" : ""}`}>
          {p.total_stock === 0 ? "Out" : p.total_stock}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      responsive: "hidden md:table-cell",
      sort: { asc: "updated_asc", desc: "updated" },
      cell: (p) => (
        <span className="text-muted">{new Date(p.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (p) => (
        <Link href={`/vendor/products/${p.id}`} className="focus-ring rounded-sm text-sm font-medium text-accent hover:underline">
          Edit<span className="sr-only"> {p.name}</span>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Products</h1>
          <p className="text-sm text-muted">New and edited products go through a quick review before they go live.</p>
        </div>
        {!readOnly && <ButtonLink href="/vendor/products/new">Add product</ButtonLink>}
      </div>

      <div role="group" aria-label="Filter by status" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {STATUSES.map((s) => {
          const on = s === status;
          const n = s ? (counts[s] ?? 0) : total;
          return (
            <button
              key={s || "all"}
              type="button"
              aria-pressed={on}
              onClick={() => setParams({ status: s || null })}
              className={`focus-ring inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-pill border px-3.5 text-xs font-medium transition-colors ${
                on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong hover:bg-surface-2"
              }`}
            >
              {s ? productStatusLabel(s) : "All"}
              <span className={`tabular-nums ${on ? "opacity-80" : "text-muted"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <label className="relative block max-w-md">
        <span className="sr-only">Search products by name or SKU</span>
        <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or SKU"
          className="focus-ring h-10 w-full rounded-pill border border-border-strong bg-surface pl-10 pr-4 text-sm placeholder:text-muted"
        />
      </label>

      {selected.size > 0 && !readOnly && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-20 z-10 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift animate-fade-up"
        >
          <p className="mr-auto text-sm" aria-live="polite">
            <span className="font-semibold">{selected.size}</span> selected
          </p>
          <Button size="sm" onClick={() => runBulk("submit")} loading={busy}>
            Submit for review
          </Button>
          <Button size="sm" variant="outline" onClick={() => runBulk("archive")} disabled={busy}>
            Archive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => runBulk("delete")} disabled={busy} className="text-danger">
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <DataTable
        caption="Your products"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        loading={!data}
        sort={{ value: sort, onSort: (v) => setParams({ sort: v === "updated" ? null : v }) }}
        selection={readOnly ? undefined : { selected, onChange: setSelected, label: (id) => `Select ${byId.get(id)?.name ?? "product"}` }}
        empty={
          <EmptyState
            compact
            title={q || status ? "No products match" : "No products yet"}
            description={q || status ? "Try another search or status." : "Add your first product — it goes live once our team has reviewed it."}
            action={!q && !status && !readOnly ? <ButtonLink href="/vendor/products/new">Add product</ButtonLink> : undefined}
          />
        }
      />

      {data && pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <p className="text-muted">
            Page {page} of {pages} · {data.total} products
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
