"use client";

import { useState, type FormEvent } from "react";
import { useAdminApi, type Coupon, type CouponWrite } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useCan } from "@/lib/permissions";
import { errorText } from "@/lib/http";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader, RequirePermission, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EditIcon, PlusIcon, TagIcon, TrashIcon } from "@/components/ui/icons";

function couponState(c: Coupon): { label: string; tone: "success" | "neutral" | "warning" | "danger" } {
  const now = Date.now();
  if (!c.is_active) return { label: "Off", tone: "neutral" };
  if (c.ends_at && Date.parse(c.ends_at) < now) return { label: "Expired", tone: "danger" };
  if (c.starts_at && Date.parse(c.starts_at) > now) return { label: "Scheduled", tone: "warning" };
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) return { label: "Used up", tone: "danger" };
  return { label: "Live", tone: "success" };
}

export default function CouponsPage() {
  const api = useAdminApi();
  const { can } = useCan();
  const { data, error, reload, update } = useLoad("coupons", () => api.coupons());
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);

  async function toggle(c: Coupon) {
    try {
      const next = await api.saveCoupon(c.id, { ...toWrite(c), is_active: !c.is_active });
      update((list) => list.map((x) => (x.id === c.id ? next : x)));
      toast.success(next.is_active ? `${c.code} is on` : `${c.code} is off`);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function remove(c: Coupon) {
    const ok = await confirmDialog({
      title: `Delete ${c.code}?`,
      description: "It can't be redeemed any more. This can't be undone.",
      confirmLabel: "Delete coupon",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteCoupon(c.id);
      update((list) => list.filter((x) => x.id !== c.id));
      toast.success(`${c.code} deleted`);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const columns: Column<Coupon>[] = [
    {
      key: "code",
      header: "Code",
      cell: (c) => (
        <span>
          <span className="font-mono font-medium">{c.code}</span>
          {c.description && <span className="block max-w-56 truncate text-xs text-muted">{c.description}</span>}
        </span>
      ),
    },
    {
      key: "discount",
      header: "Discount",
      cell: (c) => (
        <>
          {c.discount_type === "PERCENT" ? `${Number(c.value)}%` : formatMoney(c.value)}
          {c.max_discount && <span className="block text-xs text-muted">max {formatMoney(c.max_discount)}</span>}
        </>
      ),
    },
    {
      key: "min",
      header: "Min. order",
      cell: (c) => (Number(c.min_subtotal) ? formatMoney(c.min_subtotal) : "—"),
      responsive: "hidden md:table-cell",
    },
    {
      key: "window",
      header: "Valid",
      cell: (c) => (c.starts_at || c.ends_at ? `${fmtDate(c.starts_at)} – ${fmtDate(c.ends_at)}` : "Always"),
      responsive: "hidden lg:table-cell",
    },
    {
      key: "used",
      header: "Used",
      align: "right",
      cell: (c) => `${c.used_count}${c.usage_limit ? ` / ${c.usage_limit}` : ""}`,
    },
    {
      key: "state",
      header: "State",
      cell: (c) => {
        const s = couponState(c);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (c) => (
        <span className="flex justify-end gap-1">
          {can("coupons.edit") && (
            <>
              <Button variant="outline" size="sm" onClick={() => toggle(c)}>
                {c.is_active ? "Turn off" : "Turn on"}
              </Button>
              <Button variant="ghost" size="sm" aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)}>
                <EditIcon width={16} height={16} />
              </Button>
            </>
          )}
          {can("coupons.delete") && c.used_count === 0 && (
            <Button variant="ghost" size="sm" aria-label={`Delete ${c.code}`} onClick={() => remove(c)}>
              <TrashIcon width={16} height={16} />
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <RequirePermission code="coupons.view">
      <PageHeader
        title="Coupons"
        description="Coupons are platform-funded: vendors are paid on their full line price. Used coupons can be turned off but not deleted."
        actions={
          can("coupons.create") && (
            <Button onClick={() => setEditing("new")}>
              <PlusIcon width={16} height={16} aria-hidden /> New coupon
            </Button>
          )
        }
      />
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <DataTable
          caption="Coupons"
          columns={columns}
          rows={data ?? []}
          rowKey={(c) => c.id}
          loading={!data}
          empty={<EmptyState compact icon={<TagIcon width={22} height={22} />} title="No coupons yet" />}
        />
      )}
      <CouponModal
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(c) => {
          update((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));
          setEditing(null);
        }}
      />
    </RequirePermission>
  );
}

function toWrite(c: Coupon): CouponWrite {
  return {
    code: c.code,
    description: c.description,
    discount_type: c.discount_type,
    value: c.value,
    min_subtotal: c.min_subtotal,
    max_discount: c.max_discount,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    usage_limit: c.usage_limit,
    per_user_limit: c.per_user_limit,
    is_active: c.is_active,
  };
}

// <input type="datetime-local"> speaks local time without a zone.
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function CouponModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Coupon | "new" | null;
  onClose: () => void;
  onSaved: (c: Coupon) => void;
}) {
  const api = useAdminApi();
  const existing = editing && editing !== "new" ? editing : null;
  const [type, setType] = useState<"PERCENT" | "FIXED">(existing?.discount_type ?? "PERCENT");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const body: CouponWrite = {
      code: s("code"),
      description: s("description") || null,
      discount_type: type,
      value: s("value"),
      min_subtotal: s("min_subtotal") || "0",
      max_discount: s("max_discount") || null,
      starts_at: fromLocalInput(s("starts_at")),
      ends_at: fromLocalInput(s("ends_at")),
      usage_limit: s("usage_limit") ? Number(s("usage_limit")) : null,
      per_user_limit: Number(s("per_user_limit")) || 1,
      is_active: existing?.is_active ?? true,
    };
    if (type === "PERCENT" && Number(body.value) > 100) return setFields({ value: "A percentage can't exceed 100" });
    if (body.starts_at && body.ends_at && body.ends_at <= body.starts_at)
      return setFields({ ends_at: "Must be after the start" });
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const saved = await api.saveCoupon(existing?.id ?? null, body);
      toast.success(existing ? "Coupon saved" : "Coupon created");
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={existing ? `Edit ${existing.code}` : "New coupon"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="coupon-form" loading={busy}>
            {existing ? "Save coupon" : "Create coupon"}
          </Button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {error && (
          <p role="alert" className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger sm:col-span-2">
            {error}
          </p>
        )}
        <Input name="code" label="Code" required defaultValue={existing?.code} hint="Saved in capitals." data-autofocus />
        <Select
          label="Discount type"
          value={type}
          onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}
          options={[
            { value: "PERCENT", label: "Percentage off" },
            { value: "FIXED", label: "Fixed amount off" },
          ]}
        />
        <Input
          name="value"
          label={type === "PERCENT" ? "Percent" : "Amount (NPR)"}
          type="number"
          min="0.01"
          step="0.01"
          required
          defaultValue={existing?.value}
          error={fields.value}
        />
        <Input
          name="max_discount"
          label="Maximum discount (NPR)"
          type="number"
          min="0"
          step="1"
          defaultValue={existing?.max_discount ?? ""}
          hint={type === "PERCENT" ? "Caps a percentage coupon on big orders." : "Optional."}
        />
        <Input name="min_subtotal" label="Minimum order (NPR)" type="number" min="0" step="1" defaultValue={existing?.min_subtotal ?? "0"} />
        <Input name="description" label="Internal description" defaultValue={existing?.description ?? ""} />
        <Input name="starts_at" label="Starts" type="datetime-local" defaultValue={toLocalInput(existing?.starts_at ?? null)} />
        <Input
          name="ends_at"
          label="Ends"
          type="datetime-local"
          defaultValue={toLocalInput(existing?.ends_at ?? null)}
          error={fields.ends_at}
        />
        <Input
          name="usage_limit"
          label="Total uses"
          type="number"
          min="1"
          step="1"
          defaultValue={existing?.usage_limit ?? ""}
          hint={existing?.used_count ? `Used ${existing.used_count} times so far.` : "Leave empty for unlimited."}
        />
        <Input name="per_user_limit" label="Uses per customer" type="number" min="1" step="1" defaultValue={existing?.per_user_limit ?? 1} />
      </form>
    </Modal>
  );
}
