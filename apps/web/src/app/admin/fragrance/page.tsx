"use client";

import { useState, type FormEvent } from "react";
import { useAdminApi, type FragranceFamily, type FragranceNote } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useCan } from "@/lib/permissions";
import { errorText } from "@/lib/http";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader, RequirePermission, SearchBox } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { EditIcon, PlusIcon, SparkleIcon, TrashIcon } from "@/components/ui/icons";

type Editing =
  | { kind: "family"; item: FragranceFamily | null }
  | { kind: "note"; item: FragranceNote | null }
  | null;

export default function FragrancePage() {
  return (
    <RequirePermission code="taxonomy.view">
      <PageHeader
        title="Fragrance taxonomy"
        description="Families group notes; shoppers filter by both, and vendors pick notes for each product's pyramid."
      />
      <Taxonomy />
    </RequirePermission>
  );
}

function Taxonomy() {
  const api = useAdminApi();
  const { can } = useCan();
  const { data, error, reload } = useLoad("fragrance", () => Promise.all([api.families(), api.notes()]));
  const [editing, setEditing] = useState<Editing>(null);
  const [familyFilter, setFamilyFilter] = useState("");
  const [q, setQ] = useState("");

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );

  const [families, notes] = data;
  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const noteCount = new Map<string, number>();
  for (const n of notes) if (n.family_id) noteCount.set(n.family_id, (noteCount.get(n.family_id) ?? 0) + 1);
  const shown = notes.filter(
    (n) =>
      (!familyFilter || (familyFilter === "none" ? !n.family_id : n.family_id === familyFilter)) &&
      (!q || n.name.toLowerCase().includes(q.toLowerCase())),
  );

  async function remove(kind: "family" | "note", item: FragranceFamily | FragranceNote) {
    const ok = await confirmDialog({
      title: `Delete “${item.name}”?`,
      description:
        kind === "family"
          ? "Its notes stay, without a family. Products using this family lose it."
          : "Products lose this note from their pyramid.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await (kind === "family" ? api.deleteFamily(item.id) : api.deleteNote(item.id));
      toast.success(`Deleted ${item.name}`);
      reload();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const rowActions = (kind: "family" | "note", item: FragranceFamily | FragranceNote) => (
    <span className="flex shrink-0 gap-1">
      {can("taxonomy.edit") && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Edit ${item.name}`}
          onClick={() => setEditing(kind === "family" ? { kind, item: item as FragranceFamily } : { kind, item: item as FragranceNote })}
        >
          <EditIcon width={16} height={16} />
        </Button>
      )}
      {can("taxonomy.delete") && (
        <Button variant="ghost" size="sm" aria-label={`Delete ${item.name}`} onClick={() => remove(kind, item)}>
          <TrashIcon width={16} height={16} />
        </Button>
      )}
    </span>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <Card padding="lg">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Families ({families.length})</h2>
          {can("taxonomy.create") && (
            <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "family", item: null })}>
              <PlusIcon width={16} height={16} aria-hidden /> Add family
            </Button>
          )}
        </div>
        {families.length === 0 ? (
          <EmptyState compact icon={<SparkleIcon width={22} height={22} />} title="No families yet" />
        ) : (
          <ul className="divide-y divide-border">
            {families.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setFamilyFilter(f.id)}
                  aria-pressed={familyFilter === f.id}
                  className="focus-ring min-w-0 rounded-sm text-left aria-pressed:text-accent"
                >
                  <span className="block font-medium">{f.name}</span>
                  <span className="block text-xs text-muted">
                    {noteCount.get(f.id) ?? 0} notes · /{f.slug}
                  </span>
                </button>
                {rowActions("family", f)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="lg">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Notes ({shown.length})</h2>
          {can("taxonomy.create") && (
            <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "note", item: null })}>
              <PlusIcon width={16} height={16} aria-hidden /> Add note
            </Button>
          )}
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select
            label="Family"
            hideLabel
            controlSize="sm"
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            options={[
              { value: "", label: "All families" },
              { value: "none", label: "No family" },
              ...families.map((f) => ({ value: f.id, label: f.name })),
            ]}
          />
          <SearchBox label="Search notes" placeholder="Note name" value={q} onChange={setQ} />
        </div>
        {shown.length === 0 ? (
          <EmptyState compact icon={<SparkleIcon width={22} height={22} />} title="No notes match" />
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {shown.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-2 border-b border-border py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{n.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {n.family_id ? familyName.get(n.family_id) : "No family"}
                  </span>
                </span>
                {rowActions("note", n)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EditModal editing={editing} families={families} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}

function EditModal({
  editing,
  families,
  onClose,
  onSaved,
}: {
  editing: Editing;
  families: FragranceFamily[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Keyed so each open starts from that item's values.
  const key = editing ? `${editing.kind}:${editing.item?.id ?? "new"}` : "closed";
  return <EditForm key={key} editing={editing} families={families} onClose={onClose} onSaved={onSaved} />;
}

function EditForm({
  editing,
  families,
  onClose,
  onSaved,
}: {
  editing: Editing;
  families: FragranceFamily[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useAdminApi();
  const family = editing?.kind === "family" ? editing.item : null;
  const note = editing?.kind === "note" ? editing.item : null;
  const [name, setName] = useState(family?.name ?? note?.name ?? "");
  const [description, setDescription] = useState(family?.description ?? "");
  const [familyId, setFamilyId] = useState(note?.family_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isFamily = editing?.kind === "family";
  const existing = family ?? note;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter a name");
    setBusy(true);
    try {
      if (isFamily) {
        await api.saveFamily(family?.id ?? null, { name: name.trim(), description: description.trim() || null });
      } else {
        await api.saveNote(note?.id ?? null, { name: name.trim(), family_id: familyId || null });
      }
      toast.success(existing ? "Saved" : "Added");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const noun = isFamily ? "family" : "note";
  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : `New ${noun}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="taxonomy-form" loading={busy}>
            {existing ? "Save" : `Add ${noun}`}
          </Button>
        </>
      }
    >
      <form id="taxonomy-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Name"
          required
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          data-autofocus
        />
        {isFamily ? (
          <Textarea
            label="Description"
            hint="Shown on the family's filter page."
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        ) : (
          <Select
            label="Family"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
            placeholder="No family"
            options={families.map((f) => ({ value: f.id, label: f.name }))}
          />
        )}
      </form>
    </Modal>
  );
}
