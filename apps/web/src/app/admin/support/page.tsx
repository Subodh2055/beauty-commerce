"use client";

import { Suspense, useState, type FormEvent } from "react";
import {
  useAdminApi,
  type TicketDetail,
  type TicketPriority,
  type TicketRow,
  type TicketStatus,
} from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useDebouncedQuery, useUrlState } from "@/lib/use-url-state";
import { useCan } from "@/lib/permissions";
import { errorText } from "@/lib/http";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader, Pager, RequirePermission, SearchBox, fmtDateTime, relTime } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Select, Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatIcon, ChevronIcon, LockIcon } from "@/components/ui/icons";

const SIZE = 25;
const STATUSES = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "AWAITING_CUSTOMER", label: "Awaiting customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

export default function SupportPage() {
  return (
    <RequirePermission code="support.view">
      <PageHeader title="Support inbox" description="Customer and vendor tickets. Internal notes are never shown to the requester." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Inbox />
      </Suspense>
    </RequirePermission>
  );
}

function Inbox() {
  const api = useAdminApi();
  const { get, set, page } = useUrlState();
  const status = get("status");
  const priority = get("priority");
  const q = get("q");
  const selected = get("t");
  const [search, setSearch] = useDebouncedQuery(q, set);
  const { data, error, reload, update } = useLoad(JSON.stringify([status, priority, q, page]), () =>
    api.tickets({ status: status || undefined, priority: priority || undefined, q: q || undefined, page, size: SIZE }),
  );

  // Opening a ticket keeps the list's page.
  const select = (id: string | null) => set({ t: id, page: page > 1 ? String(page) : null });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FilterChips label="Ticket status" options={STATUSES} value={status} onChange={(v) => set({ status: v || null })} />
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Priority"
            hideLabel
            controlSize="sm"
            value={priority}
            onChange={(e) => set({ priority: e.target.value || null })}
            options={[
              { value: "", label: "Any priority" },
              { value: "HIGH", label: "High" },
              { value: "NORMAL", label: "Normal" },
              { value: "LOW", label: "Low" },
            ]}
          />
          <SearchBox label="Search tickets" placeholder="Reference, subject or email" value={search} onChange={setSearch} />
        </div>
      </div>
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className={selected ? "hidden lg:block" : ""}>
            {!data ? (
              <Skeleton className="h-96" />
            ) : data.items.length === 0 ? (
              <EmptyState compact icon={<ChatIcon width={22} height={22} />} title="Inbox zero" description="No tickets match." />
            ) : (
              <>
                <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface" aria-label="Tickets">
                  {data.items.map((t) => (
                    <TicketItem key={t.id} t={t} active={t.id === selected} onOpen={() => select(t.id)} />
                  ))}
                </ul>
                <Pager page={page} size={SIZE} total={data.total} onPage={(p) => set({ page: String(p) })} />
              </>
            )}
          </div>
          <div className={selected ? "" : "hidden lg:block"}>
            {selected ? (
              <Conversation
                key={selected}
                id={selected}
                onBack={() => select(null)}
                onChanged={(d) =>
                  update((p) => ({
                    ...p,
                    items: p.items.map((x) =>
                      x.id === d.id
                        ? { ...x, status: d.status, priority: d.priority, assigned_to: d.assigned_to, assignee_email: d.assignee_email, needs_reply: false }
                        : x,
                    ),
                  }))
                }
              />
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center rounded-card border border-dashed border-border text-sm text-muted">
                Pick a ticket to read the conversation.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function TicketItem({ t, active, onOpen }: { t: TicketRow; active: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active || undefined}
        className={`focus-ring flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left transition-colors duration-(--duration-fast) hover:bg-surface-2 ${
          active ? "bg-surface-2" : ""
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{t.subject}</span>
          <span className="shrink-0 text-xs text-muted">{relTime(t.last_message_at ?? t.updated_at)}</span>
        </span>
        <span className="truncate text-xs text-muted">
          {t.reference} · {t.requester_email ?? "unknown"}
        </span>
        <span className="flex flex-wrap gap-1">
          <StatusBadge kind="ticket" status={t.status} />
          {t.priority === "HIGH" && <StatusBadge kind="priority" status="HIGH" />}
          {t.needs_reply && <Badge tone="accent">Needs reply</Badge>}
        </span>
      </button>
    </li>
  );
}

function Conversation({
  id,
  onBack,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onChanged: (t: TicketDetail) => void;
}) {
  const api = useAdminApi();
  const { can } = useCan();
  const canEdit = can("support.edit");
  const { data: t, error, reload, update } = useLoad(`ticket:${id}`, () => api.ticket(id));
  const { data: assignees } = useLoad("assignees", () => api.assignees(), []);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function apply(fn: () => Promise<TicketDetail>, done: string) {
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

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !t) return;
    await apply(() => api.replyTicket(t.id, body.trim(), internal), internal ? "Note added" : "Reply sent");
    setBody("");
  }

  async function setStatus(status: TicketStatus) {
    if (!t) return;
    if (status === "CLOSED") {
      const ok = await confirmDialog({
        title: "Close this ticket?",
        description: "Closed tickets can't be replied to by anyone. Use Resolved if the customer may still answer.",
        confirmLabel: "Close ticket",
        tone: "danger",
      });
      if (!ok) return;
    }
    await apply(() => api.updateTicket(t.id, { status }), "Status updated");
  }

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!t) return <Skeleton className="h-96" />;
  const closed = t.status === "CLOSED";

  return (
    <article className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-6" aria-labelledby="ticket-h">
      <Button variant="ghost" size="sm" onClick={onBack} className="self-start lg:hidden">
        <ChevronIcon width={16} height={16} className="rotate-180" aria-hidden /> All tickets
      </Button>
      <header className="space-y-2">
        <h2 id="ticket-h" className="font-display text-2xl font-semibold">
          {t.subject}
        </h2>
        <p className="text-sm text-muted">
          {t.reference} · {t.category.toLowerCase()} · from {t.requester_name ? `${t.requester_name} ` : ""}
          {t.requester_email}
          {t.order_number && ` · order ${t.order_number}`} · opened {fmtDateTime(t.created_at)}
        </p>
        {canEdit && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Status"
              controlSize="sm"
              value={t.status}
              disabled={busy || closed}
              onChange={(e) => setStatus(e.target.value as TicketStatus)}
              options={STATUSES.filter((s) => s.value).map((s) => ({ value: s.value, label: s.label }))}
            />
            <Select
              label="Priority"
              controlSize="sm"
              value={t.priority}
              disabled={busy || closed}
              onChange={(e) => apply(() => api.updateTicket(t.id, { priority: e.target.value as TicketPriority }), "Priority updated")}
              options={[
                { value: "LOW", label: "Low" },
                { value: "NORMAL", label: "Normal" },
                { value: "HIGH", label: "High" },
              ]}
            />
            <Select
              label="Assignee"
              controlSize="sm"
              value={t.assigned_to ?? ""}
              disabled={busy || closed}
              placeholder="Unassigned"
              onChange={(e) => apply(() => api.updateTicket(t.id, { assigned_to: e.target.value || null }), "Assignee updated")}
              options={(assignees ?? []).map((a) => ({ value: a.id, label: a.full_name || a.email }))}
            />
          </div>
        )}
      </header>

      <ol className="space-y-3" aria-label="Conversation">
        {t.messages.map((m) => (
          <li key={m.id} className={`flex ${m.from_staff ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-card px-4 py-3 text-sm ${
                m.is_internal
                  ? "border border-dashed border-warning bg-warning-soft"
                  : m.from_staff
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2"
              }`}
            >
              <p className={`mb-1 flex items-center gap-1.5 text-xs ${m.is_internal ? "font-semibold text-warning" : "opacity-80"}`}>
                {m.is_internal && <LockIcon width={12} height={12} aria-hidden />}
                {m.is_internal ? "Internal note" : m.from_staff ? "Staff" : "Customer"} · {fmtDateTime(m.created_at)}
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {canEdit && !closed && (
        <form onSubmit={send} className="space-y-3 border-t border-border pt-4">
          <Textarea
            label={internal ? "Internal note (staff only)" : "Reply to the customer"}
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={10000}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-4 w-4 accent-accent" />
              Internal note — not sent to the customer
            </label>
            <Button type="submit" size="sm" loading={busy} disabled={!body.trim()} variant={internal ? "secondary" : "primary"}>
              {internal ? "Add note" : "Send reply"}
            </Button>
          </div>
        </form>
      )}
      {closed && <p className="text-sm text-muted">This ticket is closed.</p>}
    </article>
  );
}
