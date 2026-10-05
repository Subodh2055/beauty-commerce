"use client";

import Link from "next/link";
import { ProductEditor } from "@/components/vendor/product-editor/product-editor";

export default function NewVendorProductPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link href="/vendor/products" className="focus-ring rounded-sm text-sm text-muted hover:text-foreground">
          ← Products
        </Link>
        <h1 className="mt-1 font-display text-3xl font-semibold">Add a product</h1>
      </div>
      <ProductEditor />
    </div>
  );
}
