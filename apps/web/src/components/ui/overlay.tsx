"use client";

/**
 * Shared behaviour for Modal and Drawer:
 * - rendered in a portal on <body>, so ancestors with transforms/backdrop-filter
 *   (the sticky header) can't trap `position: fixed`;
 * - Esc closes, Tab is trapped inside, focus returns to the opener on close;
 * - body scroll is locked (ref-counted, so stacked overlays don't fight);
 * - when overlays stack (a confirm over a drawer), only the topmost one
 *   handles Esc and Tab, so Esc closes one layer at a time;
 * - stays mounted briefly after close so it can animate out (exit < enter).
 */

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const EXIT_MS = 180; // keep in sync with --duration-exit

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), ' +
  '[contenteditable="true"]';

/** Mounted while open, and for EXIT_MS after closing; `closing` drives the out-animation. */
export function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  // Adjust state while rendering when `open` changes (no effect round-trip).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }
  useEffect(() => {
    if (open || !mounted) return;
    const id = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);
  return { mounted, closing: mounted && !open };
}

/** Open overlays, oldest first; only the last one reacts to the keyboard. */
const stack: symbol[] = [];

let scrollLocks = 0;
let savedOverflow = "";
let savedPadding = "";

function lockScroll() {
  if (scrollLocks++ > 0) return;
  const body = document.body;
  savedOverflow = body.style.overflow;
  savedPadding = body.style.paddingRight;
  // Keep layout steady where a scrollbar disappears.
  const gap = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = "hidden";
  if (gap > 0) body.style.paddingRight = `${gap}px`;
}

function unlockScroll() {
  if (--scrollLocks > 0) return;
  document.body.style.overflow = savedOverflow;
  document.body.style.paddingRight = savedPadding;
}

/** Esc, focus trap, scroll lock and focus restore for an open panel. */
export function useOverlay(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  { dismissible = true }: { dismissible?: boolean } = {},
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const me = Symbol("overlay");
    stack.push(me);
    lockScroll();

    // Initial focus: the element marked [data-autofocus], else the first
    // focusable control, else the panel itself.
    const node = panel.current;
    const target =
      node?.querySelector<HTMLElement>("[data-autofocus]") ??
      node?.querySelector<HTMLElement>(FOCUSABLE) ??
      node;
    target?.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== me) return; // a newer overlay is on top
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      stack.splice(stack.indexOf(me), 1);
      unlockScroll();
      // Return focus to whatever opened the overlay, if it's still on the page.
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, panel, dismissible]);
}

const noopSubscribe = () => () => {};

/** Portal to <body>; renders nothing during SSR. */
export function Portal({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return isClient ? createPortal(children, document.body) : null;
}

/** The dimmed layer behind a modal or drawer. */
export function Backdrop({
  closing,
  onClick,
}: {
  closing: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      aria-hidden
      onClick={onClick}
      className={`fixed inset-0 bg-scrim/45 backdrop-blur-[2px] ${
        closing
          ? "opacity-0 transition-opacity duration-(--duration-exit) ease-exit"
          : "animate-overlay-in"
      }`}
    />
  );
}
