"use client";

import { useEffect, useState } from "react";
import { useAdmin, type AdminNotification } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const CHANNEL_NOTE: Record<string, string> = {
  N8N: "Sent to n8n",
  EMAIL: "Sent via SMTP",
  LOG: "Logged (no n8n/SMTP configured)",
};

const STATUS_TONE: Record<string, "success" | "danger" | "gold"> = {
  SENT: "success",
  FAILED: "danger",
  PENDING: "gold",
};

export default function AdminNotifications() {
  const admin = useAdmin();
  const [rows, setRows] = useState<AdminNotification[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await admin.notifications();
        if (active) setRows(res.items);
      } catch {
        if (active) setRows([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rows) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Every order notification the system emitted. Channel shows how it was delivered —
        configure n8n or SMTP to move off the log fallback.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          No notifications yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Event</th>
                <th className="p-3">Recipient</th>
                <th className="p-3">Channel</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="border-t border-border">
                  <td className="p-3 text-muted whitespace-nowrap">
                    {new Date(n.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="p-3">
                    <p className="font-medium">{n.event}</p>
                    <p className="text-xs text-muted">{n.subject}</p>
                  </td>
                  <td className="p-3 text-muted">{n.recipient ?? "—"}</td>
                  <td className="p-3">
                    <Badge>{n.channel}</Badge>
                    <p className="mt-1 text-xs text-muted">{CHANNEL_NOTE[n.channel]}</p>
                  </td>
                  <td className="p-3">
                    <Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{n.status.toLowerCase()}</Badge>
                    {n.error && <p className="mt-1 text-xs text-danger">{n.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
