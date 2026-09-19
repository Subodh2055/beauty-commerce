/**
 * Thin typed client for the FastAPI backend.
 *
 * Server Components call the internal Docker hostname (API_INTERNAL_URL);
 * the browser calls the public URL (NEXT_PUBLIC_API_URL).
 * All business logic stays in FastAPI — this file only transports.
 */

const isServer = typeof window === "undefined";

export const API_BASE_URL =
  (isServer ? process.env.API_INTERNAL_URL : undefined) ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api/v1";

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
  request_id: string | null;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.error.message);
    this.name = "ApiRequestError";
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(params?: Query): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function api<T>(
  path: string,
  init: RequestInit & {
    query?: Query;
    next?: { revalidate?: number; tags?: string[] };
  } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const res = await fetch(`${API_BASE_URL}${path}${qs(query)}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
  });

  if (!res.ok) {
    let body: ApiError;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = {
        error: { code: "http_error", message: res.statusText },
        request_id: res.headers.get("x-request-id"),
      };
    }
    throw new ApiRequestError(res.status, body);
  }
  return (await res.json()) as T;
}

/* ---------- Types (mirror apps/api/app/modules/<name>/schemas.py) ---------- */

export interface HealthResponse {
  status: "ok" | "degraded";
  database: boolean | null;
  redis: boolean | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
}

export interface CategoryTree extends Category {
  children: CategoryTree[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  country: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  options: Record<string, string>;
  price: string;
  compare_at_price: string | null;
  stock_quantity: number;
  is_default: boolean;
  sort_order: number;
}

export interface ProductSummary {
  id: string;
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  product_type: string;
  base_price: string;
  compare_at_price: string | null;
  currency: string;
  is_featured: boolean;
  rating_avg: string;
  rating_count: number;
  brand: Brand | null;
  category: Category | null;
  primary_image: ProductImage | null;
  in_stock: boolean;
  tags: string[];
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  tax_rate: string;
  attributes: Record<string, unknown>;
  images: ProductImage[];
  variants: ProductVariant[];
  published_at: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface FacetValue {
  slug: string;
  name: string;
  count: number;
}

export interface ProductFacets {
  categories: FacetValue[];
  brands: FacetValue[];
  product_types: FacetValue[];
  price_min: string | null;
  price_max: string | null;
}

export type SortOption =
  | "newest"
  | "price_asc"
  | "price_desc"
  | "name"
  | "rating"
  | "featured";

export type ProductQuery = {
  q?: string;
  category?: string;
  brand?: string;
  product_type?: string;
  min_price?: string;
  max_price?: string;
  featured?: boolean;
  in_stock?: boolean;
  sort?: SortOption;
  page?: number;
  size?: number;
}

/* ---------- Endpoints ---------- */

const CATALOG_REVALIDATE = 60;

export const getHealth = () =>
  api<HealthResponse>("/health/ready", { cache: "no-store" });

export const getProducts = (query: ProductQuery = {}) =>
  api<Page<ProductSummary>>("/products", {
    query,
    next: { revalidate: CATALOG_REVALIDATE, tags: ["products"] },
  });

export const getProductFacets = (query: ProductQuery = {}) =>
  api<ProductFacets>("/products/facets", {
    query,
    next: { revalidate: CATALOG_REVALIDATE, tags: ["products"] },
  });

export const getProduct = (slug: string) =>
  api<ProductDetail>(`/products/${encodeURIComponent(slug)}`, {
    next: { revalidate: CATALOG_REVALIDATE, tags: ["products", `product:${slug}`] },
  });

export const getRelatedProducts = (slug: string) =>
  api<ProductSummary[]>(`/products/${encodeURIComponent(slug)}/related`, {
    next: { revalidate: CATALOG_REVALIDATE, tags: ["products"] },
  });

export const getCategoryTree = () =>
  api<CategoryTree[]>("/categories", {
    next: { revalidate: CATALOG_REVALIDATE, tags: ["categories"] },
  });

export const getCategory = (slug: string) =>
  api<Category>(`/categories/${encodeURIComponent(slug)}`, {
    next: { revalidate: CATALOG_REVALIDATE, tags: ["categories"] },
  });

export const getBrands = () =>
  api<Brand[]>("/brands", {
    next: { revalidate: CATALOG_REVALIDATE, tags: ["brands"] },
  });

export const getBrand = (slug: string) =>
  api<Brand>(`/brands/${encodeURIComponent(slug)}`, {
    next: { revalidate: CATALOG_REVALIDATE, tags: ["brands"] },
  });
