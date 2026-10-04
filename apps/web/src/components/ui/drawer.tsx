"use client";

import { useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { Backdrop, Portal, useOverlay, usePresence } from "@/components/ui/overlay";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; shown in the header unless `header` replaces it. */
  title: string;
  side?: "left" | "right";
  /** Custom header content (e.g. a logo). Defaults to the title. */
  header?: ReactNode;
  /** Pinned below the scrolling body (actions, totals). */
  footer?: ReactNode;
  children: ReactNode;
  /** Hide below this breakpoint's counterpart, e.g. "lg:hidden" for mobile-only drawers. */
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  side = "right",
  header,
  footer,
  children,
  className = "",
}: DrawerProps) {
  const { mounted, closing } = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, panel, onClose);

  if (!mounted) return null;

  const edge = side === "left" ? "left-0" : "right-0";
  const enter = side === "left" ? "animate-drawer-in-left" : "animate-drawer-in-right";
  const exit = side === "left" ? "-translate-x-full" : "translate-x-full";

  return (
    <Portal>
      <div className={`fixed inset-0 z-60 ${className}`}>
        <Backdrop closing={closing} onClick={onClose} />
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`absolute inset-y-0 ${edge} flex w-[88vw] max-w-sm flex-col bg-background shadow-overlay outline-none ${
            closing ? `${exit} transition-transform duration-(--duration-exit) ease-exit` : enter
          }`}
        >
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-5">
            <div id={titleId} className="min-w-0 flex-1">
              {header ?? <p className="font-display text-xl font-semibold">{title}</p>}
              {header && <span className="sr-only">{title}</span>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="focus-ring -mr-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill text-muted transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-foreground"
              aria-label={`Close ${title.toLowerCase()}`}
            >
              <CloseIcon />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <div className="border-t border-border p-4">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
