"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/ui/icons";

/**
 * Counts from 0 to `value` once it scrolls into view (transform-free: only text
 * changes). Reduced motion shows the final number straight away. Screen readers
 * get the final formatted value, never the intermediate frames.
 */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [inView, reduce, value]);

  return (
    <>
      <span ref={ref} aria-hidden className="tabular-nums">
        {format(reduce ? value : shown)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

/**
 * KPI card: label, counted-up value, and the change against the previous period.
 * The change is carried by an arrow and words as well as colour.
 */
export function KpiCard({
  label,
  value,
  previous,
  format,
  hint,
  icon,
  lowerIsBetter = false,
}: {
  label: string;
  value: number;
  /** Same metric for the previous period; omit to hide the delta. */
  previous?: number;
  format: (n: number) => string;
  hint?: ReactNode;
  icon?: ReactNode;
  /** For costs like refunds: a rise is shown as bad (danger), a fall as good. */
  lowerIsBetter?: boolean;
}) {
  let delta: ReactNode = null;
  if (previous !== undefined) {
    if (previous === 0 && value === 0) {
      delta = <span className="text-muted">No change</span>;
    } else if (previous === 0) {
      delta = <span className={lowerIsBetter ? "text-danger" : "text-success"}>New this period</span>;
    } else {
      const pct = ((value - previous) / previous) * 100;
      const up = pct >= 0;
      const good = up !== lowerIsBetter;
      delta = (
        <span className={`inline-flex items-center gap-1 ${good ? "text-success" : "text-danger"}`}>
          {up ? <ArrowUpIcon width={13} height={13} /> : <ArrowDownIcon width={13} height={13} />}
          {up ? "Up" : "Down"} {Math.abs(pct).toFixed(pct > -10 && pct < 10 ? 1 : 0)}%
          <span className="text-muted">vs previous</span>
        </span>
      );
    }
  }
  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {icon && (
          <span className="text-muted" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">
        <CountUp value={value} format={format} />
      </p>
      {(delta || hint) && <p className="mt-1.5 text-xs">{delta ?? <span className="text-muted">{hint}</span>}</p>}
    </div>
  );
}
