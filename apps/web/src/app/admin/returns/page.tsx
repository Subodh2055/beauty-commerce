"use client";

import { Suspense, useState } from "react";
import { useAdminApi, type AdminReturn, type ReturnStatus } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useDebouncedQuery, useUrlState } from "@/lib/use-url-state";
import { useCan } from "@/lib/permissions";
import { errorText } from "@/lib/http";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  Facts,
  LoadError,
  PageHeader,
  Pager,
  RequirePermission,
  SearchBox,
  fmtDateTime,
  relTime,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { promptDialog } from "@/components/ui/prompt";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ReturnIcon } from "@/components/ui/icons";

const SIZE = 20;
const STATUSES: { value: "" | ReturnStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "REQUESTED", label: "Requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "RECEIVED", label: "Received" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "REJECTED", label: "Rejected" },
];
const REASONS: Record<string, string> = {
  DAMAGED: "Arrived damaged",
  WRONG_ITEM: "Wrong item",
  NOT_AS_DESCRIBED: "Not as described",
  CHANGED_MIND: "Changed mind",
  OTHER: "Other",
};

export default function ReturnsPage() {
  return (
    <RequirePermission code="returns.view">
      <PageHeader
        title="Returns & refunds"
        description="Approve or reject requests, mark parcels received (optionally restocking), then record the refund."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Returns />
      </Suspense>
    </RequirePermission>
  );
}

function Returns() {
  const api = useAdminApi();
  const { get, set, page } = useUrlState();
  const status = get("status");
  const q = get("q");
  const [search, setSearch] = useDebouncedQuery(q, set);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, error, reload, update } = useLoad(JSON.stringify([status, q, page]), () =>
    api.returns({ status: status || undefined, q: q || undefined, page, size: SIZE }),
  );

  const columns: Column<AdminReturn>[] = [
    {
      key: "ref",
      header: "Return",
      cell: (r) => (
        <button type="button" onClick={() => setOpenId(r.id)} className="focus-ring rounded-sm text-left font-medium text-accent hover:underline">
          {r.reference}
          <span className="block text-xs font-normal text-muted">Order {r.order_number}</span>
        </button>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (r) => (
        <span className="block max-w-48 truncate">
          {r.customer_name ?? "—"}
          <span className="block truncate text-xs text-muted">{r.customer_email}</span>
        </span>
      ),
      responsive: "hidden md:table-cell",
    },
    { key: "reason", header: "Reason", cell: (r) => REASONS[r.reason] ?? r.reason, responsive: "hidden lg:table-cell" },
    {
      key: "amount",
      header: "Value",
      align: "right",
      cell: (r) => <span className="tabular-nums">{formatMoney(r.requested_amount, r.currency)}</span>,
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge kind="return" status={r.status} /> },
    { key: "when", header: "Requested", cell: (r) => relTime(r.created_at), responsive: "hidden sm:table-cell" },
  ];

  const onChanged = (next: AdminReturn) => {
    update((p) => ({ ...p, items: p.items.map((r) => (r.id === next.id ? next : r)) }));
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FilterChips label="Status" options={STATUSES} value={status} onChange={(v) => set({ status: v || null })} />
        <SearchBox
          label="Search returns"
          placeholder="Reference, order or email"
          value={search}
          onChange={setSearch}
        />
      </div>
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <>
          <DataTable
            caption="Return requests"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(r) => r.id}
            loading={!data}
            empty={
              <EmptyState
                compact
                icon={<ReturnIcon width={22} height={22} />}
                title={status || q ? "No returns match" : "No return requests yet"}
                description="Customers ask for returns from their order page within the return window."
              />
            }
          />
          {data && <Pager page={page} size={SIZE} total={data.total} onPage={(p) => set({ page: String(p) })} />}
        </>
      )}
      <ReturnDrawer id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} />
    </>
  );
}

function ReturnDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: (r: AdminReturn) => void;
}) {
  const api = useAdminApi();
  const { can } = useCan();
  const canEdit = can("returns.edit");
  const { data: r, error, reload, update } = useLoad(`return:${id}`, () =>
    id ? api.returnDetail(id) : Promise.resolve(null),
  );
  const [busy, setBusy] = useState(false);
  const [refunding, setRefunding] = useState(false);

  async function run(fn: () => Promise<AdminReturn>, done: string) {
    setBusy(true);
    try {
      const next = await fn();
      update(() => next);
      onChanged(next);
      toast.success(done);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!r) return;
    const note = await promptDialog({
      title: `Approve ${r.reference}?`,
      description: "The customer can send the items back.",
      label: "Note to keep with the return (optional)",
      confirmLabel: "Approve",
    });
    if (note !== null) await run(() => api.approveReturn(r.id, note), "Return approved");
  }

  async function reject() {
    if (!r) return;
    const reason = await promptDialog({
      title: `Reject ${r.reference}?`,
      description: "The items become returnable again only if the customer asks once more.",
      label: "Reason",
      hint: "Recorded on the return and in the audit log.",
      required: true,
      tone: "danger",
      confirmLabel: "Reject return",
    });
    if (reason) await run(() => api.rejectReturn(r.id, reason), "Return rejected");
  }

  async function receive() {
    if (!r) return;
    const restock = await confirmDialog({
      title: "Put the items back on sale?",
      description: `Mark ${r.reference} received. Choose “Restock” if the items are sellable; otherwise they stay out of stock.`,
      confirmLabel: "Restock",
      cancelLabel: "Receive without restocking",
    });
    await run(() => api.receiveReturn(r.id, restock), restock ? "Received and restocked" : "Marked received");
  }

  const open = id !== null;
  return (
    <Drawer open={open} onClose={onClose} title={r ? `Return ${r.reference}` : "Return"} side="right" size="lg"
      footer={
        r && canEdit ? (
          <div className="flex flex-wrap justify-end gap-2">
            {(r.status === "REQUESTED" || r.status === "APPROVED") && (
              <Button variant="outline" size="sm" onClick={reject} disabled={busy}>
                Reject
              </Button>
            )}
            {r.status === "REQUESTED" && (
              <Button size="sm" onClick={approve} loading={busy}>
                Approve
              </Button>
            )}
            {r.status === "APPROVED" && (
              <Button variant="secondary" size="sm" onClick={receive} disabled={busy}>
                Mark received
              </Button>
            )}
            {(r.status === "APPROVED" || r.status === "RECEIVED") && (
              <Button size="sm" onClick={() => setRefunding(true)} disabled={busy}>
                Record refund
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !r ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="return" status={r.status} />
            <span className="text-sm text-muted">requested {fmtDateTime(r.created_at)}</span>
          </div>
          <Facts
            items={[
              ["Order", `${r.order_number} · ${formatMoney(r.order_total, r.currency)} · ${r.payment_method}`],
              ["Customer", r.customer_email ? `${r.customer_name ?? ""} ${r.customer_email}`.trim() : "—"],
              ["Reason", REASONS[r.reason] ?? r.reason],
              ["Details", r.details],
              ["Decision note", r.decision_note],
              ["Received", r.received_at ? `${fmtDateTime(r.received_at)}${r.restocked ? " · restocked" : ""}` : null],
              ["Still refundable", formatMoney(r.order_refundable, r.currency)],
            ]}
          />
          <section>
            <h3 className="mb-2 text-sm font-semibold">Items</h3>
            <ul className="divide-y divide-border rounded-card border border-border">
              {r.items.map((i) => (
                <li key={i.order_item_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.product_name}</span>
                    <span className="text-xs text-muted">
                      {i.variant_name} · {i.sku}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {i.quantity} × {formatMoney(i.unit_price, r.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {r.refunds.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Refunds</h3>
              <ul className="space-y-2 text-sm">
                {r.refunds.map((f) => (
                  <li key={f.id} className="rounded-card bg-success-soft px-4 py-2.5 text-success">
                    {formatMoney(f.amount, r.currency)} · {f.method === "ORIGINAL" ? "to original payment" : "manual"}
                    {f.reference ? ` · ref ${f.reference}` : ""} · {fmtDateTime(f.created_at)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {r && (
        <RefundModal
          open={refunding}
          ret={r}
          onClose={() => setRefunding(false)}
          onDone={(next) => {
            setRefunding(false);
            update(() => next);
            onChanged(next);
          }}
        />
      )}
    </Drawer>
  );
}

function RefundModal({
  open,
  ret,
  onClose,
  onDone,
}: {
  open: boolean;
  ret: AdminReturn;
  onClose: () => void;
  onDone: (r: AdminReturn) => void;
}) {
  const api = useAdminApi();
  const max = Math.min(Number(ret.requested_amount), Number(ret.order_refundable));
  const [amount, setAmount] = useState(String(max));
  const [method, setMethod] = useState<"ORIGINAL" | "MANUAL">("ORIGINAL");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const n = Number(amount);
    if (!(n > 0)) return setError("Enter an amount above zero");
    if (n > Number(ret.order_refundable)) return setError("That's more than can still be refunded on this order");
    const ok = await confirmDialog({
      title: `Record a ${formatMoney(n, ret.currency)} refund?`,
      description:
        n >= Number(ret.order_refundable)
          ? "This refunds the rest of the order, which moves it (and its vendor orders) to Refunded."
          : "Record it after you've paid it through the payment provider or bank.",
      confirmLabel: "Record refund",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const next = await api.refundReturn(ret.id, { amount: n.toFixed(2), method, reference: reference || undefined });
      toast.success("Refund recorded");
      onDone(next);
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
      title={`Refund ${ret.reference}`}
      description={`Returned items are worth ${formatMoney(ret.requested_amount, ret.currency)}; ${formatMoney(ret.order_refundable, ret.currency)} is still refundable on the order.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Record refund
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label={`Amount (${ret.currency})`}
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          data-autofocus
        />
        <Select
          label="Paid back via"
          value={method}
          onChange={(e) => setMethod(e.target.value as "ORIGINAL" | "MANUAL")}
          options={[
            { value: "ORIGINAL", label: "Original payment method" },
            { value: "MANUAL", label: "Manual (bank transfer, cash)" },
          ]}
        />
        <Input
          label="Payment reference (optional)"
          hint="Gateway refund id or bank reference, for reconciliation."
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
    </Modal>
  );
}
