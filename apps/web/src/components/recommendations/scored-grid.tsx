import type { ScoredProduct } from "@/lib/api";
import { ProductCard } from "@/components/product/product-card";
import { Reveal } from "@/components/ui/reveal";
import { MatchBadge } from "./match-badge";

/**
 * Product cards with their match % and the top reason underneath. When
 * `showMatch` is false (keyword fallback, popular picks) the cards stand alone.
 */
export function ScoredGrid({
  items,
  showMatch = true,
  columns = 4,
}: {
  items: ScoredProduct[];
  showMatch?: boolean;
  columns?: 3 | 4;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 ${columns === 4 ? "lg:grid-cols-4" : ""}`}
    >
      {items.map((s, i) => (
        <Reveal key={s.product.id} index={i % columns}>
          <div className="flex h-full flex-col gap-2">
            <ProductCard product={s.product} />
            {showMatch && s.match > 0 && (
              <div className="flex flex-col items-start gap-1">
                <MatchBadge match={s.match} />
                {s.reasons[0] && <p className="text-xs text-muted">{s.reasons[0]}</p>}
              </div>
            )}
          </div>
        </Reveal>
      ))}
    </div>
  );
}
