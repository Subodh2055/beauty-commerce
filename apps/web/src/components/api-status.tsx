import { getHealth } from "@/lib/api";

function Dot({ ok }: { ok: boolean | null }) {
  const color =
    ok === null ? "bg-muted" : ok ? "bg-emerald-500" : "bg-red-500";
  return <span className={`inline-block size-2 rounded-full ${color}`} />;
}

/** Server Component — hits the API readiness endpoint on each request. */
export async function ApiStatus() {
  let rows: { label: string; ok: boolean | null }[];
  let note: string | null = null;

  try {
    const h = await getHealth();
    rows = [
      { label: "API", ok: true },
      { label: "PostgreSQL", ok: h.database },
      { label: "Redis", ok: h.redis },
    ];
    if (h.status !== "ok") note = "One or more services are degraded.";
  } catch {
    rows = [
      { label: "API", ok: false },
      { label: "PostgreSQL", ok: null },
      { label: "Redis", ok: null },
    ];
    note = "API unreachable. Is the backend running on port 8000?";
  }

  return (
    <div className="rounded-lg border border-border p-4 text-sm">
      <p className="mb-3 font-medium">System status</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <Dot ok={r.ok} />
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </div>
  );
}
