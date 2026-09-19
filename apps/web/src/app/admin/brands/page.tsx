"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin, type AdminBrand } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/auth/auth-card";
import { ImageUpload } from "@/components/admin/image-upload";

const blank = { name: "", country: "", description: "", logo_url: "", is_active: true };

export default function AdminBrands() {
  const admin = useAdmin();
  const [rows, setRows] = useState<AdminBrand[] | null>(null);
  const [editing, setEditing] = useState<AdminBrand | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const b = await admin.brands();
        if (active) setRows(b);
      } catch {
        if (active) setRows([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setRows(await admin.brands());
  }

  function edit(b: AdminBrand) {
    setEditing(b);
    setForm({
      name: b.name,
      country: b.country ?? "",
      description: b.description ?? "",
      logo_url: b.logo_url ?? "",
      is_active: b.is_active,
    });
  }

  function reset() {
    setEditing(null);
    setForm(blank);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload = {
      name: form.name,
      country: form.country || null,
      description: form.description || null,
      logo_url: form.logo_url || null,
      is_active: form.is_active,
    };
    try {
      if (editing) await admin.saveBrand(editing.id, payload);
      else await admin.createBrand(payload);
      toast.success(editing ? "Brand updated" : "Brand created");
      reset();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(b: AdminBrand) {
    const warn = b.product_count
      ? `Delete "${b.name}"? ${b.product_count} product(s) will become unbranded.`
      : `Delete "${b.name}"?`;
    if (!confirm(warn)) return;
    try {
      await admin.deleteBrand(b.id);
      if (editing?.id === b.id) reset();
      await refresh();
      toast.success(`Deleted ${b.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {!rows ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="p-3">Brand</th>
                  <th className="p-3 text-right">Products</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="p-3">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted">{b.slug}{b.country ? ` · ${b.country}` : ""}</p>
                    </td>
                    <td className="p-3 text-right tabular-nums">{b.product_count}</td>
                    <td className="p-3">
                      <Badge tone={b.is_active ? "success" : "neutral"}>
                        {b.is_active ? "active" : "inactive"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-8! px-3! text-xs" onClick={() => edit(b)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8! px-3! text-xs text-danger hover:bg-danger/10" onClick={() => onDelete(b)}>
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

      <form onSubmit={onSubmit} className="h-fit space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="font-serif text-lg font-semibold">{editing ? "Edit brand" : "New brand"}</h2>
        <FormError message={error} />
        <Field label="Name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Field label="Country (2-letter)" name="country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} maxLength={2} placeholder="NP" />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Logo</label>
          <ImageUpload label="logo" value={form.logo_url} onChange={(url) => setForm({ ...form, logo_url: url })} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          Active
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">
            {busy ? "Saving…" : editing ? "Save" : "Create"}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
