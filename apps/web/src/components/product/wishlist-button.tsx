"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useStore, type WishlistItem } from "@/lib/store";
import { toast } from "@/lib/toast";
import { HeartIcon } from "@/components/ui/icons";

const BURST = [0, 60, 120, 180, 240, 300];

/**
 * Optimistic heart: the local wishlist flips instantly (WishlistSync mirrors it
 * to the server when signed in). Saving pops the heart and throws a small ring
 * of sparks; removing just settles. Transform/opacity only; still for reduced motion.
 */
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
  const reduce = useReducedMotion();
  const active = isWishlisted(item.productId);
  const [pops, setPops] = useState(0);
  // Callers often position the button absolutely; only add `relative` (for the sparks) if not.
  const positioned = /\b(absolute|fixed|sticky)\b/.test(className) ? "" : "relative";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWishlist(item);
        if (!active) setPops((n) => n + 1);
        toast[active ? "info" : "success"](
          active ? `Removed ${item.name} from wishlist` : `Saved ${item.name} to wishlist`,
        );
      }}
      aria-pressed={active}
      aria-label={active ? `Remove ${item.name} from wishlist` : `Save ${item.name} to wishlist`}
      className={`focus-ring ${positioned} inline-flex cursor-pointer items-center justify-center rounded-full transition-colors duration-(--duration-fast) ${
        active ? "text-accent" : "text-foreground hover:text-accent"
      } ${className}`}
    >
      <motion.span
        key={pops}
        className="inline-flex"
        initial={false}
        animate={reduce || pops === 0 ? undefined : { scale: [1, 1.38, 0.88, 1] }}
        transition={{ duration: 0.5, times: [0, 0.35, 0.7, 1], ease: "easeOut" }}
      >
        <HeartIcon width={size} height={size} filled={active} />
      </motion.span>
      <AnimatePresence>
        {!reduce && active && pops > 0 && (
          <motion.span key={pops} aria-hidden className="pointer-events-none absolute inset-0" exit={{ opacity: 0 }}>
            {BURST.map((deg) => (
              <motion.span
                key={deg}
                className="absolute left-1/2 top-1/2 -ml-0.5 -mt-0.5 h-1 w-1 rounded-full bg-accent"
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{
                  opacity: 0,
                  x: Math.cos((deg * Math.PI) / 180) * size * 0.9,
                  y: Math.sin((deg * Math.PI) / 180) * size * 0.9,
                  scale: 0.4,
                }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
