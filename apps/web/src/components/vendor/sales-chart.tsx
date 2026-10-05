"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { SalesPoint } from "@/lib/vendor";
import { formatMoney } from "@/lib/format";

const W = 720;
const H = 260;
const PAD = { top: 16, right: 44, bottom: 30, left: 64 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag / 2) * 2 * mag || mag;
}

/** Axis labels stay short ("NPR 40K"); exact figures live in the tooltip and table. */
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Revenue (bars, left axis) and orders (dashed line with square markers, right
 * axis) per day. Accessible by design:
 * - Colours are Okabe–Ito tokens AND the two series differ in shape (bar vs
 *   dashed line + markers), so nothing relies on hue.
 * - The plot is one focusable element: ←/→ (Home/End) move a cursor between
 *   days and a live region reads the day's figures; hover does the same.
 * - "Show data as a table" gives the full series as a real table.
 */
export function SalesChart({ series, currency }: { series: SalesPoint[]; currency: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const data = useMemo(
    () => series.map((p) => ({ ...p, rev: Number(p.revenue), earn: Number(p.earnings) })),
    [series],
  );
  const maxRev = niceMax(Math.max(0, ...data.map((d) => d.rev)));
  const maxOrders = Math.max(2, niceMax(Math.max(0, ...data.map((d) => d.orders))));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(22, step * 0.62));
  const x = (i: number) => PAD.left + step * i + step / 2;
  const yRev = (v: number) => PAD.top + innerH - (v / maxRev) * innerH;
  const yOrd = (v: number) => PAD.top + innerH - (v / maxOrders) * innerH;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yOrd(d.orders).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(data.length / 7);
  const total = data.reduce((n, d) => n + d.rev, 0);
  const best = data.reduce((b, d) => (d.rev > b.rev ? d : b), data[0] ?? { rev: 0, date: "" });

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    const last = data.length - 1;
    const cur = active ?? last;
    const next =
      e.key === "ArrowRight" ? Math.min(last, cur + 1)
      : e.key === "ArrowLeft" ? Math.max(0, cur - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  }

  const a = active !== null ? data[active] : null;
  const describe = (d: (typeof data)[number]) =>
    `${shortDate(d.date)}: ${formatMoney(d.rev, currency)} revenue, ${d.orders} order${d.orders === 1 ? "" : "s"}, ${d.units} unit${d.units === 1 ? "" : "s"}`;

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-chart-1" /> Revenue (left axis)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="10" viewBox="0 0 22 10">
            <path d="M1 5h20" stroke="var(--chart-2)" strokeWidth="2" strokeDasharray="4 3" />
            <rect x="8" y="2" width="6" height="6" fill="var(--chart-2)" />
          </svg>
          Orders (right axis)
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="focus-ring h-auto w-full rounded-control"
          role="img"
          tabIndex={0}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-desc`}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onMouseLeave={() => setActive(null)}
        >
          <title id={`${id}-title`}>Daily revenue and orders, last {data.length} days</title>
          <desc id={`${id}-desc`}>
            {`Total ${formatMoney(total, currency)}. Best day ${best?.date ? shortDate(best.date) : "none"}. Use left and right arrow keys to read each day.`}
          </desc>

          {/* Grid + axes */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = PAD.top + innerH - t * innerH;
            return (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                  {`${currency} ${compact.format(maxRev * t)}`}
                </text>
                <text x={W - PAD.right + 8} y={y + 4} fontSize="11" fill="var(--muted)">
                  {Math.round(maxOrders * t)}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => (
            <g key={d.date}>
              {/* Hit area per day for hover */}
              <rect
                x={x(i) - step / 2}
                y={PAD.top}
                width={step}
                height={innerH}
                fill={active === i ? "var(--surface-2)" : "transparent"}
                onMouseEnter={() => setActive(i)}
              />
              <rect
                x={x(i) - barW / 2}
                y={yRev(d.rev)}
                width={barW}
                height={Math.max(0, PAD.top + innerH - yRev(d.rev))}
                rx="2"
                fill="var(--chart-1)"
                opacity={active === null || active === i ? 1 : 0.55}
                pointerEvents="none"
              />
              {i % labelEvery === 0 && (
                <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {shortDate(d.date)}
                </text>
              )}
            </g>
          ))}

          <path d={line} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeDasharray="5 4" pointerEvents="none" />
          {data.map((d, i) => (
            <rect
              key={`m-${d.date}`}
              x={x(i) - 3.5}
              y={yOrd(d.orders) - 3.5}
              width="7"
              height="7"
              fill="var(--chart-2)"
              stroke="var(--surface)"
              strokeWidth="1.5"
              pointerEvents="none"
            />
          ))}

          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--foreground)"
              strokeWidth="1"
              strokeDasharray="2 3"
              pointerEvents="none"
            />
          )}
        </svg>

        {a && (
          <div
            className="pointer-events-none absolute top-2 rounded-control border border-border bg-surface px-3 py-2 text-xs shadow-lift"
            style={{
              left: `${(x(active!) / W) * 100}%`,
              transform: `translateX(${x(active!) > W * 0.6 ? "-105%" : "8px"})`,
            }}
            aria-hidden
          >
            <p className="font-semibold">{shortDate(a.date)}</p>
            <p className="tabular-nums">Revenue {formatMoney(a.rev, currency)}</p>
            <p className="tabular-nums text-muted">Earnings {formatMoney(a.earn, currency)}</p>
            <p className="tabular-nums">
              {a.orders} order{a.orders === 1 ? "" : "s"} · {a.units} unit{a.units === 1 ? "" : "s"}
            </p>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {a ? describe(a) : ""}
        </p>
      </div>

      <details className="group text-sm">
        <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-accent hover:underline [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show data as a table</span>
          <span className="hidden group-open:inline">Hide table</span>
        </summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-card border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily sales</caption>
            <thead className="sticky top-0 bg-surface-2">
              <tr className="text-left text-2xs tracking-eyebrow text-muted uppercase">
                <th scope="col" className="px-3 py-2">Day</th>
                <th scope="col" className="px-3 py-2 text-right">Revenue</th>
                <th scope="col" className="px-3 py-2 text-right">Earnings</th>
                <th scope="col" className="px-3 py-2 text-right">Orders</th>
                <th scope="col" className="px-3 py-2 text-right">Units</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">{shortDate(d.date)}</th>
                  <td className="px-3 py-1.5 text-right">{formatMoney(d.rev, currency)}</td>
                  <td className="px-3 py-1.5 text-right">{formatMoney(d.earn, currency)}</td>
                  <td className="px-3 py-1.5 text-right">{d.orders}</td>
                  <td className="px-3 py-1.5 text-right">{d.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
