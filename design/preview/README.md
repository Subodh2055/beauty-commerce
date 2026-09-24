# Preview + check harness

Two Node scripts that execute `../figma-plugin/code.js` against a mock of the
Figma Plugin API, so the generator can be run and inspected without opening
Figma (and without spending Figma MCP quota).

```bash
node design/preview/check.js     # correctness pass — no output files
node design/preview/render.js    # writes design/preview/preview.html
```

No dependencies; plain Node.

## `check.js`

Stubs the Plugin API and asserts the rules that actually break real plugins:

- `characters` set before the font was loaded with `loadFontAsync`
- `FILL` / `HUG` sizing applied to a node with no auto-layout parent
- `layoutWrap = "WRAP"` on a `VERTICAL` frame (only legal on `HORIZONTAL`)
- `counterAxisSpacing` without `WRAP`
- `layoutPositioning = "ABSOLUTE"` on an unparented node
- colour channels outside 0–1, or an `a` field on a paint colour
- `primaryAxisSizingMode` / `counterAxisSizingMode` given a `layoutSizing*` value
- variant names that aren't `Prop=Value`, and `setProperties` with unknown keys

It prints the page/variable counts and a deduplicated findings list. This is how
the two bugs in the first draft of the generator were found.

## `render.js`

Runs the same mock, then walks the resulting node tree and emits
`preview.html` — Figma auto-layout maps almost 1:1 onto CSS flexbox, so the
translation is mostly mechanical:

| Figma | CSS |
| --- | --- |
| `layoutMode` | `flex-direction` |
| `itemSpacing` / `counterAxisSpacing` | `gap` / `row-gap` |
| `primaryAxisSizingMode: AUTO` | `fit-content` on the main axis |
| `layoutSizingHorizontal: FILL` | `flex:1 1 0` in a row, `align-self:stretch` in a column |
| `layoutGrow` | `flex-grow` |
| `layoutPositioning: ABSOLUTE` | `position:absolute` + `left`/`top` |
| effect style | `box-shadow` |
| `VECTOR` / `STAR` | inline `<svg>` |

It also prints a structural audit: fixed-width children that overflow a
fixed-width parent's content box, empty text nodes, non-positive sizes, and a
per-screen node count.

Pass a page-name filter to render a subset:

```bash
node design/preview/render.js storefront
```

`preview.html` is gitignored.

## What this does and does not prove

It proves the generator runs to completion, produces the expected structure, and
breaks none of the Plugin API rules listed above. It does **not** prove the
design looks right — there is no real text shaper or layout engine here, so
line-wrap points, final heights, and optical spacing come from the browser's
flexbox, not Figma's. Treat the preview as a faithful structural mock-up, and
the Figma file as the source of truth once you run the plugin.
