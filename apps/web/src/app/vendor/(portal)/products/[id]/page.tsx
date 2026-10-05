"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useVendorApi, type VendorProductDetail } from "@/lib/vendor";
import { ProductEditor } from "@/components/vendor/product-editor/product-editor";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditVendorProductPage() {
  const { id } = useParams<{ id: string }>();
  const api = useVendorApi();
  const [product, setProduct] = useState<VendorProductDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    // The API answers 404 for another store's product, so it simply isn't found.
    api
      .product(id)
      .then((p) => active && setProduct(p))
      .catch(() => active && setMissing(true));
    return () => {
      active = false;
    };
  }, [api, id]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/vendor/products" className="focus-ring rounded-sm text-sm text-muted hover:text-foreground">
          ← Products
        </Link>
        <h1 className="mt-1 font-display text-3xl font-semibold">{product?.name ?? "Edit product"}</h1>
      </div>
      {missing ? (
        <EmptyState
          title="Product not found"
          description="It may have been deleted."
          action={<ButtonLink href="/vendor/products">Back to products</ButtonLink>}
        />
      ) : product ? (
        <ProductEditor key={product.id} product={product} />
      ) : (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-72" />
        </div>
      )}
    </div>
  );
}
