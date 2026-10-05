import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "gold" | "success" | "warning" | "danger" | "solid";

// Every tone pairs a text token with its own soft background (AA-checked in
// scripts/check-contrast.mjs); colour is never the only signal — badges carry text.
const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-foreground",
  accent: "bg-accent-soft text-accent",
  gold: "bg-gold-soft text-gold-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  solid: "bg-primary text-primary-foreground",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-2xs font-semibold tracking-wide whitespace-nowrap uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
