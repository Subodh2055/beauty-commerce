# Design System Master File — "Ink & Champagne"

> **LOGIC:** When building a specific page, first check `design-system/beauty-commerce/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

**Project:** Beauty Commerce — multi-vendor perfume & cosmetics marketplace
**Implemented:** 2026-10-04 in `apps/web/src/app/globals.css` (tokens) and `apps/web/src/components/ui/` (primitives)
**Contrast gate:** `npm run check:contrast` (apps/web) — fails if any pair below drops under WCAG AA

## Where these decisions came from (ui-ux-pro-max database, verified matches)

| Decision | Source match | What we kept / changed |
|---|---|---|
| Palette direction | color: *E-commerce Luxury* — "premium dark + gold accent" | Kept ink + gold; added blush/nude per brief; tuned every hex for AA in both themes |
| Display + body fonts | typography: *Luxury Serif* (Cormorant) + *Classic Elegant* (Inter body) | Cormorant Garamond for display, Inter for everything read; Montserrat rejected (too wide for dense admin tables) |
| Style | style: *Minimalism* (editorial) | Generator first proposed *Liquid Glass* — rejected: built for Apple-platform chrome, not a storefront |
| Motion | `--motion 4` (standard) | Subtle, purposeful; exits faster than entries; all respect reduced-motion |

---

## Colour tokens

Use the Tailwind utility (`bg-surface`, `text-muted`, …). **Never** raw hex or Tailwind palette colours (`bg-red-500`) in components.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#fbf8f4` ivory | `#0f0e14` | Page |
| `background-tint` | `#f5eee7` | `#15131b` | Hero / band washes |
| `surface` | `#ffffff` | `#18161f` | Cards, inputs, menus |
| `surface-2` | `#f3ece5` nude | `#221f2b` | Quiet fills, table heads, empty states |
| `foreground` | `#17151f` deep ink | `#f3ede4` | Body text |
| `muted` | `#5f5864` | `#aaa2af` | Secondary text (≥4.5:1 on every surface) |
| `border` | `#e5dcd2` | `#2f2b39` | Hairlines — decoration only |
| `border-strong` | `#8a8090` | `#77707f` | **Form controls** (≥3:1, SC 1.4.11) |
| `primary` / `-hover` / `-foreground` | ink / `#2e2a38` / ivory | champagne `#d9be8a` / `#e6d0a6` / ink | Main CTA |
| `accent` / `-hover` / `-foreground` | rose `#9a3f58` / `#80334a` / white | `#e8a3b4` / `#f1bbc8` / ink | Links, active states, eyebrows |
| `accent-soft` | blush `#f6e4e5` | `#3a2430` | Blush panels, accent badges |
| `gold` | `#9c7a3c` | `#d1b47c` | Champagne **graphics** (stars, rules) ≥3:1 |
| `gold-strong` | `#765a24` | `#e3cb9d` | Champagne **text** ≥4.5:1 |
| `gold-soft`, `nude`, `blush` | `#f4ebdb`, `#e9d9c8`, `#efd5d3` | dark equivalents | Decorative fills |
| `success` / `warning` / `danger` (+ `-soft`, `danger-foreground`) | `#2c6a49` / `#8a5300` / `#b42318` | `#7fcfa2` / `#e9b45f` / `#f39a8f` | Status — always with text, never colour alone |
| `ring` | rose | champagne | Focus ring |
| `scrim` | ink | black | Modal/drawer backdrop |
| `image-scrim`, `on-image` | ink, white (same in both themes) | — | Text over photography (`from-image-scrim/70`) |

Rule of thumb: champagne is a **light** colour — never set small text in `gold`; use `gold-strong`.

## Typography

- **Display:** Cormorant Garamond 500–700 (`font-display` / `font-serif`), `tracking-display`. Normalised with
  `font-size-adjust: ex-height 0.46` so it sits at the visual size of the old Playfair layouts.
- **Body/UI:** Inter (`font-sans`, default), base 16px, line-height 1.5.
- **Smallest text:** `text-2xs` (11px) — badges and eyebrows only. Nothing below 11px.
- **Eyebrow:** `.eyebrow` = 11px, semibold, uppercase, `tracking-eyebrow` (0.18em), accent colour.
- **Hero:** `text-display` = `clamp(2.75rem, …, 5.75rem)` available for marketing heroes.

## Spacing, radius, elevation

