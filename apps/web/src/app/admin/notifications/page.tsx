"use client";

import { useEffect, useState } from "react";
import { useAdmin, type AdminNotification } from "@/lib/auth";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { RequirePermission } from "@/components/admin/ui";

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

function AdminNotificationsPage() {
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


  const columns: Column<AdminNotification>[] = [
    {
      key: "when",
      header: "When",
      className: "whitespace-nowrap text-muted",
      cell: (n) => new Date(n.created_at).toLocaleString("en-GB"),
    },
    {
      key: "event",
      header: "Event",
      cell: (n) => (
        <>
          <p className="font-medium">{n.event}</p>
          <p className="text-xs text-muted">{n.subject}</p>
        </>
      ),
    },
    {
      key: "recipient",
      header: "Recipient",
      responsive: "hidden md:table-cell",
      cell: (n) => <span className="text-muted">{n.recipient ?? "—"}</span>,
    },
    {
      key: "channel",
      header: "Channel",
      cell: (n) => (
        <>
          <Badge>{n.channel}</Badge>
          <p className="mt-1 text-xs text-muted">{CHANNEL_NOTE[n.channel]}</p>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (n) => (
        <>
          <Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{n.status.toLowerCase()}</Badge>
          {n.error && <p className="mt-1 text-xs text-danger">{n.error}</p>}
        </>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Every order notification the system emitted. Channel shows how it was delivered —
        configure n8n or SMTP to move off the log fallback.
      </p>
      <DataTable
        caption="Notifications"
        columns={columns}
        rows={rows ?? []}
        rowKey={(n) => n.id}
        loading={!rows}
        empty={<EmptyState compact title="No notifications yet" description="Order emails and n8n events will be listed here." />}
      />
    </div>
  );
}

export default function AdminNotifications() {
  return (
    <RequirePermission code="dashboard.view">
      <AdminNotificationsPage />
    </RequirePermission>
  );
}
