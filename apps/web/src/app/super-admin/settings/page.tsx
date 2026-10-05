"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  useAdminApi,
  type EmailEvent,
  type EmailTemplate,
  type PlatformSettings,
  type ShippingZone,
} from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { errorText } from "@/lib/http";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm";
import { Input, Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { PlusIcon, ShieldIcon, TrashIcon } from "@/components/ui/icons";

type Save = (patch: Partial<PlatformSettings>, what: string) => Promise<void>;

export default function SettingsPage() {
  const api = useAdminApi();
  const { data, error, reload, update } = useLoad("platform-settings", () => api.settings());

  const save: Save = async (patch, what) => {
    const ok = await confirmDialog({
      title: `Save ${what}?`,
      description: "This applies across the whole platform straight away and is recorded in the audit log.",
      confirmLabel: "Save",
    });
    if (!ok) return;
    try {
      const next = await api.updateSettings(patch);
      update(() => next);
      toast.success(`${what[0].toUpperCase()}${what.slice(1)} saved`);
    } catch (err) {
      toast.error(errorText(err));
      throw err;
    }
  };

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Checkout, money and messaging rules for the whole marketplace. Each tab saves on its own."
      />
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton className="h-96" />
      ) : (
        <Tabs
          label="Settings sections"
          items={[
            { id: "general", label: "General", content: <General key={JSON.stringify(data)} s={data} save={save} /> },
            { id: "payments", label: "Payments", content: <Payments key={JSON.stringify(data.payments)} s={data} save={save} /> },
            { id: "shipping", label: "Shipping zones", content: <Shipping key={JSON.stringify(data.shipping_zones)} s={data} save={save} /> },
            { id: "taxes", label: "Taxes", content: <Taxes key={JSON.stringify(data.taxes)} s={data} save={save} /> },
            { id: "currencies", label: "Currencies", content: <Currencies key={JSON.stringify(data.display_currencies)} s={data} save={save} /> },
            { id: "emails", label: "Email templates", content: <Emails key={JSON.stringify(data.email_templates)} s={data} save={save} /> },
          ]}
        />
      )}
    </>
  );
}

