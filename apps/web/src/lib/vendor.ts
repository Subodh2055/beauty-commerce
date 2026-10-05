"use client";

/**
 * Vendor portal client. Every call goes through authFetch (bearer token,
 * refresh on 401). The API scopes each /vendor/* query to the caller's own
 * vendor, so nothing here passes a vendor id — the server decides whose data it is.
 * Types mirror apps/api/app/modules/vendors/schemas.py and friends.
 */

import { useMemo } from "react";
import { useAuth } from "./auth";

export type VendorStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type ProductStatus = "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
export type VendorOrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export interface Vendor {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  contact_email: string;
  contact_phone: string | null;
  business_registration_no: string | null;
  tax_id: string | null;
  payout_details: string | null;
  status: VendorStatus;
  status_reason: string | null;
  reviewed_at: string | null;
  commission_rate: string | null;
  created_at: string;
}

export interface VendorApplyInput {
  name: string;
  description?: string | null;
  logo_url?: string | null;
  contact_email: string;
  contact_phone?: string | null;
  business_registration_no?: string | null;
  tax_id?: string | null;
  payout_details?: string | null;
}

export type VendorUpdateInput = Partial<
  Pick<Vendor, "description" | "logo_url" | "contact_email" | "contact_phone" | "payout_details">
>;

export interface EarningsSummary {
  ready_for_payout: string;
  in_progress: string;
  in_pending_payouts: string;
  paid_out: string;
}

export interface VendorSummary {
  vendor: Vendor;
  products_by_status: Partial<Record<ProductStatus, number>>;
  orders_to_ship: number;
  earnings: EarningsSummary;
}

export interface SalesPoint {
  date: string;
  revenue: string;
  earnings: string;
  orders: number;
  units: number;
}

export interface SalesTotals {
  revenue: string;
  earnings: string;
  orders: number;
  units: number;
  avg_order_value: string;
}

export interface VendorAnalytics {
  days: number;
  currency: string;
  series: SalesPoint[];
  totals: SalesTotals;
  previous: SalesTotals;
  top_products: {
    product_id: string;
    name: string;
    slug: string | null;
    image_url: string | null;
    units: number;
    revenue: string;
  }[];
  low_stock: {
    variant_id: string;
    product_id: string;
    product_name: string;
    variant_name: string;
    sku: string;
    stock_quantity: number;
  }[];
  low_stock_threshold: number;
}

export interface VendorProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  status: ProductStatus;
  rejection_reason: string | null;
  base_price: string;
  currency: string;
  total_stock: number;
  variant_count: number;
  product_type: string | null;
  image_url: string | null;
  updated_at: string;
}

export type ProductSort =
  | "updated"
  | "updated_asc"
  | "name"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "stock_asc"
  | "stock_desc";

export interface VariantWrite {
  id?: string | null;
  name: string;
  sku?: string | null;
  options?: Record<string, string>;
  size_ml?: number | null;
  price: number;
  compare_at_price?: number | null;
  stock_quantity: number;
  is_default: boolean;
  sort_order: number;
}

export interface ImageWrite {
  id?: string | null;
  url: string;
  alt?: string | null;
  is_primary: boolean;
  sort_order: number;
}

export type NotePosition = "TOP" | "HEART" | "BASE";

export interface ProductWrite {
  sku: string;
  name: string;
  slug?: string | null;
  short_description?: string | null;
  description?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  product_type: string;
  brand_id?: string | null;
  category_id?: string | null;
  gender?: "WOMEN" | "MEN" | "UNISEX" | null;
  fragrance_family_id?: string | null;
  notes: { note_id: string; position: NotePosition }[];
  base_price: number;
  compare_at_price?: number | null;
  attributes?: Record<string, unknown>;
  tags: string[];
  variants: VariantWrite[];
  images: ImageWrite[];
}

export interface VendorProductDetail {
  id: string;
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  product_type: string;
  brand_id: string | null;
  category_id: string | null;
  gender: string | null;
  fragrance_family_id: string | null;
  notes: { note_id: string; position: NotePosition; name?: string; slug?: string }[];
  base_price: string;
  compare_at_price: string | null;
  currency: string;
  status: ProductStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  attributes: Record<string, unknown>;
  tags: string[];
  variants: {
    id: string;
    sku: string;
    name: string;
    size_ml: string | null;
    price: string;
    compare_at_price: string | null;
    stock_quantity: number;
    is_default: boolean;
    sort_order: number;
  }[];
  images: { id: string; url: string; alt: string | null; is_primary: boolean; sort_order: number }[];
}

export interface BulkResult {
  done: string[];
  failed: { id: string; reason: string }[];
}

export interface InventoryRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_status: ProductStatus;
  variant_name: string;
  sku: string;
  size_ml: string | null;
  price: string;
  stock_quantity: number;
  low: boolean;
}

export interface VendorOrderItem {
  product_name: string;
  variant_name: string;
  sku: string;
  image_url: string | null;
  slug: string | null;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface VendorOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: VendorOrderStatus;
  payment_status: string;
  subtotal: string;
  commission_rate: string | null;
  commission_amount: string;
  vendor_earnings: string;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  paid_out: boolean;
  items: VendorOrderItem[];
  ship_recipient: string;
  ship_phone: string;
  ship_line1: string;
  ship_line2: string | null;
  ship_city: string;
  ship_state: string | null;
  ship_postal_code: string | null;
  ship_country: string;
}

