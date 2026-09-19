"use client";

/**
 * Client-side auth: talks directly to the FastAPI auth endpoints from the
 * browser, keeps the token pair in localStorage, and transparently refreshes
 * the access token on a 401.
 *
 * Implemented as an external store (useSyncExternalStore) so the server
 * snapshot is empty and the client hydrates from storage without a
 * setState-in-effect, and so it syncs across tabs.
 *
 * V1 tradeoff: tokens live in localStorage (like the cart) for simplicity.
 * Phase 8 hardening moves refresh tokens to httpOnly cookies. Secrets and
 * business logic stay on the server; this only transports.
 */

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const KEY = "beauty-commerce:auth:v1";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  is_email_verified: boolean;
  roles: string[];
}

export const ADMIN_ROLES = ["STAFF", "ADMIN", "SUPER_ADMIN"];

export function isAdmin(user: Pick<AuthUser, "roles"> | null | undefined): boolean {
  return !!user && user.roles.some((r) => ADMIN_ROLES.includes(r));
}

/** Where a user should land after signing in, based on role. */
export function roleLanding(user: AuthUser | null | undefined): string {
  return isAdmin(user) ? "/admin" : "/account";
}

interface Tokens {
  access_token: string;
  refresh_token: string;
}

interface Stored extends Tokens {
  user: AuthUser;
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/* ---------- external store ---------- */

interface Snapshot {
  session: Stored | null;
  ready: boolean;
}

const SERVER_SNAPSHOT: Snapshot = { session: null, ready: false };
let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

function readStorage(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function getSnapshot(): Snapshot {
  if (snapshot === null) snapshot = { session: readStorage(), ready: true };
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return SERVER_SNAPSHOT;
}

function setSession(session: Stored | null) {
  snapshot = { session, ready: true };
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = { session: readStorage(), ready: true };
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/* ---------- HTTP ---------- */

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new AuthError(e.code ?? "error", e.message ?? "Request failed");
  }
  return data as T;
}

/* ---------- actions ---------- */

const actions = {
  async register(email: string, password: string, fullName?: string) {
    const r = await post<{ user: AuthUser; tokens: Tokens }>("/auth/register", {
      email,
      password,
      full_name: fullName || null,
    });
    setSession({ user: r.user, ...r.tokens });
  },
  async login(email: string, password: string): Promise<AuthUser> {
    const r = await post<{ user: AuthUser; tokens: Tokens }>("/auth/login", { email, password });
    setSession({ user: r.user, ...r.tokens });
    return r.user;
  },
  async logout() {
    const s = getSnapshot().session;
    if (s) {
      try {
        await post("/auth/logout", { refresh_token: s.refresh_token });
      } catch {
        /* best-effort revoke */
      }
    }
    setSession(null);
  },
  async requestPasswordReset(email: string): Promise<string> {
    const r = await post<{ message: string }>("/auth/password/reset-request", { email });
    return r.message;
  },
  async resendVerification(): Promise<string> {
    const s = getSnapshot().session;
    const r = await post<{ message: string }>("/auth/resend-verification", {}, s?.access_token);
    return r.message;
  },
  async verifyEmail(token: string): Promise<string> {
    const r = await post<{ message: string }>("/auth/verify-email", { token });
    return r.message;
  },
  /** Authenticated fetch that refreshes the access token once on 401. */
  async authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const s = getSnapshot().session;
    const withAuth = (token: string): RequestInit => ({
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });

    let res = await fetch(`${API}${path}`, s ? withAuth(s.access_token) : init);
    if (res.status !== 401 || !s) return res;

    try {
      const t = await post<Tokens>("/auth/refresh", { refresh_token: s.refresh_token });
      const next = { ...s, ...t };
      setSession(next);
      res = await fetch(`${API}${path}`, withAuth(next.access_token));
    } catch {
      setSession(null);
    }
    return res;
  },
};

/* ---------- React binding ---------- */

