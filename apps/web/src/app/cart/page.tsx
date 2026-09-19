import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { PageHeader } from "@/components/catalog/page-header";

export const metadata: Metadata = { title: "Your bag" };

export default function CartPage() {
  return (
    <div className="container-x py-10">
      <PageHeader title="Your bag" crumbs={[{ href: "/cart", label: "Bag" }]} />
      <CartView />
    </div>
  );
}
