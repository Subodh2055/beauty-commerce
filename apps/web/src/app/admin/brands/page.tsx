"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin, type AdminBrand } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/auth/auth-card";
import { ImageUpload } from "@/components/admin/image-upload";
import { confirmDialog } from "@/components/ui/confirm";
import { RequirePermission } from "@/components/admin/ui";
import { useCan } from "@/lib/permissions";

const blank = { name: "", country: "", description: "", logo_url: "", is_active: true };

function AdminBrandsPage() {
  const { can } = useCan();
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
    const ok = await confirmDialog({
      title: `Delete "${b.name}"?`,
      description: b.product_count
        ? `${b.product_count} product(s) will become unbranded.`
        : "This can't be undone.",
      confirmLabel: "Delete brand",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await admin.deleteBrand(b.id);
      if (editing?.id === b.id) reset();
      await refresh();
      toast.success(`Deleted ${b.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const columns: Column<AdminBrand>[] = [
    {
      key: "brand",
      header: "Brand",
      cell: (b) => (
        <>
          <p className="font-medium">{b.name}</p>
          <p className="text-xs text-muted">
            {b.slug}
            {b.country ? ` · ${b.country}` : ""}
          </p>
        </>
      ),
    },
    { key: "products", header: "Products", align: "right", className: "tabular-nums", cell: (b) => b.product_count },
    {
      key: "status",
      header: "Status",
      cell: (b) => <Badge tone={b.is_active ? "success" : "neutral"}>{b.is_active ? "active" : "inactive"}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (b) => (
        <div className="flex gap-1">
          {can("taxonomy.edit") && (
            <Button size="sm" variant="outline" className="h-8! px-3! text-xs" onClick={() => edit(b)}>
              Edit
            </Button>
          )}
          {can("taxonomy.delete") && (
            <Button size="sm" variant="ghost" className="h-8! px-3! text-xs text-danger hover:bg-danger-soft" onClick={() => onDelete(b)}>
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
          caption="Brands"
          columns={columns}
          rows={rows ?? []}
          rowKey={(b) => b.id}
          loading={!rows}
          empty={<EmptyState compact title="No brands yet" description="Add the first one with the form." />}
        />
      </div>

      {(editing ? can("taxonomy.edit") : can("taxonomy.create")) && (
      <form onSubmit={onSubmit} className="h-fit space-y-3 rounded-card border border-border bg-surface p-5 shadow-soft">
        <h2 className="font-display text-xl font-semibold">{editing ? "Edit brand" : "New brand"}</h2>
        <FormError message={error} />
        <Field label="Name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Field label="Country (2-letter)" name="country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} maxLength={2} placeholder="NP" />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Logo</label>
          <ImageUpload label="logo" value={form.logo_url} onChange={(url) => setForm({ ...form, logo_url: url })} />
        </div>
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

export default function AdminBrands() {
  return (
    <RequirePermission code="taxonomy.view">
      <AdminBrandsPage />
    </RequirePermission>
  );
}
