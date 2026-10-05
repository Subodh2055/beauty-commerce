import {
  getProductFacets,
  getProducts,
  type ProductFacets,
  type ProductQuery,
  type SortOption,
} from "@/lib/api";
import { pluralize } from "@/lib/format";
import { ActiveFilters, type ActiveFilter } from "./active-filters";
import { Filters } from "./filters";
import { Pagination } from "./pagination";
import { SortSelect } from "./sort-select";
import { ViewToggle, type ListingView } from "./view-toggle";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductList } from "@/components/product/product-list";

export type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 24;
const SORTS: SortOption[] = [
  "newest",
  "price_asc",
  "price_desc",
  "name",
  "rating",
  "featured",
  "bestselling",
];
const GENDERS = ["WOMEN", "MEN", "UNISEX"] as const;
const RATINGS = [3, 4];

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Turn URL search params into a validated API query. */
export function parseQuery(sp: SearchParams, fixed: Partial<ProductQuery> = {}): ProductQuery {
  const sort = str(sp.sort) as SortOption | undefined;
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const rating = Number(str(sp.min_rating));
  return {
    q: str(sp.q) || undefined,
    category: str(sp.category) || undefined,
    brand: str(sp.brand) || undefined,
    product_type: str(sp.product_type) || undefined,
    // Fragrance finder filters (notes pyramid, collections, filter sidebar).
    vendor: str(sp.vendor) || undefined,
    family: str(sp.family) || undefined,
    note: str(sp.note) || undefined,
    gender: GENDERS.find((g) => g === str(sp.gender)),
    min_price: str(sp.min_price) || undefined,
    max_price: str(sp.max_price) || undefined,
    min_rating: RATINGS.includes(rating) ? rating : undefined,
    in_stock: str(sp.in_stock) === "true" ? true : undefined,
    featured: str(sp.featured) === "true" ? true : undefined,
    sort: sort && SORTS.includes(sort) ? sort : "newest",
    page,
    size: PAGE_SIZE,
    ...fixed,
  };
}

export function parseView(sp: SearchParams): ListingView {
  return str(sp.view) === "list" ? "list" : "grid";
}

/** The query as URL params (what the page was asked for), minus route-fixed facets. */
function toParams(
  query: ProductQuery,
  view: ListingView,
  lock: { category?: boolean; brand?: boolean },
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === false || k === "page" || k === "size") continue;
    out[k] = String(v);
  }
  if (lock.category) delete out.category;
  if (lock.brand) delete out.brand;
  if (out.sort === "newest") delete out.sort;
  if (view === "list") out.view = "list";
  return out;
}

function nameOf(list: { slug: string; name: string }[], slug: string): string {
  return list.find((f) => f.slug === slug)?.name ?? slug.replace(/-/g, " ");
}

/** Chips for every active filter, each with the params that drop just it. */
function activeFilters(
  params: Record<string, string | undefined>,
  facets: ProductFacets,
): ActiveFilter[] {
  const labels: Record<string, (v: string) => string> = {
    q: (v) => `“${v}”`,
    category: (v) => nameOf(facets.categories, v),
    brand: (v) => nameOf(facets.brands, v),
    product_type: (v) => nameOf(facets.product_types, v),
    family: (v) => nameOf(facets.families, v),
    note: (v) => `Note: ${nameOf(facets.notes, v)}`,
    gender: (v) => `For ${v.toLowerCase()}`,
    vendor: (v) => `Seller: ${v.replace(/-/g, " ")}`,
    min_price: (v) => `From NPR ${Number(v).toLocaleString("en-IN")}`,
    max_price: (v) => `Up to NPR ${Number(v).toLocaleString("en-IN")}`,
    min_rating: (v) => `${v}★ & up`,
    in_stock: () => "In stock",
    featured: () => "Featured",
  };
  return Object.entries(params)
    .filter(([k, v]) => v && labels[k])
    .map(([k, v]) => ({
      key: k,
      label: labels[k](v!),
      params: Object.fromEntries(Object.entries(params).filter(([kk]) => kk !== k)),
    }));
}

export async function ProductListing({
  query,
  pathname,
  view = "grid",
  lock = {},
}: {
  query: ProductQuery;
  pathname: string;
  view?: ListingView;
  lock?: { category?: boolean; brand?: boolean };
}) {
  const [page, facets] = await Promise.all([
    getProducts(query),
    getProductFacets({ ...query, page: undefined, size: undefined }),
  ]);
  const params = toParams(query, view, lock);
  const chips = activeFilters(params, facets);

  return (
    <div className="grid gap-8 lg:grid-cols-[248px_1fr]">
      <Filters facets={facets} lock={lock} activeCount={chips.length} />

      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {pluralize(page.total, "product")}
            {query.q ? (
              <>
                {" "}for <span className="font-medium text-foreground">“{query.q}”</span>
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <ViewToggle pathname={pathname} params={params} view={view} />
            <SortSelect />
          </div>
        </div>

        <ActiveFilters pathname={pathname} chips={chips} params={params} />

        {/* Cards use h3; keep the outline h1 → h2 → h3 for screen readers. */}
        <h2 className="sr-only">Results</h2>

        {view === "list" ? (
          <ProductList products={page.items} />
        ) : (
          <ProductGrid products={page.items} morph />
        )}

        <Pagination
          page={page.page}
          size={page.size}
          total={page.total}
          pathname={pathname}
          params={params}
        />
      </div>
    </div>
  );
}
