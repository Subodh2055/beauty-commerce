"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useAddresses,
  useAuth,
  useCoupons,
  useOrders,
  usePayments,
  type Address,
  type PaymentMethodOption,
  type ShippingAddress,
} from "@/lib/auth";
import { useStore } from "@/lib/store";
import { shippingFor, useShippingRules } from "@/lib/shipping";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { AddressCard } from "@/components/account/address-form";
import { PageHeader } from "@/components/catalog/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { BagIcon, CardIcon, PinIcon, TruckIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutSteps, STEPS, type StepId } from "./checkout-steps";

type AddressDraft = Omit<ShippingAddress, "country">;
type DraftErrors = Partial<Record<keyof AddressDraft, string>>;

const VALLEY = ["kathmandu", "lalitpur", "bhaktapur", "patan", "kirtipur"];

function validate(d: AddressDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.recipient_name.trim()) e.recipient_name = "Enter the recipient's name.";
  if (d.phone.replace(/\D/g, "").length < 7) e.phone = "Enter a phone number we can call on delivery.";
  if (!d.line1.trim()) e.line1 = "Enter the street or area.";
  if (!d.city.trim()) e.city = "Enter the city.";
  return e;
}

function toShipping(a: Address | AddressDraft): ShippingAddress {
  return {
    recipient_name: a.recipient_name.trim(),
    phone: a.phone.trim(),
    line1: a.line1.trim(),
    line2: a.line2?.trim() || null,
    city: a.city.trim(),
    state: a.state?.trim() || null,
    postal_code: a.postal_code?.trim() || null,
    country: "NP",
  };
}

function eta(city: string): string {
  return VALLEY.includes(city.trim().toLowerCase()) ? "1–2 business days" : "3–5 business days";
}

/**
 * Checkout in four steps: address → delivery → payment → review. The step
 * lives in the URL (?step=) so the browser back button walks back through it.
 * Nothing is charged or reserved until "Place order"; the server re-prices,
 * checks stock and applies the coupon in one transaction.
 */
export function CheckoutFlow() {
  const { user, ready } = useAuth();
  const { cart, cartSubtotal, clearCart, hydrated } = useStore();
  const router = useRouter();

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

  if (!hydrated) {
    return (
      <div className="container-x py-10">
        <Skeleton className="mb-8 h-10 w-full max-w-xl" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="container-x py-10">
        <PageHeader title="Checkout" crumbs={[{ href: "/cart", label: "Bag" }, { href: "/checkout", label: "Checkout" }]} />
        <EmptyState
          title="Your bag is empty"
          description="Add something you love, then come back to check out."
          icon={<BagIcon width={26} height={26} />}
          action={<ButtonLink href="/products">Start shopping</ButtonLink>}
        />
      </div>
    );
  }

  return <Flow userName={user.full_name ?? ""} userPhone={user.phone ?? ""} cartSubtotal={cartSubtotal} clearCart={clearCart} />;
}

