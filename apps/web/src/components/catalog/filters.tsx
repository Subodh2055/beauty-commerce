"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { ProductFacets } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { controlClass } from "@/components/ui/field";
import { FilterIcon } from "@/components/ui/icons";

interface Props {
  facets: ProductFacets;
  /** Facets that are fixed by the route (e.g. category page) and shouldn't render. */
  lock?: { category?: boolean; brand?: boolean };
}

export function Filters({ facets, lock = {}, activeCount = 0 }: Props & { activeCount?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-4 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <FilterIcon width={16} height={16} /> Filters
          {activeCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-primary px-1.5 text-2xs font-semibold text-primary-foreground">
              {activeCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </div>

      <aside className="hidden lg:block">
        <FilterForm facets={facets} lock={lock} />
      </aside>

      <Drawer open={open} onClose={() => setOpen(false)} title="Filters" side="left" className="lg:hidden">
        <div className="p-5">
          <FilterForm facets={facets} lock={lock} onApplied={() => setOpen(false)} />
        </div>
      </Drawer>
    </>
  );
}

function FilterForm({
  facets,
  lock = {},
  onApplied,
}: Props & { onApplied?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = {
    category: sp.get("category") ?? "",
    brand: sp.get("brand") ?? "",
    product_type: sp.get("product_type") ?? "",
    family: sp.get("family") ?? "",
    gender: sp.get("gender") ?? "",
    note: sp.get("note") ?? "",
    min_rating: sp.get("min_rating") ?? "",
    min_price: sp.get("min_price") ?? "",
    max_price: sp.get("max_price") ?? "",
    in_stock: sp.get("in_stock") === "true",
    featured: sp.get("featured") === "true",
  };

  function push(next: URLSearchParams) {
    next.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  function toggle(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    push(next);
  }

  function setBool(key: string, on: boolean) {
    const next = new URLSearchParams(sp.toString());
    if (on) next.set(key, "true");
    else next.delete(key);
    push(next);
  }

  function onPrice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = new URLSearchParams(sp.toString());
    for (const k of ["min_price", "max_price"]) {
      const v = String(fd.get(k) ?? "").trim();
      if (v) next.set(k, v);
      else next.delete(k);
    }
    push(next);
    onApplied?.();
  }

  function clearAll() {
    const next = new URLSearchParams();
    const q = sp.get("q");
    if (q) next.set("q", q);
    push(next);
    onApplied?.();
  }

  const hasAny =
    Object.entries(current).some(([k, v]) => (k === "in_stock" || k === "featured" ? v : v !== ""));

  return (
    <div className="space-y-7 text-sm" aria-busy={pending}>
      <p className={`h-4 text-xs text-muted transition-opacity ${pending ? "opacity-100" : "opacity-0"}`} aria-live="polite">
        {pending ? "Updating results…" : ""}
      </p>
      {hasAny && (
        <button type="button" onClick={clearAll} className="text-accent underline-offset-2 hover:underline">
          Clear all filters
        </button>
      )}

      {!lock.category && facets.categories.length > 0 && (
        <Group title="Category">
          {facets.categories.map((f) => (
            <Check
              key={f.slug}
              label={f.name}
              count={f.count}
              checked={current.category === f.slug}
              onChange={() => toggle("category", f.slug)}
            />
          ))}
        </Group>
      )}

      {!lock.brand && facets.brands.length > 0 && (
        <Group title="Brand">
          {facets.brands.map((f) => (
            <Check
              key={f.slug}
              label={f.name}
              count={f.count}
              checked={current.brand === f.slug}
              onChange={() => toggle("brand", f.slug)}
            />
          ))}
        </Group>
      )}

      {facets.families?.length > 0 && (
        <Group title="Fragrance family">
          {facets.families.map((f) => (
            <Check
              key={f.slug}
              label={f.name}
              count={f.count}
              checked={current.family === f.slug}
              onChange={() => toggle("family", f.slug)}
            />
          ))}
        </Group>
      )}

      {facets.genders?.length > 0 && (
        <Group title="For">
          {facets.genders.map((f) => (
            <Check
              key={f.slug}
              label={f.name}
              count={f.count}
              checked={current.gender === f.slug}
              onChange={() => toggle("gender", f.slug)}
            />
          ))}
        </Group>
      )}

      {facets.notes?.length > 0 && (
        <NotesGroup
          notes={facets.notes}
          selected={current.note}
          onToggle={(slug) => toggle("note", slug)}
        />
      )}

      {facets.ratings?.some((r) => r.count > 0) && (
        <Group title="Rating">
          {facets.ratings.map((r) => (
            <Check
              key={r.slug}
              label={`★ & up`}
              count={r.count}
              checked={current.min_rating === r.slug}
              onChange={() => toggle("min_rating", r.slug)}
            />
          ))}
        </Group>
      )}

      {facets.product_types.length > 1 && (
        <Group title="Type">
          {facets.product_types.map((f) => (
            <Check
              key={f.slug}
              label={f.name}
              count={f.count}
              checked={current.product_type === f.slug}
              onChange={() => toggle("product_type", f.slug)}
            />
          ))}
        </Group>
      )}

      <Group title="Price">
        <form onSubmit={onPrice} className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              name="min_price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder={facets.price_min ? formatMoney(facets.price_min) : "Min"}
              defaultValue={current.min_price}
              className={`${controlClass} h-9 px-2`}
              aria-label="Minimum price"
            />
            <span className="text-muted">–</span>
            <input
              name="max_price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder={facets.price_max ? formatMoney(facets.price_max) : "Max"}
              defaultValue={current.max_price}
              className={`${controlClass} h-9 px-2`}
              aria-label="Maximum price"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Apply price
          </Button>
        </form>
      </Group>

      <Group title="Availability">
        <Check
          label="In stock only"
          checked={current.in_stock}
          onChange={(on) => setBool("in_stock", on)}
        />
        <Check
          label="Featured"
          checked={current.featured}
          onChange={(on) => setBool("featured", on)}
        />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-2xs font-semibold tracking-eyebrow text-muted uppercase">
        {title}
      </legend>
      <div className="space-y-1.5">{children}</div>
    </fieldset>
  );
}

function Check({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-1 hover:bg-surface-2">
      <span className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="focus-ring h-4 w-4 cursor-pointer rounded border-border-strong accent-accent"
        />
        <span className={checked ? "font-medium" : ""}>{label}</span>
      </span>
      {count !== undefined && <span className="text-xs text-muted tabular-nums">{count}</span>}
    </label>
  );
}

const NOTES_COLLAPSED = 8;

/** Notes as toggle chips: the busiest few, expandable to the full facet list. */
function NotesGroup({
  notes,
  selected,
  onToggle,
}: {
  notes: ProductFacets["notes"];
  selected: string;
  onToggle: (slug: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? notes : notes.slice(0, NOTES_COLLAPSED);
  // Keep the active note visible even when it isn't among the busiest.
  const extra = selected && !shown.some((n) => n.slug === selected) ? [{ slug: selected, name: selected.replace(/-/g, " "), count: 0 }] : [];
  return (
    <Group title="Notes">
      <div className="flex flex-wrap gap-1.5">
        {[...extra, ...shown].map((n) => {
          const on = n.slug === selected;
          return (
            <button
              key={n.slug}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(n.slug)}
              className={`focus-ring inline-flex h-8 cursor-pointer items-center gap-1 rounded-pill border px-3 text-xs capitalize transition-colors duration-(--duration-fast) ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-strong hover:bg-surface-2"
              }`}
            >
              {n.name}
              {n.count > 0 && <span className={on ? "opacity-80" : "text-muted"}>{n.count}</span>}
            </button>
          );
        })}
      </div>
      {notes.length > NOTES_COLLAPSED && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="focus-ring mt-1 cursor-pointer rounded-sm text-xs font-medium text-accent underline-offset-4 hover:underline"
        >
          {all ? "Show fewer notes" : `Show all ${notes.length} notes`}
        </button>
      )}
    </Group>
  );
}