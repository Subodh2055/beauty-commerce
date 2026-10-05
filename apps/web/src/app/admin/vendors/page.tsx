"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useAdminApi } from "@/lib/admin";
import type { Vendor } from "@/lib/vendor";
import { useLoad } from "@/lib/use-load";
import { useDebouncedQuery, useUrlState } from "@/lib/use-url-state";
import { useCan } from "@/lib/permissions";
import { errorText } from "@/lib/http";
import { toast } from "@/lib/toast";
import {
  Facts,
  LoadError,
  PageHeader,
  Pager,
  RequirePermission,
  SearchBox,
  SuperAdminBadge,
  fmtDateTime,
  relTime,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/status";
import { Button, buttonClass } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/prompt";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldIcon, StoreIcon } from "@/components/ui/icons";

const SIZE = 20;
const STATUSES = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Awaiting review" },
  { value: "APPROVED", label: "Approved" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REJECTED", label: "Rejected" },
];

type Decision = "approve" | "reject" | "suspend" | "reinstate";

// What each decision does, so the prompt can say it plainly.
const DECISIONS: Record<
  Decision,
  { title: string; description: string; required: boolean; tone: "default" | "danger"; done: string }
> = {
  approve: {
    title: "Approve this seller?",
    description: "They get the vendor portal and can submit products for review.",
    required: false,
    tone: "default",
    done: "Vendor approved",
  },
  reject: {
    title: "Reject this application?",
    description: "They'll see your reason and can apply again.",
    required: true,
    tone: "danger",
    done: "Application rejected",
  },
  suspend: {
    title: "Suspend this vendor?",
    description: "Their products stop selling immediately and they can't edit their catalog. Orders already placed still need fulfilling.",
    required: true,
    tone: "danger",
    done: "Vendor suspended",
  },
  reinstate: {
    title: "Reinstate this vendor?",
    description: "Their live products go back on sale.",
    required: false,
    tone: "default",
    done: "Vendor reinstated",
  },
};

export default function VendorsPage() {
  return (
    <RequirePermission code="vendors.view">
      <PageHeader title="Vendors" description="Review seller applications and manage who can sell." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Vendors />
      </Suspense>
    </RequirePermission>
  );
}

function Vendors() {
  const api = useAdminApi();
  const { get, set, page } = useUrlState();
  const status = get("status");
  const q = get("q");
  const [search, setSearch] = useDebouncedQuery(q, set);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, error, reload, update } = useLoad(JSON.stringify([status, q, page]), () =>
    api.vendors({ status: status || undefined, q: q || undefined, page, size: SIZE }),
  );
  const open = data?.items.find((v) => v.id === openId) ?? null;

  const columns: Column<Vendor>[] = [
    {
      key: "name",
      header: "Store",
      cell: (v) => (
        <button type="button" onClick={() => setOpenId(v.id)} className="focus-ring block max-w-64 rounded-sm text-left">
          <span className="block truncate font-medium text-accent hover:underline">{v.name}</span>
          <span className="block truncate text-xs text-muted">{v.contact_email}</span>
        </button>
      ),
    },
    { key: "status", header: "Status", cell: (v) => <StatusBadge kind="vendor" status={v.status} /> },
    {
      key: "commission",
      header: "Commission",
      align: "right",
      cell: (v) => (v.commission_rate ? `${Number(v.commission_rate)}%` : <span className="text-muted">Default</span>),
      responsive: "hidden md:table-cell",
    },
    { key: "applied", header: "Applied", cell: (v) => relTime(v.created_at), responsive: "hidden sm:table-cell" },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FilterChips label="Vendor status" options={STATUSES} value={status} onChange={(v) => set({ status: v || null })} />
        <SearchBox label="Search vendors" placeholder="Store name or email" value={search} onChange={setSearch} />
      </div>
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <>
          <DataTable
            caption="Vendors"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(v) => v.id}
            loading={!data}
            empty={
              <EmptyState
                compact
                icon={<StoreIcon width={22} height={22} />}
                title={status === "PENDING" ? "No applications waiting" : "No vendors match"}
              />
            }
          />
          {data && <Pager page={page} size={SIZE} total={data.total} onPage={(p) => set({ page: String(p) })} />}
        </>
      )}
      <VendorDrawer
        vendor={open}
        onClose={() => setOpenId(null)}
        onChanged={(v) => update((p) => ({ ...p, items: p.items.map((x) => (x.id === v.id ? v : x)) }))}
      />
    </>
  );
}

