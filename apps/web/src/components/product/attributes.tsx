import Link from "next/link";
import type { ReactNode } from "react";
import type { FragranceNote, NotePyramid as Pyramid } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { ChevronDownIcon } from "@/components/ui/icons";

type Attrs = Record<string, unknown>;

// Legacy free-text notes (products created before the notes taxonomy).
const NOTE_KEYS = ["top_notes", "middle_notes", "base_notes"] as const;
const INGREDIENT_KEYS = ["ingredients", "key_ingredients"] as const;
const HIDDEN = new Set<string>([...NOTE_KEYS, ...INGREDIENT_KEYS]);

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function asText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const TIERS = [
  { key: "top", legacy: "top_notes", label: "Top", when: "First impression", width: "w-[64%]" },
  { key: "heart", legacy: "middle_notes", label: "Heart", when: "After 20 minutes", width: "w-[82%]" },
  { key: "base", legacy: "base_notes", label: "Base", when: "The dry-down", width: "w-full" },
] as const;

/**
 * The note pyramid, narrowest at the top like the real thing. Taxonomy notes
 * link to every fragrance sharing them; legacy text notes render as plain chips.
 */
export function NotePyramid({ notes, attributes }: { notes: Pyramid; attributes: Attrs }) {
  const tiers = TIERS.map((t) => {
    const linked: FragranceNote[] = notes[t.key];
    const legacy = linked.length === 0 ? asList(attributes[t.legacy]) : [];
    return { ...t, linked, legacy };
  }).filter((t) => t.linked.length > 0 || t.legacy.length > 0);
  if (tiers.length === 0) return null;

  return (
    <section aria-labelledby="notes-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="notes-heading" className="font-display text-2xl font-semibold">
          Fragrance notes
        </h2>
        <span className="text-xs text-muted">Tap a note to find similar scents</span>
      </div>
      <ol className="flex flex-col items-center gap-2">
        {tiers.map((t, i) => (
          <li
            key={t.key}
            className={`${t.width} animate-fade-up rounded-card border border-border bg-surface p-4 text-center shadow-soft`}
            style={{ animationDelay: `${150 + i * 90}ms` }}
          >
            <p className="flex flex-wrap items-baseline justify-center gap-x-2">
              <span className="font-display text-lg font-semibold">{t.label}</span>
              <span className="text-2xs font-semibold tracking-eyebrow text-gold-strong uppercase">{t.when}</span>
            </p>
            <ul className="mt-2.5 flex flex-wrap justify-center gap-1.5">
              {t.linked.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/products?note=${n.slug}`}
                    className="focus-ring inline-flex h-8 items-center rounded-pill border border-border-strong px-3 text-xs transition-colors duration-(--duration-fast) hover:bg-accent-soft"
                  >
                    {n.name}
                  </Link>
                </li>
              ))}
              {t.legacy.map((n) => (
                <li key={n} className="inline-flex h-8 items-center rounded-pill bg-surface-2 px-3 text-xs">
                  {n}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Disclosure built on <details>: keyboard and screen-reader friendly with no JS. */
export function Accordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group border-b border-border" open={defaultOpen}>
      <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 text-left font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDownIcon
          width={18}
          height={18}
          className="shrink-0 text-muted transition-transform duration-(--duration-base) ease-standard group-open:rotate-180"
        />
      </summary>
      <div className="pb-5 text-sm leading-relaxed text-muted">{children}</div>
    </details>
  );
}

/** Ingredients (full INCI list and/or hero ingredients), or null when unknown. */
export function Ingredients({ attributes }: { attributes: Attrs }) {
  const key = asList(attributes.key_ingredients);
  const all = asList(attributes.ingredients);
  if (key.length === 0 && all.length === 0) return null;
  return (
    <Accordion title="Ingredients">
      {key.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 font-medium text-foreground">Key ingredients</p>
          <ul className="flex flex-wrap gap-1.5">
            {key.map((k) => (
              <li key={k} className="rounded-pill bg-gold-soft px-3 py-1 text-xs font-medium text-gold-strong">
                {k}
              </li>
            ))}
          </ul>
        </div>
      )}
      {all.length > 0 && <p>{all.join(", ")}.</p>}
      <p className="mt-3 text-xs">
        Formulas change from time to time; the list on the pack you receive is the one to trust.
      </p>
    </Accordion>
  );
}

export function AttributeTable({ attributes }: { attributes: Attrs }) {
  const entries = Object.entries(attributes).filter(
    ([k, v]) => !HIDDEN.has(k) && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  if (entries.length === 0) return null;
  return (
    <Accordion title="Details">
      <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-border py-2.5 last:border-0">
            <dt>{titleCase(k)}</dt>
            <dd className="text-right font-medium text-foreground">{asText(v)}</dd>
          </div>
        ))}
      </dl>
    </Accordion>
  );
}
