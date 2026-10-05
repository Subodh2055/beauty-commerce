"use client";

import { Suspense, useState } from "react";
import { useAdminApi, type AuditLog } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useDebouncedQuery, useUrlState } from "@/lib/use-url-state";
import { Facts, LoadError, PageHeader, Pager, SearchBox, fmtDateTime } from "@/components/admin/ui";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { HistoryIcon } from "@/components/ui/icons";

const SIZE = 50;

function verb(action: string): { label: string; tone: BadgeTone } {
  const v = action.split(".").pop() ?? action;
  if (v === "create") return { label: "Created", tone: "success" };
  if (v === "update") return { label: "Updated", tone: "accent" };
  if (v === "delete") return { label: "Deleted", tone: "danger" };
  return { label: v.replaceAll("_", " "), tone: "platform" };
}

export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made through the admin, vendor and super-admin areas, written in the same transaction as the change itself."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Audit />
      </Suspense>
    </>
  );
}

function Audit() {
  const api = useAdminApi();
  const { get, set, page } = useUrlState();
  const q = get("q");
  const action = get("action");
  const entity = get("entity");
  const since = get("since");
  const until = get("until");
  const [search, setSearch] = useDebouncedQuery(q, set);
  const [open, setOpen] = useState<AuditLog | null>(null);
  const types = useLoad("audit-types", () => api.auditEntityTypes(), []);

  const { data, error, reload } = useLoad(JSON.stringify([q, action, entity, since, until, page]), () =>
    api.auditLogs({
      q: q || undefined,
      action: action || undefined,
      entity_type: entity || undefined,
      // Date inputs are local days; the API takes instants.
      since: since ? new Date(`${since}T00:00:00`).toISOString() : undefined,
      until: until ? new Date(new Date(`${until}T00:00:00`).getTime() + 86_400_000).toISOString() : undefined,
      page,
      size: SIZE,
    }),
  );

  const columns: Column<AuditLog>[] = [
    { key: "when", header: "When", cell: (l) => <span className="whitespace-nowrap text-xs">{fmtDateTime(l.created_at)}</span> },
    {
      key: "who",
      header: "Who",
      cell: (l) => <span className="block max-w-48 truncate text-sm">{l.actor_email ?? "system"}</span>,
    },
    {
      key: "what",
      header: "What",
      cell: (l) => {
        const v = verb(l.action);
        return (
          <button type="button" onClick={() => setOpen(l)} className="focus-ring flex flex-wrap items-center gap-2 rounded-sm text-left">
            <Badge tone={v.tone}>{v.label}</Badge>
            <span className="font-mono text-xs text-accent hover:underline">{l.entity_type}</span>
          </button>
        );
      },
    },
    {
      key: "fields",
      header: "Fields",
      cell: (l) => (
        <span className="block max-w-64 truncate text-xs text-muted">{Object.keys(l.changes).join(", ") || "—"}</span>
      ),
      responsive: "hidden lg:table-cell",
    },
    {
      key: "path",
      header: "Request",
      cell: (l) => (
        <span className="block max-w-56 truncate font-mono text-xs text-muted">
          {l.request_method} {l.request_path}
        </span>
      ),
      responsive: "hidden xl:table-cell",
    },
  ];

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-end">
        <SearchBox label="Search the audit log" placeholder="Email, id or path" value={search} onChange={setSearch} />
        <Select
          label="Action"
          controlSize="sm"
          value={action}
          onChange={(e) => set({ action: e.target.value || null })}
          options={[
            { value: "", label: "Any action" },
            { value: "create", label: "Created" },
            { value: "update", label: "Updated" },
            { value: "delete", label: "Deleted" },
          ]}
        />
        <Select
          label="Entity"
          controlSize="sm"
          value={entity}
          onChange={(e) => set({ entity: e.target.value || null })}
          options={[{ value: "", label: "Any entity" }, ...(types.data ?? []).map((t) => ({ value: t, label: t }))]}
        />
        <Input label="From" type="date" value={since} onChange={(e) => set({ since: e.target.value || null })} className="lg:w-40" />
        <Input label="To" type="date" value={until} onChange={(e) => set({ until: e.target.value || null })} className="lg:w-40" />
      </div>
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <>
          <DataTable
            caption="Audit log entries, newest first"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(l) => l.id}
            loading={!data}
            empty={<EmptyState compact icon={<HistoryIcon width={22} height={22} />} title="Nothing logged for these filters" />}
          />
          {data && <Pager page={page} size={SIZE} total={data.total} onPage={(p) => set({ page: String(p) })} />}
        </>
      )}
      <Drawer open={open !== null} onClose={() => setOpen(null)} title={open ? `${open.action}` : "Entry"} side="right" size="lg">
        {open && <EntryDetail log={open} />}
      </Drawer>
    </>
  );
}

const show = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v === "" ? "(empty)" : v;
  return JSON.stringify(v, null, 1);
};

/** Pair-valued fields ([old, new]) are updates from the ORM listener. */
const isPair = (v: unknown): v is [unknown, unknown] => Array.isArray(v) && v.length === 2;

function EntryDetail({ log }: { log: AuditLog }) {
  const kind = log.action.split(".").pop();
  const entries = Object.entries(log.changes);
  // ORM updates store every field as [old, new]; explicit entries (role grants,
  // blocks) mix before/after pairs of lists with plain values.
  const pairOf = (v: unknown) => isPair(v) && (kind === "update" || Array.isArray(v[0]) || Array.isArray(v[1]));
  const diff = entries.some(([, v]) => pairOf(v));
  return (
    <div className="space-y-5">
      <Facts
        items={[
          ["When", fmtDateTime(log.created_at)],
          ["Who", log.actor_email ?? "system"],
          ["Entity", `${log.entity_type} ${log.entity_id ?? ""}`],
          ["Request", `${log.request_method ?? ""} ${log.request_path ?? ""}`],
          ["IP", log.ip_address],
          ["Request id", log.request_id ? <code key="r" className="text-xs">{log.request_id}</code> : null],
        ]}
      />
      <section>
        <h3 className="mb-2 text-sm font-semibold">{diff ? "What changed" : kind === "delete" ? "Removed" : "Values"}</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">No field data recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Field changes</caption>
              <thead className="bg-surface-2 text-left text-2xs tracking-eyebrow text-muted uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">Field</th>
                  {diff ? (
                    <>
                      <th scope="col" className="px-3 py-2">Before</th>
                      <th scope="col" className="px-3 py-2">After</th>
                    </>
                  ) : (
                    <th scope="col" className="px-3 py-2">Value</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top">
                {entries.map(([field, value]) => (
                  <tr key={field}>
                    <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-normal">
                      {field}
                    </th>
                    {diff && pairOf(value) && isPair(value) ? (
                      <>
                        <td className="px-3 py-2">
                          <span className="block rounded bg-danger-soft px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap text-danger">
                            <span className="sr-only">Before: </span>
                            {show(value[0])}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block rounded bg-success-soft px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap text-success">
                            <span className="sr-only">After: </span>
                            {show(value[1])}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap" colSpan={diff ? 2 : 1}>
                        {show(value)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
