"use client";

/**
 * Tiny toast system. `toast.success|error|info(msg)` can be called from
 * anywhere — inside React or from plain modules (the store, api helpers) —
 * because the queue lives at module scope. <Toaster/> renders it.
 */

import { useSyncExternalStore } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
const DURATION = 3500;

function emit() {
  listeners.forEach((l) => l());
}

function remove(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(type: ToastType, message: string) {
  const id = nextId++;
  toasts = [...toasts, { id, type, message }];
  emit();
  if (typeof window !== "undefined") {
    window.setTimeout(() => remove(id), DURATION);
  }
  return id;
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m),
  info: (m: string) => push("info", m),
  dismiss: remove,
};

/** Hook form for convenience; identical to the imperative `toast`. */
export function useToast() {
  return toast;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const EMPTY: Toast[] = [];
const getSnapshot = () => toasts;
const getServerSnapshot = () => EMPTY;

const ICONS: Record<ToastType, string> = { success: "✓", error: "!", info: "i" };
const TONES: Record<ToastType, string> = {
  success: "border-success/30 bg-success/12 text-success",
  error: "border-danger/30 bg-danger/12 text-danger",
  info: "border-border bg-surface text-foreground",
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end sm:px-0"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`animate-slide-in-right pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lift backdrop-blur ${TONES[t.type]}`}
          role="status"
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              t.type === "info" ? "bg-surface-2" : "bg-current/15"
            }`}
            aria-hidden
          >
            {ICONS[t.type]}
          </span>
          <p className="flex-1 leading-snug">{t.message}</p>
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            className="focus-ring -mr-1 shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
