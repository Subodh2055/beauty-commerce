import { StarIcon } from "@/components/ui/icons";

export function Rating({
  value,
  count,
  showCount = true,
}: {
  value: string | number;
  count?: number;
  showCount?: boolean;
}) {
  const v = Number(value);
  if (!v) return null;
  const rounded = Math.round(v);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted"
      aria-label={`Rated ${v.toFixed(1)} out of 5${count ? ` by ${count} reviews` : ""}`}
    >
      <span className="flex text-gold" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <StarIcon key={i} width={13} height={13} filled={i < rounded} />
        ))}
      </span>
      <span className="font-medium text-foreground">{v.toFixed(1)}</span>
      {showCount && count ? <span>({count})</span> : null}
    </span>
  );
}
