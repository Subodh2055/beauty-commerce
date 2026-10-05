import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * primary   — deep ink (champagne in dark): the main action on a screen
 * accent    — rose: promotional / secondary emphasis
 * secondary — nude fill: quiet actions next to a primary
 * outline   — hairline: tertiary actions, toolbars
 * ghost     — text-only: icon buttons, inline actions
 * danger    — destructive
 * platform  — violet: super-admin-only actions (pair with ShieldIcon); never
 *             used for everyday admin work, so platform-wide changes stand out
 */
type Variant = "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger" | "platform";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-medium whitespace-nowrap focus-ring select-none " +
  "transition-[transform,background-color,border-color,box-shadow,opacity] duration-(--duration-fast) ease-standard " +
  "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:duration-(--duration-instant) " +
  "disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover hover:shadow-lift",
  accent: "bg-accent text-accent-foreground shadow-soft hover:bg-accent-hover hover:shadow-lift",
  secondary: "bg-surface-2 text-foreground hover:bg-nude",
  outline: "border border-border-strong bg-transparent text-foreground hover:border-foreground hover:bg-surface-2",
  ghost: "bg-transparent text-foreground hover:bg-surface-2 hover:translate-y-0",
  danger: "bg-danger text-danger-foreground shadow-soft hover:opacity-90",
  platform: "bg-platform text-platform-foreground shadow-soft hover:opacity-90 hover:shadow-lift",
};

// sm stays ≥36px tall for dense admin toolbars; md/lg/icon meet the 44px target.
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-12 px-8 text-base",
  icon: "h-11 w-11 p-0",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

function Spinner() {
  return (
    <svg
      className="animate-spin-slow"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

interface ButtonLinkProps {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
