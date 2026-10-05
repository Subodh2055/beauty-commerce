import type { ProductSummary } from "@/lib/api";
import { Reveal } from "@/components/ui/reveal";
import { ProductCard } from "./product-card";
import { EmptyState } from "@/components/ui/empty-state";

export function ProductGrid({
  products,
  priorityCount = 4,
  emptyMessage = "No products match these filters.",
  morph = false,
}: {
  products: ProductSummary[];
  priorityCount?: number;
  emptyMessage?: string;
  /** Name card images so they morph into the product page gallery. Only on
   * pages where each product appears once (view transition names are unique). */
  morph?: boolean;
}) {
  if (products.length === 0) {
    return (
      <EmptyState title="No matches" description={emptyMessage} />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {products.map((p, i) => (
        // Stagger by column position so rows cascade without long tail delays.
        <Reveal key={p.id} index={i % 4}>
          <ProductCard product={p} priority={i < priorityCount} morph={morph} />
        </Reveal>
      ))}
    </div>
  );
}
