import {
  getProductFacets,
  getProducts,
  type ProductQuery,
  type SortOption,
} from "@/lib/api";
import { pluralize } from "@/lib/format";
import { Filters } from "./filters";
import { Pagination } from "./pagination";
import { SortSelect } from "./sort-select";
import { ProductGrid } from "@/components/product/product-grid";

export type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 24;
const SORTS: SortOption[] = ["newest", "price_asc", "price_desc", "name", "rating", "featured"];

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Turn URL search params into a validated API query. */
export function parseQuery(sp: SearchParams, fixed: Partial<ProductQuery> = {}): ProductQuery {
  const sort = str(sp.sort) as SortOption | undefined;
  const page = Math.max(1, Number(str(sp.page)) || 1);
  return {
    q: str(sp.q) || undefined,
    category: str(sp.category) || undefined,
    brand: str(sp.brand) || undefined,
    product_type: str(sp.product_type) || undefined,
    min_price: str(sp.min_price) || undefined,
    max_price: str(sp.max_price) || undefined,
    in_stock: str(sp.in_stock) === "true" ? true : undefined,
    featured: str(sp.featured) === "true" ? true : undefined,
    sort: sort && SORTS.includes(sort) ? sort : "newest",
    page,
    size: PAGE_SIZE,
    ...fixed,
  };
}

export async function ProductListing({
  query,
  pathname,
  lock,
}: {
  query: ProductQuery;
  pathname: string;
  lock?: { category?: boolean; brand?: boolean };
}) {
  const [page, facets] = await Promise.all([
    getProducts(query),
    getProductFacets({ ...query, page: undefined, size: undefined }),
  ]);

  const paramsForLinks: Record<string, string | undefined> = {
    q: query.q,
    category: lock?.category ? undefined : query.category,
    brand: lock?.brand ? undefined : query.brand,
    product_type: query.product_type,
    min_price: query.min_price,
    max_price: query.max_price,
    in_stock: query.in_stock ? "true" : undefined,
    featured: query.featured ? "true" : undefined,
    sort: query.sort !== "newest" ? query.sort : undefined,
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <Filters facets={facets} lock={lock} />

      <div>
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted">
            {pluralize(page.total, "product")}
            {query.q ? (
              <>
                {" "}for <span className="font-medium text-foreground">“{query.q}”</span>
              </>
            ) : null}
          </p>
          <SortSelect />
        </div>

        <ProductGrid products={page.items} />

        <Pagination
          page={page.page}
          size={page.size}
          total={page.total}
          pathname={pathname}
          params={paramsForLinks}
        />
      </div>
    </div>
  );
}
