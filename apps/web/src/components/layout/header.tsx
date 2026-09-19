"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
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

interface Props {
  categories: CategoryTree[];
}

const ADMIN_ROLES = ["STAFF", "ADMIN", "SUPER_ADMIN"];

export function Header({ categories }: Props) {
  const { cartCount, wishlist, hydrated } = useStore();
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const isAdmin = !!user && user.roles.some((r) => ADMIN_ROLES.includes(r));

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/products");
  }

  const isActive = (href: string) =>
    href === "/products" ? pathname === href : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container-x flex h-16 items-center gap-3 sm:gap-4">
          <button
            type="button"
            className="focus-ring -ml-2 rounded-full p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <MenuIcon />
          </button>

          <Link
            href="/"
            className="shrink-0 font-serif text-xl font-semibold tracking-tight sm:text-2xl"
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
            {isAdmin && (
              <NavLink href="/admin" active={isActive("/admin")}>
                Admin
              </NavLink>
            )}
          </nav>

          <form onSubmit={onSearch} role="search" className="ml-auto hidden max-w-xs flex-1 md:block">
            <label className="relative block">
              <span className="sr-only">Search products</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search perfumes, serums…"
                className="focus-ring h-10 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-sm placeholder:text-muted"
              />
            </label>
          </form>

          <div className="ml-auto flex items-center gap-0.5 md:ml-0 sm:gap-1">
            <Link
              href="/search"
              className="focus-ring rounded-full p-2 hover:bg-surface-2 md:hidden"
              aria-label="Search"
            >
              <SearchIcon />
            </Link>
            <Link
              href="/account"
              className="focus-ring relative rounded-full p-2 hover:bg-surface-2"
              aria-label={user ? "Your account" : "Sign in"}
            >
              <UserIcon />
              {user && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success ring-2 ring-background" />
              )}
            </Link>
            <Link
              href="/wishlist"
              className="focus-ring relative rounded-full p-2 hover:bg-surface-2"
              aria-label={`Wishlist, ${wishlist.length} items`}
            >
              <HeartIcon />
              {hydrated && wishlist.length > 0 && <Count n={wishlist.length} />}
            </Link>
            <Link
              href="/cart"
              className="focus-ring relative rounded-full p-2 hover:bg-surface-2"
              aria-label={`Cart, ${cartCount} items`}
            >
              <BagIcon />
              {hydrated && cartCount > 0 && <Count n={cartCount} />}
            </Link>
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
      <div className="invisible absolute left-0 top-full pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="min-w-52 rounded-2xl border border-border bg-surface p-2 shadow-lift">
          <Link
            href={`/categories/${category.slug}`}
            className="focus-ring block rounded-xl px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            All {category.name}
          </Link>
          {category.children.map((child) => (
            <Link
              key={child.id}
              href={`/categories/${child.slug}`}
              className="focus-ring block rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
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
    <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
      {n > 99 ? "99+" : n}
    </span>
  );
}
