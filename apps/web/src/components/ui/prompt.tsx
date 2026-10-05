"use client";

/**
 * Promise-based "confirm with a reason", the companion to confirmDialog():
 *
 *   const reason = await promptDialog({ title: "Reject application?", label: "Reason", required: true, tone: "danger" });
 *   if (reason === null) return; // cancelled
 *
 * Resolves with the trimmed text ("" when optional and left blank) or null on
 * cancel. <PromptHost/> is mounted once in the root layout.
 */

import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/field";

interface PromptOptions {
  title: string;
  description?: string;
  label: string;
  hint?: string;
  placeholder?: string;
  /** Require at least `minLength` characters (default 3 when required). */
  required?: boolean;
  minLength?: number;
  confirmLabel?: string;
  tone?: "default" | "danger" | "platform";
}

interface Pending extends PromptOptions {
  resolve: (value: string | null) => void;
  id: number;
}

let seq = 0;
let state: { open: boolean; question: Pending | null } = { open: false, question: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function promptDialog(options: PromptOptions): Promise<string | null> {
  if (state.open) state.question?.resolve(null);
  return new Promise((resolve) => {
    state = { open: true, question: { ...options, resolve, id: ++seq } };
    emit();
  });
}

function settle(value: string | null) {
  const pending = state.open ? state.question : null;
  state = { ...state, open: false };
  emit();
  pending?.resolve(value);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const SERVER_STATE = { open: false, question: null };

export function PromptHost() {
  const { open, question: q } = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
  if (!q) return null;
  // Keyed by question so each prompt starts with an empty field.
  return <PromptForm key={q.id} open={open} q={q} />;
}

function PromptForm({ open, q }: { open: boolean; q: Pending }) {
  const formId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const min = q.minLength ?? (q.required ? 3 : 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (text.length < min) {
      setError(min <= 1 ? "This is required" : `Write at least ${min} characters`);
      return;
    }
    settle(text);
  }

  return (
    <Modal
      open={open}
      onClose={() => settle(null)}
      size="sm"
      title={q.title}
      description={q.description}
      footer={
        <>
          <Button variant="outline" onClick={() => settle(null)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={q.tone === "danger" ? "danger" : q.tone === "platform" ? "platform" : "primary"}
          >
            {q.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Textarea
          label={q.label}
          hint={q.hint}
          placeholder={q.placeholder}
          required={q.required}
          rows={3}
          value={value}
          error={error ?? undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          data-autofocus
        />
      </form>
    </Modal>
  );
}
