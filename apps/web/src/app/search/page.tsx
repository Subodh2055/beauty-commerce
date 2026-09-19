import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/catalog/page-header";
import { ProductListing, parseQuery } from "@/components/catalog/product-listing";
import { SearchForm } from "@/components/catalog/search-form";
import { ProductGridSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = await props.searchParams;
  const query = parseQuery(sp);

  return (
    <div className="container-x py-10">
      <PageHeader
        title={query.q ? <>Results for “{query.q}”</> : "Search"}
        crumbs={[{ href: "/search", label: "Search" }]}
      />
      <SearchForm initial={query.q ?? ""} />
      {query.q ? (
        <Suspense key={JSON.stringify(query)} fallback={<ProductGridSkeleton />}>
          <ProductListing query={query} pathname="/search" />
        </Suspense>
      ) : (
        <p className="text-muted">Try “oud”, “serum”, “matte” or a brand name.</p>
      )}
    </div>
  );
}
