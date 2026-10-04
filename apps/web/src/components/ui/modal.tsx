"use client";

import { useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { Backdrop, Portal, useOverlay, usePresence } from "@/components/ui/overlay";

type Size = "sm" | "md" | "lg";

const widths: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row; rendered right-aligned (stacked on narrow screens). */
  footer?: ReactNode;
  size?: Size;
  /**
   * `alertdialog` for interruptions that need an answer (session timeout,
   * destructive confirms): no backdrop/Esc dismissal, no close button.
   */
  role?: "dialog" | "alertdialog";
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  role = "dialog",
}: ModalProps) {
  const { mounted, closing } = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const dismissible = role === "dialog";
  useOverlay(open, panel, onClose, { dismissible });

  if (!mounted) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-70 flex items-end justify-center p-4 sm:items-center">
        <Backdrop closing={closing} onClick={dismissible ? onClose : undefined} />
        <div
          ref={panel}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          className={`relative w-full ${widths[size]} max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-panel border border-border bg-surface p-6 shadow-overlay outline-none sm:p-7 ${
            closing
              ? "translate-y-2 opacity-0 transition duration-(--duration-exit) ease-exit"
              : "animate-dialog-in"
          }`}
        >
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              className="focus-ring absolute right-3 top-3 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-pill text-muted transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-foreground"
              aria-label="Close"
            >
              <CloseIcon width={18} height={18} />
            </button>
          )}
          <h2 id={titleId} className="pr-10 font-display text-2xl font-semibold tracking-display">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-2 text-sm leading-relaxed text-muted">
              {description}
            </p>
          )}
          {children && <div className="mt-5">{children}</div>}
          {footer && (
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
