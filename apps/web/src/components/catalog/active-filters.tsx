import Link from "next/link";
import { CloseIcon } from "@/components/ui/icons";

export interface ActiveFilter {
  key: string;
  label: string;
  /** The URL params with only this filter removed. */
  params: Record<string, string | undefined>;
}

function href(pathname: string, params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** Server-rendered chips for the filters in the URL; each link drops one. */
export function ActiveFilters({
  pathname,
  chips,
  params,
}: {
  pathname: string;
  chips: ActiveFilter[];
  params: Record<string, string | undefined>;
}) {
  if (chips.length === 0) return null;
  // "Clear all" keeps presentation choices (sort, view), drops every filter.
  const keep = Object.fromEntries(
    Object.entries(params).filter(([k]) => k === "sort" || k === "view"),
  );
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2" aria-label="Active filters" role="group">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={href(pathname, c.params)}
          scroll={false}
          className="focus-ring group inline-flex h-9 items-center gap-1.5 rounded-pill border border-border-strong bg-surface pl-3.5 pr-2.5 text-xs font-medium capitalize transition-colors duration-(--duration-fast) hover:border-foreground"
        >
          {c.label}
          <span className="sr-only">, remove filter</span>
          <CloseIcon
            width={14}
            height={14}
            aria-hidden
            className="text-muted transition-colors group-hover:text-foreground"
          />
        </Link>
      ))}
      {chips.length > 1 && (
        <Link
          href={href(pathname, keep)}
          scroll={false}
          className="focus-ring rounded-pill px-2 py-1 text-xs font-medium text-accent underline-offset-4 hover:underline"
        >
          Clear all
        </Link>
      )}
    </div>
  );
}
