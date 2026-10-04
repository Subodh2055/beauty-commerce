/**
 * Theme: class strategy (`<html class="dark">`), light by default.
 *
 * The choice is "light" | "dark" | "system". Nothing follows the OS unless the
 * shopper picks "system" — an earlier OS-driven dark mode read as too dark for
 * the brand, so dark is an explicit opt-in.
 *
 * THEME_SCRIPT runs in <head> before first paint (no flash); `applyTheme` is the
 * same logic for the toggle and for React's dev-mode remount (see
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 */

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "bc-theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "dark" || t === "system" ? t : "light";
  } catch {
    return "light";
  }
}

export function resolvesDark(choice: ThemeChoice): boolean {
  return (
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

/** Apply a choice to <html>; `animate` cross-fades colours for a moment. */
export function applyTheme(choice: ThemeChoice, animate = false) {
  const root = document.documentElement;
  if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 450);
  }
  root.classList.toggle("dark", resolvesDark(choice));
}

export function saveTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private mode / storage disabled: the choice lasts for this page only.
  }
  applyTheme(choice, true);
}
