"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  useAddresses,
  useAuth,
  useCoupons,
  useOrders,
  type Address,
  type ShippingAddress,
} from "@/lib/auth";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/catalog/page-header";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AddressCard } from "@/components/account/address-form";

const FREE_SHIPPING_THRESHOLD = 5000;
const SHIPPING_FEE = 150;

const PAYMENT_METHODS = [
  { value: "COD", label: "Cash on Delivery", available: true, note: "Pay in cash when your order arrives." },
  { value: "ESEWA", label: "eSewa", available: false, note: "Coming soon" },
  { value: "KHALTI", label: "Khalti", available: false, note: "Coming soon" },
  { value: "STRIPE", label: "Card (Stripe)", available: false, note: "Coming soon" },
];

export default function CheckoutPage() {
  const { user, ready } = useAuth();
  const { checkout } = useOrders();
  const { validate } = useCoupons();
  const addressApi = useAddresses();
  const { cart, cartSubtotal, clearCart, hydrated } = useStore();
  const router = useRouter();

  const [method, setMethod] = useState("COD");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Saved addresses; selectedId is an address id, or "new" for the manual form.
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("new");

  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    (async () => {
      try {
        const list = await addressApi.list();
        if (!active) return;
        setAddresses(list);
        const def = list.find((a) => a.is_default) ?? list[0];
        setSelectedId(def ? def.id : "new");
      } catch {
        if (active) setAddresses([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const res = await validate(code, cartSubtotal);
      setCoupon({ code: res.code, discount: Number(res.discount_amount) });
      setCouponMsg(res.message);
      toast.success(res.message);
    } catch (err) {
      setCoupon(null);
      const m = err instanceof Error ? err.message : "Invalid coupon";
      setCouponMsg(m);
      toast.error(m);
    } finally {
      setCouponBusy(false);
    }
  }

  useEffect(() => {
    if (ready && !user) router.replace("/login?next=/checkout");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <AuthCard title="Sign in to check out" subtitle="You need an account to place an order.">
        <ButtonLink href="/login?next=/checkout" size="lg" className="w-full">
          Sign in
        </ButtonLink>
      </AuthCard>
    );
  }

  if (hydrated && cart.length === 0) {
    return (
      <div className="container-x py-10">
        <PageHeader title="Checkout" crumbs={[{ href: "/cart", label: "Bag" }, { href: "/checkout", label: "Checkout" }]} />
        <div className="rounded-3xl border border-dashed border-border p-16 text-center">
          <p className="mb-4 text-muted">Your bag is empty.</p>
          <ButtonLink href="/products">Start shopping</ButtonLink>
        </div>
      </div>
    );
  }

  const currency = cart[0]?.currency ?? "NPR";
  const discount = coupon?.discount ?? 0;
  const shipping = cartSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = Math.max(0, cartSubtotal - discount) + shipping;

  const usingSaved = selectedId !== "new";
  const selectedAddress = addresses?.find((a) => a.id === selectedId) ?? null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const shipping_address: ShippingAddress =
      usingSaved && selectedAddress
        ? {
            recipient_name: selectedAddress.recipient_name,
            phone: selectedAddress.phone,
            line1: selectedAddress.line1,
            line2: selectedAddress.line2,
            city: selectedAddress.city,
            state: selectedAddress.state,
            postal_code: selectedAddress.postal_code,
            country: selectedAddress.country,
          }
        : {
            recipient_name: String(fd.get("recipient_name")),
            phone: String(fd.get("phone")),
            line1: String(fd.get("line1")),
            line2: String(fd.get("line2")) || null,
            city: String(fd.get("city")),
            state: String(fd.get("state")) || null,
            postal_code: String(fd.get("postal_code")) || null,
            country: "NP",
          };
    try {
      const result = await checkout({
        items: cart.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
        shipping_address,
        payment_method: method,
        customer_note: String(fd.get("customer_note")) || undefined,
        coupon_code: coupon?.code,
      });
      clearCart();
      toast.success(result.message);
      router.replace(`/orders/${result.order.id}?placed=1`);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Could not place order";
      setError(m);
      toast.error(m);
      setBusy(false);
    }
  }

  return (
    <div className="container-x py-10">
      <PageHeader title="Checkout" crumbs={[{ href: "/cart", label: "Bag" }, { href: "/checkout", label: "Checkout" }]} />

      <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="font-serif text-lg font-semibold">Shipping address</h2>
            <FormError message={error} />

            {addresses && addresses.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => (
                  <AddressCard
                    key={a.id}
                    address={a}
                    selectable
                    selected={selectedId === a.id}
                    onSelect={() => setSelectedId(a.id)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedId("new")}
                  className={`focus-ring rounded-2xl border border-dashed p-4 text-left text-sm transition-colors ${
                    usingSaved ? "border-border text-muted hover:border-foreground/30" : "border-accent bg-accent-soft/40 text-foreground"
                  }`}
                >
                  + Enter a new address
                </button>
              </div>
            )}

            <div className={usingSaved && addresses && addresses.length > 0 ? "hidden" : "space-y-4"}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" name="recipient_name" defaultValue={user.full_name ?? ""} />
                <Field label="Phone" name="phone" type="tel" placeholder="98XXXXXXXX" />
              </div>
              <Field label="Address line 1" name="line1" placeholder="Street, area" />
              <Field label="Address line 2" name="line2" placeholder="Apartment, landmark (optional)" />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="City" name="city" defaultValue="Kathmandu" />
                <Field label="Province" name="state" placeholder="Bagmati" />
                <Field label="Postal code" name="postal_code" placeholder="44600" />
              </div>
            </div>
            <Field label="Order note" name="customer_note" placeholder="Delivery instructions (optional)" />
          </section>

          <section className="space-y-3 rounded-3xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="font-serif text-lg font-semibold">Payment</h2>
            <div className="space-y-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors ${
                    method === m.value ? "border-accent bg-accent-soft/50" : "border-border"
                  } ${!m.available ? "cursor-not-allowed opacity-55" : ""}`}
                >
                  <input
                    type="radio"
                    name="payment_method"
                    value={m.value}
                    checked={method === m.value}
                    disabled={!m.available}
                    onChange={() => setMethod(m.value)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="flex-1">
                    <span className="font-medium">{m.label}</span>
                    <span className="block text-xs text-muted">{m.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="h-fit space-y-4 rounded-3xl bg-surface-2 p-6 lg:sticky lg:top-24">
          <h2 className="font-serif text-lg font-semibold">Your order</h2>
          <ul className="space-y-3">
            {cart.map((l) => (
              <li key={l.variantId} className="flex gap-3">
                <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                  {l.imageUrl && <Image src={l.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                    {l.quantity}
                  </span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="text-muted">{l.variantName}</p>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {formatMoney(Number(l.unitPrice) * l.quantity, l.currency)}
                </span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Coupon code"
                className="focus-ring h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm uppercase placeholder:normal-case placeholder:text-muted"
              />
              <Button type="button" variant="outline" onClick={applyCoupon} disabled={couponBusy}>
                {couponBusy ? "…" : coupon ? "Update" : "Apply"}
              </Button>
            </div>
            {couponMsg && (
              <p className={`text-xs ${coupon ? "text-success" : "text-danger"}`}>{couponMsg}</p>
            )}
          </div>

          <dl className="space-y-2 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={formatMoney(cartSubtotal, currency)} />
            {discount > 0 && (
              <Row label={`Discount (${coupon?.code})`} value={`− ${formatMoney(discount, currency)}`} />
            )}
            <Row label="Shipping" value={shipping === 0 ? "Free" : formatMoney(shipping, currency)} />
            <div className="border-t border-border pt-2">
              <Row label="Total" value={formatMoney(total, currency)} strong />
            </div>
          </dl>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Placing order…" : `Place order · ${formatMoney(total, currency)}`}
          </Button>
          <p className="text-center text-xs text-muted">
            By placing this order you agree to our terms. Prices include 13% VAT.
          </p>
          <Link href="/cart" className="block text-center text-xs text-muted hover:text-accent">
            ← Back to bag
          </Link>
        </aside>
      </form>
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
