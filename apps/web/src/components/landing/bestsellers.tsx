import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/api";
import { ButtonLink } from "@/components/ui/button";
import { Price } from "@/components/product/price";
import { Rating } from "@/components/product/rating";
import { QuickView } from "./quick-view";

/** Server component: the grid is static HTML; only Quick view hydrates. */
export function Bestsellers({ products }: { products: ProductSummary[] }) {
  return (
    <section aria-labelledby="bestsellers-title" className="container-x py-section lg:py-section-lg">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Most loved</p>
          <h2
            id="bestsellers-title"
            className="mt-3 font-display text-4xl font-semibold tracking-display sm:text-5xl"
          >
            Bestsellers
          </h2>
        </div>
        <ButtonLink href="/products?sort=bestselling" variant="outline">
          Shop all bestsellers
        </ButtonLink>
      </div>

      <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.id}>
            <article className="group">
              <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-surface-2 shadow-soft">
                {p.primary_image && (
                  <Image
                    src={p.primary_image.url}
                    alt={p.primary_image.alt ?? p.name}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                    className="object-cover transition-transform duration-(--duration-slower) ease-luxe group-hover:scale-105"
                  />
                )}
                <QuickView slug={p.slug} name={p.name} />
              </div>
              <div className="mt-3 space-y-1">
                <p className="text-2xs font-semibold tracking-eyebrow text-muted uppercase">
                  {p.brand?.name ?? p.vendor?.name ?? "Beauty"}
                </p>
                <h3 className="font-medium leading-snug">
                  <Link href={`/products/${p.slug}`} className="focus-ring rounded-sm hover:text-accent">
                    {p.name}
                  </Link>
                </h3>
                <div>
                  <Rating value={p.rating_avg} count={p.rating_count} />
                </div>
                <div>
                  <Price amount={p.base_price} compareAt={p.compare_at_price} currency={p.currency} />
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
