"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { HeartIcon } from "@/components/ui/icons";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/** Saved products. Removal is optimistic (local store first, server mirrored). */
export function WishlistView() {
  const { wishlist, hydrated, toggleWishlist } = useStore();
  const reduce = useReducedMotion();

  if (!hydrated) return <ProductGridSkeleton count={4} />;

  if (wishlist.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet"
        description="Tap the heart on any product to keep it here."
        icon={<HeartIcon width={26} height={26} />}
        action={<ButtonLink href="/products">Browse products</ButtonLink>}
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence initial={false}>
        {wishlist.map((w) => (
          <motion.li
            key={w.productId}
            layout={!reduce}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="group relative"
          >
            <Link
              href={`/products/${w.slug}`}
              className="focus-ring relative block aspect-4/5 overflow-hidden rounded-card bg-surface-2"
              tabIndex={-1}
              aria-hidden
            >
              {w.imageUrl && (
                <Image
                  src={w.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 20vw, (min-width: 640px) 30vw, 50vw"
                  className="object-cover transition-transform duration-(--duration-slower) group-hover:scale-105"
                />
              )}
            </Link>
            <button
              type="button"
              onClick={() => {
                toggleWishlist(w);
                toast.info(`Removed ${w.name} from wishlist`);
              }}
              className="focus-ring absolute right-3 top-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-pill bg-surface/90 text-accent shadow-hairline backdrop-blur transition-transform duration-(--duration-fast) active:scale-90"
              aria-label={`Remove ${w.name} from wishlist`}
            >
              <HeartIcon filled />
            </button>
            <div className="mt-3 space-y-1">
              {w.brand && <p className="text-2xs font-semibold tracking-eyebrow text-muted uppercase">{w.brand}</p>}
              <Link href={`/products/${w.slug}`} className="focus-ring block rounded-sm text-sm font-medium hover:text-accent">
                {w.name}
              </Link>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(w.price, w.currency)}</p>
              <Link
                href={`/products/${w.slug}`}
                className="focus-ring inline-block rounded-sm text-xs font-medium text-accent underline-offset-4 hover:underline"
              >
                Choose size &amp; add to bag
              </Link>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
