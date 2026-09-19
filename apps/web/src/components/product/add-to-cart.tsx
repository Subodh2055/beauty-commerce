"use client";

import { useState } from "react";
import type { ProductDetail } from "@/lib/api";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";
import { Price } from "./price";
import { WishlistButton } from "./wishlist-button";

export function AddToCart({ product }: { product: ProductDetail }) {
  const { addToCart } = useStore();
  const variants = product.variants;
  const defaultVariant =
    variants.find((v) => v.is_default && v.stock_quantity > 0) ??
    variants.find((v) => v.stock_quantity > 0) ??
    variants[0];

  const [variantId, setVariantId] = useState(defaultVariant?.id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = variants.find((v) => v.id === variantId) ?? defaultVariant;
  if (!variant) return null;

  const optionLabel = Object.keys(variant.options)[0] ?? "Option";
  const soldOut = variant.stock_quantity <= 0;
  const low = !soldOut && variant.stock_quantity <= 5;
  const maxQty = Math.max(1, Math.min(10, variant.stock_quantity));

  function add() {
    addToCart(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand?.name ?? null,
        variantId: variant!.id,
        variantName: variant!.name,
        unitPrice: variant!.price,
        currency: product.currency,
        imageUrl: product.primary_image?.url ?? null,
      },
      qty,
    );
    setAdded(true);
    toast.success(`Added ${product.name} (${variant!.name}) to your bag`);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="space-y-6">
      <Price
        amount={variant.price}
        compareAt={variant.compare_at_price ?? product.compare_at_price}
        currency={product.currency}
        size="lg"
      />

      {variants.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium capitalize">
            {optionLabel}: <span className="text-muted">{variant.name}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const selected = v.id === variant.id;
              const out = v.stock_quantity <= 0;
              return (
                <label
                  key={v.id}
                  className={`focus-within:ring-2 focus-within:ring-ring cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground"
                  } ${out ? "opacity-50 line-through" : ""}`}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={v.id}
                    checked={selected}
                    onChange={() => {
                      setVariantId(v.id);
                      setQty(1);
                    }}
                    className="sr-only"
                  />
                  {v.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex h-11 items-center rounded-full border border-border">
          <button
            type="button"
            className="focus-ring h-full rounded-l-full px-3 disabled:opacity-40"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1 || soldOut}
            aria-label="Decrease quantity"
          >
            <MinusIcon width={16} height={16} />
          </button>
          <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            className="focus-ring h-full rounded-r-full px-3 disabled:opacity-40"
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
            disabled={qty >= maxQty || soldOut}
            aria-label="Increase quantity"
          >
            <PlusIcon width={16} height={16} />
          </button>
        </div>

        <Button
          size="lg"
          className="min-w-44 flex-1 sm:flex-none"
          onClick={add}
          disabled={soldOut}
        >
          {soldOut ? "Sold out" : added ? "Added ✓" : "Add to bag"}
        </Button>

        <WishlistButton
          className="h-12 w-12 border border-border hover:bg-surface-2"
          item={{
            productId: product.id,
            slug: product.slug,
            name: product.name,
            brand: product.brand?.name ?? null,
            price: product.base_price,
            currency: product.currency,
            imageUrl: product.primary_image?.url ?? null,
          }}
        />
      </div>

      <p className="text-xs text-muted" aria-live="polite">
        {soldOut
          ? "This option is currently unavailable."
          : low
            ? `Only ${variant.stock_quantity} left in stock.`
            : "In stock · ships in 1–2 days within Kathmandu Valley."}
        <span className="ml-2 font-mono">SKU {variant.sku}</span>
      </p>
    </div>
  );
}