- Spacing: Tailwind 4px scale + `gutter` (1rem), `section` (4rem), `section-lg` (7rem). Containers: `.container-x`.
- Radius: `rounded-control` 0.75rem (inputs) · `rounded-card` 1rem · `rounded-panel` 1.5rem (modals, big panels) ·
  `rounded-pill` (buttons, chips).
- Shadow (tinted, theme-aware): `shadow-hairline` · `shadow-soft` (cards) · `shadow-lift` (hover, toasts) · `shadow-overlay` (modals/drawers).

## Motion

| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 100ms | Press feedback |
| `--duration-fast` | 160ms | Hover, colour |
| `--duration-base` | 220ms | Toggles, small transitions |
| `--duration-slow` | 360ms | Overlays in |
| `--duration-exit` | 180ms | Overlays out (exit < enter) |
| `--duration-slower` | 700ms | Entrances, scroll reveals |
| `ease-luxe` | `cubic-bezier(0.22,1,0.36,1)` | House curve: entrances |
| `ease-standard` | `cubic-bezier(0.2,0,0,1)` | Everyday transitions |
| `ease-exit` | `cubic-bezier(0.4,0,1,1)` | Leaving |

Use as `duration-(--duration-fast) ease-standard`. Named animations: `animate-fade-up`, `animate-dialog-in`,
`animate-drawer-in-left|right`, `animate-overlay-in`, `.reveal`. `prefers-reduced-motion` collapses all of them.

## Themes

- Class strategy: `<html class="dark">`. **Light is the default**; dark is opt-in via the header toggle
  (light → dark → device). An earlier OS-driven dark mode read as too dark for the brand.
- No flash: `THEME_SCRIPT` (`lib/theme.ts`) runs in `<head>` before first paint; the toggle re-applies in
  `useLayoutEffect` for React's dev remount. Storage key `bc-theme`.

## Components (`apps/web/src/components/ui/`)

| Component | Notes |
|---|---|
| `Button`, `ButtonLink`, `buttonClass` | `primary` ink · `accent` rose · `secondary` nude · `outline` · `ghost` · `danger`; sizes `sm` (36px, dense admin), `md`/`lg`/`icon` (≥44px); `loading` adds spinner + `aria-busy` |
| `Input`, `Textarea`, `Select` (+ `Field` alias, `controlClass`) | Real `<label for>`; `hint`/`error` via `aria-describedby`, `aria-invalid`; `border-strong` borders |
| `Badge` | `neutral · accent · gold · success · warning · danger · solid` — each an AA-checked pair |
| `Card`, `CardHeader` | `tone`: surface / muted / blush / champagne; `interactive` lift |
| `Modal` | Portal, focus trap, Esc, focus restore, scroll lock; `role="alertdialog"` for must-answer prompts |
| `Drawer` | Same behaviour, left/right; used by mobile nav and catalogue filters |
| `confirmDialog()` + `<ConfirmHost/>` | Promise-based replacement for `window.confirm` |
| `Tabs` | WAI-ARIA: ←/→, Home/End, roving tabindex |
| `DataTable` | Real `<table>` + caption, scroll on narrow screens, skeleton rows, empty slot, `responsive` columns |
| `FilterChips` | `aria-pressed` toggle group |
| `EmptyState` | Icon in champagne disc, display title, description, action; `compact` for cards/tables |
| `Skeleton` | Shimmer, reduced-motion safe |
| `toast` / `<Toaster/>` | SVG icons, soft status tokens, polite live region; errors `role="alert"` |
| `ThemeToggle` | 44px, labelled with the current theme |

## Anti-patterns (enforced in review)

- Raw hex / Tailwind palette colours / `text-[Npx]` in components — use tokens.
- `gold` for text; `border` (hairline) on form controls.
- Text glyphs as icons (✓ ★ !) — use `components/ui/icons.tsx`.
- `window.confirm` — use `confirmDialog`.
- Colour as the only signal (status dots without words, low stock without text).
- Hand-rolled overlays — use `Modal`/`Drawer` (they handle focus, Esc, scroll, portal).
- Interactive targets under 44px on touch surfaces (admin `sm` buttons at 32–36px are the documented exception, still ≥24px per WCAG 2.5.8).

## Pre-delivery checklist

- [ ] `npm run check:contrast` passes (both themes)
- [ ] `npm run lint` and `npx tsc --noEmit` clean
- [ ] Looked at the page in light **and** dark
- [ ] Keyboard: every control reachable, visible focus ring, overlays trap and return focus
- [ ] Reduced motion: nothing essential depends on animation
- [ ] Responsive at 375 / 768 / 1024 / 1440 — no horizontal page scroll
