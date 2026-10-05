import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ApiRequestError,
  getProduct,
  getPublicSettings,
  getRelatedProducts,
  getSimilarScents,
  type ProductDetail,
} from "@/lib/api";
import { formatMoney, titleCase } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { TruckIcon } from "@/components/ui/icons";
import { AddToCart } from "@/components/product/add-to-cart";
import { Accordion, AttributeTable, Ingredients, NotePyramid } from "@/components/product/attributes";
import { Gallery } from "@/components/product/gallery";
import { ProductGrid } from "@/components/product/product-grid";
import { Rating } from "@/components/product/rating";
import { Reviews } from "@/components/product/reviews";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
  const description = p.short_description ?? p.description?.slice(0, 160) ?? undefined;
  return {
    title,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: {
      title,
      description,
      url: `/products/${p.slug}`,
      images: p.images.slice(0, 4).map((i) => ({ url: i.url, alt: i.alt ?? p.name })),
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** schema.org Product + BreadcrumbList. One Offer per size so rich results show the range. */
function structuredData(p: ProductDetail) {
  const url = `${SITE}/products/${p.slug}`;
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: p.name,
    sku: p.sku,
    url,
    description: p.short_description ?? p.description ?? undefined,
    image: p.images.map((i) => i.url),
    brand: p.brand ? { "@type": "Brand", name: p.brand.name } : undefined,
    category: p.category?.name,
    ...(p.notes.top.length + p.notes.heart.length + p.notes.base.length > 0 && {
      additionalProperty: (["top", "heart", "base"] as const)
        .filter((k) => p.notes[k].length > 0)
        .map((k) => ({
          "@type": "PropertyValue",
          name: `${titleCase(k)} notes`,
          value: p.notes[k].map((n) => n.name).join(", "),
        })),
    }),
    offers: p.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      name: v.name,
      url,
      price: Number(v.price).toFixed(2),
      priceCurrency: p.currency,
      itemCondition: "https://schema.org/NewCondition",
      availability: v.stock_quantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: p.vendor?.name ?? "Beauty" },
    })),
    aggregateRating:
      p.rating_count > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: Number(p.rating_avg),
            reviewCount: p.rating_count,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };
  const crumbs = [
    { name: "Home", url: SITE },
    { name: "Products", url: `${SITE}/products` },
    ...(p.category ? [{ name: p.category.name, url: `${SITE}/categories/${p.category.slug}` }] : []),
    { name: p.name, url },
  ];
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  };
  // Escape "<" so product text can never close the script tag.
  return JSON.stringify([product, breadcrumbs]).replace(/</g, "\\u003c");
}

export default async function ProductPage(props: PageProps<"/products/[slug]">) {
  const { slug } = await props.params;
  const product = await loadProduct(slug);
  const isFragrance = product.product_type === "perfume" || !!product.fragrance_family;
  const [related, similar, settings] = await Promise.all([
    getRelatedProducts(slug).catch(() => []),
    isFragrance ? getSimilarScents(slug).catch(() => []) : Promise.resolve([]),
    getPublicSettings().catch(() => null),
  ]);
  const similarSlugs = new Set(similar.map((p) => p.slug));
  const alsoLike = related.filter((p) => !similarSlugs.has(p.slug));

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
          <li className="text-foreground" aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div data-product-media className="lg:sticky lg:top-24 lg:self-start">
          <Gallery images={product.images} name={product.name} slug={product.slug} />
        </div>

        <div className="space-y-8">
          <header className="animate-fade-up space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {product.brand && (
                <Link
                  href={`/brands/${product.brand.slug}`}
                  className="text-2xs font-semibold tracking-eyebrow text-muted uppercase hover:text-accent"
                >
                  {product.brand.name}
                </Link>
              )}
              {product.fragrance_family && (
                <Link href={`/products?family=${product.fragrance_family.slug}`} className="focus-ring rounded-pill">
                  <Badge>{product.fragrance_family.name}</Badge>
                </Link>
              )}
              {product.gender && <Badge>For {product.gender.toLowerCase()}</Badge>}
              {product.is_featured && <Badge tone="gold">Featured</Badge>}
            </div>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-display sm:text-5xl">
              {product.name}
            </h1>
            {product.rating_count > 0 ? (
              <a href="#reviews-heading" className="inline-flex rounded-sm hover:opacity-80">
                <Rating value={product.rating_avg} count={product.rating_count} />
              </a>
            ) : (
              <Rating value={product.rating_avg} count={product.rating_count} />
            )}
            {product.short_description && <p className="leading-relaxed text-muted">{product.short_description}</p>}
            {product.vendor && (
              <p className="text-xs text-muted">
                Sold and shipped by <span className="font-medium text-foreground">{product.vendor.name}</span>
              </p>
            )}
          </header>

          <AddToCart product={product} openDrawerOnAdd sticky />

          {settings && (
            <p className="flex items-start gap-2.5 rounded-card bg-surface-2 p-4 text-sm">
              <TruckIcon width={18} height={18} className="mt-0.5 shrink-0 text-accent" />
              <span>
                Free delivery on orders over{" "}
                <span className="font-semibold">{formatMoney(settings.free_shipping_threshold, product.currency)}</span>
                . Otherwise {formatMoney(settings.shipping_fee, product.currency)}, cash on delivery available.
              </span>
            </p>
          )}

          <NotePyramid notes={product.notes} attributes={product.attributes} />

          <div className="border-t border-border">
            {product.description && (
              <Accordion title="About this product" defaultOpen>
                <p className="whitespace-pre-line">{product.description}</p>
              </Accordion>
            )}
            <Ingredients attributes={product.attributes} />
            <AttributeTable attributes={product.attributes} />
            <Accordion title="Delivery & returns">
              <p>
                Orders inside Kathmandu Valley arrive in 1–2 days, elsewhere in Nepal in 3–5. Unopened items can be
                returned within 7 days; for hygiene, opened fragrance and cosmetics can&apos;t be returned unless they
                arrived damaged.
              </p>
            </Accordion>
          </div>

          {product.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Tags">
              {product.tags.map((t) => (
                <li key={t}>
                  <Link
                    href={`/search?q=${encodeURIComponent(t)}`}
                    className="focus-ring inline-flex h-8 items-center rounded-pill bg-surface-2 px-3 text-xs capitalize hover:bg-border"
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

      {similar.length > 0 && (
        <section className="mt-20" aria-labelledby="similar">
          <p className="eyebrow">Shares notes with {product.name}</p>
          <h2 id="similar" className="mt-2 mb-6 font-display text-3xl font-semibold tracking-display">
            Similar scents
          </h2>
          <ProductGrid products={similar.slice(0, 4)} priorityCount={0} />
        </section>
      )}

      {alsoLike.length > 0 && (
        <section className="mt-20" aria-labelledby="related">
          <h2 id="related" className="mb-6 font-display text-3xl font-semibold tracking-display">
            You may also like
          </h2>
          <ProductGrid products={alsoLike} priorityCount={0} />
        </section>
      )}

      {/* Room for the sticky add-to-bag bar on small screens. */}
      <div className="h-20 lg:hidden" aria-hidden />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData(product) }} />
    </div>
  );
}
