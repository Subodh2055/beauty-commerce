import type { ProductSummary } from "@/lib/api";
import { Reveal } from "@/components/ui/reveal";
import { ProductCard } from "./product-card";

export function ProductGrid({
  products,
  priorityCount = 4,
  emptyMessage = "No products match these filters.",
}: {
  products: ProductSummary[];
  priorityCount?: number;
  emptyMessage?: string;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {products.map((p, i) => (
        // Stagger by column position so rows cascade without long tail delays.
        <Reveal key={p.id} index={i % 4}>
          <ProductCard product={p} priority={i < priorityCount} />
        </Reveal>
      ))}
    </div>
  );
}
