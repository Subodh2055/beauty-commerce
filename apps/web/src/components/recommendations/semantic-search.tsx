"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { semanticSearch, type ScoredProduct } from "@/lib/api";
import { SearchIcon, SparkleIcon } from "@/components/ui/icons";

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;
const EXAMPLES = ["fresh citrus for summer evenings", "warm vanilla for winter", "soft rose for a date"];

/**
 * Header search that understands meaning: as you type, the closest products by
 * embedding similarity appear with their match %. WAI-ARIA combobox: ↑/↓ move
 * through suggestions, Enter opens one (or searches), Esc closes.
 */
export function SemanticSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<{ q: string; items: ScoredProduct[]; keyword: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const term = q.trim();
  const ready = term.length >= MIN_CHARS;

  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setLoading(true);
      semanticSearch(term, 5, { signal: ctrl.signal })
        .then((r) => {
          setState({ q: term, items: r.results, keyword: r.mode === "keyword" });
          setActive(-1);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [term, ready]);

  // Close when focus or a click leaves the widget.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const items = ready && state ? state.items : [];
  const showList = open && ready;
  // Options: each product, then "See all results".
  const count = items.length + 1;

  function go(i: number) {
    setOpen(false);
    if (i >= 0 && i < items.length) router.push(`/products/${items[i].product.slug}`);
    else router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/products");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && ready) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % count);
    } else if (e.key === "ArrowUp" && ready) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? count - 1 : a - 1));
    } else if (e.key === "Enter" && open && active >= 0) {
      // Open the highlighted option (the form's submit would only search).
      e.preventDefault();
      go(active);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(open && active >= 0 ? active : items.length);
  }

  const optionId = (i: number) => `${id}-opt-${i}`;
  const stale = state?.q !== term;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form onSubmit={onSubmit} role="search">
        <label className="relative block">
          <span className="sr-only">Search by name or describe a scent</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Try “fresh citrus for summer”"
            className="focus-ring h-10 w-full rounded-full border border-border-strong bg-surface pr-4 pl-10 text-sm placeholder:text-muted"
          />
        </label>
      </form>

      {showList && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 min-w-80 overflow-hidden rounded-card border border-border bg-surface shadow-overlay animate-fade-up">
          <p className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-xs text-muted">
            <SparkleIcon width={13} height={13} aria-hidden />
            {loading || stale ? "Finding scents that match…" : state?.keyword ? "Matching by keyword" : "Matching by meaning"}
          </p>
          <ul id={listId} role="listbox" aria-label="Suggestions" aria-busy={loading || stale}>
            {items.map((s, i) => (
              <li
                key={s.product.id}
                id={optionId(i)}
                role="option"
                aria-selected={active === i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(i)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${active === i ? "bg-surface-2" : ""}`}
              >
                <span className="relative h-11 w-9 shrink-0 overflow-hidden rounded-control bg-surface-2">
                  {s.product.primary_image && (
                    <Image src={s.product.primary_image.url} alt="" fill sizes="36px" className="object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.product.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {s.reasons[0] ?? s.product.brand?.name ?? ""}
                  </span>
                </span>
                {s.match > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-gold-strong tabular-nums">{s.match}%</span>
                )}
              </li>
            ))}
            {!loading && !stale && items.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted" role="presentation">
                No close matches. Try describing it, e.g. “{EXAMPLES[term.length % EXAMPLES.length]}”.
              </li>
            )}
            <li
              id={optionId(items.length)}
              role="option"
              aria-selected={active === items.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(items.length)}
              onMouseEnter={() => setActive(items.length)}
              className={`cursor-pointer border-t border-border px-4 py-2.5 text-sm font-medium text-accent ${
                active === items.length ? "bg-surface-2" : ""
              }`}
            >
              See all results for “{term}”
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
