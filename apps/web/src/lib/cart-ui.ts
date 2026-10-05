"use client";

/**
 * UI-only cart state: whether the cart drawer is open, plus the fly-to-cart
 * micro-interaction. Cart contents live in lib/store.tsx.
 */

import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function openCart() {
  open = true;
  emit();
}

export function closeCart() {
  open = false;
  emit();
}

export function useCartDrawer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => false,
  );
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The visible bag button in the header (marked with data-cart-target). */
function cartTarget(): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>("[data-cart-target]");
  for (const el of all) if (el.getClientRects().length > 0) return el;
  return null;
}

/** Give the bag icon a little bounce so the count change is noticed. */
export function bumpCart() {
  const target = cartTarget();
  if (!target || reducedMotion()) return;
  target.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.22)" }, { transform: "scale(1)" }],
    { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

/**
 * Fly a thumbnail from `from` to the header bag along a gentle arc, then bump
 * the bag. Transform/opacity only (compositor-friendly); decorative and
 * pointer-transparent; skipped for reduced motion. Resolves when it lands.
 */
export function flyToCart(from: Element | null, imageUrl?: string | null): Promise<void> {
  const target = cartTarget();
  if (!from || !target || reducedMotion()) {
    bumpCart();
    return Promise.resolve();
  }

  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const size = Math.min(96, a.width, a.height) || 64;
  const startX = a.left + a.width / 2 - size / 2;
  const startY = a.top + a.height / 2 - size / 2;
  const dx = b.left + b.width / 2 - (startX + size / 2);
  const dy = b.top + b.height / 2 - (startY + size / 2);

  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "9999px",
    pointerEvents: "none",
    zIndex: "80",
    backgroundColor: "var(--color-surface-2)",
    backgroundImage: imageUrl ? `url("${imageUrl.replace(/"/g, "%22")}")` : "",
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow: "var(--shadow-lift)",
    willChange: "transform, opacity",
  });
  document.body.appendChild(ghost);

  const anim = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      // Rise a little before dropping into the bag: reads as a throw, not a slide.
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(0.7)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.18)`, opacity: 0.35 },
    ],
    { duration: 720, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
  );
  return anim.finished
    .catch(() => undefined)
    .then(() => {
      ghost.remove();
      bumpCart();
    });
}
