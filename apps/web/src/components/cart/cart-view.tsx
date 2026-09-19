"use client";

import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { formatMoney, pluralize } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

const FREE_SHIPPING_THRESHOLD = 5000;
const SHIPPING_FEE = 150;

export function CartView() {
  const { cart, hydrated, setQuantity, removeFromCart, clearCart, cartSubtotal, cartCount } =
    useStore();

  function remove(variantId: string, name: string) {
    removeFromCart(variantId);
    toast.info(`Removed ${name} from your bag`);
  }

  function emptyBag() {
    if (cart.length === 0) return;
    clearCart();
    toast.info("Bag cleared");
  }

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-16 text-center">
        <p className="mb-4 text-muted">Your bag is empty.</p>
        <ButtonLink href="/products">Start shopping</ButtonLink>
      </div>
    );
  }

  const currency = cart[0].currency;
  const shipping = cartSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = cartSubtotal + shipping;
  const toFree = FREE_SHIPPING_THRESHOLD - cartSubtotal;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-4 flex items-center justify-between text-sm">
          <p className="text-muted">{pluralize(cartCount, "item")}</p>
          <button type="button" onClick={emptyBag} className="text-muted hover:text-danger">
            Clear bag
          </button>
        </div>
        <ul className="divide-y divide-border">
          {cart.map((l) => (
            <li key={l.variantId} className="flex gap-4 py-5">
              <Link
                href={`/products/${l.slug}`}
                className="relative h-28 w-22 shrink-0 overflow-hidden rounded-xl bg-surface-2"
              >
                {l.imageUrl && (
                  <Image src={l.imageUrl} alt="" fill sizes="88px" className="object-cover" />
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-1">
                {l.brand && (
                  <p className="text-xs uppercase tracking-wider text-muted">{l.brand}</p>
                )}
                <Link href={`/products/${l.slug}`} className="font-medium hover:text-accent">
                  {l.name}
                </Link>
                <p className="text-sm text-muted">{l.variantName}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="inline-flex h-9 items-center rounded-full border border-border">
                    <button
                      type="button"
                      className="focus-ring h-full rounded-l-full px-2.5"
                      onClick={() => setQuantity(l.variantId, l.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      <MinusIcon width={14} height={14} />
                    </button>
                    <span className="w-7 text-center text-sm tabular-nums">{l.quantity}</span>
                    <button
                      type="button"
                      className="focus-ring h-full rounded-r-full px-2.5"
                      onClick={() => setQuantity(l.variantId, l.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      <PlusIcon width={14} height={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {formatMoney(Number(l.unitPrice) * l.quantity, l.currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(l.variantId, l.name)}
                      className="focus-ring rounded-full p-1.5 text-muted hover:text-danger"
                      aria-label={`Remove ${l.name}`}
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className="h-fit space-y-4 rounded-3xl bg-surface-2 p-6 lg:sticky lg:top-24">
        <h2 className="font-serif text-lg font-semibold">Summary</h2>
        <dl className="space-y-2 text-sm">
          <Row label="Subtotal" value={formatMoney(cartSubtotal, currency)} />
          <Row label="Shipping" value={shipping === 0 ? "Free" : formatMoney(shipping, currency)} />
          <div className="border-t border-border pt-2">
            <Row label="Total" value={formatMoney(total, currency)} strong />
          </div>
        </dl>
        {toFree > 0 && (
          <p className="text-xs text-muted">
            Add {formatMoney(toFree, currency)} more for free shipping.
          </p>
        )}
        <ButtonLink href="/checkout" size="lg" className="w-full">
          Checkout
        </ButtonLink>
        <p className="text-center text-xs text-muted">
          Prices include 13% VAT. Final totals are confirmed at checkout.
        </p>
        <Button variant="ghost" size="sm" className="w-full" onClick={emptyBag}>
          Clear bag
        </Button>
      </aside>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