export interface AuthApi {
  user: AuthUser | null;
  ready: boolean;
  register: typeof actions.register;
  login: typeof actions.login;
  logout: typeof actions.logout;
  requestPasswordReset: typeof actions.requestPasswordReset;
  resendVerification: typeof actions.resendVerification;
  verifyEmail: typeof actions.verifyEmail;
  authFetch: typeof actions.authFetch;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<AuthApi>(
    () => ({
      user: state.session?.user ?? null,
      ready: state.ready,
      ...actions,
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/* ---------- Orders (authenticated) ---------- */

export interface ShippingAddress {
  recipient_name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
}

export interface CheckoutItem {
  variant_id: string;
  quantity: number;
}

export interface OrderItem {
  product_name: string;
  variant_name: string;
  sku: string;
  image_url: string | null;
  slug: string | null;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface OrderStatusEvent {
  status: string;
  note: string | null;
  created_at: string;
}

export interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  subtotal: string;
  shipping_fee: string;
  tax_total: string;
  discount_total: string;
  total: string;
  currency: string;
  payment_method: string;
  payment_status: string;
  ship_recipient: string;
  ship_phone: string;
  ship_line1: string;
  ship_line2: string | null;
  ship_city: string;
  ship_state: string | null;
  ship_postal_code: string | null;
  ship_country: string;
  customer_note: string | null;
  created_at: string;
  items: OrderItem[];
  history: OrderStatusEvent[];
}

export interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  total: string;
  currency: string;
  created_at: string;
  item_count: number;
}

export interface CheckoutResult {
  order: OrderDetail;
  payment_redirect_url: string | null;
  message: string;
}

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } })?.error ?? {};
    throw new AuthError(e.code ?? "error", e.message ?? "Request failed");
  }
  return data as T;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  author_name: string;
  is_verified_purchase: boolean;
  created_at: string;
}

export interface RatingBreakdown {
  average: string;
  count: number;
  stars: Record<string, number>;
}

export interface ReviewList {
  items: Review[];
  total: number;
  page: number;
  size: number;
  breakdown: RatingBreakdown;
  my_review: Review | null;
}

/** Hook for product reviews. List is public (personalised when signed in);
 * writing/deleting requires auth and auto-refreshes on 401. */
