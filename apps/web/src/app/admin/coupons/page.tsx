"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin, type Coupon } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { FormError } from "@/components/auth/auth-card";

export default function AdminCoupons() {
  const admin = useAdmin();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      setCoupons(await admin.coupons());
    } catch {
      setCoupons([]);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const c = await admin.coupons();
        if (active) setCoupons(c);
      } catch {
        if (active) setCoupons([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await admin.createCoupon({
        code: String(fd.get("code")),
        discount_type: String(fd.get("discount_type")),
        value: Number(fd.get("value")),
        min_subtotal: Number(fd.get("min_subtotal")) || 0,
        max_discount: fd.get("max_discount") ? Number(fd.get("max_discount")) : null,
        usage_limit: fd.get("usage_limit") ? Number(fd.get("usage_limit")) : null,
        per_user_limit: Number(fd.get("per_user_limit")) || 1,
        description: String(fd.get("description")) || null,
      });
      (e.target as HTMLFormElement).reset();
      await reload();
      toast.success("Coupon created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create coupon");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Coupon>[] = [
    { key: "code", header: "Code", className: "font-mono font-medium", cell: (c) => c.code },
    {
      key: "discount",
      header: "Discount",
      cell: (c) => (
        <>
          {c.discount_type === "PERCENT" ? `${Number(c.value)}%` : formatMoney(c.value)}
          {c.max_discount && <span className="text-xs text-muted"> (max {formatMoney(c.max_discount)})</span>}
        </>
      ),
    },
    {
      key: "min",
      header: "Min spend",
      responsive: "hidden sm:table-cell",
      cell: (c) => <span className="text-muted">{Number(c.min_subtotal) ? formatMoney(c.min_subtotal) : "—"}</span>,
    },
    {
      key: "used",
      header: "Used",
      align: "right",
      className: "tabular-nums",
      cell: (c) => `${c.used_count}${c.usage_limit ? `/${c.usage_limit}` : ""}`,
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <Badge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "active" : "inactive"}</Badge>,
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <DataTable
          caption="Coupons"
          columns={columns}
          rows={coupons ?? []}
          rowKey={(c) => c.id}
          loading={!coupons}
          empty={<EmptyState compact title="No coupons yet" description="Create one with the form." />}
        />
      </div>

      <form onSubmit={onCreate} className="h-fit space-y-3 rounded-card border border-border bg-surface p-5 shadow-soft">
        <h2 className="font-display text-xl font-semibold">New coupon</h2>
        <FormError message={error} />
        <Field label="Code" name="code" required placeholder="WELCOME10" />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Type"
            name="discount_type"
            options={[
              { value: "PERCENT", label: "Percent" },
              { value: "FIXED", label: "Fixed" },
            ]}
          />
          <Field label="Value" name="value" type="number" step="0.01" required placeholder="10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min spend" name="min_subtotal" type="number" step="1" placeholder="0" />
          <Field label="Max discount" name="max_discount" type="number" step="1" placeholder="—" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Usage limit" name="usage_limit" type="number" step="1" placeholder="∞" />
          <Field label="Per user" name="per_user_limit" type="number" step="1" defaultValue="1" />
        </div>
        <Field label="Description" name="description" placeholder="Optional" />
        <Button type="submit" className="w-full" loading={busy}>
          Create coupon
        </Button>
      </form>
    </div>
  );
}
