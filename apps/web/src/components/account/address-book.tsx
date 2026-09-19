"use client";

import { useEffect, useState } from "react";
import { useAddresses, type Address, type AddressInput } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { AddressCard, AddressForm } from "./address-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function AddressBook() {
  const api = useAddresses();
  const [items, setItems] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await api.list();
        if (active) setItems(list);
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setItems(await api.list());
  }

  async function create(body: AddressInput) {
    await api.create(body);
    setAdding(false);
    await refresh();
    toast.success("Address added");
  }

  async function update(body: AddressInput) {
    if (!editing) return;
    await api.update(editing.id, body);
    setEditing(null);
    await refresh();
    toast.success("Address updated");
  }

  async function remove(id: string) {
    if (!confirm("Delete this address?")) return;
    try {
      await api.remove(id);
      await refresh();
      toast.info("Address deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  async function setDefault(id: string) {
    await api.setDefault(id);
    await refresh();
    toast.success("Default address updated");
  }

  if (!items) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      {items.length === 0 && !adding && (
        <p className="text-sm text-muted">No saved addresses yet.</p>
      )}

      {!adding && !editing && (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onEdit={() => setEditing(a)}
              onDelete={() => remove(a.id)}
              onSetDefault={() => setDefault(a.id)}
            />
          ))}
        </div>
      )}

      {adding && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h3 className="mb-3 font-medium">New address</h3>
          <AddressForm onSubmit={create} onCancel={() => setAdding(false)} />
        </div>
      )}

      {editing && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h3 className="mb-3 font-medium">Edit address</h3>
          <AddressForm initial={editing} onSubmit={update} onCancel={() => setEditing(null)} />
        </div>
      )}

      {!adding && !editing && (
        <Button variant="outline" onClick={() => setAdding(true)}>
          + Add address
        </Button>
      )}
    </div>
  );
}
