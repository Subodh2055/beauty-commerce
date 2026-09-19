import { titleCase } from "@/lib/format";

type Attrs = Record<string, unknown>;

const NOTE_KEYS = ["top_notes", "middle_notes", "base_notes"] as const;
const HIDDEN = new Set<string>(NOTE_KEYS);

function asText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export function NotePyramid({ attributes }: { attributes: Attrs }) {
  const rows = NOTE_KEYS.filter((k) => Array.isArray(attributes[k]));
  if (rows.length === 0) return null;
  const labels: Record<(typeof NOTE_KEYS)[number], string> = {
    top_notes: "Top",
    middle_notes: "Heart",
    base_notes: "Base",
  };
  return (
    <section aria-labelledby="notes-heading" className="space-y-3">
      <h2 id="notes-heading" className="font-serif text-lg font-semibold">
        Fragrance notes
      </h2>
      <ol className="space-y-2">
        {rows.map((k, i) => (
          <li
            key={k}
            className="flex gap-4 rounded-2xl bg-surface-2 p-4"
            style={{ marginInline: `${i * 6}%` }}
          >
            <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted">
              {labels[k]}
            </span>
            <span className="text-sm">{asText(attributes[k])}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AttributeTable({ attributes }: { attributes: Attrs }) {
  const entries = Object.entries(attributes).filter(
    ([k, v]) => !HIDDEN.has(k) && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="details-heading" className="space-y-3">
      <h2 id="details-heading" className="font-serif text-lg font-semibold">
        Details
      </h2>
      <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between gap-4 border-b border-border py-2.5 text-sm"
          >
            <dt className="text-muted">{titleCase(k)}</dt>
            <dd className="text-right font-medium">{asText(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
