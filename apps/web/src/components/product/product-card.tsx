import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Price } from "./price";
import { Rating } from "./rating";
import { WishlistButton } from "./wishlist-button";

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductSummary;
  priority?: boolean;
}) {
  const img = product.primary_image;
  const href = `/products/${product.slug}`;

  return (
    <article className="group relative flex flex-col">
      <Link
        href={href}
        className="focus-ring relative block aspect-[4/5] overflow-hidden rounded-2xl bg-surface-2 shadow-soft transition-all duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-lift"
      >
        {img ? (
          <Image
            src={img.url}
            alt={img.alt ?? product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            No image
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {product.compare_at_price && <Badge tone="accent">Sale</Badge>}
          {product.is_featured && <Badge tone="gold">Featured</Badge>}
          {!product.in_stock && <Badge tone="danger">Sold out</Badge>}
        </div>
      </Link>

      <WishlistButton
        className="absolute right-3 top-3 h-9 w-9 bg-surface/90 shadow-sm backdrop-blur"
        item={{
          productId: product.id,
          slug: product.slug,
          name: product.name,
          brand: product.brand?.name ?? null,
          price: product.base_price,
          currency: product.currency,
          imageUrl: img?.url ?? null,
        }}
      />

      <div className="mt-3 flex flex-1 flex-col gap-1">
        {product.brand && (
          <p className="text-xs uppercase tracking-wider text-muted">
            {product.brand.name}
          </p>
        )}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          <Link href={href} className="focus-ring rounded">
            <span className="absolute inset-0" aria-hidden />
            {product.name}
          </Link>
        </h3>
        <Rating value={product.rating_avg} count={product.rating_count} />
        <div className="mt-auto pt-1">
          <Price
            amount={product.base_price}
            compareAt={product.compare_at_price}
            currency={product.currency}
            size="sm"
          />
        </div>
      </div>
    </article>
  );
}