function VendorDrawer({
  vendor: v,
  onClose,
  onChanged,
}: {
  vendor: Vendor | null;
  onClose: () => void;
  onChanged: (v: Vendor) => void;
}) {
  const api = useAdminApi();
  const { can, isSuper } = useCan();
  const [busy, setBusy] = useState<Decision | null>(null);

  async function decide(action: Decision) {
    if (!v) return;
    const d = DECISIONS[action];
    const reason = await promptDialog({
      title: d.title,
      description: `${v.name}: ${d.description}`,
      label: d.required ? "Reason" : "Note (optional)",
      hint: d.required ? "Shown to the vendor and kept in the audit log." : "Kept in the audit log.",
      required: d.required,
      tone: d.tone,
      confirmLabel: action[0].toUpperCase() + action.slice(1),
    });
    if (reason === null) return;
    setBusy(action);
    try {
      onChanged(await api.vendorDecision(v.id, action, reason));
      toast.success(d.done);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const actions: Decision[] = !v
    ? []
    : v.status === "PENDING"
      ? ["reject", "approve"]
      : v.status === "APPROVED"
        ? ["suspend"]
        : v.status === "SUSPENDED"
          ? ["reinstate"]
          : v.status === "REJECTED"
            ? ["approve"]
            : [];

  return (
    <Drawer
      open={v !== null}
      onClose={onClose}
      title={v?.name ?? "Vendor"}
      side="right"
      size="lg"
      footer={
        v && can("vendors.edit") && actions.length ? (
          <div className="flex justify-end gap-2">
            {actions.map((a) => (
              <Button
                key={a}
                size="sm"
                variant={a === "reject" || a === "suspend" ? "danger" : "primary"}
                loading={busy === a}
                disabled={busy !== null}
                onClick={() => decide(a)}
              >
                {a[0].toUpperCase() + a.slice(1)}
              </Button>
            ))}
          </div>
        ) : undefined
      }
    >
      {v && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="vendor" status={v.status} />
            {v.status_reason && <span className="text-sm text-muted">“{v.status_reason}”</span>}
          </div>
          {v.description && <p className="text-sm leading-relaxed whitespace-pre-line">{v.description}</p>}
          <Facts
            items={[
              ["Contact", `${v.contact_email}${v.contact_phone ? ` · ${v.contact_phone}` : ""}`],
              ["Registration", v.business_registration_no],
              ["PAN / VAT", v.tax_id],
              ["Payout details", v.payout_details ? <span className="whitespace-pre-line">{v.payout_details}</span> : null],
              ["Applied", fmtDateTime(v.created_at)],
              ["Last decision", fmtDateTime(v.reviewed_at)],
              ["Store slug", v.slug],
            ]}
          />
          <section className="rounded-card border border-platform/40 bg-platform-soft p-4 text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="font-semibold">Commission</h3>
              <SuperAdminBadge />
            </div>
            <p className="text-muted">
              {v.commission_rate
                ? `${Number(v.commission_rate)}% on every sale (overrides category and global rules).`
                : "Follows the category and global rules."}{" "}
              Commission rules are a platform setting.
            </p>
            {isSuper && (
              <Link href="/super-admin/commission" className={buttonClass("outline", "sm", "mt-3 border-platform text-platform hover:bg-surface")}>
                <ShieldIcon width={15} height={15} aria-hidden /> Change in super admin
              </Link>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
