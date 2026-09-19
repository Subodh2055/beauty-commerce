import type { Metadata } from "next";
import { WishlistView } from "@/components/cart/wishlist-view";
import { PageHeader } from "@/components/catalog/page-header";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage() {
  return (
    <div className="container-x py-10">
      <PageHeader title="Wishlist" crumbs={[{ href: "/wishlist", label: "Wishlist" }]} />
      <WishlistView />
    </div>
  );
}
