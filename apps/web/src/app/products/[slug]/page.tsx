import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiRequestError, getProduct, getRelatedProducts } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { AddToCart } from "@/components/product/add-to-cart";
import { AttributeTable, NotePyramid } from "@/components/product/attributes";
import { Gallery } from "@/components/product/gallery";
import { ProductGrid } from "@/components/product/product-grid";
import { Rating } from "@/components/product/rating";
import { Reviews } from "@/components/product/reviews";

async function loadProduct(slug: string) {
  try {
    return await getProduct(slug);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata(props: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const p = await loadProduct(slug);
  const title = p.brand ? `${p.name} — ${p.brand.name}` : p.name;
  return {
    title,
    description: p.short_description ?? undefined,
    openGraph: {
      title,
      description: p.short_description ?? undefined,
      images: p.primary_image ? [{ url: p.primary_image.url }] : undefined,
      type: "website",
    },
  };
}

export default async function ProductPage(props: PageProps<"/products/[slug]">) {
  const { slug } = await props.params;
  const product = await loadProduct(slug);
  const related = await getRelatedProducts(slug).catch(() => []);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.short_description ?? product.description ?? undefined,
    image: product.images.map((i) => i.url),
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: product.currency,
      lowPrice: Math.min(...product.variants.map((v) => Number(v.price))),
      highPrice: Math.max(...product.variants.map((v) => Number(v.price))),
      offerCount: product.variants.length,
      availability: product.in_stock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
    aggregateRating:
      product.rating_count > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: Number(product.rating_avg),
            reviewCount: product.rating_count,
          }
        : undefined,
  };

  return (
    <div className="container-x py-8 lg:py-12">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/" className="hover:text-foreground">Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/products" className="hover:text-foreground">Products</Link></li>
          {product.category && (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link href={`/categories/${product.category.slug}`} className="hover:text-foreground">
                  {product.category.name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden>/</li>
          <li className="text-foreground">{product.name}</li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="animate-fade-up">
          <Gallery images={product.images} name={product.name} />
        </div>

        <div className="space-y-8 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {product.brand && (
                <Link
                  href={`/brands/${product.brand.slug}`}
                  className="text-xs font-medium uppercase tracking-wider text-muted hover:text-accent"
                >
                  {product.brand.name}
                </Link>
              )}
              <Badge>{titleCase(product.product_type)}</Badge>
              {product.is_featured && <Badge tone="gold">Featured</Badge>}
            </div>
            <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {product.name}
            </h1>
            <Rating value={product.rating_avg} count={product.rating_count} />
            {product.short_description && (
              <p className="text-muted">{product.short_description}</p>
            )}
          </header>

          <AddToCart product={product} />

          {product.description && (
            <section aria-labelledby="desc" className="space-y-2">
              <h2 id="desc" className="font-serif text-lg font-semibold">About</h2>
              <p className="text-sm leading-relaxed text-muted">{product.description}</p>
            </section>
          )}

          <NotePyramid attributes={product.attributes} />
          <AttributeTable attributes={product.attributes} />

          {product.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Tags">
              {product.tags.map((t) => (
                <li key={t}>
                  <Link
                    href={`/search?q=${encodeURIComponent(t)}`}
                    className="focus-ring rounded-full bg-surface-2 px-3 py-1 text-xs capitalize hover:bg-border"
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Reviews slug={product.slug} />

      {related.length > 0 && (
        <section className="mt-20" aria-labelledby="related">
          <h2 id="related" className="mb-6 font-serif text-2xl font-semibold">
            You may also like
          </h2>
          <ProductGrid products={related} priorityCount={0} />
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
