"use client";

import { useState, type FormEvent } from "react";
import { useAuth, type OrderDetail } from "@/lib/auth";
import type { ReturnReason, ReturnRequest } from "@/lib/admin";
import { errorText, jsonInit, read } from "@/lib/http";
import { formatMoney } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { toast } from "@/lib/toast";
import { StatusBadge } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ReturnIcon } from "@/components/ui/icons";

const REASONS: { value: ReturnReason; label: string }[] = [
  { value: "DAMAGED", label: "It arrived damaged" },
  { value: "WRONG_ITEM", label: "I received the wrong item" },
  { value: "NOT_AS_DESCRIBED", label: "It's not as described" },
  { value: "CHANGED_MIND", label: "I changed my mind" },
  { value: "OTHER", label: "Something else" },
];

/**
 * Returns for a delivered order: what's already been asked for, and a form to
 * ask for more. The API enforces the return window and remaining quantities;
 * this mirrors them so the form only offers what can be returned.
 */
export function ReturnRequests({ order }: { order: OrderDetail }) {
  const { authFetch } = useAuth();
  const { data: returns, reload } = useLoad(
    `my-returns:${order.id}`,
    () => authFetch("/users/me/returns").then((r) => read<ReturnRequest[]>(r)),
    [],
  );
  const [open, setOpen] = useState(false);
  const mine = (returns ?? []).filter((r) => r.order_id === order.id);

  const taken = new Map<string, number>();
  for (const r of mine)
    if (r.status !== "REJECTED") for (const i of r.items) taken.set(i.order_item_id, (taken.get(i.order_item_id) ?? 0) + i.quantity);
  const returnable = order.items
    .filter((i) => i.id)
    .map((i) => ({ ...i, left: i.quantity - (taken.get(i.id!) ?? 0) }))
    .filter((i) => i.left > 0);

  if (order.status !== "DELIVERED" && mine.length === 0) return null;

  return (
    <section aria-labelledby="returns-title" className="rounded-panel border border-border bg-surface p-6 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="returns-title" className="font-display text-xl font-semibold">
          Returns
        </h2>
        {order.status === "DELIVERED" && returnable.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ReturnIcon width={16} height={16} aria-hidden /> Return items
          </Button>
        )}
      </div>
      {mine.length === 0 ? (
        <p className="text-sm text-muted">Not happy with something? You can ask to return it within the return window after delivery.</p>
      ) : (
        <ul className="space-y-3">
          {mine.map((r) => (
            <li key={r.id} className="rounded-card border border-border p-4 text-sm">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{r.reference}</span>
                <StatusBadge kind="return" status={r.status} />
              </div>
              <p className="text-muted">{r.items.map((i) => `${i.quantity} × ${i.product_name}`).join(", ")}</p>
              {r.decision_note && <p className="mt-1">“{r.decision_note}”</p>}
              {Number(r.refunded_amount) > 0 && (
                <p className="mt-1 text-success">Refunded {formatMoney(r.refunded_amount, order.currency)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <RequestModal
        key={String(open)}
        open={open}
        order={order}
        items={returnable}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false);
          reload();
        }}
      />
    </section>
  );
}

function RequestModal({
  open,
  order,
  items,
  onClose,
  onDone,
}: {
  open: boolean;
  order: OrderDetail;
  items: (OrderDetail["items"][number] & { left: number })[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { authFetch } = useAuth();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason>("DAMAGED");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = items.filter((i) => (qty[i.id!] ?? 0) > 0);
  const value = chosen.reduce((n, i) => n + Number(i.unit_price) * qty[i.id!], 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosen.length) return setError("Choose at least one item");
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(
        `/orders/${order.id}/returns`,
        jsonInit("POST", {
          reason,
          details: details.trim() || null,
          items: chosen.map((i) => ({ order_item_id: i.id, quantity: qty[i.id!] })),
        }),
      );
      const created = await read<ReturnRequest>(res);
      toast.success(`Return ${created.reference} requested — we'll be in touch`);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Return items"
      description="Pick what you're sending back. We review every request, then tell you how to send it."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="return-form" loading={busy}>
            Request return{value ? ` (${formatMoney(value, order.currency)})` : ""}
          </Button>
        </>
      }
    >
      <form id="return-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Items</legend>
          <ul className="divide-y divide-border rounded-card border border-border">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{i.product_name}</span>
                  <span className="text-xs text-muted">
                    {i.variant_name} · {formatMoney(i.unit_price, order.currency)} each
                  </span>
                </span>
                <label className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">Return</span>
                  <select
                    value={qty[i.id!] ?? 0}
                    onChange={(e) => setQty({ ...qty, [i.id!]: Number(e.target.value) })}
                    aria-label={`Quantity of ${i.product_name} to return`}
                    className="focus-ring h-9 cursor-pointer rounded-control border border-border-strong bg-surface px-2 text-sm"
                  >
                    {Array.from({ length: i.left + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)} options={REASONS} />
        <Textarea
          label="Anything we should know?"
          hint="Photos help with damaged items — mention it and we'll ask for them."
          rows={3}
          maxLength={2000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </form>
    </Modal>
  );
}
