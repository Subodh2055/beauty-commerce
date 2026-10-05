"use client";

/**
 * Small pieces every admin page shares: header, permission gate, the
 * super-admin marking, load error, money/date formatting.
 */

import type { ReactNode } from "react";
import { useCan } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon, LockIcon, RefreshIcon, SearchIcon, ShieldIcon } from "@/components/ui/icons";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** "Super admin" pill: shield icon + words + platform violet (never colour alone). */
export function SuperAdminBadge({ label = "Super admin" }: { label?: string }) {
  return (
    <Badge tone="platform">
      <ShieldIcon width={12} height={12} aria-hidden />
      {label}
    </Badge>
  );
}

/**
 * Wraps a page body: shows it only to holders of `code`, otherwise explains why
 * not. The API refuses the calls regardless; this avoids a page of 403 toasts.
 */
export function RequirePermission({ code, children }: { code: string; children: ReactNode }) {
  const { can } = useCan();
  if (can(code)) return <>{children}</>;
  return (
    <EmptyState
      icon={<LockIcon width={26} height={26} />}
      title="You don't have access to this page"
      description={`It needs the “${code}” permission. A super admin can grant it to your role.`}
    />
  );
}

export function LoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-danger-soft text-danger" aria-hidden>
        <AlertIcon width={22} height={22} />
      </span>
      <p className="font-display text-xl font-semibold">Couldn&apos;t load this</p>
      <p className="max-w-sm text-sm text-muted">{error.message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshIcon width={16} height={16} aria-hidden /> Try again
      </Button>
    </div>
  );
}

/** A labelled key → value list for detail drawers. */
export function Facts({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border rounded-card border border-border text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 px-4 py-2.5">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");
export const fmtDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : "—");

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(iso);
}

/** Page x of y with previous/next; hidden when everything fits on one page. */
export function Pager({
  page,
  size,
  total,
  onPage,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <p className="text-muted">
        Page {page} of {pages} · {total} total
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}

/** Pill search box used above admin tables (label kept for screen readers). */
export function SearchBox({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="relative block w-full sm:w-72">
      <span className="sr-only">{label}</span>
      <SearchIcon
        width={16}
        height={16}
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="focus-ring h-10 w-full rounded-pill border border-border-strong bg-surface pr-4 pl-10 text-sm placeholder:text-muted"
      />
    </label>
  );
}
