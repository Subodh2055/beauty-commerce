"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { getProduct, type ProductDetail } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { AddToCart } from "@/components/product/add-to-cart";
import { Rating } from "@/components/product/rating";

/** "Quick view" for a bestseller card: loads the full product on open. */
export function QuickView({ slug, name }: { slug: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function show() {
    setOpen(true);
    if (product) return;
    setError(null);
    try {
      setProduct(await getProduct(slug));
    } catch {
      setError("We couldn't load this product. Please try again.");
    }
  }

  const notes = product?.notes;
  const pyramid = notes ? [...notes.top, ...notes.heart, ...notes.base].slice(0, 6) : [];

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        className="focus-ring absolute inset-x-3 bottom-3 inline-flex h-11 cursor-pointer items-center justify-center rounded-pill bg-surface/90 text-sm font-medium text-foreground shadow-lift backdrop-blur-md transition-[transform,opacity] duration-(--duration-base) ease-luxe hover:bg-surface sm:translate-y-3 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:focus-visible:translate-y-0 sm:focus-visible:opacity-100"
      >
        Quick view<span className="sr-only">: {name}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={product?.name ?? name} size="xl">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!product && !error && (
          <div className="grid gap-6 sm:grid-cols-2" aria-busy>
            <Skeleton className="aspect-[4/5] w-full rounded-card" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-12 w-1/2" />
            </div>
          </div>
        )}
        {product && (
          <motion.div
            className="grid gap-6 sm:grid-cols-2"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-surface-2">
              {product.primary_image && (
                <Image
                  src={product.primary_image.url}
                  alt={product.primary_image.alt ?? product.name}
                  fill
                  sizes="(min-width: 640px) 26rem, 90vw"
                  className="object-cover"
                />
              )}
            </div>
            <div className="space-y-4">
              <div>
                {product.brand && (
                  <p className="text-2xs font-semibold tracking-eyebrow text-muted uppercase">{product.brand.name}</p>
                )}
                {product.rating_count > 0 && (
                  <div className="mt-1">
                    <Rating value={Number(product.rating_avg)} count={product.rating_count} />
                  </div>
                )}
              </div>
              {product.short_description && (
                <p className="text-sm leading-relaxed text-muted">{product.short_description}</p>
              )}
              {pyramid.length > 0 && (
                <p className="text-sm">
                  <span className="font-medium">Notes: </span>
                  <span className="text-muted">{pyramid.map((n) => n.name).join(" · ")}</span>
                </p>
              )}
              <AddToCart product={product} />
              <Link
                href={`/products/${product.slug}`}
                className="inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                View full details
              </Link>
            </div>
          </motion.div>
        )}
      </Modal>
    </>
  );
}
