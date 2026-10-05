import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { Price } from "./price";
import { Rating } from "./rating";
import { WishlistButton } from "./wishlist-button";

/** List layout for the shop: denser rows with the description and scent facts. */
export function ProductList({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) {
    return <EmptyState title="No matches" description="No products match these filters." />;
  }
  return (
    <ul className="divide-y divide-border border-y border-border">
      {products.map((p, i) => (
        <li key={p.id}>
          <Reveal index={Math.min(i, 3)}>
            <ProductRow product={p} priority={i < 2} />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

function ProductRow({ product: p, priority }: { product: ProductSummary; priority: boolean }) {
  const href = `/products/${p.slug}`;
  const facts = [
    p.fragrance_family?.name,
    p.gender ? `For ${p.gender.toLowerCase()}` : null,
    p.category?.name ?? titleCase(p.product_type),
  ].filter(Boolean) as string[];

  return (
    <article className="group relative flex gap-4 py-5 sm:gap-6">
      <Link
        href={href}
        className="focus-ring relative block aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-card bg-surface-2 sm:w-36"
        tabIndex={-1}
        aria-hidden
      >
        {p.primary_image && (
          <Image
            src={p.primary_image.url}
            alt=""
            fill
            sizes="144px"
            preload={priority}
            className="object-cover transition-transform duration-(--duration-slower) ease-standard group-hover:scale-105"
          />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {p.brand && (
              <p className="text-2xs font-semibold tracking-eyebrow text-muted uppercase">{p.brand.name}</p>
            )}
            <h3 className="font-display text-xl font-semibold leading-tight sm:text-2xl">
              <Link href={href} className="focus-ring rounded-sm hover:text-accent">
                {p.name}
              </Link>
            </h3>
          </div>
          <WishlistButton
            className="h-10 w-10 shrink-0 border border-border hover:bg-surface-2"
            size={18}
            item={{
              productId: p.id,
              slug: p.slug,
              name: p.name,
              brand: p.brand?.name ?? null,
              price: p.base_price,
              currency: p.currency,
              imageUrl: p.primary_image?.url ?? null,
            }}
          />
        </div>

        {p.short_description && (
          <p className="line-clamp-2 max-w-prose text-sm leading-relaxed text-muted">{p.short_description}</p>
        )}

        {facts.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="About this product">
            {facts.map((f) => (
              <li key={f}>
                <Badge>{f}</Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-2">
          <div>
            <Rating value={p.rating_avg} count={p.rating_count} />
          </div>
          <div className="flex items-center gap-3">
            {!p.in_stock && <Badge tone="danger">Sold out</Badge>}
            <Price amount={p.base_price} compareAt={p.compare_at_price} currency={p.currency} />
          </div>
        </div>
      </div>
    </article>
  );
}
