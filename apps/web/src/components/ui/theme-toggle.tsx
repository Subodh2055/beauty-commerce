"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readTheme,
  saveTheme,
  type ThemeChoice,
} from "@/lib/theme";

const ORDER: ThemeChoice[] = ["light", "dark", "system"];
const LABEL: Record<ThemeChoice, string> = {
  light: "Light theme",
  dark: "Dark theme",
  system: "Device theme",
};

// The stored choice as an external store: hydration uses the server snapshot
// ("light", matching the server HTML), then React switches to the real value —
// no hydration mismatch even when the icon differs.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === THEME_STORAGE_KEY && cb();
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
const getServerSnapshot = (): ThemeChoice => "light";

function Icon({ choice }: { choice: ThemeChoice }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (choice === "dark") {
    return (
      <svg {...common}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
    );
  }
  if (choice === "system") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** Cycles light → dark → device. The label names the current theme. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, readTheme, getServerSnapshot);

  // Dev-only: Strict Mode's remount resets <html> attributes; re-apply before paint.
  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);

  // "Device" follows live OS changes.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system", true);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  function next() {
    saveTheme(ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]);
    listeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      onClick={next}
      className={`focus-ring inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-pill text-foreground transition-colors duration-(--duration-fast) hover:bg-surface-2 ${className}`}
      aria-label={`${LABEL[choice]}. Switch theme`}
      title={LABEL[choice]}
    >
      <Icon choice={choice} />
    </button>
  );
}
