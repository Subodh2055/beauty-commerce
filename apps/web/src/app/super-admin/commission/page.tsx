"use client";

import { useState, type FormEvent } from "react";
import { useAdminApi, type CommissionRules } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { errorText } from "@/lib/http";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader, SearchBox } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm";
import { Skeleton } from "@/components/ui/skeleton";

const SNAPSHOT_NOTE = "Applies to orders placed from now on. Past orders keep the rate they were sold at.";

/** Percent input: "" means "no override". */
function RateField({
  label,
  value,
  placeholder,
  onSave,
  allowClear = true,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  onSave: (rate: string | null) => Promise<void>;
  allowClear?: boolean;
}) {
  const initial = value === null ? "" : String(Number(value));
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft.trim() !== initial;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (t === "" && !allowClear) return setError("Required");
    if (t !== "" && (!/^\d+(\.\d{1,2})?$/.test(t) || Number(t) > 100)) return setError("0–100, up to 2 decimals");
    setError(null);
    setBusy(true);
    try {
      await onSave(t === "" ? null : t);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-start justify-end gap-2" noValidate>
      <div>
        <label className="relative block">
          <span className="sr-only">{label}</span>
          <input
            inputMode="decimal"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error || undefined}
            className="focus-ring h-9 w-24 rounded-control border border-border-strong bg-surface pr-7 pl-3 text-right text-sm tabular-nums placeholder:text-muted aria-invalid:border-danger"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted" aria-hidden>
            %
          </span>
        </label>
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="sm" variant="platform" disabled={!dirty} loading={busy}>
        Save
      </Button>
    </form>
  );
}

export default function CommissionPage() {
  const api = useAdminApi();
  const { data, error, reload, update } = useLoad("commission", () => api.commission());
  const [q, setQ] = useState("");

  async function apply(what: string, fn: () => Promise<CommissionRules>) {
    const ok = await confirmDialog({ title: `Change ${what}?`, description: SNAPSHOT_NOTE, confirmLabel: "Change rate" });
    if (!ok) return;
    try {
      const next = await fn();
      update(() => next);
      toast.success(`${what[0].toUpperCase()}${what.slice(1)} updated`);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  const vendors = data.vendors.filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Commission"
        description="What the platform keeps from each sale. For every order line the most specific rule wins: the vendor's own rate, else the nearest category rate, else the global rate."
      />
      <div className="space-y-6">
        <Card padding="lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">Global rate</h2>
              <p className="text-sm text-muted">Used when neither the vendor nor the category sets one.</p>
            </div>
            <RateField
              key={data.global_rate}
              label="Global commission rate"
              value={data.global_rate}
              allowClear={false}
              onSave={async (r) => apply("the global rate", () => api.setGlobalCommission(r!))}
            />
          </div>
        </Card>

        <Card padding="none" className="overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="font-display text-xl font-semibold">By category</h2>
            <p className="text-sm text-muted">Subcategories inherit from their parent unless they set their own. Leave empty to inherit.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">Commission by category</caption>
              <thead className="bg-surface-2 text-left text-2xs tracking-eyebrow text-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-2.5">Category</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Products</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Applies</th>
                  <th scope="col" className="px-5 py-2.5 text-right">Own rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.categories.map((c) => (
                  <tr key={c.id}>
                    <th scope="row" className="px-5 py-2 text-left font-normal">
                      <span style={{ paddingLeft: `${c.depth * 1.25}rem` }} className="block">
                        {c.depth > 0 && (
                          <span className="mr-1.5 inline-block h-2.5 w-2.5 border-b border-l border-border-strong align-middle" aria-hidden />
                        )}
                        {c.name}
                      </span>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{c.product_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(c.effective_rate)}%
                      <span className="block text-xs text-muted">
                        {c.rate !== null ? "own" : c.inherited_from ? `from ${c.inherited_from}` : "global"}
                      </span>
                    </td>
                    <td className="px-5 py-2">
                      <RateField
                        key={`${c.id}:${c.rate}`}
                        label={`Commission for ${c.name}`}
                        value={c.rate}
                        placeholder="inherit"
                        onSave={async (r) => apply(`${c.name}'s rate`, () => api.setCategoryCommission(c.id, r))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="font-display text-xl font-semibold">Vendor overrides</h2>
              <p className="text-sm text-muted">A negotiated rate for one seller beats every category rule.</p>
            </div>
            <SearchBox label="Search vendors" placeholder="Vendor name" value={q} onChange={setQ} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <caption className="sr-only">Commission overrides by vendor</caption>
              <thead className="bg-surface-2 text-left text-2xs tracking-eyebrow text-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-2.5">Vendor</th>
                  <th scope="col" className="px-3 py-2.5">Status</th>
                  <th scope="col" className="px-5 py-2.5 text-right">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <th scope="row" className="px-5 py-2 text-left font-normal">
                      {v.name}
                    </th>
                    <td className="px-3 py-2">
                      <StatusBadge kind="vendor" status={v.status} />
                    </td>
                    <td className="px-5 py-2">
                      <RateField
                        key={`${v.id}:${v.rate}`}
                        label={`Commission override for ${v.name}`}
                        value={v.rate}
                        placeholder="none"
                        onSave={async (r) => apply(`${v.name}'s rate`, () => api.setVendorCommission(v.id, r))}
                      />
                    </td>
                  </tr>
                ))}
                {vendors.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-6 text-center text-muted">
                      No vendors match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
