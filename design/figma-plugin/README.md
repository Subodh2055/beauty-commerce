# Beauty Commerce — Figma design generator

A one-shot Figma plugin that builds the whole design file for this project:
foundations, a component library, and 19 screens across desktop and mobile.
Everything is derived from the real code — colours from
`apps/web/src/app/globals.css`, sizes from the Tailwind classes on the actual
components — so the Figma file and the app stay in step.

## Why a plugin instead of the Figma MCP server

The Figma MCP server is capped at **20 tool calls per month on a Starter plan**
(and 6/month for View and Collab seats on paid plans). Generating a file this
size takes far more calls than that, so the work is packaged as a plugin you run
locally. There is no quota on the Plugin API.

## Running it

1. Open the Figma **desktop app** (plugin development needs the desktop app, not
   the browser).
2. Open an empty design file. One is already waiting:
   <https://www.figma.com/design/wuJ0lRPuYA3YKsBkxG3qEu>
3. Menu → **Plugins → Development → Import plugin from manifest…**
4. Pick `design/figma-plugin/manifest.json` from this repo.
5. Menu → **Plugins → Development → Beauty Commerce Design Generator**.

It takes roughly 20–60 seconds depending on whether images download. A toast
reports the page count and which fonts it resolved.

Run it on an **empty** file. It only ever adds, but a clean file keeps the result
tidy, and re-running appends a second copy of everything.

## What you get

| Page | Contents |
| --- | --- |
| `01 Foundations` | 15 colour swatches (hex for both modes + usage note), 14-step type ramp, elevation, radii, spacing scale, 21 icons |
| `02 Components` | Button, Badge, Field, Product Card as real variant sets; Header and Footer as components; rating, price, qty stepper, search bar, breadcrumb, 8 order-status badges |
| `03 Storefront` | Home, product listing, product detail, search |
| `04 Commerce` | Cart, checkout, order detail, wishlist |
| `05 Account` | Login, register, account, orders |
| `06 Admin` | Dashboard, products table, product form |
| `07 Mobile` | Home, product detail, cart, nav drawer (390px) |

### Variables

Three collections are created:

- **Beauty / Color** — one variable per CSS custom property, named identically
  (`accent`, `surface-2`, `accent-foreground`, …), with **Light** and **Dark**
  modes populated from the two blocks in `globals.css`. Every fill and stroke in
  the file is bound to one of these, so selecting a frame and switching its mode
  to Dark re-themes it. The storefront ships Light only today — the Dark mode is
  there because `globals.css` already defines it under `[data-theme="dark"]`.
- **Beauty / Radius** — `radius/sm` … `radius/full`.
- **Beauty / Spacing** — the 4-point steps the app actually uses.

Text and effect styles are published too (`Display/Hero`, `Body/S Medium`,
`Elevation/Soft`, …) and the type ramp names map onto the Tailwind classes in
the comment column on the Foundations page.

## Fonts

The app uses **Geist** (UI) and **Playfair Display** (editorial). The plugin
resolves what your Figma actually has and falls back gracefully:

- sans: Geist → Inter → Roboto → Helvetica Neue → Arial
- serif: Playfair Display → Lora → Georgia → Times New Roman → Inter

Install [Geist](https://vercel.com/font) and Playfair Display locally first if
you want an exact match. The toast at the end names what it used.

## Images

Placeholder photography comes from `picsum.photos`, using the same seed strings
the app uses (`beauty-hero`, etc.). If the network is blocked the plugin falls
back to flat `surface-2` panels and everything else still builds — or set
`USE_REMOTE_IMAGES = false` at the top of `code.js` to skip the fetch entirely.

## Editing it

`code.js` is plain ES5-ish JavaScript with no build step — edit and re-run.
The layout helpers are worth knowing:

- `box(name, opts)` — auto-layout frame. Omitting `w`/`h` leaves that axis
  hugging. `pad` takes a number or `[t, r, b, l]`.
- `add(parent, child, { h: "FILL", grow: true })` — appends *then* applies
  sizing, because `FILL`/`HUG` are only legal once a node has an auto-layout
  parent.
- `txt(chars, opts)` — text with a token colour name (`muted`, `accent`, …).
- `icon(name, size, token)` — 24px Feather-style stroke paths from `ICONS`.

Colour arguments everywhere are token *names*, not hex, so they stay bound to
variables.

Before running it in Figma you can execute it locally against a mock of the
Plugin API — see [`../preview/`](../preview/):

```bash
node design/preview/check.js     # rule violations + structure
node design/preview/render.js    # writes an HTML preview of every screen
```

`check.js` asserts the rules that commonly break plugins (font loaded before
`characters`, `FILL` only under auto-layout parents, `layoutWrap` only on
`HORIZONTAL`, colour channels in 0–1). `render.js` translates the node tree to
flexbox HTML so you can look at all 19 screens in a browser without spending
Figma quota.
