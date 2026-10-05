import type { Metadata } from "next";
import { Suspense } from "react";
import { getProductFacets } from "@/lib/api";
import { PageHeader } from "@/components/catalog/page-header";
import { ProductListing, parseQuery, parseView } from "@/components/catalog/product-listing";
import { ListingSkeleton } from "@/components/ui/skeleton";

const BASE_TITLE = "All products";
const BASE_DESCRIPTION = "Browse perfumes, cosmetics, skincare, hair and body care.";

/** Filters that make a landing page worth indexing on their own (one at a time). */
const INDEXABLE = ["category", "brand", "family", "note", "gender", "product_type"] as const;

export async function generateMetadata(props: PageProps<"/products">): Promise<Metadata> {
  const sp = await props.searchParams;
  const query = parseQuery(sp);
  const active = INDEXABLE.filter((k) => query[k]);
  const other = query.q || query.min_price || query.max_price || query.min_rating || query.in_stock;

  // One indexable filter → a real landing page ("Woody perfumes"); any deeper
  // combination, search, sort or paging is noindex with a canonical to its base.
  let title = BASE_TITLE;
  if (active.length === 1) {
    const key = active[0];
    const value = String(query[key]);
    const facets = await getProductFacets({ [key]: value }).catch(() => null);
    const list =
      key === "family" ? facets?.families
      : key === "note" ? facets?.notes
      : key === "brand" ? facets?.brands
      : key === "category" ? facets?.categories
      : key === "product_type" ? facets?.product_types
      : facets?.genders;
    const name = list?.find((f) => f.slug === value)?.name ?? value.replace(/-/g, " ");
    title =
      key === "note" ? `Fragrances with ${name}`
      : key === "gender" ? `For ${name.toLowerCase()}`
      : key === "family" ? `${name} fragrances`
      : name;
  }
  const canonical =
    active.length === 1 ? `/products?${active[0]}=${encodeURIComponent(String(query[active[0]]))}` : "/products";
  const indexable = active.length <= 1 && !other && (query.page ?? 1) === 1 && query.sort === "newest";

  return {
    title,
    description: active.length === 1 ? `${title} — shop the edit at Beauty. ${BASE_DESCRIPTION}` : BASE_DESCRIPTION,
    alternates: { canonical },
    robots: indexable ? undefined : { index: false, follow: true },
  };
}

export default async function ProductsPage(props: PageProps<"/products">) {
  const sp = await props.searchParams;
  const query = parseQuery(sp);
  const view = parseView(sp);

  return (
    <div className="container-x py-10">
      <PageHeader
        title="All products"
        description="Every perfume, serum, lipstick and balm we carry."
        crumbs={[{ href: "/products", label: "Products" }]}
      />
      <Suspense key={JSON.stringify(query) + view} fallback={<ListingSkeleton view={view} />}>
        <ProductListing query={query} view={view} pathname="/products" />
      </Suspense>
    </div>
  );
}
