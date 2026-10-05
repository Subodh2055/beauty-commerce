"use client";

import { AccountShell } from "@/components/account/account-shell";
import { AddressBook } from "@/components/account/address-book";

export default function AddressesPage() {
  return (
    <AccountShell
      title="Addresses"
      crumbs={[
        { href: "/account", label: "Account" },
        { href: "/account/addresses", label: "Addresses" },
      ]}
    >
      <div className="rounded-panel border border-border bg-surface p-6 shadow-soft">
        <p className="mb-5 text-sm text-muted">Your default address is pre-selected at checkout.</p>
        <AddressBook />
      </div>
    </AccountShell>
  );
}
