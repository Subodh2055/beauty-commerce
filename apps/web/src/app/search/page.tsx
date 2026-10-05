import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/catalog/page-header";
import { ProductListing, parseQuery, parseView } from "@/components/catalog/product-listing";
import { SearchForm } from "@/components/catalog/search-form";
import { ListingSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = await props.searchParams;
  const query = parseQuery(sp);
  const view = parseView(sp);

  return (
    <div className="container-x py-10">
      <PageHeader
        title={query.q ? <>Results for “{query.q}”</> : "Search"}
        crumbs={[{ href: "/search", label: "Search" }]}
      />
      <SearchForm initial={query.q ?? ""} />
      {query.q ? (
        <Suspense key={JSON.stringify(query) + view} fallback={<ListingSkeleton view={view} />}>
          <ProductListing query={query} view={view} pathname="/search" />
        </Suspense>
      ) : (
        <p className="text-muted">Try “oud”, “serum”, “matte” or a brand name.</p>
      )}
    </div>
  );
}
