"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Reveals its children when scrolled into view: fade + slide up.
 * `index` staggers siblings; `as` picks the element; honours reduced-motion
 * automatically via the .reveal CSS (which collapses to visible).
 */
export function Reveal({
  children,
  as,
  index = 0,
  className = "",
  once = true,
}: {
  children: ReactNode;
  as?: ElementType;
  index?: number;
  className?: string;
  once?: boolean;
}) {
  const Tag: ElementType = as ?? "div";
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (once) io.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <Tag
      ref={ref}
      data-show={shown}
      className={`reveal ${className}`}
      style={{ "--reveal-i": index } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
