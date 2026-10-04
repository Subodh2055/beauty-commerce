"use client";

/**
 * Promise-based confirmation, replacing window.confirm():
 *
 *   if (!(await confirmDialog({ title: "Delete address?", tone: "danger" }))) return;
 *
 * Like `toast`, the queue lives at module scope so any handler can call it;
 * <ConfirmHost/> (mounted once in the root layout) renders it with <Modal>.
 */

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" styles the confirm button as destructive. */
  tone?: "default" | "danger";
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

// `question` outlives `open` so the modal can animate out with its text intact.
let state: { open: boolean; question: Pending | null } = { open: false, question: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (state.open) state.question?.resolve(false); // a newer question supersedes
  return new Promise((resolve) => {
    state = { open: true, question: { ...options, resolve } };
    emit();
  });
}

function settle(ok: boolean) {
  const pending = state.open ? state.question : null;
  state = { ...state, open: false };
  emit();
  pending?.resolve(ok);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => state;
const SERVER_STATE = { open: false, question: null };
const getServerSnapshot = () => SERVER_STATE;

export function ConfirmHost() {
  const { open, question: q } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!q) return null;
  return (
    <Modal
      open={open}
      onClose={() => settle(false)}
      size="sm"
      title={q.title}
      description={q.description}
      footer={
        <>
          <Button variant="outline" onClick={() => settle(false)}>
            {q.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={q.tone === "danger" ? "danger" : "primary"}
            onClick={() => settle(true)}
            data-autofocus={q.tone === "danger" ? undefined : true}
          >
            {q.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    />
  );
}