export function useReviews() {
  const { authFetch } = useAuth();
  return {
    async list(slug: string): Promise<ReviewList> {
      // authFetch adds the token when present so my_review comes back.
      const res = await authFetch(`/products/${encodeURIComponent(slug)}/reviews?size=50`);
      return readJson<ReviewList>(res);
    },
    async submit(slug: string, body: { rating: number; title?: string; body?: string }): Promise<Review> {
      const res = await authFetch(`/products/${encodeURIComponent(slug)}/reviews`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readJson<Review>(res);
    },
    async remove(slug: string): Promise<void> {
      const res = await authFetch(`/products/${encodeURIComponent(slug)}/reviews`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new AuthError(data?.error?.code ?? "error", data?.error?.message ?? "Failed");
      }
    },
  };
}

/* ---------- Addresses ---------- */

export interface Address {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country: string;
  is_default: boolean;
}

export type AddressInput = Omit<Address, "id">;

export function useAddresses() {
  const { authFetch } = useAuth();
  return {
    async list(): Promise<Address[]> {
      return readJson<Address[]>(await authFetch("/users/me/addresses"));
    },
    async create(body: AddressInput): Promise<Address> {
      return readJson<Address>(
        await authFetch("/users/me/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    async update(id: string, body: AddressInput): Promise<Address> {
      return readJson<Address>(
        await authFetch(`/users/me/addresses/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    async setDefault(id: string): Promise<Address> {
      return readJson<Address>(
        await authFetch(`/users/me/addresses/${id}/default`, { method: "POST" }),
      );
    },
    async remove(id: string): Promise<void> {
      const res = await authFetch(`/users/me/addresses/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        throw new AuthError(d?.error?.code ?? "error", d?.error?.message ?? "Failed");
      }
    },
  };
}

/* ---------- Server wishlist ---------- */

// Minimal product shape the wishlist endpoints return (a catalog ProductSummary).
export interface WishlistProduct {
  id: string;
  slug: string;
  name: string;
  base_price: string;
  currency: string;
  brand: { name: string } | null;
  primary_image: { url: string } | null;
}

export function useServerWishlist() {
  const { authFetch } = useAuth();
  return {
    list: () => authFetch("/users/me/wishlist").then((r) => readJson<WishlistProduct[]>(r)),
    add: (productId: string) =>
      authFetch("/users/me/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      }).then((r) => readJson<WishlistProduct[]>(r)),
    remove: (productId: string) =>
      authFetch(`/users/me/wishlist/${productId}`, { method: "DELETE" }).then((r) =>
        readJson<WishlistProduct[]>(r),
      ),
    merge: (productIds: string[]) =>
      authFetch("/users/me/wishlist/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: productIds }),
      }).then((r) => readJson<WishlistProduct[]>(r)),
  };
}

/* ---------- Server cart ---------- */

export interface ServerCartLine {
  variant_id: string;
  product_id: string;
  slug: string;
  name: string;
  brand: string | null;
  variant_name: string;
  unit_price: string;
  currency: string;
  image_url: string | null;
  quantity: number;
  stock_quantity: number;
  in_stock: boolean;
  line_total: string;
}

export interface ServerCart {
  items: ServerCartLine[];
  count: number;
  subtotal: string;
  currency: string;
}

export function useServerCart() {
  const { authFetch } = useAuth();
  const body = (b: unknown) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
  return {
    get: () => authFetch("/users/me/cart").then((r) => readJson<ServerCart>(r)),
    add: (variantId: string, quantity: number) =>
      authFetch("/users/me/cart", body({ variant_id: variantId, quantity })).then((r) =>
        readJson<ServerCart>(r),
      ),
    setQuantity: (variantId: string, quantity: number) =>
      authFetch(`/users/me/cart/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      }).then((r) => readJson<ServerCart>(r)),
    remove: (variantId: string) =>
      authFetch(`/users/me/cart/${variantId}`, { method: "DELETE" }).then((r) =>
        readJson<ServerCart>(r),
      ),
    clear: () =>
      authFetch("/users/me/cart", { method: "DELETE" }).then((r) => readJson<ServerCart>(r)),
    merge: (items: { variant_id: string; quantity: number }[]) =>
      authFetch("/users/me/cart/merge", body({ items })).then((r) => readJson<ServerCart>(r)),
  };
}

/* ---------- Coupons ---------- */

export interface CouponValidateResult {
  code: string;
  description: string | null;
  discount_type: "PERCENT" | "FIXED";
  discount_amount: string;
  message: string;
}

export function useCoupons() {
  const { authFetch } = useAuth();
  return {
    async validate(code: string, subtotal: number): Promise<CouponValidateResult> {
      const res = await authFetch("/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal }),
      });
      return readJson<CouponValidateResult>(res);
    },
  };
}

/* ---------- Admin ---------- */

export interface AdminStats {
  orders_total: number;
  orders_open: number;
  revenue_total: string;
  products_total: number;
  products_published: number;
  low_stock_variants: number;
  customers_total: number;
}

export interface AdminOrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  total: string;
  currency: string;
  customer_email: string | null;
  item_count: number;
  created_at: string;
}

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  status: string;
  is_featured: boolean;
  base_price: string;
  currency: string;
  product_type: string;
  brand_name: string | null;
  total_stock: number;
  rating_avg: string;
  rating_count: number;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  value: string;
  min_subtotal: string;
  max_discount: string | null;
  usage_limit: number | null;
  used_count: number;
  per_user_limit: number;
  is_active: boolean;
  created_at: string;
}

export function useAdmin() {
  const { authFetch } = useAuth();
  const q = <T,>(p: string) => authFetch(p).then((r) => readJson<T>(r));
  const send = <T,>(p: string, method: string, body?: unknown) =>
    authFetch(p, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => readJson<T>(r));

  return {
    stats: () => q<AdminStats>("/admin/stats"),
    orders: (status?: string) =>
      q<{ items: AdminOrderRow[]; total: number }>(
        `/admin/orders?size=50${status ? `&status=${status}` : ""}`,
      ),
    order: (id: string) => q<OrderDetail>(`/admin/orders/${id}`),
    setOrderStatus: (id: string, status: string, note?: string) =>
      send<OrderDetail>(`/admin/orders/${id}/status`, "PATCH", { status, note }),
    markOrderPaid: (id: string) => send<OrderDetail>(`/admin/orders/${id}/mark-paid`, "POST"),
    products: (q2?: string) =>
      q<{ items: AdminProductRow[]; total: number }>(
        `/admin/products?size=50${q2 ? `&q=${encodeURIComponent(q2)}` : ""}`,
      ),
    updateProduct: (id: string, body: { status?: string; is_featured?: boolean }) =>
      send<AdminProductRow>(`/admin/products/${id}`, "PATCH", body),
    coupons: () => q<Coupon[]>("/admin/coupons"),
    createCoupon: (body: Record<string, unknown>) => send<Coupon>("/admin/coupons", "POST", body),
    notifications: () =>
      q<{ items: AdminNotification[]; total: number }>("/admin/notifications?size=50"),
    // Full product management
    getProduct: (id: string) => q<AdminProductDetail>(`/admin/products/${id}`),
    createProduct: (body: ProductWrite) => send<AdminProductDetail>("/admin/products", "POST", body),
    saveProduct: (id: string, body: ProductWrite) =>
      send<AdminProductDetail>(`/admin/products/${id}`, "PUT", body),
    deleteProduct: async (id: string) => {
      const res = await authFetch(`/admin/products/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        throw new AuthError(d?.error?.code ?? "error", d?.error?.message ?? "Failed");
      }
    },
    brandOptions: () => q<Option[]>("/admin/brands"),
    categoryOptions: () => q<Option[]>("/admin/categories"),
    // Image upload — send FormData; the browser sets the multipart Content-Type.
    uploadImage: async (file: File): Promise<{ url: string; filename: string }> => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch("/admin/uploads", { method: "POST", body: fd });
      return readJson<{ url: string; filename: string }>(res);
    },
    // Brand management
    brands: () => q<AdminBrand[]>("/admin/brands"),
    createBrand: (body: Record<string, unknown>) => send<AdminBrand>("/admin/brands", "POST", body),
    saveBrand: (id: string, body: Record<string, unknown>) =>
      send<AdminBrand>(`/admin/brands/${id}`, "PUT", body),
    deleteBrand: async (id: string) => {
      const res = await authFetch(`/admin/brands/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new AuthError("error", "Failed to delete brand");
    },
    // Category management
    categories: () => q<AdminCategory[]>("/admin/categories"),
    createCategory: (body: Record<string, unknown>) =>
      send<AdminCategory>("/admin/categories", "POST", body),
    saveCategory: (id: string, body: Record<string, unknown>) =>
      send<AdminCategory>(`/admin/categories/${id}`, "PUT", body),
    deleteCategory: async (id: string) => {
      const res = await authFetch(`/admin/categories/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new AuthError("error", "Failed to delete category");
    },
  };
}

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  country: string | null;
  is_active: boolean;
  product_count: number;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  product_count: number;
}

export interface Option {
  id: string;
  name: string;
}

export interface AdminVariant {
  id?: string;
  name: string;
  sku?: string | null;
  options: Record<string, string>;
  price: string | number;
  compare_at_price?: string | number | null;
  stock_quantity: number;
  is_default: boolean;
  sort_order: number;
}

export interface AdminImage {
  id?: string;
  url: string;
  alt?: string | null;
  is_primary: boolean;
  sort_order: number;
}

export interface AdminProductDetail {
  id: string;
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  product_type: string;
  brand_id: string | null;
  category_id: string | null;
  base_price: string;
  compare_at_price: string | null;
  currency: string;
  tax_rate: string;
  status: string;
  is_featured: boolean;
  attributes: Record<string, unknown>;
  tags: string[];
  variants: (AdminVariant & { id: string })[];
  images: (AdminImage & { id: string })[];
}

export interface ProductWrite {
  sku: string;
  name: string;
  slug?: string | null;
  short_description?: string | null;
  description?: string | null;
  product_type: string;
  brand_id?: string | null;
  category_id?: string | null;
  base_price: number;
  compare_at_price?: number | null;
  currency?: string;
  tax_rate?: number;
  status: string;
  is_featured: boolean;
  attributes: Record<string, unknown>;
  tags: string[];
  variants: AdminVariant[];
  images: AdminImage[];
}

export interface AdminNotification {
  id: string;
  event: string;
  channel: string;
  recipient: string | null;
  subject: string;
  status: string;
  error: string | null;
  created_at: string;
}

/** Hook exposing authenticated order calls that auto-refresh on 401. */
export function useOrders() {
  const { authFetch } = useAuth();
  return {
    async checkout(payload: {
      items: CheckoutItem[];
      shipping_address: ShippingAddress;
      payment_method: string;
      customer_note?: string;
      coupon_code?: string;
    }): Promise<CheckoutResult> {
      const res = await authFetch("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return readJson<CheckoutResult>(res);
    },
    async list(): Promise<{ items: OrderSummary[]; total: number }> {
      const res = await authFetch("/orders?size=50");
      return readJson(res);
    },
    async get(id: string): Promise<OrderDetail> {
      const res = await authFetch(`/orders/${id}`);
      return readJson<OrderDetail>(res);
    },
    async cancel(id: string): Promise<OrderDetail> {
      const res = await authFetch(`/orders/${id}/cancel`, { method: "POST" });
      return readJson<OrderDetail>(res);
    },
  };
}
