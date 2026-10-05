"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useVendorApi, VendorApiError, type VendorSummary } from "@/lib/vendor";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  AlertIcon,
  DashboardIcon,
  LayersIcon,
  PackageIcon,
  SettingsIcon,
  StarIcon,
  TruckIcon,
  WalletIcon,
} from "@/components/ui/icons";

interface VendorContextValue {
  summary: VendorSummary;
  /** Suspended stores can look but not change anything (the API enforces this too). */
  readOnly: boolean;
  /** Re-read counts after a change (badges, product statuses). */
  refresh: () => Promise<void>;
}

const VendorContext = createContext<VendorContextValue | null>(null);

export function useVendor(): VendorContextValue {
  const ctx = useContext(VendorContext);
  if (!ctx) throw new Error("useVendor must be used inside <VendorShell>");
  return ctx;
}

/**
 * The vendor portal frame. The proxy has already refused visitors without the
 * VENDOR role; this loads the store summary (which the API only serves to an
 * approved or suspended vendor) and sends anyone else to their application status.
 */
export function VendorShell({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const api = useVendorApi();
  const router = useRouter();
  const [summary, setSummary] = useState<VendorSummary | null>(null);

  const onError = useCallback(
    (err: unknown) => {
      if (err instanceof VendorApiError && (err.status === 403 || err.status === 404)) {
        router.replace("/vendor/status");
      }
    },
    [router],
  );

  // For pages to call after a change; the initial load happens in the effect below.
  const load = useCallback(() => api.summary().then(setSummary, onError), [api, onError]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login?next=/vendor");
      return;
    }
    let active = true;
    api.summary().then((s) => active && setSummary(s), onError);
    return () => {
      active = false;
    };
  }, [ready, user, api, onError, router]);

  const readOnly = summary?.vendor.status === "SUSPENDED";
  const toShip = summary?.orders_to_ship ?? 0;
  const pending = summary?.products_by_status.PENDING ?? 0;

  return (
    <DashboardShell
      ready={!!summary}
      title={summary?.vendor.name ?? "Your store"}
      subtitle={
        summary && (
          <span className="inline-flex items-center gap-2">
            Seller centre
            {readOnly ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Approved</Badge>}
          </span>
        )
      }
      nav={[
        { href: "/vendor", label: "Overview", icon: DashboardIcon },
        { href: "/vendor/products", label: "Products", icon: PackageIcon, badge: pending },
        { href: "/vendor/inventory", label: "Inventory", icon: LayersIcon },
        { href: "/vendor/orders", label: "Orders", icon: TruckIcon, badge: toShip },
        { href: "/vendor/payouts", label: "Payouts", icon: WalletIcon },
        { href: "/vendor/reviews", label: "Reviews", icon: StarIcon },
        { href: "/vendor/settings", label: "Store settings", icon: SettingsIcon },
      ]}
      banner={
        readOnly && (
          <p
            role="status"
            className="mb-6 flex items-start gap-2.5 rounded-card bg-danger-soft p-4 text-sm text-danger"
          >
            <AlertIcon width={18} height={18} className="mt-0.5 shrink-0" />
            <span>
              Your store is suspended
              {summary?.vendor.status_reason ? `: ${summary.vendor.status_reason}` : ""}. Your products are hidden and
              changes are disabled until support reinstates you.
            </span>
          </p>
        )
      }
    >
      {summary && (
        <VendorContext.Provider value={{ summary, readOnly, refresh: load }}>{children}</VendorContext.Provider>
      )}
    </DashboardShell>
  );
}
