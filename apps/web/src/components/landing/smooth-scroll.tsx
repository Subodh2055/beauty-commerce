"use client";

import { useEffect } from "react";

/**
 * Lenis smooth scrolling for the landing page, driven by GSAP's ticker so
 * ScrollTrigger scenes and Lenis stay on the same frame.
 *
 * Lenis and GSAP are imported lazily once the browser is idle: they aren't
 * needed for the first paint, and keeping them out of the initial bundle keeps
 * the main thread free while the hero renders. Skipped for reduced motion; torn
 * down on unmount so other routes scroll natively.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      const [{ default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([
        import("lenis"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("lenis/dist/lenis.css"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ lerp: 0.1, anchors: true });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      cleanup = () => {
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33);
        lenis.destroy();
      };
    };

    // Called as window methods: detached references throw "Illegal invocation".
    const hasIdle = "requestIdleCallback" in window;
    const handle = hasIdle
      ? window.requestIdleCallback(() => void start())
      : window.setTimeout(() => void start(), 300);
    return () => {
      cancelled = true;
      cleanup?.(); // tear Lenis down first, whatever else happens
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);
  return null;
}
