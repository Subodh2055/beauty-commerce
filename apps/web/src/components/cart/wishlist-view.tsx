"use client";

import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { HeartIcon } from "@/components/ui/icons";
import { ProductGridSkeleton } from "@/components/ui/skeleton";

export function WishlistView() {
  const { wishlist, hydrated, toggleWishlist } = useStore();

  if (!hydrated) return <ProductGridSkeleton count={4} />;

  if (wishlist.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-16 text-center">
        <p className="mb-4 text-muted">Nothing saved yet. Tap the heart on any product.</p>
        <ButtonLink href="/products">Browse products</ButtonLink>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {wishlist.map((w) => (
        <li key={w.productId} className="group relative">
          <Link
            href={`/products/${w.slug}`}
            className="focus-ring relative block aspect-[4/5] overflow-hidden rounded-2xl bg-surface-2"
          >
            {w.imageUrl && (
              <Image
                src={w.imageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )}
          </Link>
          <button
            type="button"
            onClick={() => {
              toggleWishlist(w);
              toast.info(`Removed ${w.name} from wishlist`);
            }}
            className="focus-ring absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-accent shadow-sm backdrop-blur"
            aria-label={`Remove ${w.name} from wishlist`}
          >
            <HeartIcon filled />
          </button>
          <div className="mt-3 space-y-1">
            {w.brand && <p className="text-xs uppercase tracking-wider text-muted">{w.brand}</p>}
            <Link href={`/products/${w.slug}`} className="block text-sm font-medium hover:text-accent">
              {w.name}
            </Link>
            <p className="text-sm font-semibold">{formatMoney(w.price, w.currency)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
