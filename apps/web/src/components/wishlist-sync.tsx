"use client";

import { useEffect } from "react";
import { useAuth, useServerWishlist, type WishlistProduct } from "@/lib/auth";
import { setWishlistSync, useStore, type WishlistItem } from "@/lib/store";

function toItem(p: WishlistProduct): WishlistItem {
  return {
    productId: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand?.name ?? null,
    price: p.base_price,
    currency: p.currency,
    imageUrl: p.primary_image?.url ?? null,
  };
}

/**
 * Bridges the local (localStorage) wishlist and the server wishlist:
 * - On sign-in, merges the guest's local items into the account, then replaces
 *   the local list with the server's (unioned) list.
 * - While signed in, mirrors add/remove toggles to the server.
 * Renders nothing.
 */
export function WishlistSync() {
  const { user, ready } = useAuth();
  const server = useServerWishlist();
  const { wishlist, replaceWishlist } = useStore();

  // Merge on login (once per user id).
  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    (async () => {
      try {
        const localIds = wishlist.map((w) => w.productId);
        const merged = await server.merge(localIds);
        if (active) replaceWishlist(merged.map(toItem));
      } catch {
        /* offline / API down: keep local */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id]);

  // Register the toggle → server mirror while signed in.
  useEffect(() => {
    if (!user) {
      setWishlistSync(null);
      return;
    }
    setWishlistSync({
      onAdd: (id) => void server.add(id).catch(() => {}),
      onRemove: (id) => void server.remove(id).catch(() => {}),
    });
    return () => setWishlistSync(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
