"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin, type AdminCategory } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/auth/auth-card";
import { ImageUpload } from "@/components/admin/image-upload";
import { confirmDialog } from "@/components/ui/confirm";
import { RequirePermission } from "@/components/admin/ui";
import { useCan } from "@/lib/permissions";

const blank = { name: "", description: "", image_url: "", parent_id: "", sort_order: 0, is_active: true };

function AdminCategoriesPage() {
  const { can } = useCan();
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
    const ok = await confirmDialog({
      title: `Delete "${c.name}"?`,
      description: c.product_count
        ? `${c.product_count} product(s) will be uncategorised.`
        : "This can't be undone.",
      confirmLabel: "Delete category",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await admin.deleteCategory(c.id);
      if (editing?.id === c.id) reset();
      await refresh();
      toast.success(`Deleted ${c.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const columns: Column<AdminCategory>[] = [
    {
      key: "category",
      header: "Category",
      cell: (c) => (
        <>
          <p className="font-medium">
            {c.name}
            {!c.is_active && (
              <Badge tone="neutral" className="ml-2 align-middle">
                inactive
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted">{c.slug}</p>
        </>
      ),
    },
    {
      key: "parent",
      header: "Parent",
      responsive: "hidden sm:table-cell",
      cell: (c) => <span className="text-muted">{c.parent_id ? nameById(c.parent_id) : "—"}</span>,
    },
    { key: "products", header: "Products", align: "right", className: "tabular-nums", cell: (c) => c.product_count },
    {
      key: "actions",
      header: "Actions",
      cell: (c) => (
        <div className="flex gap-1">
          {can("taxonomy.edit") && (
            <Button size="sm" variant="outline" className="h-8! px-3! text-xs" onClick={() => edit(c)}>
              Edit
            </Button>
          )}
          {can("taxonomy.delete") && (
            <Button size="sm" variant="ghost" className="h-8! px-3! text-xs text-danger hover:bg-danger-soft" onClick={() => onDelete(c)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <DataTable
          caption="Categories"
          columns={columns}
          rows={rows ?? []}
          rowKey={(c) => c.id}
          loading={!rows}
          empty={<EmptyState compact title="No categories yet" description="Add the first one with the form." />}
        />
      </div>

      {(editing ? can("taxonomy.edit") : can("taxonomy.create")) && (
      <form onSubmit={onSubmit} className="h-fit space-y-3 rounded-card border border-border bg-surface p-5 shadow-soft">
        <h2 className="font-display text-xl font-semibold">{editing ? "Edit category" : "New category"}</h2>
        <FormError message={error} />
        <Field label="Name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Select
          label="Parent"
          name="parent_id"
          value={form.parent_id}
          onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
          placeholder="— (top level)"
          options={(rows ?? []).filter((c) => c.id !== editing?.id).map((c) => ({ value: c.id, label: c.name }))}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Image</label>
          <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />
        </div>
        <Field label="Sort order" name="sort_order" type="number" value={String(form.sort_order)} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        <Textarea label="Description" name="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="focus-ring h-4 w-4 cursor-pointer accent-accent" />
          Active
        </label>
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            {editing ? "Save" : "Create"}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          )}
        </div>
      </form>
      )}
    </div>
  );
}

export default function AdminCategories() {
  return (
    <RequirePermission code="taxonomy.view">
      <AdminCategoriesPage />
    </RequirePermission>
  );
}
