"use client";

import { useEffect, useState } from "react";
import { useAdminApi } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { HealthCards } from "@/components/admin/health-cards";
import { StatusBadge } from "@/components/admin/status";
import { LoadError, PageHeader, relTime } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshIcon } from "@/components/ui/icons";

const AUTO_REFRESH_MS = 30_000;

function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export default function SystemHealthPage() {
  const api = useAdminApi();
  const { data, error, reload } = useLoad("system-health", () => api.systemHealth());
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(reload, AUTO_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [auto, reload]);

  return (
    <>
      <PageHeader
        title="System health"
        description="Live checks of every dependency. Each probe times out on its own, so one dead service shows up red instead of hanging the page."
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-accent" />
              Refresh every 30 s
            </label>
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshIcon width={16} height={16} aria-hidden /> Check now
            </Button>
          </>
        }
      />
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3" aria-live="polite">
            <StatusBadge kind="health" status={data.status} />
            <span className="text-sm text-muted">
              Overall · {data.environment} · checked {relTime(data.checked_at)}
            </span>
          </div>
          <HealthCards components={data.components} detailed />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card padding="lg">
              <h2 className="mb-1 font-display text-xl font-semibold">API latency</h2>
              <p className="mb-4 text-xs text-muted">
                Last {data.api.window_seconds / 60} minutes on the worker that answered · up {uptime(data.api.uptime_seconds)}
              </p>
              <dl className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["p50", data.api.p50_ms],
                  ["p95", data.api.p95_ms],
                  ["p99", data.api.p99_ms],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-control bg-surface-2 p-3">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="font-display text-2xl font-semibold tabular-nums">{v} ms</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-muted">
                {data.api.requests} requests · {data.api.per_minute}/min · {(data.api.error_rate * 100).toFixed(2)}% server errors
              </p>
              {data.api.slowest.length > 0 && (
                <table className="mt-4 w-full text-sm">
                  <caption className="mb-2 text-left text-xs font-semibold tracking-eyebrow text-muted uppercase">Slowest routes</caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Route</th>
                      <th scope="col">Requests</th>
                      <th scope="col">p95</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.api.slowest.map((r) => (
                      <tr key={r.route}>
                        <td className="max-w-0 truncate py-1.5 pr-3 font-mono text-xs" title={r.route}>
                          {r.route}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-xs text-muted tabular-nums">{r.count}×</td>
                        <td className="py-1.5 text-right tabular-nums">{r.p95_ms} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card padding="lg">
              <h2 className="mb-4 font-display text-xl font-semibold">Celery</h2>
              <h3 className="mb-2 text-sm font-semibold">Workers</h3>
              {data.workers.length === 0 ? (
                <p className="mb-4 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                  No worker answered. Background jobs (emails, image processing, the nightly rollup) are not running.
                </p>
              ) : (
                <ul className="mb-4 divide-y divide-border text-sm">
                  {data.workers.map((w) => (
                    <li key={w.name} className="flex justify-between gap-3 py-2">
                      <span className="truncate font-mono text-xs">{w.name}</span>
                      <span className="shrink-0 text-muted tabular-nums">
                        {w.active_tasks} running{w.concurrency ? ` / ${w.concurrency}` : ""}
                        {w.processed !== null ? ` · ${w.processed} done` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mb-2 text-sm font-semibold">Queues</h3>
              <ul className="divide-y divide-border text-sm">
                {data.queues.map((q) => (
                  <li key={q.name} className="flex justify-between gap-3 py-2">
                    <span className="font-mono text-xs">{q.name}</span>
                    <span className="tabular-nums">{q.pending ?? "unknown"} waiting</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
