import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "gold" | "success" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-foreground",
  accent: "bg-accent text-accent-foreground",
  gold: "bg-gold/15 text-gold",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
