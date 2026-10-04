import type { ReactNode } from "react";
import { BottleIcon } from "@/components/ui/icons";

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Defaults to a perfume bottle; pass `null` for none. */
  icon?: ReactNode;
  /** Usually a Button/ButtonLink pointing somewhere useful. */
  action?: ReactNode;
  /** Tighter version for inside cards and tables. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
  className = "",
}: EmptyStateProps) {
  const glyph = icon === undefined ? <BottleIcon width={26} height={26} /> : icon;
  return (
    <div
      className={`flex flex-col items-center text-center ${
        compact ? "gap-2 px-4 py-8" : "gap-3 rounded-panel bg-surface-2 px-6 py-16"
      } ${className}`}
    >
      {glyph && (
        <span
          className={`flex items-center justify-center rounded-pill bg-gold-soft text-gold-strong ${
            compact ? "h-11 w-11" : "mb-1 h-14 w-14"
          }`}
          aria-hidden
        >
          {glyph}
        </span>
      )}
      <p className={`font-display font-semibold ${compact ? "text-lg" : "text-2xl"}`}>{title}</p>
      {description && <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
