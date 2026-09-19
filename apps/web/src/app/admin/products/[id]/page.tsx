"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdmin, type AdminProductDetail } from "@/lib/auth";
import { ProductForm } from "@/components/admin/product-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditProductPage() {
  const admin = useAdmin();
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await admin.getProduct(id);
        if (active) setProduct(p);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Not found");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <p className="text-muted">{error}</p>;
  if (!product) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">Edit: {product.name}</h2>
      <ProductForm existing={product} />
    </div>
  );
}
