import { useId } from "react";

/**
 * Decorative perfume bottle in the design-system colours (theme-aware via CSS
 * variables). Pure SVG: crisp at any size, no network request, no layout shift.
 */
export function BottleArt({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 320 460" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--surface)", stopOpacity: 0.95 }} />
          <stop offset="0.55" style={{ stopColor: "var(--blush)", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "var(--nude)", stopOpacity: 0.9 }} />
        </linearGradient>
        <linearGradient id={`${id}-liquid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--gold)", stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: "var(--gold)", stopOpacity: 0.85 }} />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--gold-strong)" }} />
          <stop offset="0.45" style={{ stopColor: "var(--gold)" }} />
          <stop offset="1" style={{ stopColor: "var(--gold-strong)" }} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.6" r="0.6">
          <stop offset="0" style={{ stopColor: "var(--gold)", stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: "var(--gold)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      <ellipse cx="160" cy="300" rx="150" ry="150" fill={`url(#${id}-glow)`} />
      {/* cap + collar */}
      <rect x="118" y="20" width="84" height="72" rx="10" fill={`url(#${id}-cap)`} />
      <rect x="132" y="92" width="56" height="26" rx="4" fill="var(--gold-strong)" opacity="0.9" />
      {/* glass body */}
      <rect
        x="48"
        y="118"
        width="224"
        height="312"
        rx="46"
        fill={`url(#${id}-glass)`}
        stroke="var(--border-strong)"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      {/* juice */}
      <rect x="62" y="210" width="196" height="206" rx="34" fill={`url(#${id}-liquid)`} />
      {/* label */}
      <rect x="104" y="250" width="112" height="72" rx="8" fill="var(--surface)" opacity="0.85" />
      <text
        x="160"
        y="296"
        textAnchor="middle"
        fontSize="30"
        fontFamily="var(--font-display)"
        fontWeight="600"
        fill="var(--foreground)"
      >
        B.
      </text>
      {/* highlights */}
      <path d="M78 150 C70 220 70 330 84 400" stroke="var(--surface)" strokeWidth="9" strokeLinecap="round" opacity="0.7" fill="none" />
      <path d="M248 170 C254 230 254 300 246 360" stroke="var(--surface)" strokeWidth="4" strokeLinecap="round" opacity="0.45" fill="none" />
    </svg>
  );
}
