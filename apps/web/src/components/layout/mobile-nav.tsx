"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import type { CategoryTree } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Drawer } from "@/components/ui/drawer";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { controlClass } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import {
  BagIcon,
  ChevronDownIcon,
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

  const account = (
    <div>
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
          className={buttonClass("outline", "md", "mt-3 w-full")}
        >
          Sign out
        </button>
      ) : (
        <button type="button" onClick={() => go("/login")} className={buttonClass("primary", "md", "mt-3 w-full")}>
          Sign in
        </button>
      )}
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Menu"
      side="left"
      className="lg:hidden"
      header={
        <Link href="/" onClick={onClose} className="font-display text-2xl font-semibold">
          Beauty<span className="text-accent">.</span>
        </Link>
      }
      footer={account}
    >
        <form onSubmit={onSearch} role="search" className="border-b border-border p-4">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products…"
              className={`${controlClass} h-11 rounded-pill pl-10 pr-4`}
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
                  className="focus-ring flex w-full items-center justify-between rounded-control px-3 py-3 text-base hover:bg-surface-2"
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
          <DrawerLink onClick={() => go("/find-your-scent")}>Find your scent</DrawerLink>
          {isAdmin && <DrawerLink onClick={() => go("/admin")}>Admin</DrawerLink>}
          <div className="mt-2 flex items-center justify-between rounded-control px-3 py-1 text-base">
            Appearance
            <ThemeToggle />
          </div>
        </nav>
    </Drawer>
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
      className={`focus-ring block w-full rounded-control px-3 py-3 text-left text-base hover:bg-surface-2 ${
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
      className="focus-ring relative flex flex-col items-center gap-1 rounded-control border border-border py-3 text-xs hover:bg-surface-2"
    >
      <span className="relative">
        {icon}
        {badge ? (
          <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-2xs font-bold text-accent-foreground">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      {label}
    </button>
  );
}
