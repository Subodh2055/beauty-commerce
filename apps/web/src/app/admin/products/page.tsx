"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdmin, type AdminProductRow } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { confirmDialog } from "@/components/ui/confirm";
import { RequirePermission } from "@/components/admin/ui";
import { useCan } from "@/lib/permissions";

const STATUS_TONE: Record<string, BadgeTone> = {
  PUBLISHED: "success",
  DRAFT: "neutral",
  PENDING: "warning", // awaiting moderation
  REJECTED: "danger",
  ARCHIVED: "gold",
};

function AdminProductsPage() {
  const { can } = useCan();
  const admin = useAdmin();
  const [rows, setRows] = useState<AdminProductRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function reload(q: string) {
    setRows(null);
    try {
      const res = await admin.products(q || undefined);
      setRows(res.items);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => reload(query), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function patch(id: string, body: { status?: string; is_featured?: boolean }) {
    setBusy(id);
    try {
      const updated = await admin.updateProduct(id, body);
      setRows((rs) => rs?.map((r) => (r.id === id ? updated : r)) ?? rs);
      toast.success("Product updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: string, name: string) {
    const ok = await confirmDialog({
      title: `Delete "${name}"?`,
      description: "This can't be undone. Order history is kept.",
      confirmLabel: "Delete product",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(id);
    try {
      await admin.deleteProduct(id);
      setRows((rs) => rs?.filter((r) => r.id !== id) ?? rs);
      toast.success(`Deleted ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<AdminProductRow>[] = [
    {
      key: "product",
      header: "Product",
      cell: (p) => (
        <>
          <Link href={`/products/${p.slug}`} className="font-medium transition-colors hover:text-accent">
            {p.name}
          </Link>
          <p className="text-xs text-muted">
            {p.brand_name ?? "—"} · {p.sku}
            {p.is_featured && " · featured"}
          </p>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status.toLowerCase()}</Badge>,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      className: "tabular-nums",
      cell: (p) => formatMoney(p.base_price, p.currency),
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      cell: (p) =>
        p.total_stock <= 5 ? (
          <span className="font-medium text-danger tabular-nums">
            {p.total_stock} <span className="sr-only">(low stock)</span>
          </span>
        ) : (
          <span className="tabular-nums">{p.total_stock}</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {can("products.edit") && (
            <>
          <ButtonLink href={`/admin/products/${p.id}`} variant="outline" size="sm" className="h-8! px-3! text-xs">
            Edit
          </ButtonLink>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === p.id}
            onClick={() => patch(p.id, { is_featured: !p.is_featured })}
            className="h-8! px-3! text-xs"
          >
            {p.is_featured ? "Unfeature" : "Feature"}
          </Button>
          {p.status === "PUBLISHED" ? (
            <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => patch(p.id, { status: "ARCHIVED" })} className="h-8! px-3! text-xs">
              Archive
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => patch(p.id, { status: "PUBLISHED" })} className="h-8! px-3! text-xs">
              Publish
            </Button>
          )}
            </>
          )}
          {can("products.delete") && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy === p.id}
            onClick={() => onDelete(p.id, p.name)}
            className="h-8! px-3! text-xs text-danger hover:bg-danger-soft"
          >
            Delete
          </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Input
          type="search"
          label="Search products"
          hideLabel
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="w-full max-w-xs"
          inputClassName="h-10 rounded-pill px-4"
        />
        {can("products.create") && (
        <ButtonLink href="/admin/products/new" size="sm" className="h-10!">
          + New product
        </ButtonLink>
        )}
      </div>
      <DataTable
        caption="Products"
        columns={columns}
        rows={rows ?? []}
        rowKey={(p) => p.id}
        loading={!rows}
        empty={
          <EmptyState
            compact
            title={query ? "No matching products" : "No products yet"}
            description={query ? "Try a different search." : "Create your first product to start selling."}
          />
        }
      />
    </div>
  );
}

export default function AdminProducts() {
  return (
    <RequirePermission code="products.view">
      <AdminProductsPage />
    </RequirePermission>
  );
}
