"use client";

/**
 * Admin + super-admin client. Every call goes through authFetch; the API
 * checks a permission on every route, so hiding a button here is a courtesy,
 * never the control. Types mirror the API schemas (apps/api/app/modules/*).
 */

import { useMemo } from "react";
import { useAuth } from "./auth";
import { jsonInit, qs, read, type Page } from "./http";
import type { Vendor } from "./vendor";

export type { Page } from "./http";

// --- analytics -----------------------------------------------------------------

export interface DayPoint {
  date: string;
  revenue: string;
  orders: number;
  units: number;
  new_customers: number;
  refunds: string;
}

export interface AnalyticsTotals {
  revenue: string;
  orders: number;
  units: number;
  aov: string;
  new_customers: number;
  refunds: string;
}

export interface Ranked {
  name: string;
  revenue: string;
  units: number;
  orders: number;
  commission: string | null;
}

export interface AdminAnalytics {
  start: string;
  end: string;
  previous_start: string;
  previous_end: string;
  currency: string;
  series: DayPoint[];
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
  by_status: { status: string; count: number; value: string }[];
  top_products: Ranked[];
  top_vendors: Ranked[];
  payment_methods: { method: string; orders: number; value: string }[];
  source: { rolled_up_days: number; live_days: number };
  generated_at: string;
}

// --- returns -------------------------------------------------------------------

export type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "REFUNDED";
export type ReturnReason = "DAMAGED" | "WRONG_ITEM" | "NOT_AS_DESCRIBED" | "CHANGED_MIND" | "OTHER";

export interface ReturnItem {
  order_item_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  image_url: string | null;
  unit_price: string;
  quantity: number;
}

export interface Refund {
  id: string;
  return_id: string | null;
  amount: string;
  method: "ORIGINAL" | "MANUAL";
  reference: string | null;
  note: string | null;
  created_at: string;
}

export interface ReturnRequest {
  id: string;
  reference: string;
  order_id: string;
  order_number: string;
  status: ReturnStatus;
  reason: ReturnReason;
  details: string | null;
  items: ReturnItem[];
  requested_amount: string;
  refunded_amount: string;
  decision_note: string | null;
  decided_at: string | null;
  received_at: string | null;
  restocked: boolean;
  refunds: Refund[];
  created_at: string;
  updated_at: string;
}

export interface AdminReturn extends ReturnRequest {
  customer_email: string | null;
  customer_name: string | null;
  order_total: string;
  currency: string;
  order_refundable: string;
  payment_method: string;
}

// --- customers -----------------------------------------------------------------

export interface CustomerRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  is_vendor: boolean;
  created_at: string;
  last_login_at: string | null;
  orders_count: number;
  total_spent: string;
}

export interface CustomerDetail extends CustomerRow {
  addresses: {
    id: string;
    label: string;
    recipient_name: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string | null;
    country: string;
    is_default: boolean;
  }[];
  recent_orders: {
    id: string;
    order_number: string;
    status: string;
    total: string;
    currency: string;
    created_at: string;
  }[];
  returns_count: number;
  open_tickets: number;
}

// --- catalogue moderation + taxonomy -------------------------------------------

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
  vendor_name: string | null;
  total_stock: number;
  rating_avg: string;
  rating_count: number;
}

export interface FragranceFamily {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
}

export interface FragranceNote {
  id: string;
  name: string;
  slug: string;
  family_id: string | null;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: "PERCENT" | "FIXED";
  value: string;
  min_subtotal: string;
  max_discount: string | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
  per_user_limit: number;
  is_active: boolean;
  created_at: string;
}

export interface CouponWrite {
  code: string;
  description?: string | null;
  discount_type: "PERCENT" | "FIXED";
  value: string;
  min_subtotal?: string;
  max_discount?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  usage_limit?: number | null;
  per_user_limit?: number;
  is_active?: boolean;
}

// --- banners, support, payouts -------------------------------------------------

export interface Banner {
  id: string;
  placement: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  mobile_image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
}

export type BannerWrite = Omit<Banner, "id" | "updated_at">;

