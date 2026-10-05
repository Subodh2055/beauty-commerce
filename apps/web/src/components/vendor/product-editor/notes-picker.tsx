"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { FragranceNote } from "@/lib/api";
import type { NotePosition } from "@/lib/vendor";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";

const TIERS: { position: NotePosition; label: string; hint: string }[] = [
  { position: "TOP", label: "Top notes", hint: "The first impression — citrus, spice, green." },
  { position: "HEART", label: "Heart notes", hint: "The character, after 20 minutes — florals, fruits." },
  { position: "BASE", label: "Base notes", hint: "The dry-down — woods, resins, musks." },
];

type Picked = { note_id: string; position: NotePosition };

/**
 * Pick notes per pyramid tier from the shared taxonomy, so shoppers can filter
 * by them and "similar scents" can match. Type to filter; Enter adds the first
 * match; each chip has a remove button. A note can sit in one tier only.
 */
export function NotesPicker({
  notes,
  value,
  onChange,
  disabled = false,
}: {
  notes: FragranceNote[];
  value: Picked[];
  onChange: (next: Picked[]) => void;
  disabled?: boolean;
}) {
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  return (
    <div className="space-y-5">
      {TIERS.map((t) => (
        <Tier
          key={t.position}
          {...t}
          notes={notes}
          byId={byId}
          picked={value.filter((v) => v.position === t.position)}
          taken={new Set(value.map((v) => v.note_id))}
          disabled={disabled}
          onAdd={(id) => onChange([...value, { note_id: id, position: t.position }])}
          onRemove={(id) => onChange(value.filter((v) => !(v.note_id === id && v.position === t.position)))}
        />
      ))}
    </div>
  );
}

function Tier({
  label,
  hint,
  notes,
  byId,
  picked,
  taken,
  disabled,
  onAdd,
  onRemove,
}: {
  position: NotePosition;
  label: string;
  hint: string;
  notes: FragranceNote[];
  byId: Map<string, FragranceNote>;
  picked: Picked[];
  taken: Set<string>;
  disabled: boolean;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const id = useId();
  const matches = q.trim()
    ? notes.filter((n) => !taken.has(n.id) && n.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches[0]) {
        onAdd(matches[0].id);
        setQ("");
      }
    } else if (e.key === "Escape") {
      setQ("");
    }
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted" id={`${id}-hint`}>
        {hint}
      </p>
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Selected ${label.toLowerCase()}`}>
          {picked.map((p) => (
            <li key={p.note_id} className="inline-flex h-8 items-center gap-1 rounded-pill bg-accent-soft pl-3 pr-1 text-xs">
              {byId.get(p.note_id)?.name ?? "Unknown note"}
              <button
                type="button"
                onClick={() => onRemove(p.note_id)}
                aria-label={`Remove ${byId.get(p.note_id)?.name ?? "note"}`}
                className="focus-ring inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-pill hover:bg-surface"
              >
                <CloseIcon width={12} height={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <label htmlFor={`${id}-input`} className="sr-only">
          Add {label.toLowerCase()}
        </label>
        <input
          id={`${id}-input`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Add ${label.toLowerCase()}…`}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          className="focus-ring h-10 w-full max-w-sm rounded-control border border-border-strong bg-surface px-3 text-sm placeholder:text-muted"
        />
        {q.trim() && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Matching notes">
            {matches.length === 0 ? (
              <p className="text-xs text-muted" role="status">
                No unused note matches “{q.trim()}”. Ask support to add new notes to the taxonomy.
              </p>
            ) : (
              matches.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    onAdd(n.id);
                    setQ("");
                  }}
                  className="focus-ring inline-flex h-8 cursor-pointer items-center gap-1 rounded-pill border border-border-strong px-3 text-xs hover:bg-surface-2"
                >
                  <PlusIcon width={12} height={12} aria-hidden /> {n.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </fieldset>
  );
}
