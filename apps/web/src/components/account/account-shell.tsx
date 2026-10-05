"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/catalog/page-header";
import { Skeleton } from "@/components/ui/skeleton";

const NAV = [
  { href: "/account", label: "Profile" },
  { href: "/orders", label: "Orders" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/reviews", label: "Reviews" },
];

/**
 * Frame for every account page: title, then a section nav (sidebar on desktop,
 * scrollable tabs on mobile) beside the content. Signed-out visitors are sent
 * to sign in, except where `guestOk` (the wishlist works locally for guests).
 */
export function AccountShell({
  title,
  crumbs,
  aside,
  guestOk = false,
  children,
}: {
  title: string;
  crumbs: { href: string; label: string }[];
  aside?: ReactNode;
  guestOk?: boolean;
  children: ReactNode;
}) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user && !guestOk) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, guestOk, router, pathname]);

  if (!guestOk && (!ready || !user)) {
    return (
      <div className="container-x py-10">
        <Skeleton className="mb-3 h-3 w-40" />
        <Skeleton className="mb-8 h-9 w-64" />
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <Skeleton className="hidden h-48 lg:block" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const active = (href: string) =>
    href === "/account" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="container-x py-10">
      <PageHeader title={title} crumbs={crumbs} aside={aside} />
      {user ? (
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <nav aria-label="Account" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
            <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col">
              {NAV.map((n) => {
                const on = active(n.href);
                return (
                  <li key={n.href} className="shrink-0">
                    <Link
                      href={n.href}
                      aria-current={on ? "page" : undefined}
                      className={`focus-ring flex h-10 items-center whitespace-nowrap rounded-pill px-4 text-sm transition-colors duration-(--duration-fast) lg:rounded-control ${
                        on ? "bg-primary font-medium text-primary-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
                      }`}
                    >
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
