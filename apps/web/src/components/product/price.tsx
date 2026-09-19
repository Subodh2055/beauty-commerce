import { discountPercent, formatMoney } from "@/lib/format";

export function Price({
  amount,
  compareAt,
  currency,
  size = "md",
}: {
  amount: string | number;
  compareAt?: string | number | null;
  currency: string;
  size?: "sm" | "md" | "lg";
}) {
  const pct = discountPercent(amount, compareAt);
  const cls = { sm: "text-sm", md: "text-base", lg: "text-2xl" }[size];
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 ${cls}`}>
      <span className="font-semibold tabular-nums">{formatMoney(amount, currency)}</span>
      {pct !== null && compareAt && (
        <>
          <span className="text-muted line-through tabular-nums">
            {formatMoney(compareAt, currency)}
          </span>
          <span className="text-xs font-semibold text-accent">−{pct}%</span>
        </>
      )}
    </span>
  );
}
