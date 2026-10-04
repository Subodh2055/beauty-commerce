"use client";

/**
 * Tiny toast system. `toast.success|error|info(msg)` can be called from
 * anywhere — inside React or from plain modules (the store, api helpers) —
 * because the queue lives at module scope. <Toaster/> renders it.
 */

import { useSyncExternalStore } from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "@/components/ui/icons";

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

const ICONS: Record<ToastType, (p: { width: number; height: number }) => React.ReactNode> = {
  success: CheckIcon,
  error: AlertIcon,
  info: InfoIcon,
};
// Text/background pairs are AA-checked in scripts/check-contrast.mjs.
const TONES: Record<ToastType, string> = {
  success: "border-success/25 bg-success-soft text-success",
  error: "border-danger/25 bg-danger-soft text-danger",
  info: "border-border bg-surface text-foreground",
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-100 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end sm:px-0"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {items.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={`animate-slide-in-right pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border px-4 py-3 text-sm shadow-lift ${TONES[t.type]}`}
            // The region announces politely; errors interrupt.
            role={t.type === "error" ? "alert" : undefined}
          >
            <span className="mt-0.5 shrink-0">
              <Icon width={18} height={18} />
            </span>
            <p className="flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              className="focus-ring -my-1.5 -mr-2 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-pill opacity-70 transition-opacity duration-(--duration-fast) hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
