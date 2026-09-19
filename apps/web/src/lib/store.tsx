"use client";

/**
 * Client-side cart + wishlist, persisted in localStorage.
 *
 * V1 stopgap: the cart/wishlist modules land in FastAPI in Phase 3, at which
 * point this becomes a cache in front of the API for signed-in users.
 * Prices shown here are snapshots; checkout always re-prices on the server.
 *
 * Implemented as an external store (useSyncExternalStore) so the server
 * snapshot is empty and the client snapshot hydrates from storage without
 * a setState-in-effect.
 */

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  variantId: string;
  variantName: string;
  unitPrice: string;
  currency: string;
  imageUrl: string | null;
  quantity: number;
}

export interface WishlistItem {
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  price: string;
  currency: string;
  imageUrl: string | null;
}

interface Snapshot {
  cart: CartLine[];
  wishlist: WishlistItem[];
  hydrated: boolean;
}

const KEY = "beauty-commerce:store:v1";
const EMPTY: Snapshot = { cart: [], wishlist: [], hydrated: false };

/* ---------- external store ---------- */

let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

function read(): Snapshot {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Snapshot>;
      return { cart: parsed.cart ?? [], wishlist: parsed.wishlist ?? [], hydrated: true };
    }
  } catch {
    /* corrupted or unavailable storage */
  }
  return { cart: [], wishlist: [], hydrated: true };
}

function getSnapshot(): Snapshot {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return EMPTY;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = read();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function update(fn: (s: Snapshot) => Snapshot) {
  snapshot = fn(getSnapshot());
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ cart: snapshot.cart, wishlist: snapshot.wishlist }),
    );
  } catch {
    /* quota / private mode */
  }
  listeners.forEach((l) => l());
}

/* ---------- actions ---------- */

const actions = {
  addToCart(line: Omit<CartLine, "quantity">, qty = 1) {
    update((s) => {
      const existing = s.cart.find((l) => l.variantId === line.variantId);
      const cart = existing
        ? s.cart.map((l) =>
            l.variantId === line.variantId ? { ...l, quantity: l.quantity + qty } : l,
          )
        : [...s.cart, { ...line, quantity: qty }];
      return { ...s, cart };
    });
    cartSync?.onAdd(line.variantId, qty);
  },
  setQuantity(variantId: string, qty: number) {
    update((s) => ({
      ...s,
      cart:
        qty <= 0
          ? s.cart.filter((l) => l.variantId !== variantId)
          : s.cart.map((l) => (l.variantId === variantId ? { ...l, quantity: qty } : l)),
    }));
    cartSync?.onSet(variantId, qty);
  },
  removeFromCart(variantId: string) {
    update((s) => ({ ...s, cart: s.cart.filter((l) => l.variantId !== variantId) }));
    cartSync?.onRemove(variantId);
  },
  clearCart() {
    update((s) => ({ ...s, cart: [] }));
    cartSync?.onClear();
  },
  /** Replace the whole cart (used after a server merge on login). */
  replaceCart(cart: CartLine[]) {
    update((s) => ({ ...s, cart }));
  },
  toggleWishlist(item: WishlistItem) {
    let added = false;
    update((s) => {
      const has = s.wishlist.some((w) => w.productId === item.productId);
      added = !has;
      return {
        ...s,
        wishlist: has
          ? s.wishlist.filter((w) => w.productId !== item.productId)
          : [...s.wishlist, item],
      };
    });
    // Mirror to the server when signed in (best-effort).
    if (added) wishlistSync?.onAdd(item.productId);
    else wishlistSync?.onRemove(item.productId);
  },
  /** Replace the whole wishlist (used after a server merge on login). */
  replaceWishlist(items: WishlistItem[]) {
    update((s) => ({ ...s, wishlist: items }));
  },
};

/* ---------- optional server sync (registered by <WishlistSync>) ---------- */

interface WishlistSyncHandler {
  onAdd: (productId: string) => void;
  onRemove: (productId: string) => void;
}
let wishlistSync: WishlistSyncHandler | null = null;

export function setWishlistSync(handler: WishlistSyncHandler | null) {
  wishlistSync = handler;
}

interface CartSyncHandler {
  onAdd: (variantId: string, qty: number) => void;
  onSet: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
  onClear: () => void;
}
let cartSync: CartSyncHandler | null = null;

export function setCartSync(handler: CartSyncHandler | null) {
  cartSync = handler;
}

/* ---------- React binding ---------- */

export interface StoreApi extends Snapshot {
  addToCart: typeof actions.addToCart;
  setQuantity: typeof actions.setQuantity;
  removeFromCart: typeof actions.removeFromCart;
  clearCart: typeof actions.clearCart;
  replaceCart: typeof actions.replaceCart;
  toggleWishlist: typeof actions.toggleWishlist;
  replaceWishlist: typeof actions.replaceWishlist;
  isWishlisted: (productId: string) => boolean;
  cartCount: number;
  cartSubtotal: number;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<StoreApi>(
    () => ({
      ...state,
      ...actions,
      isWishlisted: (id) => state.wishlist.some((w) => w.productId === id),
      cartCount: state.cart.reduce((n, l) => n + l.quantity, 0),
      cartSubtotal: state.cart.reduce((n, l) => n + Number(l.unitPrice) * l.quantity, 0),
    }),
    [state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
