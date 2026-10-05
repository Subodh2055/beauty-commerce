"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useStore, type CartLine } from "@/lib/store";
import { closeCart, useCartDrawer } from "@/lib/cart-ui";
import { shippingFor, useShippingRules } from "@/lib/shipping";
import { formatMoney, pluralize } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Drawer } from "@/components/ui/drawer";
import { ButtonLink } from "@/components/ui/button";
import { BagIcon, MinusIcon, PlusIcon, TrashIcon, TruckIcon } from "@/components/ui/icons";

/**
 * Slide-in bag. Opened from the header bag and after adding from a product
 * page. Quantity changes are optimistic: the local store updates instantly and
 * CartSync mirrors them to the server for signed-in shoppers.
 */
export function CartDrawer() {
  const open = useCartDrawer();
  const pathname = usePathname();
  const { cart, cartCount, cartSubtotal, setQuantity, removeFromCart } = useStore();
  const rules = useShippingRules();
  const reduce = useReducedMotion();

  // Any navigation (e.g. tapping a line) closes the drawer.
  useEffect(() => {
    closeCart();
  }, [pathname]);

  const currency = cart[0]?.currency ?? "NPR";
  const shipping = shippingFor(cartSubtotal, rules);
  const toFree = Math.max(0, rules.freeThreshold - cartSubtotal);
  const progress = Math.min(1, cartSubtotal / rules.freeThreshold);

  function remove(l: CartLine) {
    removeFromCart(l.variantId);
    toast.info(`Removed ${l.name} from your bag`);
  }

  return (
    <Drawer
      open={open}
      onClose={closeCart}
      title="Your bag"
      header={
        <p className="font-display text-xl font-semibold">
          Your bag{" "}
          <span className="font-sans text-sm font-normal text-muted">({pluralize(cartCount, "item")})</span>
        </p>
      }
      footer={
        cart.length > 0 ? (
          <div className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(cartSubtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd className="tabular-nums">{shipping === 0 ? "Free" : formatMoney(shipping, currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(cartSubtotal + shipping, currency)}</dd>
              </div>
            </dl>
            <ButtonLink href="/checkout" size="lg" className="w-full">
              Checkout
            </ButtonLink>
            <ButtonLink href="/cart" variant="ghost" size="sm" className="w-full">
              View full bag
            </ButtonLink>
          </div>
        ) : undefined
      }
    >
      {cart.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-pill bg-surface-2 text-muted">
            <BagIcon width={26} height={26} />
          </span>
          <div>
            <p className="font-display text-2xl font-semibold">Your bag is empty</p>
            <p className="mt-1 text-sm text-muted">Find something you love — it will wait here.</p>
          </div>
          <ButtonLink href="/products?sort=bestselling" variant="outline">
            Shop bestsellers
          </ButtonLink>
        </div>
      ) : (
        <div className="px-5 py-4">
          <div className="mb-4 rounded-card bg-surface-2 p-3.5" aria-live="polite">
            <p className="flex items-center gap-2 text-sm">
              <TruckIcon width={18} height={18} className="shrink-0 text-accent" />
              {toFree > 0 ? (
                <span>
                  Add <span className="font-semibold">{formatMoney(toFree, currency)}</span> more for free delivery
                </span>
              ) : (
                <span className="font-medium">You&apos;ve unlocked free delivery</span>
              )}
            </p>
            <div
              className="mt-2.5 h-1.5 overflow-hidden rounded-pill bg-border"
              role="progressbar"
              aria-label="Progress to free delivery"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div
                className="h-full origin-left rounded-pill bg-accent transition-transform duration-(--duration-slower) ease-luxe"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
          </div>

          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {cart.map((l) => (
                <motion.li
                  key={l.variantId}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: 32, transition: { duration: 0.18 } }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="flex gap-3.5 py-4"
                >
                  <Link
                    href={`/products/${l.slug}`}
                    className="focus-ring relative h-24 w-20 shrink-0 overflow-hidden rounded-control bg-surface-2"
                    tabIndex={-1}
                    aria-hidden
                  >
                    {l.imageUrl && <Image src={l.imageUrl} alt="" fill sizes="80px" className="object-cover" />}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    {l.brand && (
                      <p className="text-2xs font-semibold tracking-eyebrow text-muted uppercase">{l.brand}</p>
                    )}
                    <Link href={`/products/${l.slug}`} className="focus-ring truncate rounded-sm font-medium hover:text-accent">
                      {l.name}
                    </Link>
                    <p className="text-xs text-muted">{l.variantName}</p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <div className="inline-flex h-9 items-center rounded-pill border border-border">
                        <button
                          type="button"
                          className="focus-ring inline-flex h-full w-9 cursor-pointer items-center justify-center rounded-l-pill disabled:opacity-40"
                          onClick={() => (l.quantity <= 1 ? remove(l) : setQuantity(l.variantId, l.quantity - 1))}
                          aria-label={l.quantity <= 1 ? `Remove ${l.name}` : `Decrease quantity of ${l.name}`}
                        >
                          <MinusIcon width={14} height={14} />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">
                          {l.quantity}
                        </span>
                        <button
                          type="button"
                          className="focus-ring inline-flex h-full w-9 cursor-pointer items-center justify-center rounded-r-pill disabled:opacity-40"
                          onClick={() => setQuantity(l.variantId, l.quantity + 1)}
                          disabled={l.quantity >= 10}
                          aria-label={`Increase quantity of ${l.name}`}
                        >
                          <PlusIcon width={14} height={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatMoney(Number(l.unitPrice) * l.quantity, l.currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(l)}
                          className="focus-ring inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-pill text-muted transition-colors hover:text-danger"
                          aria-label={`Remove ${l.name}`}
                        >
                          <TrashIcon width={16} height={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </Drawer>
  );
}
