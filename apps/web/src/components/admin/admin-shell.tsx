"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isAdmin as checkAdmin, useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

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
  const pathname = usePathname();
  const isAdmin = checkAdmin(user);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login?next=/admin");
    else if (!isAdmin) router.replace("/");
  }, [ready, user, isAdmin, router]);

  if (!ready || !user || !isAdmin) {
    return (
      <div className="container-x py-10">
        <Skeleton className="mb-6 h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="container-x py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">
          Admin<span className="text-accent">.</span>
        </h1>
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← Back to store
        </Link>
      </div>
      <div className="grid gap-8 lg:grid-cols-[180px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin">
          {NAV.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`focus-ring shrink-0 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active ? "bg-accent text-accent-foreground" : "hover:bg-surface-2"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
