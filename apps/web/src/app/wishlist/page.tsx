"use client";

import { AccountShell } from "@/components/account/account-shell";
import { WishlistView } from "@/components/cart/wishlist-view";

export default function WishlistPage() {
  // Guests keep a local wishlist too, so this page doesn't require signing in.
  return (
    <AccountShell title="Wishlist" crumbs={[{ href: "/wishlist", label: "Wishlist" }]} guestOk>
      <WishlistView />
    </AccountShell>
  );
}
