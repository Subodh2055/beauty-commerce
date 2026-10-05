"use client";

import { Suspense, useState } from "react";
import { useAdminApi, type CustomerRow } from "@/lib/admin";
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
  fmtDate,
  fmtDateTime,
  relTime,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/prompt";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { BanIcon, CheckIcon, UsersIcon } from "@/components/ui/icons";

const SIZE = 25;
const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "spend", label: "Highest spend" },
  { value: "orders", label: "Most orders" },
];

export default function CustomersPage() {
  return (
    <RequirePermission code="customers.view">
      <PageHeader
        title="Customers"
        description="Shopper and vendor accounts. Staff accounts are managed by the super admin."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Customers />
      </Suspense>
    </RequirePermission>
  );
}

function Customers() {
  const api = useAdminApi();
  const { get, set, page } = useUrlState();
  const q = get("q");
  const state = get("state"); // "" | active | blocked
  const sort = SORTS.some((s) => s.value === get("sort")) ? get("sort") : "newest";
  const [search, setSearch] = useDebouncedQuery(q, set);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, error, reload, update } = useLoad(JSON.stringify([q, state, sort, page]), () =>
    api.customers({
      q: q || undefined,
      active: state === "active" ? true : state === "blocked" ? false : undefined,
      sort,
      page,
      size: SIZE,
    }),
  );

  const columns: Column<CustomerRow>[] = [
    {
      key: "who",
      header: "Customer",
      cell: (c) => (
        <button type="button" onClick={() => setOpenId(c.id)} className="focus-ring block max-w-64 rounded-sm text-left">
          <span className="block truncate font-medium text-accent hover:underline">{c.full_name || c.email}</span>
          <span className="block truncate text-xs text-muted">{c.email}</span>
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.is_active ? (
            <Badge tone="success">
              <CheckIcon width={12} height={12} aria-hidden /> Active
            </Badge>
          ) : (
            <Badge tone="danger">
              <BanIcon width={12} height={12} aria-hidden /> Blocked
            </Badge>
          )}
          {c.is_vendor && <Badge tone="gold">Vendor</Badge>}
        </span>
      ),
    },
    { key: "orders", header: "Orders", align: "right", cell: (c) => c.orders_count },
    {
      key: "spent",
      header: "Spent",
      align: "right",
      cell: (c) => <span className="tabular-nums">{formatMoney(c.total_spent)}</span>,
    },
    { key: "joined", header: "Joined", cell: (c) => fmtDate(c.created_at), responsive: "hidden md:table-cell" },
    { key: "seen", header: "Last sign-in", cell: (c) => relTime(c.last_login_at), responsive: "hidden lg:table-cell" },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FilterChips
          label="Account status"
          options={[
            { value: "", label: "All" },
            { value: "active", label: "Active" },
            { value: "blocked", label: "Blocked" },
          ]}
          value={state}
          onChange={(v) => set({ state: v || null })}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Sort"
            hideLabel
            controlSize="sm"
            value={sort}
            onChange={(e) => set({ sort: e.target.value === "newest" ? null : e.target.value })}
            options={SORTS}
          />
          <SearchBox label="Search customers" placeholder="Name, email or phone" value={search} onChange={setSearch} />
        </div>
      </div>
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <>
          <DataTable
            caption="Customers"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(c) => c.id}
            loading={!data}
            rowClassName={(c) => (c.is_active ? "" : "bg-danger-soft/30")}
            empty={
              <EmptyState
                compact
                icon={<UsersIcon width={22} height={22} />}
                title={q || state ? "No customers match" : "No customers yet"}
              />
            }
          />
          {data && <Pager page={page} size={SIZE} total={data.total} onPage={(p) => set({ page: String(p) })} />}
        </>
      )}
      <CustomerDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        onChanged={(c) =>
          update((p) => ({ ...p, items: p.items.map((x) => (x.id === c.id ? { ...x, is_active: c.is_active } : x)) }))
        }
      />
    </>
  );
}

function CustomerDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: (c: CustomerRow) => void;
}) {
  const api = useAdminApi();
  const { can } = useCan();
  const { data: c, error, reload, update } = useLoad(`customer:${id}`, () =>
    id ? api.customer(id) : Promise.resolve(null),
  );
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!c) return;
    const blocking = c.is_active;
    const reason = await promptDialog({
      title: blocking ? `Block ${c.email}?` : `Unblock ${c.email}?`,
      description: blocking
        ? "They're signed out everywhere and can't sign in or check out until unblocked. Orders already placed are unaffected."
        : "They can sign in and shop again.",
      label: "Reason",
      hint: "Kept in the audit log.",
      required: blocking,
      tone: blocking ? "danger" : "default",
      confirmLabel: blocking ? "Block account" : "Unblock",
    });
    if (reason === null) return;
    setBusy(true);
    try {
      const next = await api.setCustomerStatus(c.id, !blocking, reason);
      update(() => next);
      onChanged(next);
      toast.success(blocking ? "Account blocked" : "Account unblocked");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      title={c ? c.full_name || c.email : "Customer"}
      side="right"
      size="lg"
      footer={
        c && can("customers.edit") ? (
          <div className="flex justify-end">
            <Button variant={c.is_active ? "danger" : "primary"} size="sm" onClick={toggle} loading={busy}>
              {c.is_active ? "Block account" : "Unblock account"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !c ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-5">
          <Facts
            items={[
              ["Email", `${c.email}${c.is_email_verified ? " (verified)" : " (not verified)"}`],
              ["Phone", c.phone],
              ["Status", c.is_active ? "Active" : "Blocked"],
              ["Joined", fmtDateTime(c.created_at)],
              ["Last sign-in", fmtDateTime(c.last_login_at)],
              ["Orders", `${c.orders_count} · ${formatMoney(c.total_spent)} spent`],
              ["Returns", String(c.returns_count)],
              ["Open tickets", String(c.open_tickets)],
            ]}
          />
          <section>
            <h3 className="mb-2 text-sm font-semibold">Recent orders</h3>
            {c.recent_orders.length === 0 ? (
              <p className="text-sm text-muted">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-card border border-border text-sm">
                {c.recent_orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span>
                      <span className="font-medium">{o.order_number}</span>
                      <span className="block text-xs text-muted">{fmtDate(o.created_at)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusBadge kind="order" status={o.status} />
                      <span className="tabular-nums">{formatMoney(o.total, o.currency)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Addresses</h3>
            {c.addresses.length === 0 ? (
              <p className="text-sm text-muted">None saved.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {c.addresses.map((a) => (
                  <li key={a.id} className="rounded-card border border-border p-3 text-sm">
                    <p className="font-medium">
                      {a.label} {a.is_default && <span className="text-xs text-muted">(default)</span>}
                    </p>
                    <p className="text-muted">
                      {a.recipient_name}, {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}, {a.city} · {a.phone}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
