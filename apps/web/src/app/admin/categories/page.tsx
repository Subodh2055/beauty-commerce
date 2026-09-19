"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin, type AdminCategory } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/auth/auth-card";
import { ImageUpload } from "@/components/admin/image-upload";

const blank = { name: "", description: "", image_url: "", parent_id: "", sort_order: 0, is_active: true };

export default function AdminCategories() {
  const admin = useAdmin();
  const [rows, setRows] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const c = await admin.categories();
        if (active) setRows(c);
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
    setRows(await admin.categories());
  }

  const nameById = (id: string | null) => rows?.find((c) => c.id === id)?.name ?? "—";

  function edit(c: AdminCategory) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      image_url: c.image_url ?? "",
      parent_id: c.parent_id ?? "",
      sort_order: c.sort_order,
      is_active: c.is_active,
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
      description: form.description || null,
      image_url: form.image_url || null,
      parent_id: form.parent_id || null,
      sort_order: Number(form.sort_order),
      is_active: form.is_active,
    };
    try {
      if (editing) await admin.saveCategory(editing.id, payload);
      else await admin.createCategory(payload);
      toast.success(editing ? "Category updated" : "Category created");
      reset();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(c: AdminCategory) {
    const warn = c.product_count
      ? `Delete "${c.name}"? ${c.product_count} product(s) will be uncategorised.`
      : `Delete "${c.name}"?`;
    if (!confirm(warn)) return;
    try {
      await admin.deleteCategory(c.id);
      if (editing?.id === c.id) reset();
      await refresh();
      toast.success(`Deleted ${c.name}`);
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
                  <th className="p-3">Category</th>
                  <th className="p-3">Parent</th>
                  <th className="p-3 text-right">Products</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3">
                      <p className="font-medium">
                        {c.name}
                        {!c.is_active && <span className="ml-2 text-xs text-muted">(inactive)</span>}
                      </p>
                      <p className="text-xs text-muted">{c.slug}</p>
                    </td>
                    <td className="p-3 text-muted">{c.parent_id ? nameById(c.parent_id) : "—"}</td>
                    <td className="p-3 text-right tabular-nums">{c.product_count}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-8! px-3! text-xs" onClick={() => edit(c)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8! px-3! text-xs text-danger hover:bg-danger/10" onClick={() => onDelete(c)}>
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
        <h2 className="font-serif text-lg font-semibold">{editing ? "Edit category" : "New category"}</h2>
        <FormError message={error} />
        <Field label="Name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Parent</label>
          <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className="focus-ring h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm">
            <option value="">— (top level)</option>
            {(rows ?? [])
              .filter((c) => c.id !== editing?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Image</label>
          <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />
        </div>
        <Field label="Sort order" name="sort_order" type="number" value={String(form.sort_order)} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
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