export type TicketStatus = "OPEN" | "AWAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH";

export interface TicketRow {
  id: string;
  reference: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  requester_id: string;
  requester_email: string | null;
  requester_name: string | null;
  assigned_to: string | null;
  assignee_email: string | null;
  message_count: number;
  last_message_at: string | null;
  needs_reply: boolean;
}

export interface TicketMessage {
  id: string;
  from_staff: boolean;
  is_internal: boolean;
  body: string;
  created_at: string;
}

export interface TicketDetail extends Omit<TicketRow, "message_count" | "last_message_at" | "needs_reply"> {
  messages: TicketMessage[];
  order_number: string | null;
}

export interface Assignee {
  id: string;
  email: string;
  full_name: string | null;
}

export interface VendorBalance {
  vendor_id: string;
  vendor_name: string;
  eligible_orders: number;
  gross_amount: string;
  commission_amount: string;
  net_amount: string;
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
  created_at?: string;
}

// --- super admin ---------------------------------------------------------------

export interface MatrixModule {
  key: string;
  label: string;
  group: string;
  actions: Partial<Record<"view" | "create" | "edit" | "delete", string>>;
  super_admin_only: boolean;
}

export interface PermissionMatrix {
  actions: ("view" | "create" | "edit" | "delete")[];
  modules: MatrixModule[];
  descriptions: Record<string, string>;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  user_count: number;
  built_in: boolean;
  locked: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  roles: string[];
  is_active: boolean;
  is_self: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface CommissionRules {
  global_rate: string;
  categories: {
    id: string;
    name: string;
    parent_id: string | null;
    depth: number;
    rate: string | null;
    effective_rate: string;
    inherited_from: string | null;
    product_count: number;
  }[];
  vendors: { id: string; name: string; status: string; rate: string | null }[];
}

export interface ShippingZone {
  name: string;
  regions: string[];
  fee: string;
  free_threshold: string | null;
  eta_days_min: number;
  eta_days_max: number;
}

export interface EmailTemplate {
  subject: string;
  body: string;
  enabled: boolean;
}

export type EmailEvent = "order.placed" | "order.status_changed";

export interface PlatformSettings {
  default_commission_rate: string;
  free_shipping_threshold: string;
  shipping_fee: string;
  min_payout_amount: string;
  vendor_applications_open: boolean;
  support_email: string;
  return_window_days: number;
  shipping_zones: ShippingZone[];
  payments: { enabled_methods: string[]; cod_max_total: string | null };
  taxes: { label: string; prices_include_tax: boolean; registration_number: string | null };
  base_currency: string;
  display_currencies: { code: string; symbol: string; rate: string }[];
  email_templates: Partial<Record<EmailEvent, EmailTemplate>>;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, unknown>;
  request_method: string | null;
  request_path: string | null;
  request_id: string | null;
  ip_address: string | null;
  created_at: string;
}

export type HealthStatus = "ok" | "degraded" | "down" | "unknown";

export interface HealthComponent {
  key: string;
  name: string;
  status: HealthStatus;
  latency_ms: number | null;
  summary: string;
  details: Record<string, string | number | boolean | null>;
  error: string | null;
}

export interface SystemHealth {
  status: HealthStatus;
  checked_at: string;
  environment: string;
  components: HealthComponent[];
  workers: { name: string; active_tasks: number; processed: number | null; concurrency: number | null }[];
  queues: { name: string; pending: number | null }[];
  api: {
    window_seconds: number;
    requests: number;
    per_minute: number;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    error_rate: number;
    slowest: { route: string; count: number; p95_ms: number }[];
    uptime_seconds: number;
  };
}

type Params = Record<string, string | number | boolean | undefined | null>;

export function useAdminApi() {
  const { authFetch } = useAuth();
  return useMemo(() => {
    const get = <T,>(path: string, params: Params = {}) =>
      authFetch(path + qs(params)).then((r) => read<T>(r));
    const send = <T,>(path: string, method: string, body?: unknown) =>
      authFetch(path, body === undefined ? { method } : jsonInit(method, body)).then((r) => read<T>(r));

    return {
      // Dashboard counts (list endpoints with size=1 → total)
      count: (path: string, params: Params = {}) =>
        get<Page<unknown>>(path, { ...params, size: 1 }).then((p) => p.total),

      analytics: (start: string, end: string) => get<AdminAnalytics>("/admin/analytics", { start, end }),

      // Returns
      returns: (p: { status?: string; q?: string; page?: number; size?: number }) =>
        get<Page<AdminReturn>>("/admin/returns", p),
      returnDetail: (id: string) => get<AdminReturn>(`/admin/returns/${id}`),
      approveReturn: (id: string, note?: string) =>
        send<AdminReturn>(`/admin/returns/${id}/approve`, "POST", { note: note || null }),
      rejectReturn: (id: string, reason: string) =>
        send<AdminReturn>(`/admin/returns/${id}/reject`, "POST", { reason }),
      receiveReturn: (id: string, restock: boolean, note?: string) =>
        send<AdminReturn>(`/admin/returns/${id}/receive`, "POST", { restock, note: note || null }),
      refundReturn: (
        id: string,
        body: { amount: string; method: "ORIGINAL" | "MANUAL"; reference?: string; note?: string },
      ) => send<AdminReturn>(`/admin/returns/${id}/refund`, "POST", body),

      // Customers
      customers: (p: { q?: string; active?: boolean; sort?: string; page?: number; size?: number }) =>
        get<Page<CustomerRow>>("/admin/customers", p),
      customer: (id: string) => get<CustomerDetail>(`/admin/customers/${id}`),
      setCustomerStatus: (id: string, active: boolean, reason?: string) =>
        send<CustomerDetail>(`/admin/customers/${id}/status`, "PATCH", { active, reason: reason || null }),

      // Vendors
      vendors: (p: { status?: string; q?: string; page?: number; size?: number }) =>
        get<Page<Vendor>>("/admin/vendors", p),
      vendorDecision: (
        id: string,
        action: "approve" | "reject" | "suspend" | "reinstate",
        reason?: string,
      ) => send<Vendor>(`/admin/vendors/${id}/${action}`, "POST", { reason: reason || null }),

      // Moderation
      moderationQueue: (p: { q?: string; page?: number; size?: number }) =>
        get<Page<AdminProductRow>>("/admin/moderation", p),
      moderationItem: (id: string) =>
        get<import("./auth").AdminProductDetail>(`/admin/moderation/${id}`),
      approveProduct: (id: string) => send<unknown>(`/admin/products/${id}/approve`, "POST"),
      rejectProduct: (id: string, reason: string) =>
        send<unknown>(`/admin/products/${id}/reject`, "POST", { reason }),

      // Fragrance taxonomy
      families: () => get<FragranceFamily[]>("/fragrance/families"),
      notes: () => get<FragranceNote[]>("/fragrance/notes"),
      saveFamily: (id: string | null, body: Partial<FragranceFamily>) =>
        id
          ? send<FragranceFamily>(`/admin/fragrance-families/${id}`, "PUT", body)
          : send<FragranceFamily>("/admin/fragrance-families", "POST", body),
      deleteFamily: (id: string) => send<void>(`/admin/fragrance-families/${id}`, "DELETE"),
      saveNote: (id: string | null, body: { name: string; family_id: string | null }) =>
        id
          ? send<FragranceNote>(`/admin/fragrance-notes/${id}`, "PUT", body)
          : send<FragranceNote>("/admin/fragrance-notes", "POST", body),
      deleteNote: (id: string) => send<void>(`/admin/fragrance-notes/${id}`, "DELETE"),

      // Coupons
      coupons: () => get<Coupon[]>("/admin/coupons"),
      saveCoupon: (id: string | null, body: CouponWrite) =>
        id ? send<Coupon>(`/admin/coupons/${id}`, "PUT", body) : send<Coupon>("/admin/coupons", "POST", body),
      deleteCoupon: (id: string) => send<void>(`/admin/coupons/${id}`, "DELETE"),

      // Banners
      banners: () => get<Banner[]>("/admin/banners"),
      saveBanner: (id: string | null, body: BannerWrite) =>
        id ? send<Banner>(`/admin/banners/${id}`, "PUT", body) : send<Banner>("/admin/banners", "POST", body),
      deleteBanner: (id: string) => send<void>(`/admin/banners/${id}`, "DELETE"),

      // Support
      tickets: (p: { status?: string; priority?: string; q?: string; page?: number; size?: number }) =>
        get<Page<TicketRow>>("/admin/support/tickets", p),
      ticket: (id: string) => get<TicketDetail>(`/admin/support/tickets/${id}`),
      replyTicket: (id: string, body: string, internal: boolean) =>
        send<TicketDetail>(`/admin/support/tickets/${id}/messages`, "POST", { body, internal }),
      updateTicket: (
        id: string,
        body: Partial<{ status: TicketStatus; priority: TicketPriority; assigned_to: string | null }>,
      ) => send<TicketDetail>(`/admin/support/tickets/${id}`, "PATCH", body),
      assignees: () => get<Assignee[]>("/admin/support/assignees"),

      // Payouts
      balances: () => get<VendorBalance[]>("/admin/payouts/balances"),
      payouts: (p: { status?: string; page?: number; size?: number }) => get<Page<Payout>>("/admin/payouts", p),
      createPayout: (vendor_id: string) => send<Payout>("/admin/payouts", "POST", { vendor_id }),
      markPayoutPaid: (id: string, reference: string) =>
        send<Payout>(`/admin/payouts/${id}/mark-paid`, "POST", { reference }),
      cancelPayout: (id: string) => send<Payout>(`/admin/payouts/${id}/cancel`, "POST"),

      // --- super admin ---
      matrix: () => get<PermissionMatrix>("/super-admin/permissions"),
      roles: () => get<Role[]>("/super-admin/roles"),
      createRole: (body: { name: string; description?: string; permissions: string[] }) =>
        send<Role>("/super-admin/roles", "POST", body),
      updateRole: (id: string, body: { description?: string | null; permissions: string[] }) =>
        send<Role>(`/super-admin/roles/${id}`, "PUT", body),
      deleteRole: (id: string) => send<void>(`/super-admin/roles/${id}`, "DELETE"),
      admins: (q?: string) => get<AdminUser[]>("/super-admin/admins", { q }),
      grantAdmin: (email: string, roles: string[]) =>
        send<AdminUser>("/super-admin/admins", "POST", { email, roles }),
      setAdminRoles: (id: string, roles: string[]) =>
        send<AdminUser>(`/super-admin/admins/${id}/roles`, "PUT", { roles }),
      setAdminStatus: (id: string, active: boolean, reason?: string) =>
        send<AdminUser>(`/super-admin/admins/${id}/status`, "PATCH", { active, reason: reason || null }),
      commission: () => get<CommissionRules>("/super-admin/commission"),
      setGlobalCommission: (rate: string) => send<CommissionRules>("/super-admin/commission/global", "PUT", { rate }),
      setCategoryCommission: (id: string, rate: string | null) =>
        send<CommissionRules>(`/super-admin/commission/categories/${id}`, "PUT", { rate }),
      setVendorCommission: (id: string, rate: string | null) =>
        send<CommissionRules>(`/super-admin/commission/vendors/${id}`, "PUT", { rate }),
      settings: () => get<PlatformSettings>("/super-admin/settings"),
      updateSettings: (body: Partial<PlatformSettings>) =>
        send<PlatformSettings>("/super-admin/settings", "PATCH", body),
      auditLogs: (p: {
        q?: string;
        action?: string;
        entity_type?: string;
        entity_id?: string;
        since?: string;
        until?: string;
        page?: number;
        size?: number;
      }) => get<Page<AuditLog>>("/super-admin/audit-logs", p),
      auditEntityTypes: () => get<string[]>("/super-admin/audit-logs/entity-types"),
      systemHealth: () => get<SystemHealth>("/super-admin/system/health"),
    };
  }, [authFetch]);
}
