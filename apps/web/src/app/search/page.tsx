import type { Metadata } from "next";
import { Suspense } from "react";
import { semanticSearch } from "@/lib/api";
import { PageHeader } from "@/components/catalog/page-header";
import { ProductListing, parseQuery, parseView } from "@/components/catalog/product-listing";
import { SearchForm } from "@/components/catalog/search-form";
import { ScoredGrid } from "@/components/recommendations/scored-grid";
import { ListingSkeleton, Skeleton } from "@/components/ui/skeleton";
import { SparkleIcon } from "@/components/ui/icons";

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
        <>
          <Suspense key={`sem:${query.q}`} fallback={<Skeleton className="mb-12 h-72" />}>
            <BestMatches q={query.q} />
          </Suspense>
          <h2 className="mb-4 font-display text-2xl font-semibold">All products matching your words</h2>
          <Suspense key={JSON.stringify(query) + view} fallback={<ListingSkeleton view={view} />}>
            <ProductListing query={query} view={view} pathname="/search" />
          </Suspense>
        </>
      ) : (
        <p className="text-muted">
          Search by name, or describe what you want: “fresh citrus for summer evenings”, “warm vanilla for winter”.
        </p>
      )}
    </div>
  );
}

/** Ranked by meaning (embeddings), so descriptions find scents whose names don't match. */
async function BestMatches({ q }: { q: string }) {
  const res = await semanticSearch(q, 8).catch(() => null);
  if (!res || res.mode !== "semantic" || res.results.length === 0) return null;
  return (
    <section aria-labelledby="best-h" className="mb-14">
      <p className="eyebrow flex items-center gap-1.5">
        <SparkleIcon width={13} height={13} aria-hidden /> Matched by meaning
      </p>
      <h2 id="best-h" className="mt-1 mb-6 font-display text-3xl font-semibold tracking-display">
        Best matches
      </h2>
      <ScoredGrid items={res.results} />
    </section>
  );
}
