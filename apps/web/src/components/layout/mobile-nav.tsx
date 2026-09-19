"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import type { CategoryTree } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  BagIcon,
  ChevronDownIcon,
  CloseIcon,
  HeartIcon,
  SearchIcon,
  UserIcon,
} from "@/components/ui/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: CategoryTree[];
  isAdmin: boolean;
}

export function MobileNav({ open, onClose, categories, isAdmin }: Props) {
  const { user, logout } = useAuth();
  const { cartCount, wishlist } = useStore();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    onClose();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/products");
  }

  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-[86vw] max-w-sm flex-col bg-background shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <Link href="/" onClick={onClose} className="font-serif text-xl font-semibold">
            Beauty<span className="text-accent">.</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-full p-2 hover:bg-surface-2"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={onSearch} role="search" className="border-b border-border p-4">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products…"
              className="focus-ring h-11 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-sm"
            />
          </label>
        </form>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Mobile">
          <DrawerLink onClick={() => go("/products")}>All products</DrawerLink>

          {categories.map((c) =>
            c.children.length > 0 ? (
              <div key={c.id}>
                <button
                  type="button"
                  onClick={() => setExpanded((e) => (e === c.id ? null : c.id))}
                  aria-expanded={expanded === c.id}
                  className="focus-ring flex w-full items-center justify-between rounded-xl px-3 py-3 text-base hover:bg-surface-2"
                >
                  {c.name}
                  <ChevronDownIcon
                    width={18}
                    height={18}
                    className={`text-muted transition-transform ${expanded === c.id ? "rotate-180" : ""}`}
                  />
                </button>
                {expanded === c.id && (
                  <div className="ml-3 border-l border-border pl-2">
                    <DrawerLink onClick={() => go(`/categories/${c.slug}`)} muted>
                      All {c.name}
                    </DrawerLink>
                    {c.children.map((ch) => (
                      <DrawerLink key={ch.id} onClick={() => go(`/categories/${ch.slug}`)} muted>
                        {ch.name}
                      </DrawerLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <DrawerLink key={c.id} onClick={() => go(`/categories/${c.slug}`)}>
                {c.name}
              </DrawerLink>
            ),
          )}

          <DrawerLink onClick={() => go("/brands")}>Brands</DrawerLink>
          {isAdmin && <DrawerLink onClick={() => go("/admin")}>Admin</DrawerLink>}
        </nav>

        <div className="border-t border-border p-4">
          <div className="grid grid-cols-3 gap-2">
            <QuickAction icon={<UserIcon />} label="Account" onClick={() => go("/account")} />
            <QuickAction
              icon={<HeartIcon />}
              label="Wishlist"
              badge={wishlist.length}
              onClick={() => go("/wishlist")}
            />
            <QuickAction icon={<BagIcon />} label="Bag" badge={cartCount} onClick={() => go("/cart")} />
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => {
                logout().then(() => {
                  toast.info("Signed out");
                  onClose();
                  router.push("/");
                });
              }}
              className="focus-ring mt-3 w-full rounded-full border border-border py-2.5 text-sm hover:bg-surface-2"
            >
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go("/login")}
              className="focus-ring mt-3 w-full rounded-full bg-accent py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DrawerLink({
  onClick,
  children,
  muted,
}: {
  onClick: () => void;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring block w-full rounded-xl px-3 py-3 text-left text-base hover:bg-surface-2 ${
        muted ? "text-sm text-muted" : ""
      }`}
    >
      {children}
    </button>
  );
}

function QuickAction({
  icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring relative flex flex-col items-center gap-1 rounded-xl border border-border py-3 text-xs hover:bg-surface-2"
    >
      <span className="relative">
        {icon}
        {badge ? (
          <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      {label}
    </button>
  );
}
