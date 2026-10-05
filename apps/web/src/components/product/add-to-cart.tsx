"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ProductDetail, ProductVariant } from "@/lib/api";
import { useStore } from "@/lib/store";
import { flyToCart, openCart } from "@/lib/cart-ui";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { MinusIcon, PlusIcon, CheckIcon } from "@/components/ui/icons";
import { Price } from "./price";
import { WishlistButton } from "./wishlist-button";

function sizeLabel(v: ProductVariant): string {
  return v.size_ml ? `${Number(v.size_ml)} ml` : v.name;
}

/** "NPR 780 / 10 ml" — lets shoppers compare 30/50/100 ml value at a glance. */
function perTen(v: ProductVariant, currency: string): string | null {
  const ml = Number(v.size_ml);
  if (!ml) return null;
  return `${formatMoney((Number(v.price) / ml) * 10, currency)} / 10 ml`;
}

export function AddToCart({
  product,
  openDrawerOnAdd = false,
  sticky = false,
}: {
  product: ProductDetail;
  /** Product page: fly to the bag, then slide the bag open. */
  openDrawerOnAdd?: boolean;
  /** Product page on mobile: pin a compact add bar once the main button scrolls away. */
  sticky?: boolean;
}) {
  const { addToCart } = useStore();
  const variants = [...product.variants].sort(
    (a, b) => Number(a.size_ml ?? 0) - Number(b.size_ml ?? 0) || a.sort_order - b.sort_order,
  );
  const defaultVariant =
    variants.find((v) => v.is_default && v.stock_quantity > 0) ??
    variants.find((v) => v.stock_quantity > 0) ??
    variants[0];

  const [variantId, setVariantId] = useState(defaultVariant?.id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [mainVisible, setMainVisible] = useState(true);
  const groupName = useId();
  const reduce = useReducedMotion();
  const mainButton = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // Show the sticky bar only while the main add button is off screen.
  useEffect(() => {
    if (!sticky || !mainButton.current) return;
    const io = new IntersectionObserver(([e]) => setMainVisible(e.isIntersecting), {
      rootMargin: "0px 0px -64px 0px",
    });
    io.observe(mainButton.current);
    return () => io.disconnect();
  }, [sticky]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const variant = variants.find((v) => v.id === variantId) ?? defaultVariant;
  if (!variant) return null;

  const soldOut = variant.stock_quantity <= 0;
  const low = !soldOut && variant.stock_quantity <= 5;
  const maxQty = Math.max(1, Math.min(10, variant.stock_quantity));
  const hasSizes = variants.some((v) => v.size_ml);

  function add(source: Element | null) {
    const v = variant!;
    addToCart(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand?.name ?? null,
        variantId: v.id,
        variantName: v.name,
        unitPrice: v.price,
        currency: product.currency,
        imageUrl: product.primary_image?.url ?? null,
      },
      qty,
    );
    setAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), 1800);

    // Fly from the product photo when it's on screen, else from the button.
    const photo = document.querySelector("[data-product-media]");
    const visible = photo && photo.getBoundingClientRect().bottom > 0;
    const flight = flyToCart(visible ? photo : source, product.primary_image?.url);
    if (openDrawerOnAdd) void flight.then(openCart);
    else toast.success(`Added ${product.name} (${sizeLabel(v)}) to your bag`);
  }

  const label = (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={soldOut ? "sold" : added ? "added" : "add"}
        className="inline-flex items-center gap-2"
        initial={reduce ? { opacity: 0 } : { y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { y: -18, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {soldOut ? (
          "Sold out"
        ) : added ? (
          <>
            <motion.span
              initial={reduce ? false : { scale: 0.4, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
              className="inline-flex"
            >
              <CheckIcon width={18} height={18} />
            </motion.span>
            Added
          </>
        ) : (
          "Add to bag"
        )}
      </motion.span>
    </AnimatePresence>
  );

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
          <legend className="mb-2.5 text-sm font-medium">
            {hasSizes ? "Size" : "Option"}: <span className="text-muted">{sizeLabel(variant)}</span>
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {variants.map((v) => {
              const selected = v.id === variant.id;
              const out = v.stock_quantity <= 0;
              const unit = perTen(v, product.currency);
              return (
                <label
                  key={v.id}
                  className={`relative flex cursor-pointer flex-col items-center gap-0.5 rounded-card border px-2 py-3 text-center transition-[border-color,background-color,transform] duration-(--duration-fast) ease-standard focus-within:ring-2 focus-within:ring-ring active:scale-[0.98] ${
                    selected ? "border-foreground bg-surface shadow-soft" : "border-border hover:border-border-strong"
                  } ${out ? "text-muted" : ""}`}
                >
                  <input
                    type="radio"
                    name={groupName}
                    value={v.id}
                    checked={selected}
                    onChange={() => {
                      setVariantId(v.id);
                      setQty(1);
                    }}
                    className="sr-only"
                  />
                  <span className={`font-display text-xl font-semibold ${out ? "line-through" : ""}`}>
                    {sizeLabel(v)}
                  </span>
                  <span className="text-sm tabular-nums">{formatMoney(v.price, product.currency)}</span>
                  <span className="hidden text-2xs text-muted tabular-nums sm:block">
                    {out ? "Sold out" : (unit ?? " ")}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div ref={mainButton} className="flex flex-wrap items-center gap-3">
        <div className="inline-flex h-12 items-center rounded-pill border border-border">
          <button
            type="button"
            className="focus-ring inline-flex h-full w-11 cursor-pointer items-center justify-center rounded-l-pill disabled:opacity-40"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1 || soldOut}
            aria-label="Decrease quantity"
          >
            <MinusIcon width={16} height={16} />
          </button>
          <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
            <span className="sr-only">Quantity </span>
            {qty}
          </span>
          <button
            type="button"
            className="focus-ring inline-flex h-full w-11 cursor-pointer items-center justify-center rounded-r-pill disabled:opacity-40"
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
            disabled={qty >= maxQty || soldOut}
            aria-label="Increase quantity"
          >
            <PlusIcon width={16} height={16} />
          </button>
        </div>

        <Button
          size="lg"
          className="min-w-0 flex-1 overflow-hidden sm:min-w-44 sm:flex-none"
          onClick={(e) => add(e.currentTarget)}
          disabled={soldOut}
        >
          {label}
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
          ? "This size is currently unavailable."
          : low
            ? `Only ${variant.stock_quantity} left in stock.`
            : "In stock · ships in 1–2 days within Kathmandu Valley."}
        <span className="ml-2 font-mono">SKU {variant.sku}</span>
      </p>

      {sticky && (
        <div
          aria-hidden={mainVisible}
          inert={mainVisible}
          className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] shadow-overlay backdrop-blur-xl transition-transform duration-(--duration-slow) ease-luxe lg:hidden ${
            mainVisible ? "translate-y-full" : "translate-y-0"
          }`}
        >
          <div className="container-x flex h-18 items-center gap-3">
            {product.primary_image && (
              <div className="relative h-12 w-10 shrink-0 overflow-hidden rounded-control bg-surface-2">
                <Image src={product.primary_image.url} alt="" fill sizes="40px" className="object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{product.name}</p>
              <p className="text-xs text-muted tabular-nums">
                {sizeLabel(variant)} · {formatMoney(variant.price, product.currency)}
              </p>
            </div>
            <Button className="overflow-hidden" onClick={(e) => add(e.currentTarget)} disabled={soldOut}>
              {label}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
