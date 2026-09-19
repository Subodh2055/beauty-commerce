"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/catalog/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressBook } from "@/components/account/address-book";

export default function AccountPage() {
  const { user, ready, logout } = useAuth();
  const { wishlist, cartCount } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login?next=/account");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="container-x py-10">
        <Skeleton className="mb-3 h-3 w-40" />
        <Skeleton className="mb-8 h-9 w-64" />
        <Skeleton className="h-40 max-w-2xl" />
      </div>
    );
  }

  const initials = (user.full_name || user.email)
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="container-x py-10">
      <PageHeader title="My account" crumbs={[{ href: "/account", label: "Account" }]} />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-6 shadow-soft">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft font-serif text-xl font-semibold text-accent">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-medium">{user.full_name || "Beauty shopper"}</p>
              <p className="truncate text-sm text-muted">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {user.roles.map((r) => (
                  <Badge key={r}>{r.toLowerCase()}</Badge>
                ))}
                {user.is_email_verified ? (
                  <Badge tone="success">Email verified</Badge>
                ) : (
                  <VerifyEmailBadge />
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Tile href="/orders" title="Orders" desc="Track and review past orders." />
            <Tile href="/wishlist" title="Wishlist" desc={`${wishlist.length} saved`} />
            <Tile href="/cart" title="Bag" desc={`${cartCount} item${cartCount === 1 ? "" : "s"}`} />
            <Tile href="/products" title="Keep shopping" desc="Browse the catalogue." />
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="mb-4 font-serif text-lg font-semibold">Address book</h2>
            <AddressBook />
          </div>
        </section>

        <aside className="h-fit space-y-3 rounded-3xl border border-border bg-surface-2 p-6">
          <h2 className="font-medium">Session</h2>
          <p className="text-sm text-muted">
            Signed in on this device. Signing out revokes this session&apos;s refresh token.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              logout().then(() => {
                toast.info("Signed out");
                router.push("/");
              })
            }
          >
            Sign out
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Tile({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group focus-ring rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
    >
      <p className="font-medium group-hover:text-accent">{title}</p>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </Link>
  );
}

function VerifyEmailBadge() {
  const { resendVerification } = useAuth();
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      const msg = await resendVerification();
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone="gold">Verify email</Badge>
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        className="focus-ring rounded text-[11px] font-medium text-accent underline-offset-2 hover:underline disabled:opacity-50"
      >
        {busy ? "Sending…" : "Resend"}
      </button>
    </span>
  );
}
