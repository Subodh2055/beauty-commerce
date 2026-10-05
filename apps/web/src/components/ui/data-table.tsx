"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/ui/icons";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Extra classes for this column's cells (widths, nowrap, …). */
  className?: string;
  /** Hide below a breakpoint, e.g. "hidden md:table-cell". */
  responsive?: string;
  /** Makes the header a sort button. `asc`/`desc` are the sort values sent to `onSort`. */
  sort?: { asc: string; desc: string };
}

export interface TableSort {
  value: string;
  onSort: (value: string) => void;
}

export interface TableSelection {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Accessible label for each row's checkbox. */
  label: (key: string) => string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Read by screen readers; visually hidden. */
  caption: string;
  loading?: boolean;
  /** Shown in place of rows when `rows` is empty (and not loading). */
  empty?: ReactNode;
  /** Marks rows, e.g. highlighting low stock. */
  rowClassName?: (row: T) => string;
  className?: string;
  sort?: TableSort;
  selection?: TableSelection;
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" };

function SelectAll({ state, onToggle }: { state: "none" | "some" | "all"; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      onChange={onToggle}
      aria-label="Select all rows on this page"
      className="focus-ring h-4 w-4 cursor-pointer rounded accent-accent"
    />
  );
}

/**
 * A real <table> (so screen readers get headers and row/column navigation) in a
 * horizontally scrollable card for narrow screens. Columns map rows to cells.
 * Optional: sortable headers (buttons with aria-sort) and row selection
 * (checkboxes with a tri-state select-all).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  empty,
  rowClassName,
  className = "",
  sort,
  selection,
}: DataTableProps<T>) {
  const showEmpty = !loading && rows.length === 0;
  const keys = rows.map(rowKey);
  const picked = selection ? keys.filter((k) => selection.selected.has(k)).length : 0;
  const allState = picked === 0 ? "none" : picked === keys.length ? "all" : "some";
  const span = columns.length + (selection ? 1 : 0);

  function toggleAll() {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (allState === "all") keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));
    selection.onChange(next);
  }

  function toggle(key: string) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  }

  return (
    <div
      className={`overflow-x-auto rounded-card border border-border bg-surface shadow-soft ${className}`}
    >
      <table className="w-full text-sm" aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-2/60">
            {selection && (
              <th scope="col" className="h-11 w-10 pl-4">
                {keys.length > 0 && <SelectAll state={allState} onToggle={toggleAll} />}
              </th>
            )}
            {columns.map((c) => {
              const dir =
                sort && c.sort ? (sort.value === c.sort.asc ? "ascending" : sort.value === c.sort.desc ? "descending" : null) : null;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.sort ? (dir ?? "none") : undefined}
                  className={`h-11 px-4 text-2xs font-semibold tracking-eyebrow text-muted uppercase ${
                    alignClass[c.align ?? "left"]
                  } ${c.responsive ?? ""}`}
                >
                  {sort && c.sort ? (
                    <button
                      type="button"
                      onClick={() => sort.onSort(dir === "ascending" ? c.sort!.desc : c.sort!.asc)}
                      className={`focus-ring -mx-1 inline-flex cursor-pointer items-center gap-1 rounded-sm px-1 uppercase hover:text-foreground ${
                        dir ? "text-foreground" : ""
                      }`}
                    >
                      {c.header}
                      {dir === "ascending" ? (
                        <ArrowUpIcon width={12} height={12} />
                      ) : dir === "descending" ? (
                        <ArrowDownIcon width={12} height={12} />
                      ) : (
                        <span className="w-3" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skeleton-${i}`}>
                {selection && <td className="pl-4" />}
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3.5 ${c.responsive ?? ""}`}>
                    <Skeleton className="h-4 w-full max-w-40" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows.map((row) => {
              const key = rowKey(row);
              const on = selection?.selected.has(key) ?? false;
              return (
                <tr
                  key={key}
                  aria-selected={selection ? on : undefined}
                  className={`transition-colors duration-(--duration-fast) hover:bg-surface-2/50 ${
                    on ? "bg-accent-soft/40" : ""
                  } ${rowClassName?.(row) ?? ""}`}
                >
                  {selection && (
                    <td className="w-10 pl-4 align-middle">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(key)}
                        aria-label={selection.label(key)}
                        className="focus-ring h-4 w-4 cursor-pointer rounded accent-accent"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3.5 align-middle ${alignClass[c.align ?? "left"]} ${
                        c.responsive ?? ""
                      } ${c.className ?? ""}`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          {showEmpty && (
            <tr>
              <td colSpan={span}>{empty ?? <p className="p-8 text-center text-muted">Nothing here yet.</p>}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