function Flow({
  userName,
  userPhone,
  cartSubtotal,
  clearCart,
}: {
  userName: string;
  userPhone: string;
  cartSubtotal: number;
  clearCart: () => void;
}) {
  const { cart } = useStore();
  const addressApi = useAddresses();
  const payments = usePayments();
  const { checkout } = useOrders();
  const { validate: validateCoupon } = useCoupons();
  const rules = useShippingRules();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);

  // --- data
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [methods, setMethods] = useState<PaymentMethodOption[] | null>(null);

  // --- choices
  const [selectedId, setSelectedId] = useState<string>("new");
  const [draft, setDraft] = useState<AddressDraft>({
    recipient_name: userName,
    phone: userPhone,
    line1: "",
    line2: "",
    city: "Kathmandu",
    state: "",
    postal_code: "",
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saveAddress, setSaveAddress] = useState(true);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethodOption["method"]>("COD");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reached, setReached] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    let active = true;
    addressApi
      .list()
      .then((list) => {
        if (!active) return;
        setAddresses(list);
        const def = list.find((a) => a.is_default) ?? list[0];
        if (def) setSelectedId(def.id);
      })
      .catch(() => active && setAddresses([]));
    payments
      .methods()
      .then((m) => active && setMethods(m))
      .catch(
        () =>
          active &&
          setMethods([
            { method: "COD", label: "Cash on Delivery", description: "Pay in cash when your order arrives.", available: true, online: false },
          ]),
      );
    return () => {
      active = false;
    };
    // Load once per checkout visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step from the URL, but never past what has been completed.
  const requested = STEPS.findIndex((s) => s.id === params.get("step"));
  const index = Math.max(0, Math.min(requested, reached));
  const step: StepId = STEPS[index].id;

  // Move focus to the step heading on change, for keyboard and screen-reader users.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [step, reduce]);

  function go(id: StepId) {
    const i = STEPS.findIndex((s) => s.id === id);
    setDirection(i >= index ? 1 : -1);
    setReached((r) => Math.max(r, i));
    router.push(i === 0 ? pathname : `${pathname}?step=${id}`, { scroll: false });
  }

  const usingSaved = selectedId !== "new" && !!addresses?.some((a) => a.id === selectedId);
  const selected = addresses?.find((a) => a.id === selectedId) ?? null;
  const shipTo: ShippingAddress = usingSaved && selected ? toShipping(selected) : toShipping(draft);

  const currency = cart[0]?.currency ?? "NPR";
  const discount = coupon?.discount ?? 0;
  const shipping = shippingFor(cartSubtotal, rules);
  const total = Math.max(0, cartSubtotal - discount) + shipping;
  const chosen = methods?.find((m) => m.method === method);

  async function continueFromAddress() {
    if (!usingSaved) {
      const e = validate(draft);
      setErrors(e);
      if (Object.keys(e).length > 0) {
        document.getElementById(`co-${Object.keys(e)[0]}`)?.focus();
        return;
      }
      if (saveAddress) {
        try {
          const created = await addressApi.create({
            ...toShipping(draft),
            line2: draft.line2?.trim() || null,
            state: draft.state?.trim() || null,
            postal_code: draft.postal_code?.trim() || null,
            label: "Home",
            is_default: !addresses || addresses.length === 0,
          });
          setAddresses((list) => [...(list ?? []), created]);
          setSelectedId(created.id);
        } catch {
          // Saving is a convenience; the order still ships to the typed address.
          toast.info("We couldn't save this address to your account, but you can still use it.");
        }
      }
    }
    go("delivery");
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const res = await validateCoupon(code, cartSubtotal);
      setCoupon({ code: res.code, discount: Number(res.discount_amount) });
      setCouponMsg(res.message);
    } catch (err) {
      setCoupon(null);
      setCouponMsg(err instanceof Error ? err.message : "Invalid coupon");
    } finally {
      setCouponBusy(false);
    }
  }

  async function placeOrder() {
    setError(null);
    setBusy(true);
    try {
      const result = await checkout({
        items: cart.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
        shipping_address: shipTo,
        payment_method: method,
        customer_note: note.trim() || undefined,
        coupon_code: coupon?.code,
      });
      clearCart();
      toast.success(result.message);
      const next = result.payment_redirect_url;
      if (next) {
        // Online payment: hand over to the provider's page (the dev stub lives in this app).
        const url = new URL(next, window.location.origin);
        if (url.origin === window.location.origin) router.push(url.pathname + url.search);
        else window.location.assign(next);
      } else {
        router.replace(`/orders/${result.order.id}?placed=1`);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "Could not place order";
      setError(m);
      toast.error(m);
      setBusy(false);
    }
  }

  const stepTitle = { address: "Where should we deliver?", delivery: "Delivery", payment: "How would you like to pay?", review: "Review and place order" }[step];

  return (
    <div className="container-x py-10">
      <PageHeader title="Checkout" crumbs={[{ href: "/cart", label: "Bag" }, { href: "/checkout", label: "Checkout" }]} />
      <CheckoutSteps current={step} reached={reached} onGo={go} />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="step-title" className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface p-5 shadow-soft sm:p-7">
          <h2 id="step-title" ref={heading} tabIndex={-1} className="mb-5 font-display text-2xl font-semibold outline-none sm:text-3xl">
            {stepTitle}
          </h2>

          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16 * direction, transition: { duration: 0.15 } }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === "address" && (
                <div className="space-y-5">
                  {addresses === null ? (
                    <Skeleton className="h-28" />
                  ) : (
                    addresses.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Saved addresses">
                        {addresses.map((a) => (
                          <AddressCard key={a.id} address={a} selectable selected={selectedId === a.id} onSelect={() => setSelectedId(a.id)} />
                        ))}
                        <button
                          type="button"
                          onClick={() => setSelectedId("new")}
                          aria-pressed={!usingSaved}
                          className={`focus-ring cursor-pointer rounded-card border border-dashed p-4 text-left text-sm transition-colors ${
                            usingSaved ? "border-border-strong text-muted hover:border-foreground/40" : "border-accent bg-accent-soft/40"
                          }`}
                        >
                          + Deliver to a new address
                        </button>
                      </div>
                    )
                  )}

                  {!usingSaved && addresses !== null && (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="co-recipient_name" label="Full name" name="recipient_name" autoComplete="name" required value={draft.recipient_name} error={errors.recipient_name} onChange={(e) => setDraft({ ...draft, recipient_name: e.target.value })} />
                        <Field id="co-phone" label="Phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="98XXXXXXXX" value={draft.phone} error={errors.phone} hint="The rider calls this number on arrival." onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                      </div>
                      <Field id="co-line1" label="Address" name="line1" autoComplete="address-line1" required placeholder="Street, area, tole" value={draft.line1} error={errors.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} />
                      <Field label="Apartment, landmark" name="line2" autoComplete="address-line2" placeholder="Optional" value={draft.line2 ?? ""} onChange={(e) => setDraft({ ...draft, line2: e.target.value })} />
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field id="co-city" label="City" name="city" autoComplete="address-level2" required value={draft.city} error={errors.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
                        <Field label="Province" name="state" autoComplete="address-level1" placeholder="Bagmati" value={draft.state ?? ""} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
                        <Field label="Postal code" name="postal_code" autoComplete="postal-code" inputMode="numeric" placeholder="44600" value={draft.postal_code ?? ""} onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })} />
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="h-4 w-4 accent-accent" />
                        Save this address to my account
                      </label>
                    </div>
                  )}

                  <StepActions>
                    <Button size="lg" onClick={continueFromAddress} disabled={addresses === null}>
                      Continue to delivery
                    </Button>
                  </StepActions>
                </div>
              )}

              {step === "delivery" && (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 rounded-card border-2 border-accent bg-accent-soft/30 p-4">
                    <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border-2 border-accent">
                      <span className="h-2.5 w-2.5 rounded-pill bg-accent" />
                    </span>
                    <div className="flex-1">
                      <p className="flex flex-wrap items-baseline justify-between gap-2 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <TruckIcon width={18} height={18} className="text-accent" /> Standard delivery
                        </span>
                        <span className="tabular-nums">{shipping === 0 ? "Free" : formatMoney(shipping, currency)}</span>
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        Arrives in {eta(shipTo.city)} to {shipTo.city}. Items from different sellers may arrive separately — each gets its own tracking.
                      </p>
                      {shipping > 0 && (
                        <p className="mt-1 text-xs text-muted">
                          Free over {formatMoney(rules.freeThreshold, currency)} — add {formatMoney(rules.freeThreshold - cartSubtotal, currency)} more.
                        </p>
                      )}
                    </div>
                  </div>
                  <Textarea label="Delivery instructions" name="customer_note" rows={3} maxLength={1000} placeholder="Gate code, best time to call, nearby landmark… (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <StepActions back={() => go("address")}>
                    <Button size="lg" onClick={() => go("payment")}>
                      Continue to payment
                    </Button>
                  </StepActions>
                </div>
              )}

              {step === "payment" && (
                <div className="space-y-5">
                  {methods === null ? (
                    <div className="space-y-2">
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                    </div>
                  ) : (
                    <fieldset className="space-y-2">
                      <legend className="sr-only">Payment method</legend>
                      {methods.map((m) => (
                        <label
                          key={m.method}
                          className={`flex items-center gap-3 rounded-card border p-4 transition-colors duration-(--duration-fast) focus-within:ring-2 focus-within:ring-ring ${
                            method === m.method ? "border-accent bg-accent-soft/40" : "border-border"
                          } ${m.available ? "cursor-pointer hover:border-border-strong" : "cursor-not-allowed opacity-60"}`}
                        >
                          <input type="radio" name="payment_method" value={m.method} checked={method === m.method} disabled={!m.available} onChange={() => setMethod(m.method)} className="h-4 w-4 accent-accent" />
                          <span className="flex-1">
                            <span className="font-medium">{m.label}</span>
                            <span className="block text-xs text-muted">{m.description}</span>
                          </span>
                          {m.online && m.available && <CardIcon width={20} height={20} className="text-muted" />}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {chosen?.online && (
                    <p className="text-sm text-muted">
                      After you place the order you&apos;ll be taken to {chosen.label} to pay. Your order is confirmed once payment succeeds.
                    </p>
                  )}
                  <StepActions back={() => go("delivery")}>
                    <Button size="lg" onClick={() => go("review")} disabled={!chosen?.available}>
                      Review order
                    </Button>
                  </StepActions>
                </div>
              )}

              {step === "review" && (
                <div className="space-y-5">
                  <FormError message={error} />
                  <dl className="divide-y divide-border rounded-card border border-border">
                    <ReviewRow icon={<PinIcon width={18} height={18} />} label="Deliver to" onEdit={() => go("address")}>
                      <span className="font-medium text-foreground">{shipTo.recipient_name}</span> · {shipTo.phone}
                      <br />
                      {shipTo.line1}
                      {shipTo.line2 ? `, ${shipTo.line2}` : ""}, {shipTo.city}
                      {shipTo.state ? `, ${shipTo.state}` : ""} {shipTo.postal_code ?? ""}
                    </ReviewRow>
                    <ReviewRow icon={<TruckIcon width={18} height={18} />} label="Delivery" onEdit={() => go("delivery")}>
                      Standard, {eta(shipTo.city)} · {shipping === 0 ? "Free" : formatMoney(shipping, currency)}
                      {note.trim() && <><br />“{note.trim()}”</>}
                    </ReviewRow>
                    <ReviewRow icon={<CardIcon width={18} height={18} />} label="Payment" onEdit={() => go("payment")}>
                      {chosen?.label ?? method}
                    </ReviewRow>
                  </dl>

                  <div>
                    <div className="flex gap-2">
                      <label className="sr-only" htmlFor="co-coupon">Coupon code</label>
                      <input
                        id="co-coupon"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyCoupon())}
                        placeholder="Coupon code"
                        aria-describedby={couponMsg ? "co-coupon-msg" : undefined}
                        className="focus-ring h-11 flex-1 rounded-control border border-border-strong bg-surface px-3 text-sm uppercase placeholder:normal-case placeholder:text-muted"
                      />
                      <Button type="button" variant="outline" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()}>
                        {couponBusy ? "Checking…" : coupon ? "Update" : "Apply"}
                      </Button>
                    </div>
                    {couponMsg && (
                      <p id="co-coupon-msg" role="status" className={`mt-1.5 text-xs ${coupon ? "text-success" : "text-danger"}`}>
                        {couponMsg}
                      </p>
                    )}
                  </div>

                  <StepActions back={() => go("payment")}>
                    <Button size="lg" onClick={placeOrder} disabled={busy} className="min-w-56">
                      {busy ? "Placing order…" : `Place order · ${formatMoney(total, currency)}`}
                    </Button>
                  </StepActions>
                  <p className="text-xs text-muted">
                    By placing this order you agree to our terms. Prices include 13% VAT; the final total is confirmed by our server.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        <OrderSummary subtotal={cartSubtotal} discount={discount} coupon={coupon?.code} shipping={shipping} total={total} currency={currency} />
      </div>
    </div>
  );
}

function StepActions({ back, children }: { back?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
      {back ? (
        <Button variant="ghost" onClick={back}>
          ← Back
        </Button>
      ) : (
        <Link href="/cart" className="focus-ring rounded-sm text-sm text-muted hover:text-foreground">
          ← Back to bag
        </Link>
      )}
      {children}
    </div>
  );
}

function ReviewRow({ icon, label, onEdit, children }: { icon: ReactNode; label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span className="mt-0.5 text-muted" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-2xs font-semibold tracking-eyebrow text-muted uppercase">{label}</dt>
        <dd className="mt-1 text-sm text-muted">{children}</dd>
      </div>
      <button type="button" onClick={onEdit} className="focus-ring cursor-pointer rounded-sm text-sm font-medium text-accent hover:underline" aria-label={`Change ${label.toLowerCase()}`}>
        Change
      </button>
    </div>
  );
}

function OrderSummary({
  subtotal,
  discount,
  coupon,
  shipping,
  total,
  currency,
}: {
  subtotal: number;
  discount: number;
  coupon?: string;
  shipping: number;
  total: number;
  currency: string;
}) {
  const { cart, cartCount } = useStore();
  const lines = (
    <ul className="space-y-3">
      {cart.map((l) => (
        <li key={l.variantId} className="flex gap-3">
          <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded-control bg-surface">
            {l.imageUrl && <Image src={l.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-primary px-1 text-2xs font-bold text-primary-foreground">
              {l.quantity}
            </span>
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{l.name}</p>
            <p className="text-muted">{l.variantName}</p>
          </div>
          <span className="text-sm font-medium tabular-nums">{formatMoney(Number(l.unitPrice) * l.quantity, l.currency)}</span>
        </li>
      ))}
    </ul>
  );
  const totals = (
    <dl className="space-y-2 border-t border-border pt-3 text-sm">
      <SummaryRow label="Subtotal" value={formatMoney(subtotal, currency)} />
      {discount > 0 && <SummaryRow label={`Discount (${coupon})`} value={`− ${formatMoney(discount, currency)}`} />}
      <SummaryRow label="Shipping" value={shipping === 0 ? "Free" : formatMoney(shipping, currency)} />
      <div className="border-t border-border pt-2">
        <SummaryRow label="Total" value={formatMoney(total, currency)} strong />
      </div>
    </dl>
  );
  return (
    <aside aria-label="Order summary" className="h-fit rounded-panel bg-surface-2 p-5 sm:p-6 lg:sticky lg:top-24">
      {/* Mobile: collapsed behind a disclosure so the step stays in view. */}
      <details className="group lg:hidden">
        <summary className="focus-ring flex cursor-pointer list-none items-center justify-between rounded-sm [&::-webkit-details-marker]:hidden">
          <span className="font-medium">
            Order summary <span className="text-sm font-normal text-muted">({cartCount})</span>
          </span>
          <span className="font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </summary>
        <div className="mt-4 space-y-4">
          {lines}
          {totals}
        </div>
      </details>
      <div className="hidden space-y-4 lg:block">
        <h2 className="font-display text-xl font-semibold">Your order</h2>
        {lines}
        {totals}
      </div>
    </aside>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
