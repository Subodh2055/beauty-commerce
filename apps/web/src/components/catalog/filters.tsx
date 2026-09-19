"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { ProductFacets } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CloseIcon, FilterIcon } from "@/components/ui/icons";

interface Props {
  facets: ProductFacets;
  /** Facets that are fixed by the route (e.g. category page) and shouldn't render. */
  lock?: { category?: boolean; brand?: boolean };
}

export function Filters({ facets, lock = {} }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-4 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <FilterIcon width={16} height={16} /> Filters
        </Button>
      </div>

      <aside className="hidden lg:block">
        <FilterForm facets={facets} lock={lock} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
          />
          <div className="absolute inset-y-0 left-0 w-[85vw] max-w-sm overflow-y-auto bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold">Filters</p>
              <button
                type="button"
                className="focus-ring rounded-full p-1"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <FilterForm facets={facets} lock={lock} onApplied={() => setOpen(false)} />
          </div>
        </div>
      )}
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
  const [, startTransition] = useTransition();

  const current = {
    category: sp.get("category") ?? "",
    brand: sp.get("brand") ?? "",
    product_type: sp.get("product_type") ?? "",
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
    <div className="space-y-7 text-sm">
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
              className="focus-ring h-9 w-full rounded-lg border border-border bg-surface px-2"
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
              className="focus-ring h-9 w-full rounded-lg border border-border bg-surface px-2"
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
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
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
          className="focus-ring h-4 w-4 rounded border-border accent-[var(--accent)]"
        />
        <span className={checked ? "font-medium" : ""}>{label}</span>
      </span>
      {count !== undefined && <span className="text-xs text-muted tabular-nums">{count}</span>}
    </label>
  );
}
