"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useAdminApi } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { HealthCards } from "@/components/admin/health-cards";
import { PageHeader, relTime } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ActivityIcon,
  ChevronIcon,
  HistoryIcon,
  KeyIcon,
  PercentIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/ui/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const AREAS: { href: string; title: string; text: string; icon: Icon }[] = [
  { href: "/super-admin/admins", title: "Admins", text: "Who has staff access, and with which roles.", icon: UsersIcon },
  { href: "/super-admin/roles", title: "Roles & permissions", text: "The module × action matrix for every role.", icon: KeyIcon },
  { href: "/super-admin/commission", title: "Commission", text: "Global, per category and per vendor rates.", icon: PercentIcon },
  { href: "/super-admin/settings", title: "Settings", text: "Payments, shipping zones, tax, currencies, emails.", icon: SettingsIcon },
  { href: "/super-admin/audit", title: "Audit log", text: "Every admin and vendor change, with diffs.", icon: HistoryIcon },
  { href: "/super-admin/system", title: "System health", text: "Postgres, Redis, Celery, n8n, API latency.", icon: ActivityIcon },
];

export default function SuperAdminHome() {
  const api = useAdminApi();
  const health = useLoad("sa-health", () => api.systemHealth());
  const recent = useLoad("sa-audit", () => api.auditLogs({ size: 6 }));

  return (
    <>
      <PageHeader title="Platform overview" description="Access, money rules, settings and the health of the whole system." />

      <section aria-labelledby="sa-health-h" className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="sa-health-h" className="eyebrow">
            System status
          </h2>
          <Link href="/super-admin/system" className="text-sm text-accent hover:underline">
            Details
          </Link>
        </div>
        {health.data ? (
          <HealthCards components={health.data.components} />
        ) : health.error ? (
          <p className="text-sm text-danger">Couldn&apos;t reach the health endpoint: {health.error.message}</p>
        ) : (
          <Skeleton className="h-40" />
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
        <ul className="grid gap-3 sm:grid-cols-2">
          {AREAS.map((a) => {
            const I = a.icon;
            return (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="focus-ring group flex h-full items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-hairline transition-shadow duration-(--duration-fast) hover:shadow-soft"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-platform-soft text-platform" aria-hidden>
                    <I width={19} height={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.title}</span>
                    <span className="block text-sm text-muted">{a.text}</span>
                  </span>
                  <ChevronIcon width={16} height={16} className="mt-1 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>

        <section aria-labelledby="sa-recent-h">
          <h2 id="sa-recent-h" className="eyebrow mb-3">
            Recent changes
          </h2>
          {!recent.data ? (
            <Skeleton className="h-56" />
          ) : recent.data.items.length === 0 ? (
            <p className="text-sm text-muted">Nothing logged yet.</p>
          ) : (
            <ol className="divide-y divide-border rounded-card border border-border bg-surface text-sm">
              {recent.data.items.map((l) => (
                <li key={l.id} className="px-4 py-2.5">
                  <span className="block font-mono text-xs">{l.action}</span>
                  <span className="block truncate text-xs text-muted">
                    {l.actor_email ?? "system"} · {relTime(l.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <Link href="/super-admin/audit" className="mt-2 inline-block text-sm text-accent hover:underline">
            Open the audit log
          </Link>
        </section>
      </div>
    </>
  );
}