export interface Payout {
  id: string;
  vendor_id: string;
  status: "PENDING" | "PAID" | "CANCELLED";
  currency: string;
  gross_amount: string;
  commission_amount: string;
  net_amount: string;
  order_count: number;
  paid_at: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
}

export interface PayoutDetail extends Payout {
  lines: {
    vendor_order_id: string;
    order_number: string;
    delivered_at: string | null;
    subtotal: string;
    commission_rate: string | null;
    commission_amount: string;
    vendor_earnings: string;
  }[];
}

export interface VendorReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  author: string;
  is_verified_purchase: boolean;
  created_at: string;
  product: { name: string; slug: string };
}

export interface VendorReviewList {
  items: VendorReview[];
  total: number;
  page: number;
  size: number;
  average: string;
  count: number;
  stars: Record<string, number>;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface MediaAsset {
  id: string;
  url: string;
  filename: string;
  status: string;
  width: number | null;
  height: number | null;
  renditions: Record<string, string>;
}

/** An API error with the server's message and (for 422) per-field details. */
export class VendorApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function read<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { message?: string; details?: unknown } }).error ?? {};
    const fields: Record<string, string> = {};
    if (Array.isArray(err.details)) {
      for (const d of err.details as { loc?: (string | number)[]; msg?: string }[]) {
        const key = (d.loc ?? []).filter((p) => p !== "body").join(".");
        if (key && d.msg) fields[key] = d.msg.replace(/^Value error, /, "");
      }
    }
    throw new VendorApiError(res.status, err.message ?? "Request failed", fields);
  }
  return data as T;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function useVendorApi() {
  const { authFetch } = useAuth();
  return useMemo(() => {
    const get = <T,>(path: string) => authFetch(path).then((r) => read<T>(r));
    const send = <T,>(path: string, method: string, body?: unknown) =>
      authFetch(path, body === undefined ? { method } : json(method, body)).then((r) => read<T>(r));
    return {
      // Application (any signed-in user)
      me: () => get<Vendor>("/vendors/me"),
      apply: (body: VendorApplyInput) => send<Vendor>("/vendors/apply", "POST", body),
      updateMe: (body: VendorUpdateInput) => send<Vendor>("/vendors/me", "PATCH", body),

      // Portal
      summary: () => get<VendorSummary>("/vendor/summary"),
      analytics: (days = 30) => get<VendorAnalytics>(`/vendor/analytics${qs({ days })}`),
      products: (p: { q?: string; status?: string; sort?: ProductSort; page?: number; size?: number }) =>
        get<Page<VendorProductRow>>(`/vendor/products${qs(p)}`),
      product: (id: string) => get<VendorProductDetail>(`/vendor/products/${id}`),
      createProduct: (body: ProductWrite) => send<VendorProductDetail>("/vendor/products", "POST", body),
      updateProduct: (id: string, body: ProductWrite) =>
        send<VendorProductDetail>(`/vendor/products/${id}`, "PUT", body),
      submitProduct: (id: string) => send<VendorProductDetail>(`/vendor/products/${id}/submit`, "POST"),
      archiveProduct: (id: string) => send<VendorProductDetail>(`/vendor/products/${id}/archive`, "POST"),
      deleteProduct: (id: string) => send<void>(`/vendor/products/${id}`, "DELETE"),
      bulk: (action: "submit" | "archive" | "delete", ids: string[]) =>
        send<BulkResult>("/vendor/products/bulk", "POST", { action, product_ids: ids }),
      upload: (file: File) => {
        const fd = new FormData();
        fd.append("file", file);
        return authFetch("/vendor/uploads", { method: "POST", body: fd }).then((r) => read<MediaAsset>(r));
      },
      inventory: (p: { q?: string; low_only?: boolean; page?: number; size?: number }) =>
        get<Page<InventoryRow>>(`/vendor/inventory${qs(p)}`),
      setStock: (variantId: string, stock: number, note?: string) =>
        send<{ variant_id: string; sku: string; stock_quantity: number }>(
          `/vendor/variants/${variantId}/stock`,
          "PUT",
          { stock_quantity: stock, note: note ?? null },
        ),
      orders: (p: { status?: string; page?: number; size?: number }) =>
        get<Page<VendorOrder>>(`/vendor/orders${qs(p)}`),
      order: (id: string) => get<VendorOrder>(`/vendor/orders/${id}`),
      setOrderStatus: (id: string, status: VendorOrderStatus, tracking_number?: string) =>
        send<VendorOrder>(`/vendor/orders/${id}/status`, "PATCH", {
          status,
          tracking_number: tracking_number || null,
        }),
      payouts: (page = 1) => get<Page<Payout>>(`/vendor/payouts${qs({ page, size: 50 })}`),
      payout: (id: string) => get<PayoutDetail>(`/vendor/payouts/${id}`),
      reviews: (p: { rating?: number; page?: number; size?: number }) =>
        get<VendorReviewList>(`/vendor/reviews${qs(p)}`),
    };
  }, [authFetch]);
}
