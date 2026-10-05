"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { hasPermission, isAdmin as checkAdmin, isSuperAdmin, useAuth } from "@/lib/auth";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import {
  BellIcon,
  BottleIcon,
  ChartIcon,
  ChatIcon,
  CheckIcon,
  DashboardIcon,
  ImageIcon,
  LayersIcon,
  PackageIcon,
  ReturnIcon,
  ShieldIcon,
  SparkleIcon,
  StoreIcon,
  TagIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/ui/icons";

type NavSpec = DashboardNavItem & { perm: string };

// Each entry appears only for holders of its permission; the API enforces the same codes.
const NAV: NavSpec[] = [
  { href: "/admin", label: "Dashboard", icon: DashboardIcon, perm: "dashboard.view", group: "Overview" },
  { href: "/admin/analytics", label: "Analytics", icon: ChartIcon, perm: "analytics.view", group: "Overview" },
  { href: "/admin/notifications", label: "Notifications", icon: BellIcon, perm: "dashboard.view", group: "Overview" },
  { href: "/admin/orders", label: "Orders", icon: PackageIcon, perm: "orders.view", group: "Sales" },
  { href: "/admin/returns", label: "Returns", icon: ReturnIcon, perm: "returns.view", group: "Sales" },
  { href: "/admin/customers", label: "Customers", icon: UsersIcon, perm: "customers.view", group: "Sales" },
  { href: "/admin/coupons", label: "Coupons", icon: TagIcon, perm: "coupons.view", group: "Sales" },
  { href: "/admin/products", label: "Products", icon: BottleIcon, perm: "products.view", group: "Catalog" },
  { href: "/admin/moderation", label: "Moderation", icon: CheckIcon, perm: "moderation.view", group: "Catalog" },
  { href: "/admin/brands", label: "Brands", icon: LayersIcon, perm: "taxonomy.view", group: "Catalog" },
  { href: "/admin/categories", label: "Categories", icon: LayersIcon, perm: "taxonomy.view", group: "Catalog" },
  { href: "/admin/fragrance", label: "Fragrance", icon: SparkleIcon, perm: "taxonomy.view", group: "Catalog" },
  { href: "/admin/vendors", label: "Vendors", icon: StoreIcon, perm: "vendors.view", group: "Marketplace" },
  { href: "/admin/payouts", label: "Payouts", icon: WalletIcon, perm: "payouts.view", group: "Marketplace" },
  { href: "/admin/banners", label: "Banners", icon: ImageIcon, perm: "cms.view", group: "Content" },
  { href: "/admin/support", label: "Support inbox", icon: ChatIcon, perm: "support.view", group: "Content" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, ready, refreshUser } = useAuth();
  const router = useRouter();
  const isAdmin = checkAdmin(user);
  const hasPerms = !!user?.permissions;

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login?next=/admin");
    else if (!isAdmin) router.replace("/");
  }, [ready, user, isAdmin, router]);

  // Sessions stored before permissions existed: fetch them once.
  useEffect(() => {
    if (ready && user && !hasPerms) void refreshUser();
  }, [ready, user, hasPerms, refreshUser]);

  const nav = useMemo(() => NAV.filter((n) => hasPermission(user, n.perm)), [user]);

  return (
    <DashboardShell
      title={
        <>
          Admin<span className="text-accent">.</span>
        </>
      }
      subtitle={user ? `${user.email} · ${user.roles.filter((r) => r !== "CUSTOMER").join(", ")}` : undefined}
      aside={
        isSuperAdmin(user) ? (
          <Link
            href="/super-admin"
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-pill border border-platform px-3.5 text-sm font-medium text-platform hover:bg-platform-soft"
          >
            <ShieldIcon width={15} height={15} aria-hidden /> Super admin
          </Link>
        ) : null
      }
      nav={nav}
      ready={ready && !!user && isAdmin && hasPerms}
    >
      {children}
    </DashboardShell>
  );
}
