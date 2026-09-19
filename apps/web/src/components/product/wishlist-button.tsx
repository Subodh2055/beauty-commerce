"use client";

import { useStore, type WishlistItem } from "@/lib/store";
import { toast } from "@/lib/toast";
import { HeartIcon } from "@/components/ui/icons";

export function WishlistButton({
  item,
  className = "",
  size = 20,
}: {
  item: WishlistItem;
  className?: string;
  size?: number;
}) {
  const { toggleWishlist, isWishlisted } = useStore();
  const active = isWishlisted(item.productId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWishlist(item);
        toast[active ? "info" : "success"](
          active ? `Removed ${item.name} from wishlist` : `Saved ${item.name} to wishlist`,
        );
      }}
      aria-pressed={active}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      className={`focus-ring inline-flex items-center justify-center rounded-full transition-colors ${
        active ? "text-accent" : "text-foreground hover:text-accent"
      } ${className}`}
    >
      <HeartIcon width={size} height={size} filled={active} />
    </button>
  );
}
