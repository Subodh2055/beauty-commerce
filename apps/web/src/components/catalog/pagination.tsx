import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";

export function Pagination({
  page,
  size,
  total,
  pathname,
  params,
}: {
  page: number;
  size: number;
  total: number;
  pathname: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    const s = sp.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const window = 2;
  const items: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= window) items.push(p);
    else if (items[items.length - 1] !== "…") items.push("…");
  }

  const btn =
    "focus-ring inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm";

  return (
    <nav className="mt-10 flex items-center justify-center gap-1" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${btn} border-border hover:bg-surface-2`} aria-label="Previous page">
          <ChevronIcon className="rotate-180" width={16} height={16} />
        </Link>
      ) : (
        <span className={`${btn} border-border opacity-40`}>
          <ChevronIcon className="rotate-180" width={16} height={16} />
        </span>
      )}
      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-2 text-muted">…</span>
        ) : it === page ? (
          <span key={it} className={`${btn} border-foreground bg-foreground text-background`} aria-current="page">
            {it}
          </span>
        ) : (
          <Link key={it} href={href(it)} className={`${btn} border-border hover:bg-surface-2`}>
            {it}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={href(page + 1)} className={`${btn} border-border hover:bg-surface-2`} aria-label="Next page">
          <ChevronIcon width={16} height={16} />
        </Link>
      ) : (
        <span className={`${btn} border-border opacity-40`}>
          <ChevronIcon width={16} height={16} />
        </span>
      )}
    </nav>
  );
}
