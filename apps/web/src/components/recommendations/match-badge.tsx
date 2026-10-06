import { Badge, type BadgeTone } from "@/components/ui/badge";

/**
 * "92% match". The words carry the meaning; the tone (gold for strong, rose for
 * good, neutral otherwise) and the small dial are extra cues, never the only one.
 */
export function MatchBadge({ match, size = "sm" }: { match: number; size?: "sm" | "lg" }) {
  const tone: BadgeTone = match >= 80 ? "gold" : match >= 60 ? "accent" : "neutral";
  if (size === "lg") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="sr-only">{match}% match</span>
        <Dial value={match} />
        <span className="font-display text-2xl font-semibold tabular-nums" aria-hidden>
          {match}%
        </span>
        <span className="text-xs text-muted" aria-hidden>
          match
        </span>
      </span>
    );
  }
  return (
    <Badge tone={tone} className="normal-case tracking-normal">
      <Dial value={match} small />
      {match}% match
    </Badge>
  );
}

function Dial({ value, small = false }: { value: number; small?: boolean }) {
  const r = small ? 5 : 15;
  const c = 2 * Math.PI * r;
  const size = (r + (small ? 2 : 3)) * 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={small ? 2 : 3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={small ? 2 : 3}
        strokeLinecap="round"
        strokeDasharray={`${(c * Math.max(0, Math.min(100, value))) / 100} ${c}`}
        className={small ? "" : "text-gold"}
      />
    </svg>
  );
}
