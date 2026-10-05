"use client";

import { ProductForm } from "@/components/admin/product-form";
import { RequirePermission } from "@/components/admin/ui";

function NewProductPagePage() {
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">New product</h2>
      <ProductForm />
    </div>
  );
}

export default function NewProductPage() {
  return (
    <RequirePermission code="products.create">
      <NewProductPagePage />
    </RequirePermission>
  );
}
