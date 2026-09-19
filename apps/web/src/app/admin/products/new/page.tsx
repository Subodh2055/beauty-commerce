"use client";

import { ProductForm } from "@/components/admin/product-form";

export default function NewProductPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">New product</h2>
      <ProductForm />
    </div>
  );
}
