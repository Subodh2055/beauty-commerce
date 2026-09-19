"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin, type Coupon } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {!coupons ? (
          <Skeleton className="h-64" />
        ) : coupons.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
            No coupons yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Discount</th>
                  <th className="p-3">Min spend</th>
                  <th className="p-3 text-right">Used</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-mono font-medium">{c.code}</td>
                    <td className="p-3">
                      {c.discount_type === "PERCENT" ? `${Number(c.value)}%` : formatMoney(c.value)}
                      {c.max_discount && <span className="text-xs text-muted"> (max {formatMoney(c.max_discount)})</span>}
                    </td>
                    <td className="p-3 text-muted">{Number(c.min_subtotal) ? formatMoney(c.min_subtotal) : "—"}</td>
                    <td className="p-3 text-right tabular-nums">
                      {c.used_count}
                      {c.usage_limit ? `/${c.usage_limit}` : ""}
                    </td>
                    <td className="p-3">
                      <Badge tone={c.is_active ? "success" : "neutral"}>
                        {c.is_active ? "active" : "inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={onCreate} className="h-fit space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="font-serif text-lg font-semibold">New coupon</h2>
        <FormError message={error} />
        <Field label="Code" name="code" required placeholder="WELCOME10" />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="discount_type" className="block text-sm font-medium">Type</label>
            <select id="discount_type" name="discount_type" className="focus-ring h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm">
              <option value="PERCENT">Percent</option>
              <option value="FIXED">Fixed</option>
            </select>
          </div>
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
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create coupon"}
        </Button>
      </form>
    </div>
  );
}
