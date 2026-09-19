"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdmin, type AdminProductRow } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_TONE: Record<string, "success" | "gold" | "neutral"> = {
  PUBLISHED: "success",
  DRAFT: "gold",
  REVIEW: "gold",
  ARCHIVED: "neutral",
};

export default function AdminProducts() {
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
    if (!confirm(`Delete "${name}"? This cannot be undone. Order history is kept.`)) return;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="focus-ring h-10 w-full max-w-xs rounded-full border border-border bg-surface px-4 text-sm"
        />
        <Link
          href="/admin/products/new"
          className="focus-ring inline-flex h-10 items-center gap-1 rounded-full bg-accent px-5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          + New product
        </Link>
      </div>

      {!rows ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Stock</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3">
                    <Link href={`/products/${p.slug}`} className="font-medium hover:text-accent">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {p.brand_name ?? "—"} · {p.sku}
                      {p.is_featured && " · ★ featured"}
                    </p>
                  </td>
                  <td className="p-3">
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status.toLowerCase()}</Badge>
                  </td>
                  <td className="p-3 text-right tabular-nums">{formatMoney(p.base_price, p.currency)}</td>
                  <td className={`p-3 text-right tabular-nums ${p.total_stock <= 5 ? "text-danger font-medium" : ""}`}>
                    {p.total_stock}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="focus-ring inline-flex h-8 items-center rounded-full border border-border px-3 text-xs hover:bg-surface-2"
                      >
                        Edit
                      </Link>
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
                      <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => onDelete(p.id, p.name)} className="h-8! px-3! text-xs text-danger hover:bg-danger/10">
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
