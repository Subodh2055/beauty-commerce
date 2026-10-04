import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Extra classes for this column's cells (widths, nowrap, …). */
  className?: string;
  /** Hide below a breakpoint, e.g. "hidden md:table-cell". */
  responsive?: string;
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
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" };

/**
 * A real <table> (so screen readers get headers and row/column navigation) in a
 * horizontally scrollable card for narrow screens. Columns map rows to cells.
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
}: DataTableProps<T>) {
  const showEmpty = !loading && rows.length === 0;
  return (
    <div
      className={`overflow-x-auto rounded-card border border-border bg-surface shadow-soft ${className}`}
    >
      <table className="w-full text-sm" aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-2/60">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`h-11 px-4 text-2xs font-semibold tracking-eyebrow text-muted uppercase ${
                  alignClass[c.align ?? "left"]
                } ${c.responsive ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skeleton-${i}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3.5 ${c.responsive ?? ""}`}>
                    <Skeleton className="h-4 w-full max-w-[10rem]" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`transition-colors duration-(--duration-fast) hover:bg-surface-2/50 ${
                  rowClassName?.(row) ?? ""
                }`}
              >
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
            ))}
          {showEmpty && (
            <tr>
              <td colSpan={columns.length}>{empty ?? <p className="p-8 text-center text-muted">Nothing here yet.</p>}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
