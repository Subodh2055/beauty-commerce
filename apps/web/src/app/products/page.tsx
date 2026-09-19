import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/catalog/page-header";
import { ProductListing, parseQuery } from "@/components/catalog/product-listing";
import { ProductGridSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "All products",
  description: "Browse perfumes, cosmetics, skincare, hair and body care.",
};

export default async function ProductsPage(props: PageProps<"/products">) {
  const sp = await props.searchParams;
  const query = parseQuery(sp);

  return (
    <div className="container-x py-10">
      <PageHeader
        title="All products"
        description="Every perfume, serum, lipstick and balm we carry."
        crumbs={[{ href: "/products", label: "Products" }]}
      />
      <Suspense key={JSON.stringify(query)} fallback={<ProductGridSkeleton />}>
        <ProductListing query={query} pathname="/products" />
      </Suspense>
    </div>
  );
}
