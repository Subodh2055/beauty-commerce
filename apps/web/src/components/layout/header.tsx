"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useStore } from "@/lib/store";
import { openCart } from "@/lib/cart-ui";
import { isAdmin as checkAdmin, useAuth } from "@/lib/auth";
import type { CategoryTree } from "@/lib/api";
import {
  BagIcon,
  ChevronDownIcon,
  HeartIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from "@/components/ui/icons";
import { MobileNav } from "./mobile-nav";
import { SemanticSearch } from "@/components/recommendations/semantic-search";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface Props {
  categories: CategoryTree[];
}

export function Header({ categories }: Props) {
  const { cartCount, wishlist, hydrated } = useStore();
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));
  // The home hero runs full-bleed under a transparent bar until you scroll.
  const isHome = pathname === "/";
  const glass = scrolled || !isHome;

  const isAdmin = checkAdmin(user);

  const isActive = (href: string) =>
    href === "/products" ? pathname === href : pathname.startsWith(href);

  return (
    <>
      {/*
        Shrinking glass bar, transform/opacity only: the bar is 80px with its
        content in the bottom 64px; scrolling slides it up 16px (leaving a centred
        64px bar), scales the logo, and fades in the frosted layer. -mb-4 keeps
        page layout at the old 64px.
      */}
      <header
        className={`${isHome ? "fixed inset-x-0" : "sticky -mb-4"} top-0 z-40 h-20 transition-transform duration-(--duration-slow) ease-luxe ${
          scrolled ? "-translate-y-4" : ""
        }`}
        // Anchored during route transitions: content slides, the bar stays put.
        style={{ viewTransitionName: "site-header" }}
      >
        <div
          aria-hidden
          className={`absolute inset-0 border-b border-border bg-background/75 shadow-hairline backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-(--duration-slow) ease-standard ${
            glass ? "opacity-100" : "opacity-0"
          }`}
        />
        <div className="container-x relative mt-4 flex h-16 items-center gap-3 sm:gap-4">
          <button
            type="button"
            className="focus-ring -ml-2 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-pill transition-colors duration-(--duration-fast) hover:bg-surface-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <MenuIcon />
          </button>

          <Link
            href="/"
            className={`shrink-0 origin-left font-serif text-xl font-semibold tracking-tight transition-transform duration-(--duration-slow) ease-luxe sm:text-2xl ${
              scrolled ? "scale-[0.92]" : ""
            }`}
          >
            Beauty<span className="text-accent">.</span>
          </Link>

          {/* Desktop nav with category dropdowns */}
          <nav className="ml-4 hidden items-center lg:flex" aria-label="Primary">
            <NavLink href="/products" active={isActive("/products")}>
              All
            </NavLink>
            {categories.map((c) =>
              c.children.length > 0 ? (
                <Dropdown key={c.id} category={c} active={pathname.startsWith(`/categories/${c.slug}`)} />
              ) : (
                <NavLink
                  key={c.id}
                  href={`/categories/${c.slug}`}
                  active={pathname.startsWith(`/categories/${c.slug}`)}
                >
                  {c.name}
                </NavLink>
              ),
            )}
            <NavLink href="/brands" active={isActive("/brands")}>
              Brands
            </NavLink>
            <NavLink href="/find-your-scent" active={isActive("/find-your-scent")}>
              Find your scent
            </NavLink>
            {isAdmin && (
              <NavLink href="/admin" active={isActive("/admin")}>
                Admin
              </NavLink>
            )}
            {user?.roles.includes("VENDOR") && (
              <NavLink href="/vendor" active={isActive("/vendor")}>
                Seller centre
              </NavLink>
            )}
          </nav>

          <SemanticSearch className="ml-auto hidden max-w-xs flex-1 md:block" />

          <div className="ml-auto flex items-center gap-0.5 md:ml-0 sm:gap-1">
            <Link
              href="/search"
              className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-(--duration-fast) hover:bg-surface-2 md:hidden"
              aria-label="Search"
            >
              <SearchIcon />
            </Link>
            <ThemeToggle className="hidden sm:inline-flex" />
            <Link
              href="/account"
              className="focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-(--duration-fast) hover:bg-surface-2"
              aria-label={user ? "Your account" : "Sign in"}
            >
              <UserIcon />
              {user && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success ring-2 ring-background" />
              )}
            </Link>
            <Link
              href="/wishlist"
              className="focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-(--duration-fast) hover:bg-surface-2"
              aria-label={`Wishlist, ${wishlist.length} items`}
            >
              <HeartIcon />
              {hydrated && wishlist.length > 0 && <Count n={wishlist.length} />}
            </Link>
            <button
              type="button"
              onClick={openCart}
              data-cart-target
              aria-haspopup="dialog"
              className="focus-ring relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-pill transition-colors duration-(--duration-fast) hover:bg-surface-2"
              aria-label={`Open bag, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
            >
              <BagIcon />
              {hydrated && cartCount > 0 && <Count n={cartCount} />}
            </button>
          </div>
        </div>
      </header>

      <MobileNav
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        isAdmin={isAdmin}
      />
    </>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`link-underline focus-ring rounded px-3 py-1.5 text-sm transition-colors ${
        active ? "font-medium text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function Dropdown({ category, active }: { category: CategoryTree; active: boolean }) {
  return (
    <div className="group relative">
      <Link
        href={`/categories/${category.slug}`}
        className={`focus-ring inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm transition-colors ${
          active ? "font-medium text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        {category.name}
        <ChevronDownIcon
          width={14}
          height={14}
          className="transition-transform group-hover:rotate-180"
        />
      </Link>
      {/* Panel: shown on hover/focus */}
      <div className="invisible absolute left-0 top-full pt-2 opacity-0 transition-all duration-(--duration-base) group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="min-w-52 rounded-card border border-border bg-surface p-2 shadow-lift">
          <Link
            href={`/categories/${category.slug}`}
            className="focus-ring block rounded-control px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            All {category.name}
          </Link>
          {category.children.map((child) => (
            <Link
              key={child.id}
              href={`/categories/${child.slug}`}
              className="focus-ring block rounded-control px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
            >
              {child.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-2xs font-bold text-accent-foreground">
      {n > 99 ? "99+" : n}
    </span>
  );
}
