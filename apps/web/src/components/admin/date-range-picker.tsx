"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CalendarIcon } from "@/components/ui/icons";

export interface DateRange {
  start: string; // YYYY-MM-DD, inclusive, UTC days (the API's rollup is UTC)
  end: string;
}

const MAX_DAYS = 366;

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function lastDays(n: number): DateRange {
  const end = todayUtc();
  return { start: shift(end, -(n - 1)), end };
}

function monthRange(offset: number): DateRange {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  const end = offset === 0 ? todayUtc() : last.toISOString().slice(0, 10);
  return { start: first.toISOString().slice(0, 10), end };
}

const PRESETS: { id: string; label: string; range: () => DateRange }[] = [
  { id: "7d", label: "7 days", range: () => lastDays(7) },
  { id: "30d", label: "30 days", range: () => lastDays(30) },
  { id: "90d", label: "90 days", range: () => lastDays(90) },
  { id: "mtd", label: "This month", range: () => monthRange(0) },
  { id: "last-month", label: "Last month", range: () => monthRange(-1) },
];

export function daysIn(r: DateRange): number {
  return Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86_400_000) + 1;
}

/**
 * Presets as a pressed-button group plus a custom from/to form. Validates the
 * same rules as the API (order, not in the future, at most a year) before
 * calling `onChange`, so a bad range never round-trips.
 */
export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const active = PRESETS.find((p) => {
    const r = p.range();
    return r.start === value.start && r.end === value.end;
  })?.id;

  function apply(e: FormEvent) {
    e.preventDefault();
    if (!draft.start || !draft.end) return setError("Pick both dates");
    if (draft.end < draft.start) return setError("The end date is before the start date");
    if (draft.end > todayUtc()) return setError("The range can't end in the future");
    if (daysIn(draft) > MAX_DAYS) return setError(`Pick at most ${MAX_DAYS} days`);
    setError(null);
    onChange(draft);
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Date range" className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={active === p.id && !custom}
            onClick={() => {
              setCustom(false);
              setError(null);
              onChange(p.range());
            }}
            className="focus-ring h-9 cursor-pointer rounded-pill border border-border-strong px-3.5 text-sm transition-colors duration-(--duration-fast) hover:bg-surface-2 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom || !active}
          aria-expanded={custom}
          onClick={() => {
            setDraft(value);
            setCustom((c) => !c);
          }}
          className="focus-ring inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-pill border border-border-strong px-3.5 text-sm transition-colors duration-(--duration-fast) hover:bg-surface-2 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          <CalendarIcon width={15} height={15} aria-hidden />
          {active && !custom ? "Custom" : `${value.start} → ${value.end}`}
        </button>
      </div>
      {custom && (
        <form onSubmit={apply} className="flex flex-wrap items-end gap-3" noValidate>
          <Input
            label="From"
            type="date"
            value={draft.start}
            max={todayUtc()}
            onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
            className="w-44"
          />
          <Input
            label="To"
            type="date"
            value={draft.end}
            max={todayUtc()}
            onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
            className="w-44"
          />
          <Button type="submit" size="sm" className="mb-1">
            Apply
          </Button>
          {error && (
            <p role="alert" className="mb-2 w-full text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