function Section({
  title,
  description,
  onSubmit,
  children,
  error,
}: {
  title: string;
  description?: ReactNode;
  onSubmit: () => Promise<void>;
  children: ReactNode;
  error?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit();
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card padding="lg" className="mt-6">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        {children}
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="submit" variant="platform" loading={busy}>
            <ShieldIcon width={15} height={15} aria-hidden /> Save {title.toLowerCase()}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const money = (v: string) => (v.trim() === "" ? null : v.trim());

function General({ s, save }: { s: PlatformSettings; save: Save }) {
  const [f, setF] = useState({
    support_email: s.support_email,
    free_shipping_threshold: String(Number(s.free_shipping_threshold)),
    shipping_fee: String(Number(s.shipping_fee)),
    min_payout_amount: String(Number(s.min_payout_amount)),
    return_window_days: String(s.return_window_days),
    vendor_applications_open: s.vendor_applications_open,
  });
  return (
    <Section
      title="General"
      description="Defaults used where no shipping zone applies, and marketplace basics."
      onSubmit={() =>
        save(
          {
            support_email: f.support_email.trim(),
            free_shipping_threshold: f.free_shipping_threshold,
            shipping_fee: f.shipping_fee,
            min_payout_amount: f.min_payout_amount,
            return_window_days: Number(f.return_window_days),
            vendor_applications_open: f.vendor_applications_open,
          },
          "general settings",
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Support email" type="email" value={f.support_email} onChange={(e) => setF({ ...f, support_email: e.target.value })} hint="Shown in the footer and in emails." />
        <Input label="Return window (days after delivery)" type="number" min="0" max="365" value={f.return_window_days} onChange={(e) => setF({ ...f, return_window_days: e.target.value })} />
        <Input label={`Default shipping fee (${s.base_currency})`} type="number" min="0" value={f.shipping_fee} onChange={(e) => setF({ ...f, shipping_fee: e.target.value })} />
        <Input label={`Free shipping from (${s.base_currency})`} type="number" min="0" value={f.free_shipping_threshold} onChange={(e) => setF({ ...f, free_shipping_threshold: e.target.value })} />
        <Input label={`Minimum payout (${s.base_currency})`} type="number" min="0" value={f.min_payout_amount} onChange={(e) => setF({ ...f, min_payout_amount: e.target.value })} hint="Smaller vendor balances roll over to the next payout." />
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" checked={f.vendor_applications_open} onChange={(e) => setF({ ...f, vendor_applications_open: e.target.checked })} className="h-4 w-4 accent-accent" />
        Accept new vendor applications
      </label>
    </Section>
  );
}

const METHODS = [
  { value: "COD", label: "Cash on delivery" },
  { value: "ESEWA", label: "eSewa" },
  { value: "KHALTI", label: "Khalti" },
  { value: "STRIPE", label: "Card (Stripe)" },
];

function Payments({ s, save }: { s: PlatformSettings; save: Save }) {
  const [enabled, setEnabled] = useState(new Set(s.payments.enabled_methods));
  const [cap, setCap] = useState(s.payments.cod_max_total ? String(Number(s.payments.cod_max_total)) : "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Section
      title="Payments"
      description="Which methods shoppers may choose. An online method also needs its provider keys configured on the server before it actually becomes available."
      error={error}
      onSubmit={async () => {
        if (enabled.size === 0) {
          setError("Keep at least one payment method on, or nobody can check out");
          throw new Error("invalid");
        }
        setError(null);
        await save({ payments: { enabled_methods: [...enabled], cod_max_total: money(cap) } }, "payment settings");
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Methods offered at checkout</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {METHODS.map((m) => (
            <label key={m.value} className="flex cursor-pointer items-center gap-2.5 rounded-control border border-border p-3 text-sm has-checked:border-platform has-checked:bg-platform-soft">
              <input
                type="checkbox"
                checked={enabled.has(m.value)}
                onChange={(e) =>
                  setEnabled((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(m.value);
                    else n.delete(m.value);
                    return n;
                  })
                }
                className="h-4 w-4 accent-accent"
              />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Input
        label={`Cash on delivery limit (${s.base_currency})`}
        type="number"
        min="0"
        value={cap}
        onChange={(e) => setCap(e.target.value)}
        hint="Orders above this must be paid online. Leave empty for no limit."
        className="max-w-xs"
      />
    </Section>
  );
}

const EMPTY_ZONE: ShippingZone = { name: "", regions: [], fee: "0", free_threshold: null, eta_days_min: 2, eta_days_max: 5 };

function Shipping({ s, save }: { s: PlatformSettings; save: Save }) {
  const [zones, setZones] = useState(
    s.shipping_zones.map((z) => ({ ...z, regionsText: z.regions.join(", ") })),
  );
  const [error, setError] = useState<string | null>(null);
  const patch = (i: number, p: Partial<(typeof zones)[number]>) =>
    setZones((zs) => zs.map((z, j) => (j === i ? { ...z, ...p } : z)));

  return (
    <Section
      title="Shipping zones"
      description={`Orders shipped to a listed city or province pay that zone's fee; anywhere else pays the default ${s.base_currency} ${Number(s.shipping_fee)}. The first matching zone wins.`}
      error={error}
      onSubmit={async () => {
        const clean = zones.map(({ regionsText, ...z }) => ({
          ...z,
          name: z.name.trim(),
          regions: regionsText.split(",").map((r) => r.trim()).filter(Boolean),
        }));
        const bad = clean.findIndex((z) => !z.name || z.regions.length === 0 || z.eta_days_max < z.eta_days_min);
        if (bad >= 0) {
          setError(`Zone ${bad + 1}: needs a name, at least one region, and max days ≥ min days`);
          throw new Error("invalid");
        }
        setError(null);
        await save({ shipping_zones: clean }, "shipping zones");
      }}
    >
      {zones.length === 0 && <p className="text-sm text-muted">No zones yet: everyone pays the default fee.</p>}
      <ol className="space-y-4">
        {zones.map((z, i) => (
          <li key={i} className="rounded-card border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Zone {i + 1}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setZones((zs) => zs.filter((_, j) => j !== i))} aria-label={`Remove zone ${i + 1}`}>
                <TrashIcon width={15} height={15} aria-hidden /> Remove
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" value={z.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Kathmandu Valley" />
              <Input label="Cities or provinces" value={z.regionsText} onChange={(e) => patch(i, { regionsText: e.target.value })} placeholder="Kathmandu, Lalitpur, Bhaktapur" hint="Comma-separated; matched without case." />
              <Input label={`Fee (${s.base_currency})`} type="number" min="0" value={z.fee} onChange={(e) => patch(i, { fee: e.target.value })} />
              <Input label={`Free from (${s.base_currency})`} type="number" min="0" value={z.free_threshold ?? ""} onChange={(e) => patch(i, { free_threshold: money(e.target.value) })} hint="Empty: the platform default applies." />
              <Input label="Delivery in (min days)" type="number" min="0" value={z.eta_days_min} onChange={(e) => patch(i, { eta_days_min: Number(e.target.value) || 0 })} />
              <Input label="Delivery in (max days)" type="number" min="0" value={z.eta_days_max} onChange={(e) => patch(i, { eta_days_max: Number(e.target.value) || 0 })} />
            </div>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" size="sm" onClick={() => setZones((zs) => [...zs, { ...EMPTY_ZONE, regionsText: "" }])}>
        <PlusIcon width={15} height={15} aria-hidden /> Add zone
      </Button>
    </Section>
  );
}

function Taxes({ s, save }: { s: PlatformSettings; save: Save }) {
  const [f, setF] = useState({ ...s.taxes, registration_number: s.taxes.registration_number ?? "" });
  return (
    <Section
      title="Taxes"
      description="Each product carries its own rate (13% VAT by default). This decides how that rate is applied."
      onSubmit={() =>
        save(
          { taxes: { label: f.label.trim() || "VAT", prices_include_tax: f.prices_include_tax, registration_number: f.registration_number.trim() || null } },
          "tax settings",
        )
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Catalogue prices</legend>
        {[
          { v: true, label: "Include tax", text: "Shoppers pay the listed price; tax is shown on the invoice." },
          { v: false, label: "Exclude tax", text: "Tax is added on top of the listed price at checkout." },
        ].map((o) => (
          <label key={String(o.v)} className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 text-sm has-checked:border-platform has-checked:bg-platform-soft">
            <input type="radio" name="tax-mode" checked={f.prices_include_tax === o.v} onChange={() => setF({ ...f, prices_include_tax: o.v })} className="mt-0.5 accent-accent" />
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className="text-muted">{o.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Tax name" value={f.label} maxLength={20} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <Input label="Registration number (PAN/VAT)" value={f.registration_number} maxLength={40} onChange={(e) => setF({ ...f, registration_number: e.target.value })} hint="Printed on invoices." />
      </div>
    </Section>
  );
}

function Currencies({ s, save }: { s: PlatformSettings; save: Save }) {
  const [rows, setRows] = useState(s.display_currencies.map((c) => ({ ...c, rate: String(Number(c.rate)) })));
  const [error, setError] = useState<string | null>(null);
  const patch = (i: number, p: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <Section
      title="Currencies"
      description={`Everything is priced, charged and paid out in ${s.base_currency}. Display currencies are reference conversions for shoppers abroad; they never change what is charged.`}
      error={error}
      onSubmit={async () => {
        const clean = rows.map((r) => ({ code: r.code.trim().toUpperCase(), symbol: r.symbol.trim(), rate: r.rate.trim() }));
        const bad = clean.findIndex((r) => !/^[A-Z]{3}$/.test(r.code) || !r.symbol || !(Number(r.rate) > 0));
        if (bad >= 0) {
          setError(`Row ${bad + 1}: a 3-letter code, a symbol and a rate above 0`);
          throw new Error("invalid");
        }
        setError(null);
        await save({ display_currencies: clean }, "currencies");
      }}
    >
      <p className="text-sm">
        Base currency: <span className="font-semibold">{s.base_currency}</span>
      </p>
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_1fr_1.5fr_auto] items-end gap-3">
            <Input label="Code" value={r.code} maxLength={3} onChange={(e) => patch(i, { code: e.target.value.toUpperCase() })} placeholder="USD" />
            <Input label="Symbol" value={r.symbol} maxLength={6} onChange={(e) => patch(i, { symbol: e.target.value })} placeholder="$" />
            <Input label={`Per 1 ${s.base_currency}`} inputMode="decimal" value={r.rate} onChange={(e) => patch(i, { rate: e.target.value })} placeholder="0.0075" />
            <Button type="button" variant="ghost" size="sm" className="mb-1" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove ${r.code || "row"}`}>
              <TrashIcon width={15} height={15} />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { code: "", symbol: "", rate: "" }])}>
        <PlusIcon width={15} height={15} aria-hidden /> Add currency
      </Button>
    </Section>
  );
}

const EVENTS: { id: EmailEvent; label: string; vars: string[]; sample: EmailTemplate }[] = [
  {
    id: "order.placed",
    label: "Order confirmation",
    vars: ["order_number", "recipient", "total", "payment_method", "items"],
    sample: {
      subject: "Order {{order_number}} confirmed — Beauty Commerce",
      body: "Hi {{recipient}},\n\nThank you for your order {{order_number}}.\n\n{{items}}\n\nTotal: {{total}} ({{payment_method}})\n\nWe'll email you when it ships.",
      enabled: true,
    },
  },
  {
    id: "order.status_changed",
    label: "Order status update",
    vars: ["order_number", "recipient", "status", "status_message", "total"],
    sample: {
      subject: "Order {{order_number}}: {{status}}",
      body: "Hi {{recipient}},\n\n{{status_message}}\n\nOrder: {{order_number}}",
      enabled: true,
    },
  },
];

function Emails({ s, save }: { s: PlatformSettings; save: Save }) {
  // The whole set is saved together, so "Back to built-in" removes an override.
  const [tpl, setTpl] = useState<Partial<Record<EmailEvent, EmailTemplate>>>(s.email_templates);
  return (
    <div>
      {EVENTS.map((ev) => {
        const t = tpl[ev.id];
        return (
          <Section
            key={ev.id}
            title={ev.label}
            description={
              t ? (
                <>
                  Placeholders: {ev.vars.map((v) => <code key={v} className="mr-1 rounded bg-surface-2 px-1 text-xs">{`{{${v}}}`}</code>)}
                </>
              ) : (
                "Using the built-in email. Customise it to change the wording."
              )
            }
            onSubmit={() => save({ email_templates: tpl }, `the ${ev.label.toLowerCase()} email`)}
          >
            {t ? (
              <>
                <Input label="Subject" value={t.subject} maxLength={200} onChange={(e) => setTpl({ ...tpl, [ev.id]: { ...t, subject: e.target.value } })} />
                <Textarea label="Body (plain text; a blank line starts a new paragraph)" rows={8} value={t.body} maxLength={5000} onChange={(e) => setTpl({ ...tpl, [ev.id]: { ...t, body: e.target.value } })} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input type="checkbox" checked={t.enabled} onChange={(e) => setTpl({ ...tpl, [ev.id]: { ...t, enabled: e.target.checked } })} className="h-4 w-4 accent-accent" />
                    Use this version (off = built-in email)
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setTpl(Object.fromEntries(Object.entries(tpl).filter(([k]) => k !== ev.id)))
                    }
                  >
                    Back to built-in
                  </Button>
                </div>
              </>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setTpl({ ...tpl, [ev.id]: ev.sample })}>
                Customise
              </Button>
            )}
          </Section>
        );
      })}
    </div>
  );
}
