"use client";

import { useEffect } from "react";
import { useAuth, useServerCart, type ServerCartLine } from "@/lib/auth";
import { setCartSync, useStore, type CartLine } from "@/lib/store";

function toLine(l: ServerCartLine): CartLine {
  return {
    productId: l.product_id,
    slug: l.slug,
    name: l.name,
    brand: l.brand,
    variantId: l.variant_id,
    variantName: l.variant_name,
    unitPrice: l.unit_price,
    currency: l.currency,
    imageUrl: l.image_url,
    quantity: l.quantity,
  };
}

/**
 * Bridges the local (localStorage) cart and the server cart:
 * - On sign-in, merges the guest's local lines into the account, then replaces
 *   the local cart with the server's (re-priced, stock-clamped) cart.
 * - While signed in, mirrors add/set/remove/clear to the server.
 * Renders nothing.
 */
export function CartSync() {
  const { user, ready } = useAuth();
  const server = useServerCart();
  const { cart, replaceCart } = useStore();

  // Merge + load on login (once per user id).
  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    (async () => {
      try {
        const items = cart.map((l) => ({ variant_id: l.variantId, quantity: l.quantity }));
        const merged = items.length ? await server.merge(items) : await server.get();
        if (active) replaceCart(merged.items.map(toLine));
      } catch {
        /* offline / API down: keep local */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id]);

  // Register the store → server mirror while signed in.
  useEffect(() => {
    if (!user) {
      setCartSync(null);
      return;
    }
    setCartSync({
      onAdd: (id, qty) => void server.add(id, qty).catch(() => {}),
      onSet: (id, qty) => void server.setQuantity(id, qty).catch(() => {}),
      onRemove: (id) => void server.remove(id).catch(() => {}),
      onClear: () => void server.clear().catch(() => {}),
    });
    return () => setCartSync(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
