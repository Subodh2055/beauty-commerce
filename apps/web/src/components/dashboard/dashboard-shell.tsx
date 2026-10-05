"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface DashboardNavItem {
  href: string;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Small count shown next to the label (e.g. orders to ship). */
  badge?: number;
}

/**
 * Frame shared by the admin and vendor dashboards: title row, section nav
 * (sidebar from lg, scrollable pills below), optional banner, content.
 * Access checks belong to the caller; pass `ready={false}` to show the skeleton.
 */
export function DashboardShell({
  title,
  subtitle,
  nav,
  ready,
  aside,
  banner,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  nav: DashboardNavItem[];
  /** False while access is still being checked. */
  ready: boolean;
  aside?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // On narrow screens the nav is a scrolling strip: keep the current section in view.
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname, ready]);

  if (!ready) {
    return (
      <div className="container-x py-10" aria-busy aria-label="Loading dashboard">
        <Skeleton className="mb-8 h-8 w-48" />
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <Skeleton className="hidden h-72 lg:block" />
          <div className="space-y-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  // The root item ("/admin", "/vendor") only matches itself; others match their subtree.
  const root = nav[0]?.href;
  const active = (href: string) =>
    href === root ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="container-x py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-2xl font-semibold">{title}</p>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3">
          {aside}
          <Link href="/" className="focus-ring rounded-sm text-sm text-muted hover:text-accent">
            ← Back to store
          </Link>
        </div>
      </div>
      {banner}
      <div className="grid gap-6 lg:grid-cols-[200px_1fr] lg:gap-8">
        <nav ref={navRef} aria-label="Dashboard" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col">
            {nav.map((item) => {
              const on = active(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={`focus-ring flex h-10 items-center gap-2.5 whitespace-nowrap rounded-pill px-3.5 text-sm transition-colors duration-(--duration-fast) lg:rounded-control ${
                      on ? "bg-primary font-medium text-primary-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    {Icon && <Icon width={17} height={17} aria-hidden />}
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5 text-2xs font-semibold tabular-nums ${
                          on ? "bg-primary-foreground text-primary" : "bg-accent text-accent-foreground"
                        }`}
                      >
                        {item.badge}
                        <span className="sr-only"> waiting</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
