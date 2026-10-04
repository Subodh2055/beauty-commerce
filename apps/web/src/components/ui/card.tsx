import type { ElementType, ReactNode } from "react";

type Padding = "none" | "sm" | "md" | "lg";

const paddings: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

interface CardProps {
  as?: ElementType;
  padding?: Padding;
  /** Soft tinted panel (no border) instead of a white card. */
  tone?: "surface" | "muted" | "blush" | "champagne";
  /** Lifts on hover — for cards that are themselves links. */
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}

const toneClass = {
  surface: "border border-border bg-surface shadow-soft",
  muted: "bg-surface-2",
  blush: "bg-accent-soft",
  champagne: "bg-gold-soft",
};

export function Card({
  as: Tag = "div",
  padding = "md",
  tone = "surface",
  interactive = false,
  className = "",
  children,
}: CardProps) {
  return (
    <Tag
      className={`rounded-card ${toneClass[tone]} ${paddings[padding]} ${
        interactive
          ? "transition-[transform,box-shadow] duration-(--duration-base) ease-luxe hover:-translate-y-0.5 hover:shadow-lift"
          : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-xl font-semibold tracking-display">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
