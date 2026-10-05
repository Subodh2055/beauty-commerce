"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isAdmin as checkAdmin, useAuth } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/notifications", label: "Notifications" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const isAdmin = checkAdmin(user);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login?next=/admin");
    else if (!isAdmin) router.replace("/");
  }, [ready, user, isAdmin, router]);

  return (
    <DashboardShell
      title={
        <>
          Admin<span className="text-accent">.</span>
        </>
      }
      nav={NAV}
      ready={ready && !!user && isAdmin}
    >
      {children}
    </DashboardShell>
  );
}
