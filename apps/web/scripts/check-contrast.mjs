// WCAG 2.2 contrast check for the design tokens in src/app/globals.css.
//
//   npm run check:contrast
//
// Parses the light (:root) and dark (:root.dark) colour blocks and checks every
// foreground/background pairing the components actually use. Text must reach
// 4.5:1 (AA normal text); UI graphics — control borders, focus rings, rating
// stars — must reach 3:1 (SC 1.4.11). Exits non-zero on any failure, so it can
// gate CI. Add a pair here whenever a component starts using a new combination.

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

// Every `selector {` block merged (globals.css has several :root blocks: light
// colours, fixed colours that don't change with the theme, motion).
function block(selector) {
  const out = {};
  let at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`No ${selector} block in globals.css`);
  while (at >= 0) {
    const body = css.slice(at, css.indexOf("}", at));
    for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)) out[m[1]] = m[2];
    at = css.indexOf(`${selector} {`, at + 1);
  }
  return out;
}

const light = block(":root");
// Dark overrides the light values; fixed tokens carry over unchanged.
const themes = { light, dark: { ...light, ...block(":root.dark") } };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const UI = 3;
const surfaces = ["background", "background-tint", "surface", "surface-2"];

// [foreground token, background token, minimum, where it's used]
const pairs = [
  ...surfaces.map((s) => ["foreground", s, TEXT, "body text"]),
  ...surfaces.map((s) => ["muted", s, TEXT, "secondary text"]),
  ...["background", "surface", "surface-2"].map((s) => ["accent", s, TEXT, "links, eyebrows, prices"]),
  ...["background", "surface"].map((s) => ["gold-strong", s, TEXT, "champagne text"]),
  ["primary-foreground", "primary", TEXT, "primary button"],
  ["primary-foreground", "primary-hover", TEXT, "primary button hover"],
  ["accent-foreground", "accent", TEXT, "accent button, count bubbles"],
  ["accent-foreground", "accent-hover", TEXT, "accent button hover"],
  ["foreground", "accent-soft", TEXT, "blush panels"],
  ["accent", "accent-soft", TEXT, "accent badge / chips"],
  ["gold-strong", "gold-soft", TEXT, "gold badge"],
  ["foreground", "gold-soft", TEXT, "champagne panels"],
  ["foreground", "nude", TEXT, "nude panels"],
  ["foreground", "blush", TEXT, "blush tiles"],
  ["success", "success-soft", TEXT, "success badge / toast"],
  ...["chart-1", "chart-2", "chart-3"].flatMap((c) =>
    ["background", "surface", "surface-2"].map((s) => [c, s, UI, "chart series"]),
  ),
  ["success", "surface", TEXT, "in-stock text"],
  ["warning", "warning-soft", TEXT, "warning badge"],
  ["danger", "danger-soft", TEXT, "error badge / toast"],
  ["danger-foreground", "danger", TEXT, "danger button"],
  ...["background", "surface"].map((s) => ["danger", s, TEXT, "field errors"]),
  ...["background", "surface"].map((s) => ["border-strong", s, UI, "input / select borders"]),
  ...["background", "surface", "surface-2"].map((s) => ["ring", s, UI, "focus ring"]),
  ...["background", "surface"].map((s) => ["gold", s, UI, "rating stars"]),
  ["primary", "background", UI, "primary button edge"],
  // Landing page
  ["on-image", "ink-fixed", TEXT, "brand story text"],
  ["champagne-fixed", "ink-fixed", TEXT, "brand story kickers"],
  ["muted", "gold-soft", TEXT, "vendor CTA copy"],
  ["accent", "gold-soft", TEXT, "vendor CTA eyebrow"],
  ["muted", "background-tint", TEXT, "notes / reviews bands"],
  ["accent", "background-tint", TEXT, "band eyebrows"],
];

let failures = 0;
for (const [name, tokens] of Object.entries(themes)) {
  console.log(`\n${name.toUpperCase()}`);
  for (const [fg, bg, min, use] of pairs) {
    if (!tokens[fg] || !tokens[bg]) {
      console.log(`  MISSING ${fg} / ${bg}`);
      failures++;
      continue;
    }
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(
      `  ${ok ? "pass" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${fg} on ${bg}  — ${use}`,
    );
  }
}

console.log(failures ? `\n${failures} pair(s) below WCAG AA` : "\nAll pairs meet WCAG AA");
process.exit(failures ? 1 : 0);
