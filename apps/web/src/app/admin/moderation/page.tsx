"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useAdminApi, type AdminProductRow } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useDebouncedQuery, useUrlState } from "@/lib/use-url-state";
import { useCan } from "@/lib/permissions";
import { errorText } from "@/lib/http";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Facts, LoadError, PageHeader, Pager, RequirePermission, SearchBox } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { promptDialog } from "@/components/ui/prompt";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckIcon } from "@/components/ui/icons";

const SIZE = 20;

export default function ModerationPage() {
  return (
    <RequirePermission code="moderation.view">
      <PageHeader
        title="Product moderation"
        description="Vendor products waiting for review, oldest first. Approving publishes the product; rejecting sends it back with your reason."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Queue />
      </Suspense>
    </RequirePermission>
  );
}

function Queue() {
  const api = useAdminApi();
  const { get, set, page } = useUrlState();
  const q = get("q");
  const [search, setSearch] = useDebouncedQuery(q, set);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, error, reload, update } = useLoad(JSON.stringify([q, page]), () =>
    api.moderationQueue({ q: q || undefined, page, size: SIZE }),
  );

  const columns: Column<AdminProductRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <button type="button" onClick={() => setOpenId(p.id)} className="focus-ring block max-w-72 rounded-sm text-left">
          <span className="block truncate font-medium text-accent hover:underline">{p.name}</span>
          <span className="block truncate text-xs text-muted">
            {p.brand_name ?? "No brand"} · {p.sku}
          </span>
        </button>
      ),
    },
    { key: "vendor", header: "Vendor", cell: (p) => p.vendor_name ?? <span className="text-muted">Platform</span> },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (p) => <span className="tabular-nums">{formatMoney(p.base_price, p.currency)}</span>,
      responsive: "hidden sm:table-cell",
    },
    { key: "stock", header: "Stock", align: "right", cell: (p) => p.total_stock, responsive: "hidden md:table-cell" },
  ];

  // A decision removes the product from this queue.
  const remove = (id: string) => {
    update((p) => ({ ...p, items: p.items.filter((x) => x.id !== id), total: p.total - 1 }));
    setOpenId(null);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <SearchBox label="Search the queue" placeholder="Product name" value={search} onChange={setSearch} />
      </div>
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <>
          <DataTable
            caption="Products waiting for review"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(p) => p.id}
            loading={!data}
            empty={
              <EmptyState
                compact
                icon={<CheckIcon width={22} height={22} />}
                title="Queue is clear"
                description="Nothing is waiting for review."
              />
            }
          />
          {data && <Pager page={page} size={SIZE} total={data.total} onPage={(p) => set({ page: String(p) })} />}
        </>
      )}
      <ReviewDrawer id={openId} onClose={() => setOpenId(null)} onDecided={remove} />
    </>
  );
}

function ReviewDrawer({ id, onClose, onDecided }: { id: string | null; onClose: () => void; onDecided: (id: string) => void }) {
  const api = useAdminApi();
  const { can } = useCan();
  const { data: p, error, reload } = useLoad(`moderation:${id}`, () =>
    id ? api.moderationItem(id) : Promise.resolve(null),
  );
  const [busy, setBusy] = useState(false);

  async function approve() {
    if (!p) return;
    const ok = await confirmDialog({
      title: `Publish “${p.name}”?`,
      description: "It goes live in the storefront straight away.",
      confirmLabel: "Approve and publish",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.approveProduct(p.id);
      toast.success("Product published");
      onDecided(p.id);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!p) return;
    const reason = await promptDialog({
      title: `Send “${p.name}” back?`,
      description: "The vendor sees your reason, fixes the product and submits it again.",
      label: "What needs changing",
      required: true,
      tone: "danger",
      confirmLabel: "Reject",
    });
    if (!reason) return;
    setBusy(true);
    try {
      await api.rejectProduct(p.id, reason);
      toast.success("Sent back to the vendor");
      onDecided(p.id);
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
      title={p?.name ?? "Product"}
      side="right"
      size="lg"
      footer={
        p && can("moderation.edit") ? (
          <div className="flex justify-end gap-2">
            <Button variant="danger" size="sm" onClick={reject} disabled={busy}>
              Reject
            </Button>
            <Button size="sm" onClick={approve} loading={busy}>
              Approve
            </Button>
          </div>
        ) : undefined
      }
    >
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !p ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="space-y-5">
          {p.images.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2">
              {p.images.map((img) => (
                <li key={img.id} className="relative aspect-square overflow-hidden rounded-control bg-surface-2">
                  <Image src={img.url} alt={img.alt ?? ""} fill sizes="160px" className="object-cover" />
                  {img.is_primary && (
                    <Badge tone="solid" className="absolute top-1.5 left-1.5">
                      Primary
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-card bg-warning-soft px-4 py-3 text-sm text-warning">No images uploaded.</p>
          )}
          {p.short_description && <p className="text-sm font-medium">{p.short_description}</p>}
          {p.description && <p className="text-sm leading-relaxed whitespace-pre-line text-muted">{p.description}</p>}
          <Facts
            items={[
              ["SKU", p.sku],
              ["Type", p.product_type],
              ["Price", formatMoney(p.base_price, p.currency)],
              ["Tags", p.tags.length ? p.tags.join(", ") : null],
              ["Preview", <Link key="pv" href={`/admin/products/${p.id}`} className="text-accent hover:underline">Open full editor</Link>],
            ]}
          />
          <section>
            <h3 className="mb-2 text-sm font-semibold">Variants</h3>
            <ul className="divide-y divide-border rounded-card border border-border text-sm">
              {p.variants.map((v) => (
                <li key={v.id} className="flex justify-between gap-3 px-4 py-2.5">
                  <span>
                    {v.name} {v.is_default && <span className="text-xs text-muted">(default)</span>}
                  </span>
                  <span className="tabular-nums text-muted">
                    {formatMoney(v.price, p.currency)} · {v.stock_quantity} in stock
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Drawer>
  );
}
