"use client";

import { useState, type FormEvent } from "react";
import type { Address, AddressInput } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/auth/auth-card";

export function AddressForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save address",
}: {
  initial?: Address | null;
  onSubmit: (body: AddressInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body: AddressInput = {
      label: String(fd.get("label")) || "Home",
      recipient_name: String(fd.get("recipient_name")),
      phone: String(fd.get("phone")),
      line1: String(fd.get("line1")),
      line2: String(fd.get("line2")) || null,
      city: String(fd.get("city")),
      state: String(fd.get("state")) || null,
      postal_code: String(fd.get("postal_code")) || null,
      country: "NP",
      is_default: fd.get("is_default") === "on",
    };
    try {
      await onSubmit(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" name="label" defaultValue={initial?.label ?? "Home"} placeholder="Home, Office…" />
        <Field label="Recipient" name="recipient_name" required defaultValue={initial?.recipient_name ?? ""} />
      </div>
      <Field label="Phone" name="phone" type="tel" required defaultValue={initial?.phone ?? ""} placeholder="98XXXXXXXX" />
      <Field label="Address line 1" name="line1" required defaultValue={initial?.line1 ?? ""} />
      <Field label="Address line 2" name="line2" defaultValue={initial?.line2 ?? ""} placeholder="Apartment, landmark (optional)" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" name="city" required defaultValue={initial?.city ?? "Kathmandu"} />
        <Field label="Province" name="state" defaultValue={initial?.state ?? ""} />
        <Field label="Postal code" name="postal_code" defaultValue={initial?.postal_code ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_default" defaultChecked={initial?.is_default ?? false} className="h-4 w-4 accent-[var(--accent)]" />
        Set as default address
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  selectable,
  selected,
  onSelect,
}: {
  address: Address;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetDefault?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{address.label}</span>
        {address.is_default && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
            Default
          </span>
        )}
      </div>
      <p className="mt-1 text-sm">{address.recipient_name} · {address.phone}</p>
      <p className="text-sm text-muted">
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}, {address.city}
        {address.state ? `, ${address.state}` : ""} {address.postal_code ?? ""}
      </p>
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`focus-ring w-full rounded-2xl border p-4 text-left transition-colors ${
          selected ? "border-accent bg-accent-soft/40" : "border-border hover:border-foreground/30"
        }`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      {inner}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {!address.is_default && onSetDefault && (
          <button onClick={onSetDefault} className="text-accent hover:underline">
            Set default
          </button>
        )}
        {onEdit && (
          <button onClick={onEdit} className="text-muted hover:text-foreground">
            Edit
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="text-muted hover:text-danger">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
