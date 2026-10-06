"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAccount, useAuth, useOrders, type OrderSummary } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { AccountShell } from "@/components/account/account-shell";
import { FormError } from "@/components/auth/auth-card";
import { OrderStatusBadge } from "@/components/order/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ChevronIcon, EditIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { ForYou } from "@/components/recommendations/for-you";

export default function AccountPage() {
  return (
    <AccountShell title="My account" crumbs={[{ href: "/account", label: "Account" }]}>
      <Overview />
    </AccountShell>
  );
}

function Overview() {
  const { user, logout } = useAuth();
  const { wishlist, cartCount } = useStore();
  const { list } = useOrders();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    list()
      .then((r) => {
        if (!active) return;
        setOrders(r.items.slice(0, 3));
        setTotal(r.total);
      })
      .catch(() => active && setOrders([]));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <Profile />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat href="/orders" label="Orders" value={total === null ? "…" : String(total)} />
        <Stat href="/wishlist" label="Saved" value={String(wishlist.length)} />
        <Stat href="/cart" label="In bag" value={String(cartCount)} />
      </div>

      <section aria-labelledby="recent-orders" className="rounded-panel border border-border bg-surface p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-orders" className="font-display text-xl font-semibold">
            Recent orders
          </h2>
          <Link href="/orders" className="focus-ring rounded-sm text-sm font-medium text-accent hover:underline">
            All orders
          </Link>
        </div>
        {orders === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted">No orders yet — your first one will show up here with live tracking.</p>
        ) : (
          <ul className="divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="focus-ring group flex items-center gap-3 rounded-sm py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {o.order_number} <OrderStatusBadge status={o.status} />
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                      {o.item_count} item{o.item_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</span>
                  <ChevronIcon width={16} height={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ForYou />

      <section className="flex flex-col gap-3 rounded-panel border border-border bg-surface-2 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">Sign out</h2>
          <p className="text-sm text-muted">Ends this device&apos;s session and revokes its refresh token.</p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            logout().then(() => {
              toast.info("Signed out");
              router.push("/");
            })
          }
        >
          Sign out
        </Button>
      </section>
    </div>
  );
}

function Profile() {
  const { user, resendVerification } = useAuth();
  const { updateProfile } = useAccount();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (!user) return null;

  const initials = (user.full_name || user.email)
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") ?? "").trim();
    if (!full_name) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ full_name, phone: String(fd.get("phone") ?? "").trim() || null });
      setEditing(false);
      toast.success("Profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setSending(true);
    try {
      toast.success(await resendVerification());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="profile-title" className="rounded-panel border border-border bg-surface p-6 shadow-soft">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-pill bg-accent-soft font-display text-2xl font-semibold text-accent">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="profile-title" className="truncate text-lg font-medium">
            {user.full_name || "Beauty shopper"}
          </h2>
          <p className="truncate text-sm text-muted">{user.email}</p>
          {user.phone && <p className="text-sm text-muted">{user.phone}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {user.is_email_verified ? (
              <Badge tone="success">Email verified</Badge>
            ) : (
              <>
                <Badge tone="gold">Email not verified</Badge>
                <button
                  type="button"
                  onClick={resend}
                  disabled={sending}
                  className="focus-ring cursor-pointer rounded-sm text-xs font-medium text-accent underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Resend link"}
                </button>
              </>
            )}
          </div>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <EditIcon width={15} height={15} /> Edit profile
          </Button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="mt-6 space-y-4 border-t border-border pt-6 animate-fade-up">
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="full_name" autoComplete="name" required defaultValue={user.full_name ?? ""} />
            <Field label="Phone" name="phone" type="tel" autoComplete="tel" defaultValue={user.phone ?? ""} placeholder="98XXXXXXXX" hint="Used to pre-fill delivery details." />
          </div>
          <Field label="Email" name="email" type="email" value={user.email} disabled readOnly hint="Contact support to change the email on your account." />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function Stat({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      className="focus-ring group rounded-card border border-border bg-surface p-5 shadow-soft transition-[transform,box-shadow] duration-(--duration-base) ease-standard hover:-translate-y-0.5 hover:shadow-lift"
    >
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted group-hover:text-accent">{label}</p>
    </Link>
  );
}
