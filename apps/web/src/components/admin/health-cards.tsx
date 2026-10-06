"use client";

import type { HealthComponent } from "@/lib/admin";
import { StatusBadge } from "@/components/admin/status";

const DETAIL_LABELS: Record<string, string> = {
  version: "Version",
  database_size_mb: "Database size (MB)",
  connections: "Connections",
  max_connections: "Max connections",
  migration: "Migration",
  used_memory: "Memory used",
  connected_clients: "Clients",
  uptime_days: "Uptime (days)",
  cache_enabled: "Cache enabled",
  broker: "Broker",
  queued: "Queued tasks",
  interval_seconds: "Heartbeat every (s)",
  seconds_since: "Seconds since",
  url: "URL",
  error_rate: "5xx rate",
  requests_5m: "Requests (5 min)",
  count: "Failed tasks",
  latest_error: "Latest error",
};

/** One card per dependency: status in words + icon, latency, details. */
export function HealthCards({ components, detailed = false }: { components: HealthComponent[]; detailed?: boolean }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {components.map((c) => (
        <li
          key={c.key}
          className={`rounded-card border bg-surface p-5 shadow-hairline ${
            c.status === "down" ? "border-danger" : c.status === "degraded" ? "border-warning" : "border-border"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium">{c.name}</h3>
            <StatusBadge kind="health" status={c.status} />
          </div>
          <p className="mt-2 text-sm">{c.summary}</p>
          {c.latency_ms !== null && (
            <p className="mt-1 text-xs text-muted tabular-nums">
              {c.key === "api" ? "p95" : "Responded in"} {c.latency_ms} ms
            </p>
          )}
          {c.error && (
            <p className="mt-2 rounded-control bg-danger-soft px-3 py-2 font-mono text-xs break-words text-danger">{c.error}</p>
          )}
          {detailed && Object.keys(c.details).length > 0 && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-3 text-xs">
              {Object.entries(c.details).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{DETAIL_LABELS[k] ?? k}</dt>
                  <dd className="truncate text-right tabular-nums" title={String(v ?? "")}>
                    {v === null ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}
