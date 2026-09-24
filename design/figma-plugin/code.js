/* ---------------------------------------------------------------------------
   Beauty Commerce — Figma design file generator
   ---------------------------------------------------------------------------
   Builds the whole design file from the tokens and components that already
   exist in apps/web:

     01 Foundations  colour variables (Light + Dark modes), type ramp,
                     elevation, radii, spacing
     02 Components   button / badge / field / product card / rating / price /
                     qty stepper / status badges / header / footer
     03 Storefront   home, listing, product detail, search
     04 Commerce     cart, checkout, order confirmation, wishlist
     05 Account      login, register, account, orders
     06 Admin        dashboard, orders, products
     07 Mobile       home, product detail, cart, nav drawer

   Colour values are lifted verbatim from apps/web/src/app/globals.css, sizes
   from the Tailwind classes on the real components. Run it on an EMPTY file —
   it creates pages and leaves anything already there alone, but a clean file
   keeps the result tidy.
--------------------------------------------------------------------------- */

// Placeholder imagery. Set to false for a fully offline run (flat swatches).
var USE_REMOTE_IMAGES = true;

/* --------------------------------------------------------------------------
   1. Tokens — apps/web/src/app/globals.css
-------------------------------------------------------------------------- */

var TOKENS = {
  Light: {
    background: "#fdfbf8",
    "background-tint": "#f7f0ea",
    foreground: "#221d1b",
    surface: "#ffffff",
    "surface-2": "#f4eee8",
    muted: "#79706a",
    border: "#ebe3da",
    accent: "#b03a5b",
    "accent-hover": "#963050",
    "accent-foreground": "#ffffff",
    "accent-soft": "#f7e5ea",
    gold: "#c69a5b",
    "gold-soft": "#f5ecdd",
    success: "#2f855a",
    danger: "#d14343",
    ring: "#b03a5b",
  },
  Dark: {
    background: "#17140f",
    "background-tint": "#1f1a15",
    foreground: "#f3ece2",
    surface: "#211c17",
    "surface-2": "#2b241d",
    muted: "#b0a599",
    border: "#372f26",
    accent: "#e79bb2",
    "accent-hover": "#f0b3c5",
    "accent-foreground": "#211c17",
    "accent-soft": "#3a2029",
    gold: "#dcbc86",
    "gold-soft": "#322a1e",
    success: "#6cd39a",
    danger: "#f08a8a",
    ring: "#e79bb2",
  },
};

var TOKEN_NOTES = {
  background: "Page canvas",
  "background-tint": "Hero / banded backgrounds",
  foreground: "Primary text",
  surface: "Cards, inputs, footer",
  "surface-2": "Sunken panels, image wells, hover",
  muted: "Secondary text, icons",
  border: "Hairlines, input borders",
  accent: "Brand rose — primary action",
  "accent-hover": "Primary action, hovered",
  "accent-foreground": "Text on accent",
  "accent-soft": "Accent wash / tinted cards",
  gold: "Ratings, Featured badge",
  "gold-soft": "Gold wash",
  success: "Delivered, paid, in stock",
  danger: "Errors, sold out, cancelled",
  ring: "Focus ring",
};

// Tailwind radii used in the app.
var RADII = { sm: 6, md: 8, lg: 12, xl: 16, "2xl": 24, full: 999 };
// Tailwind 4-point spacing scale, the steps the app actually uses.
var SPACING = [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56, 64, 80];

var PAGE_W = 1440; // desktop artboard
var GUTTER = 56; // container-x at xl: px-14
var CONTENT_W = PAGE_W - GUTTER * 2; // 1328
var CARD_W = 320; // (1328 - 3*16) / 4
var MOBILE_W = 390;

/* --------------------------------------------------------------------------
   2. Small helpers
-------------------------------------------------------------------------- */

function hexToRgb(hex) {
  var h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

var V = {}; // token name -> Variable
var F = {}; // resolved font names
var STYLES = {}; // text/effect styles by key
var C = {}; // components by key

function paint(token, opacity) {
  var p = {
    type: "SOLID",
    color: hexToRgb(TOKENS.Light[token] || token),
    opacity: opacity == null ? 1 : opacity,
  };
  if (V[token]) p = figma.variables.setBoundVariableForPaint(p, "color", V[token]);
  return p;
}

function fillVar(node, token, opacity) {
  node.fills = [paint(token, opacity)];
  return node;
}

function strokeVar(node, token, weight, opacity) {
  node.strokes = [paint(token, opacity)];
  node.strokeWeight = weight == null ? 1 : weight;
  node.strokeAlign = "INSIDE";
  return node;
}

/**
 * Auto-layout frame. `pad` is a number or [t, r, b, l] (CSS shorthand rules).
 * Omitting `w`/`h` leaves that axis hugging its content.
 */
function box(name, o) {
  o = o || {};
  var f = figma.createFrame();
  f.name = name;
  f.fills = [];
  f.clipsContent = o.clip == null ? false : o.clip;

  if (o.dir) {
    f.layoutMode = o.dir;
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
    f.itemSpacing = o.gap || 0;
    f.counterAxisAlignItems = o.align || "MIN";
    f.primaryAxisAlignItems = o.justify || "MIN";
    if (o.wrap) {
      f.layoutWrap = "WRAP";
      if (o.rowGap != null) f.counterAxisSpacing = o.rowGap;
    }
  }

  var p = o.pad;
  if (p != null) {
    if (typeof p === "number") {
      f.paddingTop = f.paddingRight = f.paddingBottom = f.paddingLeft = p;
    } else {
      f.paddingTop = p[0] || 0;
      f.paddingRight = p[1] != null ? p[1] : p[0] || 0;
      f.paddingBottom = p[2] != null ? p[2] : p[0] || 0;
      f.paddingLeft = p[3] != null ? p[3] : p[1] != null ? p[1] : p[0] || 0;
    }
  }

  if (o.radius != null) f.cornerRadius = o.radius;
  if (o.bg) fillVar(f, o.bg, o.bgOpacity);
  if (o.border) strokeVar(f, o.border, o.borderWeight, o.borderOpacity);
  if (o.dash) f.dashPattern = [6, 4];
  if (o.effect) f.effectStyleId = STYLES[o.effect] ? STYLES[o.effect].id : "";

  if (o.w != null || o.h != null) {
    f.resize(o.w != null ? o.w : Math.max(f.width, 1), o.h != null ? o.h : Math.max(f.height, 1));
    // resize() forces FIXED on both axes — hand the unspecified axis back to HUG.
    if (o.dir === "VERTICAL") {
      if (o.h == null) f.primaryAxisSizingMode = "AUTO";
      if (o.w == null) f.counterAxisSizingMode = "AUTO";
    } else if (o.dir === "HORIZONTAL") {
      if (o.w == null) f.primaryAxisSizingMode = "AUTO";
      if (o.h == null) f.counterAxisSizingMode = "AUTO";
    }
  }
  return f;
}

/** Append, then apply child sizing (FILL/HUG are only legal once parented). */
function add(parent, child, sz) {
  parent.appendChild(child);
  if (sz) {
    if (sz.h) child.layoutSizingHorizontal = sz.h;
    if (sz.v) child.layoutSizingVertical = sz.v;
    if (sz.grow) child.layoutGrow = 1;
    if (sz.align) child.layoutAlign = sz.align;
  }
  return child;
}

function txt(chars, o) {
  o = o || {};
  var t = figma.createText();
  t.fontName = o.font || F.sans.regular;
  t.fontSize = o.size || 14;
  t.characters = chars;
  t.lineHeight = o.lh ? { unit: "PIXELS", value: o.lh } : { unit: "PERCENT", value: o.lhp || 140 };
  if (o.ls != null) t.letterSpacing = { unit: "PIXELS", value: o.ls };
  if (o.upper) t.textCase = "UPPER";
  if (o.strike) t.textDecoration = "STRIKETHROUGH";
  if (o.align) t.textAlignHorizontal = o.align;
  fillVar(t, o.color || "foreground", o.opacity);
  if (o.style && STYLES[o.style]) t.textStyleId = STYLES[o.style].id;
  if (o.w) {
    t.textAutoResize = "HEIGHT";
    t.resize(o.w, Math.max(t.height, 1));
  } else {
    t.textAutoResize = "WIDTH_AND_HEIGHT";
  }
  return t;
}

/** Flexible gap that eats remaining space in an auto-layout row. */
function spring(parent) {
  var s = box("spacer", { dir: "HORIZONTAL", h: 1 });
  add(parent, s, { grow: true });
  return s;
}

function divider(parent, token) {
  var d = box("divider", { h: 1, bg: token || "border" });
  add(parent, d, { h: "FILL" });
  return d;
}

/* --------------------------------------------------------------------------
   3. Icons — Feather-style 24x24 stroke paths
-------------------------------------------------------------------------- */

var ICONS = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  heart:
    "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
  bag: "M6 2 L3 6 v14 a2 2 0 0 0 2 2 h14 a2 2 0 0 0 2-2 V6 l-3-4 Z M3 6 h18 M16 10 a4 4 0 0 1-8 0",
  menu: "M3 12h18 M3 6h18 M3 18h18",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  chevronLeft: "M15 18l-6-6 6-6",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  close: "M18 6L6 18 M6 6l12 12",
  trash:
    "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  check: "M20 6L9 17l-5-5",
  truck: "M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  wallet: "M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4h-4z",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z",
  instagram:
    "M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5z M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z",
  facebook: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
  tiktok: "M16 3v9.5a4.5 4.5 0 1 1-4-4.47 M16 3c0 2.5 2 4.5 4.5 4.5",
};

function icon(name, size, token, opacity) {
  size = size || 20;
  var v = figma.createVector();
  v.name = name;
  v.vectorPaths = [{ windingRule: "NONE", data: ICONS[name] || ICONS.check }];
  v.fills = [];
  strokeVar(v, token || "foreground", 1.75, opacity);
  v.strokeCap = "ROUND";
  v.strokeJoin = "ROUND";
  v.strokeAlign = "CENTER";
  v.resize(size, size);
  v.constrainProportions = true;
  return v;
}

/** Icon centred in a fixed square, so it lines up in auto-layout rows. */
function iconBox(name, size, token, opacity) {
  var b = box("icon/" + name, {
    dir: "HORIZONTAL",
    w: size,
    h: size,
    align: "CENTER",
    justify: "CENTER",
  });
  add(b, icon(name, size, token, opacity));
  return b;
}

function star(size, filled) {
  var s = figma.createStar();
  s.pointCount = 5;
  s.innerRadius = 0.42;
  s.resize(size, size);
  if (filled) {
    fillVar(s, "gold");
    s.strokes = [];
  } else {
    s.fills = [];
    strokeVar(s, "gold", 1, 0.45);
  }
  return s;
}

/* --------------------------------------------------------------------------
   4. Fonts
-------------------------------------------------------------------------- */

async function resolveFonts() {
  var avail = await figma.listAvailableFontsAsync();
  var byFamily = {};
  for (var i = 0; i < avail.length; i++) {
    var fn = avail[i].fontName;
    if (!byFamily[fn.family]) byFamily[fn.family] = {};
    byFamily[fn.family][fn.style] = true;
  }
  function family(cands) {
    for (var j = 0; j < cands.length; j++) if (byFamily[cands[j]]) return cands[j];
    return "Inter";
  }
  function style(fam, cands) {
    var have = byFamily[fam] || { Regular: true };
    for (var j = 0; j < cands.length; j++) if (have[cands[j]]) return cands[j];
    return have.Regular ? "Regular" : Object.keys(have)[0];
  }

  var sans = family(["Geist", "Inter", "Roboto", "Helvetica Neue", "Arial"]);
  var serif = family(["Playfair Display", "Lora", "Georgia", "Times New Roman", "Inter"]);

  F.sans = {
    regular: { family: sans, style: style(sans, ["Regular", "Book"]) },
    medium: { family: sans, style: style(sans, ["Medium", "Regular"]) },
    semibold: { family: sans, style: style(sans, ["Semi Bold", "SemiBold", "Demi Bold", "Bold"]) },
    bold: { family: sans, style: style(sans, ["Bold", "Semi Bold", "SemiBold"]) },
  };
  F.serif = {
    regular: { family: serif, style: style(serif, ["Regular"]) },
    medium: { family: serif, style: style(serif, ["Medium", "Regular"]) },
    semibold: { family: serif, style: style(serif, ["SemiBold", "Semi Bold", "Bold", "Medium"]) },
    bold: { family: serif, style: style(serif, ["Bold", "SemiBold", "Semi Bold"]) },
  };

  var wanted = [];
  var seen = {};
  var groups = [F.sans, F.serif];
  for (var g = 0; g < groups.length; g++) {
    for (var k in groups[g]) {
      var f = groups[g][k];
      var key = f.family + "|" + f.style;
      if (!seen[key]) {
        seen[key] = true;
        wanted.push(f);
      }
    }
  }
  await Promise.all(wanted.map(function (f) { return figma.loadFontAsync(f); }));
  return { sans: sans, serif: serif };
}

/* --------------------------------------------------------------------------
   5. Variables, text styles, effect styles
-------------------------------------------------------------------------- */

function buildColorVariables() {
  var col = figma.variables.createVariableCollection("Beauty / Color");
  col.renameMode(col.modes[0].modeId, "Light");
  var lightId = col.modes[0].modeId;
  var darkId = col.addMode("Dark");

  var names = Object.keys(TOKENS.Light);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var v = figma.variables.createVariable(name, col, "COLOR");
    v.scopes = ["FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR"];
    v.description = TOKEN_NOTES[name] || "";
    v.setValueForMode(lightId, hexToRgb(TOKENS.Light[name]));
    v.setValueForMode(darkId, hexToRgb(TOKENS.Dark[name]));
    V[name] = v;
  }
  return col;
}

function buildNumberVariables() {
  var radius = figma.variables.createVariableCollection("Beauty / Radius");
  for (var k in RADII) {
    var rv = figma.variables.createVariable("radius/" + k, radius, "FLOAT");
    rv.scopes = ["CORNER_RADIUS"];
    rv.setValueForMode(radius.modes[0].modeId, RADII[k]);
  }
  var space = figma.variables.createVariableCollection("Beauty / Spacing");
  for (var i = 0; i < SPACING.length; i++) {
    var sv = figma.variables.createVariable("space/" + SPACING[i], space, "FLOAT");
    sv.scopes = ["GAP", "WIDTH_HEIGHT"];
    sv.setValueForMode(space.modes[0].modeId, SPACING[i]);
  }
  return [radius, space];
}

var TYPE_RAMP = [
  ["Display/Hero", "serif", "semibold", 60, 63, -1.2, "Home hero h1"],
  ["Display/Page", "serif", "semibold", 40, 46, -0.6, "PageHeader h1 (sm:text-4xl)"],
  ["Heading/XL", "serif", "semibold", 32, 38, -0.4, "Section h2 (sm:text-3xl)"],
  ["Heading/L", "serif", "semibold", 24, 30, -0.2, "Section h2, admin h1"],
  ["Heading/M", "serif", "semibold", 20, 26, 0, "Card and panel titles"],
  ["Heading/S", "serif", "semibold", 18, 24, 0, "About, Summary"],
  ["Body/L", "sans", "regular", 18, 28, 0, "Hero subcopy"],
  ["Body/M", "sans", "regular", 16, 26, 0, "Default body"],
  ["Body/S", "sans", "regular", 14, 22, 0, "Most UI text"],
  ["Body/S Medium", "sans", "medium", 14, 22, 0, "Nav active, labels, buttons"],
  ["Body/S Semibold", "sans", "semibold", 14, 22, 0, "Prices, totals"],
  ["Caption", "sans", "regular", 12, 18, 0, "Hints, meta, breadcrumbs"],
  ["Overline", "sans", "medium", 12, 16, 0.8, "Brand name above product title"],
  ["Badge", "sans", "semibold", 11, 14, 0.5, "Badge pills"],
];

function buildTextStyles() {
  for (var i = 0; i < TYPE_RAMP.length; i++) {
    var d = TYPE_RAMP[i];
    var s = figma.createTextStyle();
    s.name = d[0];
    s.fontName = F[d[1]][d[2]];
    s.fontSize = d[3];
    s.lineHeight = { unit: "PIXELS", value: d[4] };
    s.letterSpacing = { unit: "PIXELS", value: d[5] };
    s.description = d[6];
    if (d[0] === "Overline" || d[0] === "Badge") s.textCase = "UPPER";
    STYLES[d[0]] = s;
  }
}

function shadow(x, y, blur, spread, alpha) {
  return {
    type: "DROP_SHADOW",
    color: { r: 28 / 255, g: 20 / 255, b: 18 / 255, a: alpha },
    offset: { x: x, y: y },
    radius: blur,
    spread: spread,
    visible: true,
    blendMode: "NORMAL",
  };
}

function buildEffectStyles() {
  var soft = figma.createEffectStyle();
  soft.name = "Elevation/Soft";
  soft.description = ".shadow-soft — cards, inputs, sticky header";
  soft.effects = [shadow(0, 1, 2, 0, 0.04), shadow(0, 12, 32, -12, 0.14)];
  STYLES["soft"] = soft;

  var lift = figma.createEffectStyle();
  lift.name = "Elevation/Lift";
  lift.description = ".shadow-lift — hover state, dropdown panels, hero image";
  lift.effects = [shadow(0, 2, 4, 0, 0.06), shadow(0, 24, 48, -16, 0.22)];
  STYLES["lift"] = lift;
}

/* --------------------------------------------------------------------------
   6. Imagery
-------------------------------------------------------------------------- */

var imageCache = {};

async function imageFill(seed, w, h) {
  if (!USE_REMOTE_IMAGES) return null;
  var key = seed + ":" + w + "x" + h;
  if (imageCache[key] !== undefined) return imageCache[key];
  try {
    var img = await figma.createImageAsync(
      "https://picsum.photos/seed/" + encodeURIComponent(seed) + "/" + w + "/" + h
    );
    var fill = { type: "IMAGE", imageHash: img.hash, scaleMode: "FILL" };
    imageCache[key] = fill;
    return fill;
  } catch (e) {
    imageCache[key] = null;
    return null;
  }
}

/** Image well: real photo when the network allows, tinted panel otherwise. */
async function photo(name, w, h, seed, radius) {
  var f = box(name, { w: w, h: h, radius: radius == null ? 16 : radius, bg: "surface-2", clip: true });
  var fill = await imageFill(seed, Math.round(w), Math.round(h));
  if (fill) f.fills = [fill];
  return f;
}

/* --------------------------------------------------------------------------
   7. Components
-------------------------------------------------------------------------- */

var BTN_SIZES = { Sm: { h: 36, px: 16, fs: 14 }, Md: { h: 44, px: 24, fs: 14 }, Lg: { h: 48, px: 32, fs: 16 } };
var BTN_VARIANTS = ["Primary", "Secondary", "Outline", "Ghost"];

function buildButton(variant, size, label) {
  var s = BTN_SIZES[size];
  var c = figma.createComponent();
  c.name = "Variant=" + variant + ", Size=" + size;
  c.layoutMode = "HORIZONTAL";
  c.counterAxisAlignItems = "CENTER";
  c.primaryAxisAlignItems = "CENTER";
  c.itemSpacing = 8;
  c.paddingLeft = c.paddingRight = s.px;
  c.cornerRadius = 999;
  c.fills = [];

  if (variant === "Primary") {
    fillVar(c, "accent");
    c.effectStyleId = STYLES.soft.id;
  } else if (variant === "Secondary") {
    fillVar(c, "foreground");
  } else if (variant === "Outline") {
    strokeVar(c, "border", 1);
  }

  var color = variant === "Primary" ? "accent-foreground" : variant === "Secondary" ? "background" : "foreground";
  add(c, txt(label || "Button", { size: s.fs, font: F.sans.medium, color: color, lh: s.fs + 6 }));

  c.resize(Math.max(c.width, 1), s.h);
  c.primaryAxisSizingMode = "AUTO"; // hug width, fixed height
  return c;
}

function buildButtonSet(page, x, y) {
  var parts = [];
  for (var v = 0; v < BTN_VARIANTS.length; v++) {
    for (var sKey in BTN_SIZES) {
      var c = buildButton(BTN_VARIANTS[v], sKey, BTN_VARIANTS[v] === "Primary" ? "Shop all" : "Explore");
      page.appendChild(c);
      parts.push(c);
    }
  }
  var set = figma.combineAsVariants(parts, page);
  set.name = "Button";
  set.description =
    "components/ui/button.tsx — rounded-full, hover lifts 2px. Sm h-9/px-4, Md h-11/px-6, Lg h-12/px-8.";
  // WRAP is only legal on HORIZONTAL auto-layout — 3 sizes per row, 4 rows.
  set.layoutMode = "HORIZONTAL";
  set.primaryAxisSizingMode = "FIXED";
  set.counterAxisSizingMode = "AUTO";
  set.itemSpacing = 16;
  set.layoutWrap = "WRAP";
  set.counterAxisSpacing = 16;
  set.counterAxisAlignItems = "CENTER";
  set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = 24;
  set.resize(520, Math.max(set.height, 1));
  set.counterAxisSizingMode = "AUTO"; // resize() forced FIXED; hug the rows again
  set.x = x;
  set.y = y;
  C.Button = set;
  return set;
}

var BADGE_TONES = {
  Neutral: { bg: "surface-2", fg: "foreground", bgo: 1 },
  Accent: { bg: "accent", fg: "accent-foreground", bgo: 1 },
  Gold: { bg: "gold", fg: "gold", bgo: 0.15 },
  Success: { bg: "success", fg: "success", bgo: 0.15 },
  Danger: { bg: "danger", fg: "danger", bgo: 0.15 },
};

function buildBadgeSet(page, x, y) {
  var labels = { Neutral: "Perfume", Accent: "Sale", Gold: "Featured", Success: "Delivered", Danger: "Sold out" };
  var parts = [];
  for (var tone in BADGE_TONES) {
    var t = BADGE_TONES[tone];
    var c = figma.createComponent();
    c.name = "Tone=" + tone;
    c.layoutMode = "HORIZONTAL";
    c.counterAxisAlignItems = "CENTER";
    c.primaryAxisSizingMode = "AUTO";
    c.counterAxisSizingMode = "AUTO";
    c.paddingLeft = c.paddingRight = 10;
    c.paddingTop = c.paddingBottom = 3;
    c.cornerRadius = 999;
    c.fills = [];
    fillVar(c, t.bg, t.bgo);
    add(c, txt(labels[tone], { size: 11, font: F.sans.semibold, color: t.fg, upper: true, ls: 0.5, lh: 14 }));
    page.appendChild(c);
    parts.push(c);
  }
  var set = figma.combineAsVariants(parts, page);
  set.name = "Badge";
  set.description = "components/ui/badge.tsx — 11px semibold uppercase, tracking-wide, rounded-full.";
  set.layoutMode = "HORIZONTAL";
  set.primaryAxisSizingMode = "AUTO";
  set.counterAxisSizingMode = "AUTO";
  set.counterAxisAlignItems = "CENTER";
  set.itemSpacing = 16;
  set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = 24;
  set.x = x;
  set.y = y;
  C.Badge = set;
  return set;
}

function badge(tone) {
  var inst = C.Badge.defaultVariant.createInstance();
  inst.setProperties({ Tone: tone });
  return inst;
}

function button(variant, size, label) {
  var inst = C.Button.defaultVariant.createInstance();
  inst.setProperties({ Variant: variant, Size: size });
  if (label) {
    var t = inst.findOne(function (n) { return n.type === "TEXT"; });
    if (t) t.characters = label;
  }
  return inst;
}

function buildFieldSet(page, x, y) {
  var states = ["Default", "Filled", "Error"];
  var parts = [];
  for (var i = 0; i < states.length; i++) {
    var state = states[i];
    var c = figma.createComponent();
    c.name = "State=" + state;
    c.layoutMode = "VERTICAL";
    c.itemSpacing = 6;
    c.primaryAxisSizingMode = "AUTO";
    c.counterAxisSizingMode = "AUTO";
    c.fills = [];
    c.resize(320, 1);
    c.counterAxisSizingMode = "FIXED";

    add(c, txt("Email", { size: 14, font: F.sans.medium }), { h: "FILL" });

    var input = box("input", {
      dir: "HORIZONTAL",
      h: 44,
      radius: 12,
      bg: "surface",
      border: state === "Error" ? "danger" : "border",
      pad: [0, 14],
      align: "CENTER",
    });
    add(input, txt(state === "Default" ? "you@example.com" : "priya@example.com", {
      size: 14,
      color: state === "Default" ? "muted" : "foreground",
    }));
    add(c, input, { h: "FILL" });

    if (state === "Error") {
      var err = box("error", { dir: "HORIZONTAL", radius: 12, bg: "danger", bgOpacity: 0.1, pad: [10, 14], border: "danger", borderOpacity: 0.3 });
      add(err, txt("That email is already registered.", { size: 14, color: "danger" }));
      add(c, err, { h: "FILL" });
    } else {
      add(c, txt("We only email about your orders.", { size: 12, color: "muted" }), { h: "FILL" });
    }

    page.appendChild(c);
    parts.push(c);
  }
  var set = figma.combineAsVariants(parts, page);
  set.name = "Field";
  set.description = "components/ui/field.tsx — h-11, rounded-xl, 1px border, 14px label above.";
  set.layoutMode = "HORIZONTAL";
  set.primaryAxisSizingMode = "AUTO";
  set.counterAxisSizingMode = "AUTO";
  set.itemSpacing = 32;
  set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = 24;
  set.x = x;
  set.y = y;
  C.Field = set;
  return set;
}

function rating(value, count, size) {
  var r = box("Rating", { dir: "HORIZONTAL", gap: 4, align: "CENTER" });
  var stars = box("stars", { dir: "HORIZONTAL", gap: 1.5, align: "CENTER" });
  var rounded = Math.round(value);
  for (var i = 0; i < 5; i++) add(stars, star(size || 13, i < rounded));
  add(r, stars);
  add(r, txt(value.toFixed(1), { size: 12, font: F.sans.medium }));
  if (count) add(r, txt("(" + count + ")", { size: 12, color: "muted" }));
  return r;
}

function price(amount, compareAt, size) {
  var fs = size === "lg" ? 24 : size === "sm" ? 14 : 16;
  var p = box("Price", { dir: "HORIZONTAL", gap: 8, align: "BASELINE" });
  add(p, txt("NPR " + amount.toLocaleString("en-US"), { size: fs, font: F.sans.semibold }));
  if (compareAt) {
    add(p, txt("NPR " + compareAt.toLocaleString("en-US"), { size: fs - 2, color: "muted", strike: true }));
    var pct = Math.round((1 - amount / compareAt) * 100);
    add(p, txt("−" + pct + "%", { size: 12, font: F.sans.semibold, color: "accent" }));
  }
  return p;
}

var DEMO_PRODUCTS = [
  { brand: "Maison Lumière", name: "Velours Noir Eau de Parfum 50ml", price: 12800, was: 15500, rating: 4.7, count: 128, seed: "bc-p1", tag: "Sale" },
  { brand: "Aurelle", name: "Niacinamide 10% Clarifying Serum", price: 3450, was: null, rating: 4.5, count: 96, seed: "bc-p2", tag: "Featured" },
  { brand: "Kora Ritual", name: "Silk Finish Matte Lipstick — Rosewood", price: 1890, was: null, rating: 4.8, count: 214, seed: "bc-p3", tag: null },
  { brand: "Nordstem", name: "Hydra Barrier Repair Cream 50ml", price: 4200, was: 4900, rating: 4.3, count: 61, seed: "bc-p4", tag: "Sale" },
  { brand: "Maison Lumière", name: "Fleur de Sel Eau de Toilette 100ml", price: 9600, was: null, rating: 4.6, count: 77, seed: "bc-p5", tag: null },
  { brand: "Aurelle", name: "Vitamin C Brightening Ampoule", price: 5100, was: null, rating: 4.4, count: 143, seed: "bc-p6", tag: "Featured" },
  { brand: "Sable & Co", name: "Argan Repair Hair Oil 100ml", price: 2750, was: 3200, rating: 4.2, count: 54, seed: "bc-p7", tag: "Sale" },
  { brand: "Kora Ritual", name: "Soft Glow Cream Blush — Peony", price: 2150, was: null, rating: 4.9, count: 188, seed: "bc-p8", tag: null },
];

async function buildProductCardSet(page, x, y) {
  var states = ["Default", "Sale", "Sold out"];
  var parts = [];
  for (var i = 0; i < states.length; i++) {
    var state = states[i];
    var d = DEMO_PRODUCTS[i];
    var c = figma.createComponent();
    c.name = "State=" + state;
    c.layoutMode = "VERTICAL";
    c.itemSpacing = 12;
    c.fills = [];
    c.resize(CARD_W, 1);
    c.counterAxisSizingMode = "FIXED";
    c.primaryAxisSizingMode = "AUTO";

    // Image well with overlay badges + wishlist affordance.
    var well = await photo("image", CARD_W, CARD_W * 1.25, d.seed, 16);
    well.layoutMode = "HORIZONTAL";
    well.primaryAxisSizingMode = "FIXED";
    well.counterAxisSizingMode = "FIXED";
    well.paddingTop = well.paddingRight = well.paddingBottom = well.paddingLeft = 12;
    well.effectStyleId = STYLES.soft.id;

    var tags = box("tags", { dir: "VERTICAL", gap: 6 });
    if (state === "Sale") add(tags, badge("Accent"));
    if (state === "Default") add(tags, badge("Gold"));
    if (state === "Sold out") add(tags, badge("Danger"));
    add(well, tags);
    spring(well);

    var wish = box("wishlist", {
      dir: "HORIZONTAL", w: 36, h: 36, radius: 999, bg: "surface", bgOpacity: 0.9,
      align: "CENTER", justify: "CENTER",
    });
    add(wish, icon("heart", 17, state === "Sale" ? "accent" : "foreground"));
    add(well, wish);
    add(c, well, { h: "FILL" });

    var meta = box("meta", { dir: "VERTICAL", gap: 5 });
    add(meta, txt(d.brand, { size: 12, color: "muted", upper: true, ls: 0.8 }));
    add(meta, txt(d.name, { size: 14, font: F.sans.medium, w: CARD_W, lh: 20 }), { h: "FILL" });
    add(meta, rating(d.rating, d.count));
    add(meta, price(d.price, state === "Sale" ? d.was : null, "sm"));
    add(c, meta, { h: "FILL" });

    if (state === "Sold out") well.opacity = 0.55;

    page.appendChild(c);
    parts.push(c);
  }
  var set = figma.combineAsVariants(parts, page);
  set.name = "Product Card";
  set.description =
    "components/product/product-card.tsx — 4:5 image, rounded-2xl, badges top-left, wishlist top-right. Hover: lift 6px + image scale 1.07.";
  set.layoutMode = "HORIZONTAL";
  set.primaryAxisSizingMode = "AUTO";
  set.counterAxisSizingMode = "AUTO";
  set.itemSpacing = 32;
  set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = 24;
  set.x = x;
  set.y = y;
  C.ProductCard = set;
  return set;
}

function productCard(state) {
  var inst = C.ProductCard.defaultVariant.createInstance();
  inst.setProperties({ State: state || "Default" });
  return inst;
}

/** Product card filled with specific copy — used inside screens. */
async function productCardFor(d) {
  var c = box("Product Card / " + d.name, { dir: "VERTICAL", gap: 12, w: CARD_W });
  var well = await photo("image", CARD_W, CARD_W * 1.25, d.seed, 16);
  well.layoutMode = "HORIZONTAL";
  well.primaryAxisSizingMode = "FIXED";
  well.counterAxisSizingMode = "FIXED";
  well.paddingTop = well.paddingRight = well.paddingBottom = well.paddingLeft = 12;
  well.effectStyleId = STYLES.soft.id;

  var tags = box("tags", { dir: "VERTICAL", gap: 6 });
  if (d.tag === "Sale") add(tags, badge("Accent"));
  if (d.tag === "Featured") add(tags, badge("Gold"));
  add(well, tags);
  spring(well);
  var wish = box("wishlist", { dir: "HORIZONTAL", w: 36, h: 36, radius: 999, bg: "surface", bgOpacity: 0.9, align: "CENTER", justify: "CENTER" });
  add(wish, icon("heart", 17, "foreground"));
  add(well, wish);
  add(c, well, { h: "FILL" });

  var meta = box("meta", { dir: "VERTICAL", gap: 5 });
  add(meta, txt(d.brand, { size: 12, color: "muted", upper: true, ls: 0.8 }));
  add(meta, txt(d.name, { size: 14, font: F.sans.medium, w: CARD_W, lh: 20 }), { h: "FILL" });
  add(meta, rating(d.rating, d.count));
  add(meta, price(d.price, d.was, "sm"));
  add(c, meta, { h: "FILL" });
  return c;
}

function qtyStepper(qty) {
  var s = box("Qty stepper", { dir: "HORIZONTAL", h: 36, radius: 999, border: "border", align: "CENTER" });
  add(s, iconBox("minus", 14, "foreground"));
  s.paddingLeft = s.paddingRight = 10;
  s.itemSpacing = 10;
  add(s, txt(String(qty == null ? 1 : qty), { size: 14, align: "CENTER" }));
  add(s, iconBox("plus", 14, "foreground"));
  return s;
}

function searchBar(w, placeholder) {
  var f = box("Search", { dir: "HORIZONTAL", w: w, h: 40, radius: 999, bg: "surface", border: "border", pad: [0, 16], gap: 10, align: "CENTER" });
  add(f, icon("search", 16, "muted"));
  add(f, txt(placeholder || "Search perfumes, serums…", { size: 14, color: "muted" }));
  return f;
}

function breadcrumb(items) {
  var b = box("Breadcrumb", { dir: "HORIZONTAL", gap: 6, align: "CENTER" });
  for (var i = 0; i < items.length; i++) {
    var last = i === items.length - 1;
    add(b, txt(items[i], { size: 12, color: last ? "foreground" : "muted" }));
    if (!last) add(b, txt("/", { size: 12, color: "muted", opacity: 0.6 }));
  }
  return b;
}

function statusBadge(status) {
  var map = {
    "Pending Payment": "Gold", Processing: "Accent", Paid: "Accent", Shipped: "Accent",
    Delivered: "Success", Cancelled: "Danger", Refunded: "Neutral", "Payment Failed": "Danger",
  };
  var b = badge(map[status] || "Neutral");
  var t = b.findOne(function (n) { return n.type === "TEXT"; });
  if (t) t.characters = status;
  return b;
}

/* ---- Header / Footer -------------------------------------------------- */

var NAV_ITEMS = ["All", "Perfumes", "Skincare", "Makeup", "Hair", "Body", "Brands"];

function buildHeader(page, x, y) {
  var c = figma.createComponent();
  c.name = "Header";
  c.description = "components/layout/header.tsx — sticky, h-16, 85% background blur, 1px bottom border.";
  c.layoutMode = "HORIZONTAL";
  c.counterAxisAlignItems = "CENTER";
  c.itemSpacing = 16;
  c.paddingLeft = c.paddingRight = GUTTER;
  fillVar(c, "background", 0.92);
  c.resize(PAGE_W, 64);
  c.primaryAxisSizingMode = "FIXED";
  c.counterAxisSizingMode = "FIXED";

  var border = figma.createRectangle();
  border.name = "bottom border";
  border.resize(PAGE_W, 1);
  fillVar(border, "border");
  border.strokes = [];

  var wordmark = box("wordmark", { dir: "HORIZONTAL", gap: 0, align: "CENTER" });
  add(wordmark, txt("Beauty", { size: 22, font: F.serif.semibold }));
  add(wordmark, txt(".", { size: 22, font: F.serif.semibold, color: "accent" }));
  add(c, wordmark);

  var nav = box("nav", { dir: "HORIZONTAL", gap: 4, align: "CENTER" });
  nav.paddingLeft = 16;
  for (var i = 0; i < NAV_ITEMS.length; i++) {
    var item = box("nav item", { dir: "HORIZONTAL", gap: 4, align: "CENTER", pad: [6, 12] });
    var active = i === 0;
    add(item, txt(NAV_ITEMS[i], { size: 14, color: active ? "foreground" : "muted", font: active ? F.sans.medium : F.sans.regular }));
    if (i > 0 && i < 6) add(item, icon("chevronDown", 13, "muted"));
    add(nav, item);
  }
  add(c, nav);
  spring(c);
  add(c, searchBar(280));

  var actions = box("actions", { dir: "HORIZONTAL", gap: 4, align: "CENTER" });
  var icons = ["user", "heart", "bag"];
  for (var j = 0; j < icons.length; j++) {
    var slot = box("action", { dir: "HORIZONTAL", w: 40, h: 40, radius: 999, align: "CENTER", justify: "CENTER" });
    add(slot, icon(icons[j], 20, "foreground"));
    add(actions, slot);
    if (icons[j] === "bag") {
      // Count pip overlaps the bag glyph: parent it to the slot FIRST, then
      // switch to absolute — the property is illegal on an unparented node.
      var count = box("count", { dir: "HORIZONTAL", w: 18, h: 18, radius: 999, bg: "accent", align: "CENTER", justify: "CENTER" });
      add(count, txt("3", { size: 10, font: F.sans.bold, color: "accent-foreground" }));
      slot.appendChild(count);
      count.layoutPositioning = "ABSOLUTE";
      count.x = 21;
      count.y = 3;
    }
  }
  add(c, actions);

  c.appendChild(border);
  border.layoutPositioning = "ABSOLUTE";
  border.x = 0;
  border.y = 63;

  c.x = x;
  c.y = y;
  C.Header = c;
  return c;
}

function footerCol(title, links) {
  var col = box(title, { dir: "VERTICAL", gap: 10 });
  add(col, txt(title, { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.8 }));
  for (var i = 0; i < links.length; i++) add(col, txt(links[i], { size: 14, color: "muted" }));
  return col;
}

function buildFooter(page, x, y) {
  var c = figma.createComponent();
  c.name = "Footer";
  c.description = "components/layout/footer.tsx — newsletter band, 5 link columns, payment strip.";
  c.layoutMode = "VERTICAL";
  c.fills = [];
  fillVar(c, "surface");
  c.resize(PAGE_W, 1);
  c.counterAxisSizingMode = "FIXED";
  c.primaryAxisSizingMode = "AUTO";
  strokeVar(c, "border", 1);
  c.strokeTopWeight = 1;
  c.strokeBottomWeight = 0;
  c.strokeLeftWeight = 0;
  c.strokeRightWeight = 0;

  // Newsletter band
  var band = box("newsletter", { dir: "HORIZONTAL", pad: [40, GUTTER], align: "CENTER", bg: "surface-2", bgOpacity: 0.6 });
  var copy = box("copy", { dir: "VERTICAL", gap: 4 });
  var h = box("h", { dir: "HORIZONTAL", gap: 8, align: "CENTER" });
  add(h, icon("sparkle", 18, "gold"));
  add(h, txt("Join the list", { size: 20, font: F.serif.semibold }));
  add(copy, h);
  add(copy, txt("New arrivals, restocks and members-only offers — no spam, unsubscribe anytime.", { size: 14, color: "muted", w: 420 }));
  add(band, copy);
  spring(band);
  var form = box("form", { dir: "HORIZONTAL", gap: 10, align: "CENTER" });
  var input = box("input", { dir: "HORIZONTAL", w: 280, h: 44, radius: 999, bg: "surface", border: "border", pad: [0, 18], align: "CENTER" });
  add(input, txt("you@example.com", { size: 14, color: "muted" }));
  add(form, input);
  add(form, button("Primary", "Md", "Subscribe"));
  add(band, form);
  add(c, band, { h: "FILL" });
  divider(c);

  // Link columns
  var cols = box("columns", { dir: "HORIZONTAL", pad: [48, GUTTER], gap: 40 });
  var brand = box("brand", { dir: "VERTICAL", gap: 12, w: 360 });
  var wm = box("wordmark", { dir: "HORIZONTAL", align: "CENTER" });
  add(wm, txt("Beauty", { size: 20, font: F.serif.semibold }));
  add(wm, txt(".", { size: 20, font: F.serif.semibold, color: "accent" }));
  add(brand, wm);
  add(brand, txt("Perfumes, cosmetics and skincare — curated, honest, and delivered across Nepal.", { size: 14, color: "muted", w: 300 }));
  var socials = box("socials", { dir: "HORIZONTAL", gap: 8 });
  var sIcons = ["instagram", "facebook", "tiktok"];
  for (var i = 0; i < sIcons.length; i++) {
    var s = box("social", { dir: "HORIZONTAL", w: 36, h: 36, radius: 999, border: "border", align: "CENTER", justify: "CENTER" });
    add(s, icon(sIcons[i], 17, "muted"));
    add(socials, s);
  }
  add(brand, socials);
  add(cols, brand);
  spring(cols);
  add(cols, footerCol("Shop", ["Perfumes", "Skincare", "Makeup", "Hair", "Body", "Brands"]));
  add(cols, footerCol("Account", ["My account", "Orders", "Wishlist", "Cart"]));
  add(cols, footerCol("Help", ["Shipping & returns", "Authenticity promise", "Contact us"]));
  add(c, cols, { h: "FILL" });
  divider(c);

  // Bottom bar
  var bottom = box("bottom", { dir: "HORIZONTAL", pad: [20, GUTTER], align: "CENTER" });
  add(bottom, txt("© 2026 Beauty Commerce. All rights reserved.", { size: 12, color: "muted" }));
  spring(bottom);
  var pay = box("payments", { dir: "HORIZONTAL", gap: 8, align: "CENTER" });
  add(pay, txt("We accept", { size: 12, color: "muted" }));
  var methods = ["eSewa", "Khalti", "Visa", "Mastercard", "COD"];
  for (var m = 0; m < methods.length; m++) {
    var chip = box("chip", { dir: "HORIZONTAL", radius: 6, border: "border", bg: "background", pad: [5, 8] });
    add(chip, txt(methods[m], { size: 10, font: F.sans.medium }));
    add(pay, chip);
  }
  add(bottom, pay);
  add(c, bottom, { h: "FILL" });

  c.x = x;
  c.y = y;
  C.Footer = c;
  return c;
}

/* --------------------------------------------------------------------------
   8. Screen scaffolding
-------------------------------------------------------------------------- */

function screen(name, w) {
  var f = figma.createFrame();
  f.name = name;
  f.layoutMode = "VERTICAL";
  f.counterAxisSizingMode = "FIXED";
  f.clipsContent = true;
  fillVar(f, "background");
  f.resize(w || PAGE_W, 1);
  f.primaryAxisSizingMode = "AUTO";
  return f;
}

/** Content column with the app's container-x gutters. */
function container(parent, o) {
  o = o || {};
  var c = box("container-x", {
    dir: "VERTICAL",
    gap: o.gap == null ? 40 : o.gap,
    pad: [o.padY == null ? 40 : o.padY, o.gutter == null ? GUTTER : o.gutter],
  });
  add(parent, c, { h: "FILL" });
  return c;
}

function pageHeader(parent, title, description, crumbs) {
  var h = box("PageHeader", { dir: "VERTICAL", gap: 8 });
  if (crumbs) add(h, breadcrumb(crumbs));
  add(h, txt(title, { size: 40, font: F.serif.semibold, lh: 46, ls: -0.6 }));
  if (description) add(h, txt(description, { size: 16, color: "muted", w: 640 }));
  add(parent, h, { h: "FILL" });
  return h;
}

function sectionHead(parent, title, action) {
  var r = box("section head", { dir: "HORIZONTAL", align: "CENTER" });
  add(r, txt(title, { size: 32, font: F.serif.semibold, lh: 38, ls: -0.4 }));
  spring(r);
  if (action) {
    var a = box("action", { dir: "HORIZONTAL", gap: 4, align: "CENTER" });
    add(a, txt(action, { size: 14, color: "accent" }));
    add(a, icon("chevronRight", 15, "accent"));
    add(r, a);
  }
  add(parent, r, { h: "FILL" });
  return r;
}

async function productGrid(parent, items, cols) {
  cols = cols || 4;
  var grid = box("product grid", { dir: "HORIZONTAL", gap: 16, wrap: true, rowGap: 32 });
  add(parent, grid, { h: "FILL" });
  for (var i = 0; i < items.length; i++) add(grid, await productCardFor(items[i]));
  return grid;
}

function summaryRow(parent, label, value, strong) {
  var r = box(label, { dir: "HORIZONTAL", align: "CENTER" });
  add(r, txt(label, { size: 14, color: strong ? "foreground" : "muted", font: strong ? F.sans.medium : F.sans.regular }));
  spring(r);
  add(r, txt(value, { size: strong ? 16 : 14, font: strong ? F.sans.semibold : F.sans.regular }));
  add(parent, r, { h: "FILL" });
  return r;
}

function card(parent, name, o) {
  o = o || {};
  var c = box(name, {
    dir: "VERTICAL",
    gap: o.gap == null ? 16 : o.gap,
    pad: o.pad == null ? 24 : o.pad,
    radius: o.radius == null ? 24 : o.radius,
    bg: o.bg || "surface",
    border: o.border === null ? null : o.border || "border",
    effect: o.effect,
    w: o.w,
  });
  if (parent) add(parent, c, { h: o.w ? "FIXED" : "FILL" });
  return c;
}

/* --------------------------------------------------------------------------
   9. Storefront screens
-------------------------------------------------------------------------- */

async function screenHome() {
  var s = screen("Home — /");
  add(s, C.Header.createInstance(), { h: "FILL" });

  // Hero
  var hero = box("Hero", { dir: "HORIZONTAL", pad: [72, GUTTER], gap: 40, align: "CENTER", bg: "background-tint", clip: true });
  add(s, hero, { h: "FILL" });

  var left = box("copy", { dir: "VERTICAL", gap: 24, w: 600 });
  var pill = box("pill", { dir: "HORIZONTAL", gap: 8, radius: 999, border: "border", bg: "surface", bgOpacity: 0.8, pad: [7, 14], align: "CENTER", effect: "soft" });
  add(pill, icon("sparkle", 14, "accent"));
  add(pill, txt("AI-assisted fragrance finder coming soon", { size: 12, font: F.sans.medium }));
  add(left, pill);

  var h1 = box("h1", { dir: "VERTICAL", gap: 0 });
  add(h1, txt("Scents and skincare,", { size: 60, font: F.serif.semibold, lh: 63, ls: -1.2 }));
  add(h1, txt("chosen with care.", { size: 60, font: F.serif.semibold, lh: 63, ls: -1.2, color: "accent" }));
  add(left, h1);
  add(left, txt("Niche perfumes, clean skincare and high-pigment colour — 100% authentic, delivered across Nepal.", { size: 18, color: "muted", w: 520, lh: 28 }));
  var ctas = box("ctas", { dir: "HORIZONTAL", gap: 12 });
  add(ctas, button("Primary", "Lg", "Shop all"));
  add(ctas, button("Outline", "Lg", "Explore perfumes"));
  add(left, ctas);
  add(hero, left);
  spring(hero);
  var heroImg = await photo("hero", 620, 496, "beauty-hero", 32);
  heroImg.effectStyleId = STYLES.lift.id;
  add(hero, heroImg);

  var body = container(s, { gap: 72, padY: 56 });

  // Category tiles
  var cats = box("Shop by category", { dir: "VERTICAL", gap: 24 });
  add(body, cats, { h: "FILL" });
  add(cats, txt("Shop by category", { size: 24, font: F.serif.semibold }));
  var tiles = box("tiles", { dir: "HORIZONTAL", gap: 16 });
  add(cats, tiles, { h: "FILL" });
  var catNames = ["Perfumes", "Skincare", "Makeup", "Hair", "Body"];
  var tileW = Math.floor((CONTENT_W - 16 * 4) / 5);
  for (var i = 0; i < catNames.length; i++) {
    var tile = await photo(catNames[i], tileW, Math.round(tileW * 0.75), "bc-cat-" + catNames[i], 16);
    tile.layoutMode = "HORIZONTAL";
    tile.primaryAxisSizingMode = "FIXED";
    tile.counterAxisSizingMode = "FIXED";
    tile.counterAxisAlignItems = "MAX";
    tile.paddingLeft = tile.paddingRight = 16;
    tile.paddingBottom = 14;
    tile.effectStyleId = STYLES.soft.id;
    var lab = txt(catNames[i], { size: 15, font: F.sans.medium });
    lab.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    add(tile, lab);
    spring(tile);
    var ch = icon("chevronRight", 17, "surface");
    ch.strokes = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    add(tile, ch);
    add(tiles, tile);
  }

  // Featured
  var featured = box("Featured", { dir: "VERTICAL", gap: 24 });
  add(body, featured, { h: "FILL" });
  sectionHead(featured, "Featured", "View all");
  await productGrid(featured, DEMO_PRODUCTS.slice(0, 4));

  // Trust bar
  var trust = box("Trust bar", { dir: "HORIZONTAL", gap: 24, pad: 32, radius: 24, bg: "surface", border: "border", effect: "soft" });
  add(body, trust, { h: "FILL" });
  var trustItems = [
    ["shield", "100% authentic", "Sourced directly from brands and authorised distributors."],
    ["truck", "Fast delivery", "Same-day in Kathmandu Valley, 2–4 days nationwide."],
    ["refresh", "Easy returns", "7-day returns on unopened items, no questions asked."],
    ["wallet", "Pay your way", "eSewa, Khalti, cards and cash on delivery."],
  ];
  for (var t = 0; t < trustItems.length; t++) {
    var item = box(trustItems[t][1], { dir: "VERTICAL", gap: 6 });
    var head = box("head", { dir: "HORIZONTAL", gap: 8, align: "CENTER" });
    add(head, icon(trustItems[t][0], 18, "accent"));
    add(head, txt(trustItems[t][1], { size: 15, font: F.sans.medium }));
    add(item, head);
    add(item, txt(trustItems[t][2], { size: 13, color: "muted", w: 270 }));
    add(trust, item, { grow: true });
  }

  // New arrivals
  var arrivals = box("New arrivals", { dir: "VERTICAL", gap: 24 });
  add(body, arrivals, { h: "FILL" });
  sectionHead(arrivals, "New arrivals", "View all");
  await productGrid(arrivals, DEMO_PRODUCTS.slice(4, 8));

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

function filterGroup(parent, title, options, selectedIndex) {
  var g = box(title, { dir: "VERTICAL", gap: 10 });
  add(g, txt(title, { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.8 }));
  for (var i = 0; i < options.length; i++) {
    var row = box("option", { dir: "HORIZONTAL", gap: 10, align: "CENTER" });
    var boxel = box("checkbox", { dir: "HORIZONTAL", w: 18, h: 18, radius: 5, border: i === selectedIndex ? "accent" : "border", bg: i === selectedIndex ? "accent" : null, align: "CENTER", justify: "CENTER" });
    if (i === selectedIndex) add(boxel, icon("check", 12, "accent-foreground"));
    add(row, boxel);
    add(row, txt(options[i], { size: 14, color: i === selectedIndex ? "foreground" : "muted" }));
    add(g, row, { h: "FILL" });
  }
  add(parent, g, { h: "FILL" });
  return g;
}

async function screenListing() {
  var s = screen("Product listing — /products");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 32 });
  pageHeader(body, "All products", "Every perfume, serum, lipstick and balm we carry.", ["Home", "Products"]);

  var cols = box("layout", { dir: "HORIZONTAL", gap: 40 });
  add(body, cols, { h: "FILL" });

  // Filter rail
  var rail = box("Filters", { dir: "VERTICAL", gap: 28, w: 240 });
  var railHead = box("head", { dir: "HORIZONTAL", align: "CENTER" });
  add(railHead, txt("Filters", { size: 16, font: F.sans.semibold }));
  spring(railHead);
  add(railHead, txt("Clear all", { size: 12, color: "accent" }));
  add(rail, railHead, { h: "FILL" });
  filterGroup(rail, "Category", ["Perfumes", "Skincare", "Makeup", "Hair", "Body"], 0);
  filterGroup(rail, "Brand", ["Maison Lumière", "Aurelle", "Kora Ritual", "Nordstem", "Sable & Co"], -1);
  var pg = box("Price", { dir: "VERTICAL", gap: 10 });
  add(pg, txt("Price (NPR)", { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.8 }));
  var prow = box("inputs", { dir: "HORIZONTAL", gap: 8 });
  for (var p = 0; p < 2; p++) {
    var inp = box("input", { dir: "HORIZONTAL", w: 88, h: 40, radius: 12, bg: "surface", border: "border", pad: [0, 12], align: "CENTER" });
    add(inp, txt(p === 0 ? "Min" : "Max", { size: 13, color: "muted" }));
    add(prow, inp);
  }
  add(pg, prow, { h: "FILL" });
  add(pg, button("Outline", "Sm", "Apply"));
  add(rail, pg, { h: "FILL" });
  filterGroup(rail, "Availability", ["In stock only", "Featured only"], 0);
  add(cols, rail);

  // Results
  var results = box("Results", { dir: "VERTICAL", gap: 24 });
  add(cols, results, { grow: true });
  var bar = box("toolbar", { dir: "HORIZONTAL", align: "CENTER" });
  add(bar, txt("128 products", { size: 14, color: "muted" }));
  spring(bar);
  var sort = box("sort", { dir: "HORIZONTAL", h: 40, radius: 999, border: "border", bg: "surface", pad: [0, 16], gap: 8, align: "CENTER" });
  add(sort, txt("Sort: Featured", { size: 14 }));
  add(sort, icon("chevronDown", 14, "muted"));
  add(bar, sort);
  add(results, bar, { h: "FILL" });

  var chips = box("active filters", { dir: "HORIZONTAL", gap: 8 });
  add(results, chips, { h: "FILL" });
  var active = ["Perfumes", "In stock"];
  for (var a = 0; a < active.length; a++) {
    var chip = box("chip", { dir: "HORIZONTAL", gap: 6, radius: 999, bg: "accent-soft", pad: [6, 12], align: "CENTER" });
    add(chip, txt(active[a], { size: 13, color: "accent" }));
    add(chip, icon("close", 12, "accent"));
    add(chips, chip);
  }

  var grid = box("grid", { dir: "HORIZONTAL", gap: 16, wrap: true, rowGap: 32, w: CARD_W * 3 + 32 });
  add(results, grid, { h: "FILL" });
  for (var i = 0; i < 6; i++) add(grid, await productCardFor(DEMO_PRODUCTS[i]));

  var pager = box("pagination", { dir: "HORIZONTAL", gap: 8, align: "CENTER", justify: "CENTER" });
  add(results, pager, { h: "FILL" });
  var pages = ["1", "2", "3", "…", "11"];
  for (var pi = 0; pi < pages.length; pi++) {
    var pb = box("page", { dir: "HORIZONTAL", w: 40, h: 40, radius: 999, align: "CENTER", justify: "CENTER", bg: pi === 0 ? "accent" : null, border: pi === 0 ? null : "border" });
    add(pb, txt(pages[pi], { size: 14, color: pi === 0 ? "accent-foreground" : "foreground" }));
    add(pager, pb);
  }

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

async function screenProductDetail() {
  var s = screen("Product detail — /products/[slug]");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 72, padY: 32 });

  add(body, breadcrumb(["Home", "Products", "Perfumes", "Velours Noir"]), { h: "FILL" });

  var top = box("top", { dir: "HORIZONTAL", gap: 64 });
  add(body, top, { h: "FILL" });

  // Gallery
  var gallery = box("Gallery", { dir: "VERTICAL", gap: 12, w: 632 });
  var main = await photo("main", 632, 632, "bc-p1", 24);
  main.effectStyleId = STYLES.soft.id;
  add(gallery, main);
  var thumbs = box("thumbs", { dir: "HORIZONTAL", gap: 12 });
  for (var i = 0; i < 4; i++) {
    var th = await photo("thumb", 92, 92, "bc-p1-" + i, 12);
    if (i === 0) strokeVar(th, "accent", 2);
    add(thumbs, th);
  }
  add(gallery, thumbs, { h: "FILL" });
  add(top, gallery);

  // Buy column
  var buy = box("Buy column", { dir: "VERTICAL", gap: 32 });
  add(top, buy, { grow: true });

  var head = box("head", { dir: "VERTICAL", gap: 12 });
  var tagRow = box("tags", { dir: "HORIZONTAL", gap: 8, align: "CENTER" });
  add(tagRow, txt("MAISON LUMIÈRE", { size: 12, color: "muted", ls: 0.8 }));
  add(tagRow, badge("Neutral"));
  add(tagRow, badge("Gold"));
  add(head, tagRow, { h: "FILL" });
  add(head, txt("Velours Noir Eau de Parfum", { size: 36, font: F.serif.semibold, lh: 42, ls: -0.5, w: 560 }), { h: "FILL" });
  add(head, rating(4.7, 128, 15));
  add(head, txt("A velvet-dark oriental — Turkish rose steeped in oud, vanilla absolute and a whisper of smoked leather.", { size: 16, color: "muted", w: 560, lh: 26 }), { h: "FILL" });
  add(buy, head, { h: "FILL" });

  // Add to cart block
  var atc = card(buy, "AddToCart", { gap: 20, pad: 24, bg: "surface-2", border: null });
  add(atc, price(12800, 15500, "lg"));
  var sizeGroup = box("size", { dir: "VERTICAL", gap: 10 });
  add(sizeGroup, txt("Size", { size: 13, font: F.sans.medium, color: "muted", upper: true, ls: 0.8 }));
  var sizes = box("options", { dir: "HORIZONTAL", gap: 10 });
  var sizeOpts = [["30 ml", "NPR 8,400"], ["50 ml", "NPR 12,800"], ["100 ml", "NPR 19,900"]];
  for (var z = 0; z < sizeOpts.length; z++) {
    var opt = box("option", { dir: "VERTICAL", gap: 2, radius: 12, pad: [10, 16], border: z === 1 ? "accent" : "border", bg: z === 1 ? "accent-soft" : "surface", borderWeight: z === 1 ? 1.5 : 1 });
    add(opt, txt(sizeOpts[z][0], { size: 14, font: F.sans.medium }));
    add(opt, txt(sizeOpts[z][1], { size: 12, color: "muted" }));
    add(sizes, opt);
  }
  add(sizeGroup, sizes, { h: "FILL" });
  add(atc, sizeGroup, { h: "FILL" });

  var stock = box("stock", { dir: "HORIZONTAL", gap: 8, align: "CENTER" });
  add(stock, icon("check", 15, "success"));
  add(stock, txt("In stock — only 4 left", { size: 13, color: "success" }));
  add(atc, stock, { h: "FILL" });

  var actions = box("actions", { dir: "HORIZONTAL", gap: 12, align: "CENTER" });
  add(actions, qtyStepper(1));
  var addBtn = button("Primary", "Lg", "Add to bag");
  add(actions, addBtn, { grow: true });
  var wishBtn = box("wishlist", { dir: "HORIZONTAL", w: 48, h: 48, radius: 999, border: "border", align: "CENTER", justify: "CENTER" });
  add(wishBtn, icon("heart", 20, "foreground"));
  add(actions, wishBtn);
  add(atc, actions, { h: "FILL" });
  add(atc, txt("Free delivery over NPR 5,000 · 7-day returns · 100% authentic", { size: 12, color: "muted", align: "CENTER", w: 520 }), { h: "FILL" });

  // About
  var about = box("About", { dir: "VERTICAL", gap: 8 });
  add(about, txt("About", { size: 18, font: F.serif.semibold }));
  add(about, txt("Composed in Grasse and matured for six months, Velours Noir opens on bergamot and pink pepper before settling into a heart of Isparta rose. The base is where it lingers: oud, vanilla absolute, and a trace of birch tar that reads as smoked leather on warm skin.", { size: 14, color: "muted", w: 560, lh: 23 }), { h: "FILL" });
  add(buy, about, { h: "FILL" });

  // Note pyramid
  var notes = box("Notes", { dir: "VERTICAL", gap: 12 });
  add(notes, txt("Notes", { size: 18, font: F.serif.semibold }));
  var pyramid = [["Top", "Bergamot, Pink pepper"], ["Heart", "Isparta rose, Saffron"], ["Base", "Oud, Vanilla absolute, Leather"]];
  for (var n = 0; n < pyramid.length; n++) {
    var nr = box("note", { dir: "HORIZONTAL", gap: 16, align: "CENTER", pad: [12, 0], });
    add(nr, txt(pyramid[n][0], { size: 12, font: F.sans.semibold, color: "gold", upper: true, ls: 0.8, w: 60 }));
    add(nr, txt(pyramid[n][1], { size: 14 }));
    add(notes, nr, { h: "FILL" });
    if (n < 2) divider(notes);
  }
  add(buy, notes, { h: "FILL" });

  // Specs
  var specs = box("Details", { dir: "VERTICAL", gap: 0 });
  add(specs, txt("Details", { size: 18, font: F.serif.semibold }));
  var rows = [["Concentration", "Eau de Parfum"], ["Longevity", "8–10 hours"], ["Family", "Oriental · Woody"], ["SKU", "ML-VN-050"], ["Country", "France"]];
  for (var r = 0; r < rows.length; r++) {
    var rr = box("spec", { dir: "HORIZONTAL", pad: [12, 0], align: "CENTER" });
    add(rr, txt(rows[r][0], { size: 14, color: "muted", w: 180 }));
    add(rr, txt(rows[r][1], { size: 14 }));
    add(specs, rr, { h: "FILL" });
    if (r < rows.length - 1) divider(specs);
  }
  add(buy, specs, { h: "FILL" });

  // Reviews
  var reviews = box("Reviews", { dir: "VERTICAL", gap: 20 });
  add(body, reviews, { h: "FILL" });
  var rHead = box("head", { dir: "HORIZONTAL", align: "CENTER" });
  add(rHead, txt("Reviews", { size: 24, font: F.serif.semibold }));
  spring(rHead);
  add(rHead, button("Outline", "Sm", "Write a review"));
  add(reviews, rHead, { h: "FILL" });

  var rSummary = box("summary", { dir: "HORIZONTAL", gap: 32, align: "CENTER", pad: 24, radius: 24, bg: "surface-2" });
  var big = box("score", { dir: "VERTICAL", gap: 4, align: "CENTER" });
  add(big, txt("4.7", { size: 44, font: F.serif.semibold, lh: 48 }));
  add(big, rating(4.7, null, 14));
  add(big, txt("128 reviews", { size: 12, color: "muted" }));
  add(rSummary, big);
  var bars = box("bars", { dir: "VERTICAL", gap: 7 });
  var dist = [72, 38, 12, 4, 2];
  for (var b = 0; b < 5; b++) {
    var br = box("bar", { dir: "HORIZONTAL", gap: 10, align: "CENTER" });
    add(br, txt(String(5 - b), { size: 12, color: "muted", w: 10 }));
    var track = box("track", { dir: "HORIZONTAL", w: 320, h: 7, radius: 999, bg: "border" });
    var fillw = Math.max(4, Math.round((dist[b] / 128) * 320));
    add(track, box("fill", { w: fillw, h: 7, radius: 999, bg: "gold" }));
    add(br, track);
    add(br, txt(String(dist[b]), { size: 12, color: "muted" }));
    add(bars, br, { h: "FILL" });
  }
  add(rSummary, bars);
  add(reviews, rSummary, { h: "FILL" });

  var reviewData = [
    ["Priya S.", 5, "Exactly the vanilla-oud I was hunting for", "Lasts a full working day on me and the dry-down is gorgeous. Packaging arrived sealed with the batch code intact."],
    ["Bikash T.", 4, "Beautiful, a touch strong for daytime", "Two sprays is plenty. Knocked one star only because the 50ml is pricey — but it is the real thing."],
  ];
  for (var rv = 0; rv < reviewData.length; rv++) {
    var rc = card(reviews, "review", { gap: 8 });
    var rhead = box("head", { dir: "HORIZONTAL", gap: 12, align: "CENTER" });
    var av = box("avatar", { dir: "HORIZONTAL", w: 36, h: 36, radius: 999, bg: "accent-soft", align: "CENTER", justify: "CENTER" });
    add(av, txt(reviewData[rv][0].charAt(0), { size: 14, font: F.sans.semibold, color: "accent" }));
    add(rhead, av);
    var who = box("who", { dir: "VERTICAL", gap: 2 });
    add(who, txt(reviewData[rv][0], { size: 14, font: F.sans.medium }));
    add(who, rating(reviewData[rv][1], null, 12));
    add(rhead, who);
    spring(rhead);
    add(rhead, txt("Verified purchase", { size: 12, color: "success" }));
    add(rc, rhead, { h: "FILL" });
    add(rc, txt(reviewData[rv][2], { size: 15, font: F.sans.medium }), { h: "FILL" });
    add(rc, txt(reviewData[rv][3], { size: 14, color: "muted", w: 1100 }), { h: "FILL" });
  }

  // Related
  var related = box("Related", { dir: "VERTICAL", gap: 24 });
  add(body, related, { h: "FILL" });
  add(related, txt("You may also like", { size: 24, font: F.serif.semibold }));
  await productGrid(related, DEMO_PRODUCTS.slice(4, 8));

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

async function screenSearch() {
  var s = screen("Search — /search");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 32 });
  pageHeader(body, "Results for “rose”", "24 products match your search.", ["Home", "Search"]);
  add(body, searchBar(640, "rose"), { h: "FILL" });

  var suggest = box("suggestions", { dir: "HORIZONTAL", gap: 8, align: "CENTER" });
  add(body, suggest, { h: "FILL" });
  add(suggest, txt("Try:", { size: 13, color: "muted" }));
  var terms = ["rose absolute", "rose water toner", "damask rose", "rose lipstick"];
  for (var i = 0; i < terms.length; i++) {
    var chip = box("chip", { dir: "HORIZONTAL", radius: 999, bg: "surface-2", pad: [7, 14] });
    add(chip, txt(terms[i], { size: 13 }));
    add(suggest, chip);
  }
  await productGrid(body, DEMO_PRODUCTS.slice(0, 4));

  var empty = box("Empty state", { dir: "VERTICAL", gap: 16, pad: 64, radius: 24, border: "border", dash: true, align: "CENTER" });
  add(body, empty, { h: "FILL" });
  add(empty, txt("No products match these filters.", { size: 16, color: "muted" }));
  add(empty, button("Primary", "Md", "Clear filters"));

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

/* --------------------------------------------------------------------------
   10. Cart, checkout, orders
-------------------------------------------------------------------------- */

var CART_LINES = [
  { brand: "Maison Lumière", name: "Velours Noir Eau de Parfum", variant: "50 ml", qty: 1, total: 12800, seed: "bc-p1" },
  { brand: "Aurelle", name: "Niacinamide 10% Clarifying Serum", variant: "30 ml", qty: 2, total: 6900, seed: "bc-p2" },
  { brand: "Kora Ritual", name: "Silk Finish Matte Lipstick", variant: "Rosewood", qty: 1, total: 1890, seed: "bc-p3" },
];

async function cartLine(parent, l) {
  var row = box("line", { dir: "HORIZONTAL", gap: 16, pad: [20, 0] });
  add(parent, row, { h: "FILL" });
  add(row, await photo("thumb", 88, 112, l.seed, 12));
  var info = box("info", { dir: "VERTICAL", gap: 4 });
  add(row, info, { grow: true });
  add(info, txt(l.brand, { size: 12, color: "muted", upper: true, ls: 0.8 }));
  add(info, txt(l.name, { size: 15, font: F.sans.medium }));
  add(info, txt(l.variant, { size: 13, color: "muted" }));
  var ctl = box("controls", { dir: "HORIZONTAL", align: "CENTER" });
  ctl.paddingTop = 8;
  add(info, ctl, { h: "FILL" });
  add(ctl, qtyStepper(l.qty));
  spring(ctl);
  add(ctl, txt("NPR " + l.total.toLocaleString("en-US"), { size: 15, font: F.sans.semibold }));
  var trash = box("remove", { dir: "HORIZONTAL", w: 32, h: 32, radius: 999, align: "CENTER", justify: "CENTER" });
  trash.paddingLeft = 12;
  add(trash, icon("trash", 16, "muted"));
  add(ctl, trash);
  return row;
}

async function screenCart() {
  var s = screen("Cart — /cart");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 32 });
  pageHeader(body, "Your bag", null, ["Home", "Bag"]);

  var cols = box("layout", { dir: "HORIZONTAL", gap: 40 });
  add(body, cols, { h: "FILL" });

  var lines = box("lines", { dir: "VERTICAL", gap: 0 });
  add(cols, lines, { grow: true });
  var lHead = box("head", { dir: "HORIZONTAL", align: "CENTER" });
  add(lHead, txt("4 items", { size: 14, color: "muted" }));
  spring(lHead);
  add(lHead, txt("Clear bag", { size: 14, color: "muted" }));
  add(lines, lHead, { h: "FILL" });
  for (var i = 0; i < CART_LINES.length; i++) {
    divider(lines);
    await cartLine(lines, CART_LINES[i]);
  }

  var aside = box("Summary", { dir: "VERTICAL", gap: 16, pad: 24, radius: 24, bg: "surface-2", w: 360 });
  add(cols, aside);
  add(aside, txt("Summary", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  summaryRow(aside, "Subtotal", "NPR 21,590");
  summaryRow(aside, "Shipping", "Free");
  divider(aside);
  summaryRow(aside, "Total", "NPR 21,590", true);
  var freeship = box("freeship", { dir: "HORIZONTAL", gap: 8, align: "CENTER", pad: 12, radius: 12, bg: "success", bgOpacity: 0.12 });
  add(freeship, icon("truck", 16, "success"));
  add(freeship, txt("You've unlocked free shipping.", { size: 12, color: "success" }));
  add(aside, freeship, { h: "FILL" });
  var co = button("Primary", "Lg", "Checkout");
  add(aside, co, { h: "FILL" });
  add(aside, txt("Prices include 13% VAT. Final totals are confirmed at checkout.", { size: 12, color: "muted", align: "CENTER", w: 312 }), { h: "FILL" });

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

async function screenCheckout() {
  var s = screen("Checkout — /checkout");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 32 });
  pageHeader(body, "Checkout", null, ["Home", "Bag", "Checkout"]);

  var cols = box("layout", { dir: "HORIZONTAL", gap: 40 });
  add(body, cols, { h: "FILL" });

  var form = box("form", { dir: "VERTICAL", gap: 24 });
  add(cols, form, { grow: true });

  // Address
  var addr = card(form, "Shipping address", { gap: 16 });
  add(addr, txt("Shipping address", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  var saved = box("saved", { dir: "HORIZONTAL", gap: 12 });
  add(addr, saved, { h: "FILL" });
  var addrs = [["Home", "Priya Sharma · +977 98…", "Jhamsikhel, Lalitpur 44700", true], ["Office", "Priya Sharma · +977 98…", "Durbar Marg, Kathmandu 44600", false]];
  for (var a = 0; a < addrs.length; a++) {
    var ac = box("address", { dir: "VERTICAL", gap: 4, pad: 16, radius: 16, border: addrs[a][3] ? "accent" : "border", bg: addrs[a][3] ? "accent-soft" : "surface", borderWeight: addrs[a][3] ? 1.5 : 1, w: 280 });
    var acHead = box("h", { dir: "HORIZONTAL", align: "CENTER" });
    add(acHead, txt(addrs[a][0], { size: 14, font: F.sans.semibold }));
    spring(acHead);
    if (addrs[a][3]) add(acHead, badge("Accent"));
    add(ac, acHead, { h: "FILL" });
    add(ac, txt(addrs[a][1], { size: 13, color: "muted" }), { h: "FILL" });
    add(ac, txt(addrs[a][2], { size: 13, color: "muted" }), { h: "FILL" });
    add(saved, ac);
  }
  var newAddr = box("new", { dir: "HORIZONTAL", gap: 8, pad: 16, radius: 16, border: "border", dash: true, align: "CENTER", justify: "CENTER", w: 200 });
  add(newAddr, icon("plus", 16, "muted"));
  add(newAddr, txt("New address", { size: 14, color: "muted" }));
  add(saved, newAddr);

  // Payment
  var payCard = card(form, "Payment method", { gap: 12 });
  add(payCard, txt("Payment method", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  var methods = [
    ["Cash on Delivery", "Pay in cash when your order arrives.", true, true],
    ["eSewa", "Coming soon", false, false],
    ["Khalti", "Coming soon", false, false],
    ["Card (Stripe)", "Coming soon", false, false],
  ];
  for (var m = 0; m < methods.length; m++) {
    var mr = box("method", { dir: "HORIZONTAL", gap: 12, pad: 16, radius: 16, align: "CENTER", border: methods[m][2] ? "accent" : "border", bg: methods[m][2] ? "accent-soft" : "surface", borderWeight: methods[m][2] ? 1.5 : 1 });
    var radio = box("radio", { dir: "HORIZONTAL", w: 18, h: 18, radius: 999, border: methods[m][2] ? "accent" : "border", borderWeight: methods[m][2] ? 5 : 1 });
    add(mr, radio);
    var mi = box("info", { dir: "VERTICAL", gap: 2 });
    add(mi, txt(methods[m][0], { size: 14, font: F.sans.medium, opacity: methods[m][3] ? 1 : 0.5 }));
    add(mi, txt(methods[m][1], { size: 12, color: "muted" }));
    add(mr, mi);
    add(payCard, mr, { h: "FILL" });
  }

  // Coupon
  var coupon = card(form, "Coupon", { gap: 12 });
  add(coupon, txt("Have a coupon?", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  var crow = box("row", { dir: "HORIZONTAL", gap: 10, align: "CENTER" });
  var ci = box("input", { dir: "HORIZONTAL", h: 44, radius: 12, bg: "surface", border: "border", pad: [0, 14], align: "CENTER" });
  add(ci, txt("WELCOME10", { size: 14 }));
  add(crow, ci, { grow: true });
  add(crow, button("Outline", "Md", "Apply"));
  add(coupon, crow, { h: "FILL" });
  var applied = box("applied", { dir: "HORIZONTAL", gap: 8, align: "CENTER" });
  add(applied, icon("check", 15, "success"));
  add(applied, txt("WELCOME10 applied — NPR 2,159 off", { size: 13, color: "success" }));
  add(coupon, applied, { h: "FILL" });

  // Order summary
  var aside = box("Order summary", { dir: "VERTICAL", gap: 16, pad: 24, radius: 24, bg: "surface-2", w: 380 });
  add(cols, aside);
  add(aside, txt("Order summary", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  for (var l = 0; l < CART_LINES.length; l++) {
    var ln = CART_LINES[l];
    var lr = box("line", { dir: "HORIZONTAL", gap: 12, align: "CENTER" });
    add(lr, await photo("t", 48, 60, ln.seed, 8));
    var lt = box("t", { dir: "VERTICAL", gap: 2 });
    add(lt, txt(ln.name, { size: 13, font: F.sans.medium, w: 180 }));
    add(lt, txt(ln.variant + " · Qty " + ln.qty, { size: 12, color: "muted" }));
    add(lr, lt, { grow: true });
    add(lr, txt("NPR " + ln.total.toLocaleString("en-US"), { size: 13, font: F.sans.medium }));
    add(aside, lr, { h: "FILL" });
  }
  divider(aside);
  summaryRow(aside, "Subtotal", "NPR 21,590");
  summaryRow(aside, "Discount (WELCOME10)", "− NPR 2,159");
  summaryRow(aside, "Shipping", "Free");
  divider(aside);
  summaryRow(aside, "Total", "NPR 19,431", true);
  add(aside, button("Primary", "Lg", "Place order"), { h: "FILL" });
  add(aside, txt("By placing this order you agree to our terms and the authenticity policy.", { size: 12, color: "muted", align: "CENTER", w: 332 }), { h: "FILL" });

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

async function screenOrderDetail() {
  var s = screen("Order detail — /orders/[id]");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 32 });

  var ph = box("head", { dir: "HORIZONTAL", align: "CENTER" });
  add(body, ph, { h: "FILL" });
  var phl = box("l", { dir: "VERTICAL", gap: 8 });
  add(phl, breadcrumb(["Home", "Orders", "BC-2409-0184"]));
  var titleRow = box("t", { dir: "HORIZONTAL", gap: 12, align: "CENTER" });
  add(titleRow, txt("Order BC-2409-0184", { size: 40, font: F.serif.semibold, lh: 46, ls: -0.6 }));
  add(titleRow, statusBadge("Shipped"));
  add(phl, titleRow, { h: "FILL" });
  add(phl, txt("Placed 21 Sep 2026 · 3 items · Cash on Delivery", { size: 14, color: "muted" }));
  add(ph, phl);
  spring(ph);
  add(ph, button("Outline", "Md", "Download invoice"));

  // Tracker
  var tracker = card(body, "Tracker", { gap: 0, pad: 28 });
  var steps = [["Placed", "21 Sep, 14:02", true], ["Paid", "21 Sep, 14:02", true], ["Shipped", "22 Sep, 09:40", true], ["Delivered", "Expected 24 Sep", false]];
  var trow = box("steps", { dir: "HORIZONTAL", gap: 0, align: "MIN" });
  add(tracker, trow, { h: "FILL" });
  for (var i = 0; i < steps.length; i++) {
    var st = box("step", { dir: "VERTICAL", gap: 8 });
    var dotRow = box("dots", { dir: "HORIZONTAL", gap: 0, align: "CENTER" });
    var dot = box("dot", { dir: "HORIZONTAL", w: 24, h: 24, radius: 999, bg: steps[i][2] ? "accent" : "surface-2", border: steps[i][2] ? null : "border", align: "CENTER", justify: "CENTER" });
    if (steps[i][2]) add(dot, icon("check", 13, "accent-foreground"));
    add(dotRow, dot);
    if (i < steps.length - 1) {
      var lineSeg = box("line", { h: 2, w: 220, bg: steps[i + 1][2] ? "accent" : "border" });
      add(dotRow, lineSeg);
    }
    add(st, dotRow, { h: "FILL" });
    add(st, txt(steps[i][0], { size: 14, font: F.sans.medium, color: steps[i][2] ? "foreground" : "muted" }));
    add(st, txt(steps[i][1], { size: 12, color: "muted" }));
    add(trow, st);
  }

  var cols = box("cols", { dir: "HORIZONTAL", gap: 40 });
  add(body, cols, { h: "FILL" });

  var items = card(null, "Items", { gap: 0 });
  add(cols, items, { grow: true });
  add(items, txt("Items", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  for (var j = 0; j < CART_LINES.length; j++) {
    divider(items);
    await cartLine(items, CART_LINES[j]);
  }

  var side = box("side", { dir: "VERTICAL", gap: 20, w: 380 });
  add(cols, side);
  var totals = card(side, "Totals", { gap: 12, bg: "surface-2", border: null });
  add(totals, txt("Totals", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  summaryRow(totals, "Subtotal", "NPR 21,590");
  summaryRow(totals, "Discount", "− NPR 2,159");
  summaryRow(totals, "Shipping", "Free");
  divider(totals);
  summaryRow(totals, "Total", "NPR 19,431", true);

  var ship = card(side, "Shipping", { gap: 8 });
  add(ship, txt("Shipping to", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  add(ship, txt("Priya Sharma", { size: 14, font: F.sans.medium }), { h: "FILL" });
  add(ship, txt("Jhamsikhel, Lalitpur 44700\nBagmati, Nepal\n+977 9801234567", { size: 14, color: "muted", w: 300 }), { h: "FILL" });

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

async function screenWishlist() {
  var s = screen("Wishlist — /wishlist");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 32 });
  pageHeader(body, "Wishlist", "Saved to this browser, and synced to your account when you sign in.", ["Home", "Wishlist"]);
  var bar = box("bar", { dir: "HORIZONTAL", align: "CENTER" });
  add(body, bar, { h: "FILL" });
  add(bar, txt("6 saved items", { size: 14, color: "muted" }));
  spring(bar);
  add(bar, button("Outline", "Sm", "Move all to bag"));
  await productGrid(body, DEMO_PRODUCTS.slice(2, 6));
  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

/* --------------------------------------------------------------------------
   11. Account & auth
-------------------------------------------------------------------------- */

function authCard(title, subtitle, buildBody, footerText) {
  var s = screen(title.split(" ")[0] === "Welcome" ? "Login — /login" : title);
  add(s, C.Header.createInstance(), { h: "FILL" });

  var wrap = box("wrap", { dir: "VERTICAL", gap: 20, pad: [80, GUTTER], align: "CENTER" });
  add(s, wrap, { h: "FILL" });

  var wm = box("wordmark", { dir: "HORIZONTAL", align: "CENTER" });
  add(wm, txt("Beauty", { size: 24, font: F.serif.semibold }));
  add(wm, txt(".", { size: 24, font: F.serif.semibold, color: "accent" }));
  add(wrap, wm);

  var c = box("card", { dir: "VERTICAL", gap: 20, pad: 32, radius: 24, bg: "surface", border: "border", w: 448, effect: "soft" });
  add(wrap, c);
  var head = box("head", { dir: "VERTICAL", gap: 4 });
  add(head, txt(title, { size: 24, font: F.serif.semibold }));
  if (subtitle) add(head, txt(subtitle, { size: 14, color: "muted", w: 384 }));
  add(c, head, { h: "FILL" });
  buildBody(c);

  if (footerText) add(wrap, txt(footerText, { size: 14, color: "muted" }));
  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

function textField(parent, label, value, placeholder) {
  var f = box(label, { dir: "VERTICAL", gap: 6 });
  add(f, txt(label, { size: 14, font: F.sans.medium }), { h: "FILL" });
  var inp = box("input", { dir: "HORIZONTAL", h: 44, radius: 12, bg: "surface", border: "border", pad: [0, 14], align: "CENTER" });
  add(inp, txt(value || placeholder, { size: 14, color: value ? "foreground" : "muted" }));
  add(f, inp, { h: "FILL" });
  add(parent, f, { h: "FILL" });
  return f;
}

function screenLogin() {
  return authCard("Welcome back", "Sign in to your Beauty Commerce account.", function (c) {
    var form = box("form", { dir: "VERTICAL", gap: 16 });
    add(c, form, { h: "FILL" });
    textField(form, "Email", null, "you@example.com");
    textField(form, "Password", null, "••••••••");
    var fp = box("fp", { dir: "HORIZONTAL", justify: "MAX" });
    add(fp, txt("Forgot password?", { size: 12, color: "muted" }));
    add(form, fp, { h: "FILL" });
    add(form, button("Primary", "Lg", "Sign in"), { h: "FILL" });
  }, "New here? Create an account");
}

function screenRegister() {
  var s = authCard("Create your account", "Track orders, save favourites and check out faster.", function (c) {
    var form = box("form", { dir: "VERTICAL", gap: 16 });
    add(c, form, { h: "FILL" });
    textField(form, "Full name", null, "Priya Sharma");
    textField(form, "Email", null, "you@example.com");
    textField(form, "Password", null, "At least 8 characters");
    var terms = box("terms", { dir: "HORIZONTAL", gap: 10, align: "CENTER" });
    var cb = box("cb", { dir: "HORIZONTAL", w: 18, h: 18, radius: 5, border: "border" });
    add(terms, cb);
    add(terms, txt("I agree to the terms and privacy policy.", { size: 13, color: "muted" }));
    add(form, terms, { h: "FILL" });
    add(form, button("Primary", "Lg", "Create account"), { h: "FILL" });
  }, "Already have an account? Sign in");
  s.name = "Register — /register";
  return s;
}

function screenAccount() {
  var s = screen("Account — /account");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 32 });
  pageHeader(body, "Your account", null, ["Home", "Account"]);

  var cols = box("cols", { dir: "HORIZONTAL", gap: 40 });
  add(body, cols, { h: "FILL" });

  var nav = box("nav", { dir: "VERTICAL", gap: 4, w: 200 });
  add(cols, nav);
  var navItems = ["Profile", "Orders", "Addresses", "Wishlist", "Notifications", "Sign out"];
  for (var i = 0; i < navItems.length; i++) {
    var n = box("item", { dir: "HORIZONTAL", pad: [10, 14], radius: 12, bg: i === 0 ? "accent" : null });
    add(n, txt(navItems[i], { size: 14, color: i === 0 ? "accent-foreground" : "foreground" }));
    add(nav, n, { h: "FILL" });
  }

  var main = box("main", { dir: "VERTICAL", gap: 24 });
  add(cols, main, { grow: true });

  var profile = card(main, "Profile", { gap: 16 });
  add(profile, txt("Profile", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  var prow = box("row", { dir: "HORIZONTAL", gap: 16 });
  add(profile, prow, { h: "FILL" });
  var f1 = textField(prow, "Full name", "Priya Sharma");
  var f2 = textField(prow, "Email", "priya@example.com");
  prow.children[0].layoutGrow = 1;
  prow.children[1].layoutGrow = 1;
  add(profile, button("Primary", "Md", "Save changes"));

  var addresses = card(main, "Addresses", { gap: 16 });
  add(addresses, txt("Address book", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  var arow = box("row", { dir: "HORIZONTAL", gap: 16 });
  add(addresses, arow, { h: "FILL" });
  var list = [["Home", "Jhamsikhel, Lalitpur 44700", true], ["Office", "Durbar Marg, Kathmandu 44600", false]];
  for (var a = 0; a < list.length; a++) {
    var ac = box("addr", { dir: "VERTICAL", gap: 6, pad: 16, radius: 16, border: "border", w: 300 });
    var ah = box("h", { dir: "HORIZONTAL", align: "CENTER" });
    add(ah, txt(list[a][0], { size: 14, font: F.sans.semibold }));
    spring(ah);
    if (list[a][2]) add(ah, badge("Neutral"));
    add(ac, ah, { h: "FILL" });
    add(ac, txt(list[a][1], { size: 13, color: "muted" }), { h: "FILL" });
    var acts = box("acts", { dir: "HORIZONTAL", gap: 12 });
    add(acts, txt("Edit", { size: 13, color: "accent" }));
    add(acts, txt("Delete", { size: 13, color: "muted" }));
    add(ac, acts, { h: "FILL" });
    add(arow, ac);
  }

  var orders = card(main, "Recent orders", { gap: 0 });
  add(orders, txt("Recent orders", { size: 18, font: F.serif.semibold }), { h: "FILL" });
  var orderRows = [
    ["BC-2409-0184", "21 Sep 2026", "Shipped", "NPR 19,431"],
    ["BC-2408-0122", "14 Aug 2026", "Delivered", "NPR 7,250"],
    ["BC-2407-0091", "02 Jul 2026", "Cancelled", "NPR 3,450"],
  ];
  for (var o = 0; o < orderRows.length; o++) {
    divider(orders);
    var orow = box("order", { dir: "HORIZONTAL", gap: 16, align: "CENTER", pad: [16, 0] });
    add(orders, orow, { h: "FILL" });
    add(orow, txt(orderRows[o][0], { size: 14, font: F.sans.medium, w: 180 }));
    add(orow, txt(orderRows[o][1], { size: 14, color: "muted", w: 140 }));
    add(orow, statusBadge(orderRows[o][2]));
    spring(orow);
    add(orow, txt(orderRows[o][3], { size: 14, font: F.sans.semibold }));
    add(orow, icon("chevronRight", 16, "muted"));
  }

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

function screenOrders() {
  var s = screen("Orders — /orders");
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 24 });
  pageHeader(body, "Your orders", "Everything you've bought, newest first.", ["Home", "Orders"]);

  var tabs = box("tabs", { dir: "HORIZONTAL", gap: 8 });
  add(body, tabs, { h: "FILL" });
  var tabNames = ["All", "Processing", "Shipped", "Delivered", "Cancelled"];
  for (var i = 0; i < tabNames.length; i++) {
    var t = box("tab", { dir: "HORIZONTAL", pad: [8, 16], radius: 999, bg: i === 0 ? "foreground" : "surface-2" });
    add(t, txt(tabNames[i], { size: 14, color: i === 0 ? "background" : "muted" }));
    add(tabs, t);
  }

  var rows = [
    ["BC-2409-0184", "21 Sep 2026", "Shipped", "Paid", "3 items", "NPR 19,431"],
    ["BC-2408-0122", "14 Aug 2026", "Delivered", "Paid", "2 items", "NPR 7,250"],
    ["BC-2408-0119", "09 Aug 2026", "Pending Payment", "Pending", "1 item", "NPR 12,800"],
    ["BC-2407-0091", "02 Jul 2026", "Cancelled", "Refunded", "1 item", "NPR 3,450"],
  ];
  var table = card(body, "Orders table", { gap: 0, pad: 0 });
  var thead = box("thead", { dir: "HORIZONTAL", gap: 16, pad: [14, 24], bg: "surface-2", align: "CENTER" });
  add(table, thead, { h: "FILL" });
  var heads = [["Order", 200], ["Date", 140], ["Status", 160], ["Payment", 120], ["Items", 100]];
  for (var h = 0; h < heads.length; h++) add(thead, txt(heads[h][0], { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.6, w: heads[h][1] }));
  spring(thead);
  add(thead, txt("Total", { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.6 }));

  for (var r = 0; r < rows.length; r++) {
    divider(table);
    var tr = box("row", { dir: "HORIZONTAL", gap: 16, pad: [18, 24], align: "CENTER" });
    add(table, tr, { h: "FILL" });
    add(tr, txt(rows[r][0], { size: 14, font: F.sans.medium, w: 200 }));
    add(tr, txt(rows[r][1], { size: 14, color: "muted", w: 140 }));
    var sb = box("s", { dir: "HORIZONTAL", w: 160 });
    add(sb, statusBadge(rows[r][2]));
    add(tr, sb);
    var pb = box("p", { dir: "HORIZONTAL", w: 120 });
    add(pb, statusBadge(rows[r][3] === "Paid" ? "Delivered" : rows[r][3] === "Pending" ? "Pending Payment" : "Refunded"));
    var pbt = pb.findOne(function (n) { return n.type === "TEXT"; });
    if (pbt) pbt.characters = rows[r][3];
    add(tr, pb);
    add(tr, txt(rows[r][4], { size: 14, color: "muted", w: 100 }));
    spring(tr);
    add(tr, txt(rows[r][5], { size: 14, font: F.sans.semibold }));
    add(tr, icon("chevronRight", 16, "muted"));
  }

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

/* --------------------------------------------------------------------------
   12. Admin
-------------------------------------------------------------------------- */

var ADMIN_NAV = ["Dashboard", "Orders", "Products", "Brands", "Categories", "Coupons", "Notifications"];

function adminShell(name, activeIndex, buildBody) {
  var s = screen(name);
  add(s, C.Header.createInstance(), { h: "FILL" });
  var body = container(s, { gap: 32 });

  var head = box("head", { dir: "HORIZONTAL", align: "CENTER" });
  add(body, head, { h: "FILL" });
  var wm = box("wm", { dir: "HORIZONTAL", align: "CENTER" });
  add(wm, txt("Admin", { size: 24, font: F.serif.semibold }));
  add(wm, txt(".", { size: 24, font: F.serif.semibold, color: "accent" }));
  add(head, wm);
  spring(head);
  add(head, txt("← Back to store", { size: 14, color: "muted" }));

  var cols = box("cols", { dir: "HORIZONTAL", gap: 32 });
  add(body, cols, { h: "FILL" });

  var nav = box("nav", { dir: "VERTICAL", gap: 4, w: 180 });
  add(cols, nav);
  for (var i = 0; i < ADMIN_NAV.length; i++) {
    var n = box("item", { dir: "HORIZONTAL", pad: [9, 12], radius: 12, bg: i === activeIndex ? "accent" : null });
    add(n, txt(ADMIN_NAV[i], { size: 14, color: i === activeIndex ? "accent-foreground" : "foreground" }));
    add(nav, n, { h: "FILL" });
  }

  var main = box("main", { dir: "VERTICAL", gap: 24 });
  add(cols, main, { grow: true });
  buildBody(main);

  add(s, C.Footer.createInstance(), { h: "FILL" });
  return s;
}

function screenAdminDashboard() {
  return adminShell("Admin dashboard — /admin", 0, function (main) {
    var cards = [
      ["Revenue", "NPR 1,284,900", null, true, false],
      ["Total orders", "412", null, false, false],
      ["Open orders", "27", null, false, false],
      ["Products", "184/210", "published / total", false, false],
      ["Low stock", "9", "variants ≤ 5", false, true],
      ["Customers", "1,038", null, false, false],
    ];
    var grid = box("stats", { dir: "HORIZONTAL", gap: 16, wrap: true, rowGap: 16 });
    add(main, grid, { h: "FILL" });
    var w = Math.floor((CONTENT_W - 180 - 32 - 32) / 3);
    for (var i = 0; i < cards.length; i++) {
      var c = box("stat", {
        dir: "VERTICAL", gap: 4, pad: 24, radius: 16, w: w, effect: "soft",
        bg: cards[i][3] ? "accent-soft" : "surface",
        border: cards[i][3] ? "accent" : "border",
        borderOpacity: cards[i][3] ? 0.3 : 1,
      });
      add(c, txt(cards[i][0], { size: 14, color: "muted" }));
      add(c, txt(cards[i][1], { size: 30, font: F.serif.semibold, color: cards[i][4] ? "danger" : "foreground", lh: 36 }));
      if (cards[i][2]) add(c, txt(cards[i][2], { size: 12, color: "muted" }));
      add(grid, c);
    }

    var recent = card(main, "Recent orders", { gap: 0 });
    add(recent, txt("Recent orders", { size: 18, font: F.serif.semibold }), { h: "FILL" });
    var rows = [
      ["BC-2409-0184", "Priya Sharma", "Shipped", "NPR 19,431"],
      ["BC-2409-0183", "Bikash Thapa", "Processing", "NPR 4,200"],
      ["BC-2409-0182", "Anita Rai", "Pending Payment", "NPR 12,800"],
      ["BC-2409-0181", "Sujan K.C.", "Delivered", "NPR 2,150"],
    ];
    for (var r = 0; r < rows.length; r++) {
      divider(recent);
      var tr = box("row", { dir: "HORIZONTAL", gap: 16, align: "CENTER", pad: [14, 0] });
      add(recent, tr, { h: "FILL" });
      add(tr, txt(rows[r][0], { size: 14, font: F.sans.medium, w: 180 }));
      add(tr, txt(rows[r][1], { size: 14, color: "muted", w: 180 }));
      add(tr, statusBadge(rows[r][2]));
      spring(tr);
      add(tr, txt(rows[r][3], { size: 14, font: F.sans.semibold }));
    }
  });
}

function screenAdminProducts() {
  return adminShell("Admin products — /admin/products", 2, function (main) {
    var bar = box("bar", { dir: "HORIZONTAL", gap: 12, align: "CENTER" });
    add(main, bar, { h: "FILL" });
    add(bar, searchBar(280, "Search products…"));
    var sel = box("select", { dir: "HORIZONTAL", h: 40, radius: 999, border: "border", bg: "surface", pad: [0, 16], gap: 8, align: "CENTER" });
    add(sel, txt("All categories", { size: 14 }));
    add(sel, icon("chevronDown", 14, "muted"));
    add(bar, sel);
    spring(bar);
    add(bar, button("Primary", "Md", "New product"));

    var table = card(main, "Products table", { gap: 0, pad: 0 });
    var thead = box("thead", { dir: "HORIZONTAL", gap: 16, pad: [14, 20], bg: "surface-2", align: "CENTER" });
    add(table, thead, { h: "FILL" });
    var heads = [["Product", 340], ["Brand", 150], ["Type", 110], ["Stock", 90], ["Status", 120]];
    for (var h = 0; h < heads.length; h++) add(thead, txt(heads[h][0], { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.6, w: heads[h][1] }));
    spring(thead);
    add(thead, txt("Price", { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.6 }));

    var rows = [
      ["Velours Noir EDP 50ml", "Maison Lumière", "Perfume", "4", "Published", "NPR 12,800"],
      ["Niacinamide 10% Serum", "Aurelle", "Skincare", "38", "Published", "NPR 3,450"],
      ["Silk Finish Lipstick", "Kora Ritual", "Makeup", "0", "Published", "NPR 1,890"],
      ["Hydra Barrier Cream", "Nordstem", "Skincare", "12", "Draft", "NPR 4,200"],
      ["Argan Repair Hair Oil", "Sable & Co", "Hair", "3", "Published", "NPR 2,750"],
    ];
    for (var r = 0; r < rows.length; r++) {
      divider(table);
      var tr = box("row", { dir: "HORIZONTAL", gap: 16, align: "CENTER", pad: [12, 20] });
      add(table, tr, { h: "FILL" });
      var nameCell = box("name", { dir: "HORIZONTAL", gap: 12, align: "CENTER", w: 340 });
      add(nameCell, box("thumb", { w: 40, h: 50, radius: 8, bg: "surface-2" }));
      add(nameCell, txt(rows[r][0], { size: 14, font: F.sans.medium, w: 280 }));
      add(tr, nameCell);
      add(tr, txt(rows[r][1], { size: 14, color: "muted", w: 150 }));
      add(tr, txt(rows[r][2], { size: 14, color: "muted", w: 110 }));
      var stockCell = box("stock", { dir: "HORIZONTAL", w: 90 });
      var low = Number(rows[r][3]) <= 5;
      add(stockCell, txt(rows[r][3], { size: 14, font: low ? F.sans.semibold : F.sans.regular, color: low ? "danger" : "foreground" }));
      add(tr, stockCell);
      var statusCell = box("status", { dir: "HORIZONTAL", w: 120 });
      add(statusCell, rows[r][4] === "Published" ? statusBadge("Delivered") : badge("Neutral"));
      var sct = statusCell.findOne(function (n) { return n.type === "TEXT"; });
      if (sct) sct.characters = rows[r][4];
      add(tr, statusCell);
      spring(tr);
      add(tr, txt(rows[r][5], { size: 14, font: F.sans.semibold }));
    }
  });
}

function screenAdminProductForm() {
  return adminShell("Admin product form — /admin/products/[id]", 2, function (main) {
    var head = box("head", { dir: "HORIZONTAL", align: "CENTER" });
    add(main, head, { h: "FILL" });
    add(head, txt("Edit product", { size: 24, font: F.serif.semibold }));
    spring(head);
    add(head, button("Ghost", "Md", "Cancel"));
    add(head, button("Primary", "Md", "Save product"));

    var cols = box("cols", { dir: "HORIZONTAL", gap: 24 });
    add(main, cols, { h: "FILL" });

    var left = box("left", { dir: "VERTICAL", gap: 24 });
    add(cols, left, { grow: true });

    var basics = card(left, "Basics", { gap: 16 });
    add(basics, txt("Basics", { size: 18, font: F.serif.semibold }), { h: "FILL" });
    textField(basics, "Name", "Velours Noir Eau de Parfum 50ml");
    textField(basics, "Slug", "velours-noir-edp-50ml");
    var descF = box("Description", { dir: "VERTICAL", gap: 6 });
    add(descF, txt("Description", { size: 14, font: F.sans.medium }), { h: "FILL" });
    var ta = box("textarea", { dir: "HORIZONTAL", h: 120, radius: 12, bg: "surface", border: "border", pad: 14 });
    add(ta, txt("Composed in Grasse and matured for six months…", { size: 14, color: "muted", w: 600 }));
    add(descF, ta, { h: "FILL" });
    add(basics, descF, { h: "FILL" });

    var variants = card(left, "Variants", { gap: 12 });
    add(variants, txt("Variants", { size: 18, font: F.serif.semibold }), { h: "FILL" });
    var vheads = box("vh", { dir: "HORIZONTAL", gap: 12 });
    add(variants, vheads, { h: "FILL" });
    var vcols = [["Name", 160], ["SKU", 160], ["Price", 120], ["Stock", 90]];
    for (var v = 0; v < vcols.length; v++) add(vheads, txt(vcols[v][0], { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.6, w: vcols[v][1] }));
    var vrows = [["30 ml", "ML-VN-030", "8,400", "6"], ["50 ml", "ML-VN-050", "12,800", "4"], ["100 ml", "ML-VN-100", "19,900", "2"]];
    for (var vr = 0; vr < vrows.length; vr++) {
      var row = box("vrow", { dir: "HORIZONTAL", gap: 12, align: "CENTER" });
      add(variants, row, { h: "FILL" });
      for (var vc = 0; vc < vcols.length; vc++) {
        var cell = box("cell", { dir: "HORIZONTAL", w: vcols[vc][1], h: 40, radius: 10, bg: "surface", border: "border", pad: [0, 12], align: "CENTER" });
        add(cell, txt(vrows[vr][vc], { size: 13 }));
        add(row, cell);
      }
      add(row, iconBox("trash", 18, "muted"));
    }
    add(variants, button("Outline", "Sm", "Add variant"));

    var right = box("right", { dir: "VERTICAL", gap: 24, w: 320 });
    add(cols, right);

    var media = card(right, "Media", { gap: 12 });
    add(media, txt("Media", { size: 18, font: F.serif.semibold }), { h: "FILL" });
    var drop = box("dropzone", { dir: "VERTICAL", gap: 8, pad: 24, radius: 16, border: "border", dash: true, align: "CENTER", justify: "CENTER" });
    add(drop, icon("plus", 20, "muted"));
    add(drop, txt("Drop images or browse", { size: 13, color: "muted" }));
    add(media, drop, { h: "FILL" });
    var thumbs = box("thumbs", { dir: "HORIZONTAL", gap: 8, wrap: true, rowGap: 8 });
    add(media, thumbs, { h: "FILL" });
    for (var t = 0; t < 4; t++) add(thumbs, box("thumb", { w: 60, h: 75, radius: 8, bg: "surface-2", border: t === 0 ? "accent" : null, borderWeight: 2 }));

    var org = card(right, "Organisation", { gap: 16 });
    add(org, txt("Organisation", { size: 18, font: F.serif.semibold }), { h: "FILL" });
    var selects = [["Brand", "Maison Lumière"], ["Category", "Perfumes"], ["Product type", "Perfume"]];
    for (var sI = 0; sI < selects.length; sI++) {
      var sf = box("field", { dir: "VERTICAL", gap: 6 });
      add(sf, txt(selects[sI][0], { size: 14, font: F.sans.medium }), { h: "FILL" });
      var sel2 = box("select", { dir: "HORIZONTAL", h: 44, radius: 12, bg: "surface", border: "border", pad: [0, 14], align: "CENTER" });
      add(sel2, txt(selects[sI][1], { size: 14 }));
      spring(sel2);
      add(sel2, icon("chevronDown", 14, "muted"));
      add(sf, sel2, { h: "FILL" });
      add(org, sf, { h: "FILL" });
    }
    var toggles = [["Published", true], ["Featured", true]];
    for (var tg = 0; tg < toggles.length; tg++) {
      var trow = box("toggle", { dir: "HORIZONTAL", align: "CENTER" });
      add(trow, txt(toggles[tg][0], { size: 14 }));
      spring(trow);
      var sw = box("switch", { dir: "HORIZONTAL", w: 40, h: 22, radius: 999, bg: toggles[tg][1] ? "accent" : "border", align: "CENTER", justify: toggles[tg][1] ? "MAX" : "MIN", pad: [0, 3] });
      var knob = box("knob", { w: 16, h: 16, radius: 999, bg: "surface" });
      add(sw, knob);
      add(trow, sw);
      add(org, trow, { h: "FILL" });
    }
  });
}

/* --------------------------------------------------------------------------
   13. Mobile
-------------------------------------------------------------------------- */

function mobileHeader(parent, title) {
  var h = box("mobile header", { dir: "HORIZONTAL", w: MOBILE_W, h: 56, pad: [0, 16], gap: 12, align: "CENTER", bg: "background" });
  add(parent, h, { h: "FILL" });
  add(h, icon("menu", 22, "foreground"));
  var wm = box("wm", { dir: "HORIZONTAL", align: "CENTER" });
  add(wm, txt(title || "Beauty", { size: 19, font: F.serif.semibold }));
  if (!title) add(wm, txt(".", { size: 19, font: F.serif.semibold, color: "accent" }));
  add(h, wm);
  spring(h);
  add(h, icon("search", 20, "foreground"));
  add(h, icon("heart", 20, "foreground"));
  add(h, icon("bag", 20, "foreground"));
  return h;
}

function mobileTabBar(parent, activeIndex) {
  var bar = box("tab bar", { dir: "HORIZONTAL", w: MOBILE_W, h: 68, pad: [10, 8, 18, 8], bg: "surface", border: "border" });
  bar.strokeTopWeight = 1;
  bar.strokeBottomWeight = bar.strokeLeftWeight = bar.strokeRightWeight = 0;
  add(parent, bar, { h: "FILL" });
  var tabs = [["menu", "Shop"], ["search", "Search"], ["heart", "Saved"], ["bag", "Bag"], ["user", "Account"]];
  for (var i = 0; i < tabs.length; i++) {
    var t = box("tab", { dir: "VERTICAL", gap: 4, align: "CENTER", justify: "CENTER" });
    add(t, icon(tabs[i][0], 20, i === activeIndex ? "accent" : "muted"));
    add(t, txt(tabs[i][1], { size: 10, color: i === activeIndex ? "accent" : "muted" }));
    add(bar, t, { grow: true });
  }
  return bar;
}

async function screenMobileHome() {
  var s = screen("Mobile — Home", MOBILE_W);
  mobileHeader(s);
  var body = box("body", { dir: "VERTICAL", gap: 32, pad: [16, 16, 32, 16] });
  add(s, body, { h: "FILL" });

  var hero = box("hero", { dir: "VERTICAL", gap: 16, pad: 20, radius: 24, bg: "background-tint" });
  add(body, hero, { h: "FILL" });
  var pill = box("pill", { dir: "HORIZONTAL", gap: 6, radius: 999, bg: "surface", pad: [6, 12], align: "CENTER" });
  add(pill, icon("sparkle", 12, "accent"));
  add(pill, txt("Fragrance finder soon", { size: 11, font: F.sans.medium }));
  add(hero, pill);
  add(hero, txt("Scents and skincare,\nchosen with care.", { size: 30, font: F.serif.semibold, lh: 34, ls: -0.5, w: 280 }), { h: "FILL" });
  add(hero, txt("100% authentic, delivered across Nepal.", { size: 14, color: "muted", w: 280 }), { h: "FILL" });
  add(hero, button("Primary", "Md", "Shop all"));

  var cats = box("cats", { dir: "VERTICAL", gap: 12 });
  add(body, cats, { h: "FILL" });
  add(cats, txt("Shop by category", { size: 20, font: F.serif.semibold }));
  var strip = box("strip", { dir: "HORIZONTAL", gap: 12 });
  add(cats, strip, { h: "FILL" });
  var names = ["Perfumes", "Skincare", "Makeup"];
  for (var i = 0; i < names.length; i++) {
    var tile = await photo(names[i], 150, 112, "bc-cat-" + names[i], 16);
    tile.layoutMode = "HORIZONTAL";
    tile.primaryAxisSizingMode = "FIXED";
    tile.counterAxisSizingMode = "FIXED";
    tile.counterAxisAlignItems = "MAX";
    tile.paddingLeft = 12;
    tile.paddingBottom = 10;
    var l = txt(names[i], { size: 13, font: F.sans.medium });
    l.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    add(tile, l);
    add(strip, tile);
  }

  var feat = box("featured", { dir: "VERTICAL", gap: 16 });
  add(body, feat, { h: "FILL" });
  var fh = box("h", { dir: "HORIZONTAL", align: "CENTER" });
  add(fh, txt("Featured", { size: 20, font: F.serif.semibold }));
  spring(fh);
  add(fh, txt("View all", { size: 13, color: "accent" }));
  add(feat, fh, { h: "FILL" });

  var grid = box("grid", { dir: "HORIZONTAL", gap: 14, wrap: true, rowGap: 24 });
  add(feat, grid, { h: "FILL" });
  for (var p = 0; p < 4; p++) {
    var d = DEMO_PRODUCTS[p];
    var c = box("card", { dir: "VERTICAL", gap: 8, w: 172 });
    var well = await photo("img", 172, 215, d.seed, 14);
    add(c, well);
    add(c, txt(d.brand, { size: 10, color: "muted", upper: true, ls: 0.6 }));
    add(c, txt(d.name, { size: 13, font: F.sans.medium, w: 172, lh: 18 }), { h: "FILL" });
    add(c, price(d.price, d.was, "sm"));
    add(grid, c);
  }

  mobileTabBar(s, 0);
  return s;
}

async function screenMobileProduct() {
  var s = screen("Mobile — Product detail", MOBILE_W);
  mobileHeader(s, "Velours Noir");
  var img = await photo("hero", MOBILE_W, 420, "bc-p1", 0);
  add(s, img, { h: "FILL" });

  var body = box("body", { dir: "VERTICAL", gap: 20, pad: [20, 16, 24, 16] });
  add(s, body, { h: "FILL" });

  var head = box("head", { dir: "VERTICAL", gap: 8 });
  add(body, head, { h: "FILL" });
  var tagRow = box("t", { dir: "HORIZONTAL", gap: 8, align: "CENTER" });
  add(tagRow, txt("MAISON LUMIÈRE", { size: 11, color: "muted", ls: 0.8 }));
  add(tagRow, badge("Gold"));
  add(head, tagRow, { h: "FILL" });
  add(head, txt("Velours Noir Eau de Parfum", { size: 26, font: F.serif.semibold, lh: 31, w: 340 }), { h: "FILL" });
  add(head, rating(4.7, 128, 14));
  add(head, price(12800, 15500, "lg"));

  var sizes = box("sizes", { dir: "HORIZONTAL", gap: 8 });
  add(body, sizes, { h: "FILL" });
  var opts = ["30 ml", "50 ml", "100 ml"];
  for (var i = 0; i < opts.length; i++) {
    var o = box("size", { dir: "HORIZONTAL", pad: [10, 16], radius: 12, border: i === 1 ? "accent" : "border", bg: i === 1 ? "accent-soft" : "surface", borderWeight: i === 1 ? 1.5 : 1 });
    add(o, txt(opts[i], { size: 14, font: F.sans.medium }));
    add(sizes, o);
  }

  add(body, txt("A velvet-dark oriental — Turkish rose steeped in oud, vanilla absolute and a whisper of smoked leather.", { size: 14, color: "muted", w: 358, lh: 22 }), { h: "FILL" });

  var notes = box("notes", { dir: "VERTICAL", gap: 10 });
  add(body, notes, { h: "FILL" });
  add(notes, txt("Notes", { size: 17, font: F.serif.semibold }));
  var pyr = [["Top", "Bergamot, Pink pepper"], ["Heart", "Isparta rose, Saffron"], ["Base", "Oud, Vanilla, Leather"]];
  for (var n = 0; n < pyr.length; n++) {
    var nr = box("n", { dir: "HORIZONTAL", gap: 12, align: "CENTER" });
    add(nr, txt(pyr[n][0], { size: 11, font: F.sans.semibold, color: "gold", upper: true, ls: 0.8, w: 48 }));
    add(nr, txt(pyr[n][1], { size: 13 }));
    add(notes, nr, { h: "FILL" });
  }

  // Sticky buy bar
  var bar = box("buy bar", { dir: "HORIZONTAL", w: MOBILE_W, gap: 12, pad: [12, 16, 24, 16], bg: "surface", border: "border", align: "CENTER" });
  bar.strokeTopWeight = 1;
  bar.strokeBottomWeight = bar.strokeLeftWeight = bar.strokeRightWeight = 0;
  add(s, bar, { h: "FILL" });
  var wb = box("wish", { dir: "HORIZONTAL", w: 44, h: 44, radius: 999, border: "border", align: "CENTER", justify: "CENTER" });
  add(wb, icon("heart", 19, "foreground"));
  add(bar, wb);
  add(bar, button("Primary", "Lg", "Add to bag · NPR 12,800"), { grow: true });
  return s;
}

async function screenMobileCart() {
  var s = screen("Mobile — Cart", MOBILE_W);
  mobileHeader(s, "Your bag");
  var body = box("body", { dir: "VERTICAL", gap: 0, pad: [8, 16, 24, 16] });
  add(s, body, { h: "FILL" });

  for (var i = 0; i < CART_LINES.length; i++) {
    var l = CART_LINES[i];
    var row = box("line", { dir: "HORIZONTAL", gap: 12, pad: [16, 0] });
    add(body, row, { h: "FILL" });
    add(row, await photo("t", 72, 90, l.seed, 10));
    var info = box("i", { dir: "VERTICAL", gap: 3 });
    add(row, info, { grow: true });
    add(info, txt(l.brand, { size: 10, color: "muted", upper: true, ls: 0.6 }));
    add(info, txt(l.name, { size: 13, font: F.sans.medium, w: 200, lh: 18 }), { h: "FILL" });
    add(info, txt(l.variant, { size: 12, color: "muted" }));
    var ctl = box("c", { dir: "HORIZONTAL", align: "CENTER" });
    ctl.paddingTop = 6;
    add(info, ctl, { h: "FILL" });
    add(ctl, qtyStepper(l.qty));
    spring(ctl);
    add(ctl, txt("NPR " + l.total.toLocaleString("en-US"), { size: 13, font: F.sans.semibold }));
    if (i < CART_LINES.length - 1) divider(body);
  }

  var sum = box("summary", { dir: "VERTICAL", gap: 12, pad: 16, radius: 20, bg: "surface-2" });
  sum.layoutAlign = "STRETCH";
  add(body, sum, { h: "FILL" });
  summaryRow(sum, "Subtotal", "NPR 21,590");
  summaryRow(sum, "Shipping", "Free");
  divider(sum);
  summaryRow(sum, "Total", "NPR 21,590", true);

  var bar = box("checkout bar", { dir: "HORIZONTAL", w: MOBILE_W, pad: [12, 16, 24, 16], bg: "surface", border: "border" });
  bar.strokeTopWeight = 1;
  bar.strokeBottomWeight = bar.strokeLeftWeight = bar.strokeRightWeight = 0;
  add(s, bar, { h: "FILL" });
  add(bar, button("Primary", "Lg", "Checkout · NPR 21,590"), { grow: true });
  return s;
}

function screenMobileNav() {
  var s = screen("Mobile — Nav drawer", MOBILE_W);
  var head = box("head", { dir: "HORIZONTAL", w: MOBILE_W, h: 56, pad: [0, 16], align: "CENTER", bg: "background" });
  add(s, head, { h: "FILL" });
  var wm = box("wm", { dir: "HORIZONTAL", align: "CENTER" });
  add(wm, txt("Beauty", { size: 19, font: F.serif.semibold }));
  add(wm, txt(".", { size: 19, font: F.serif.semibold, color: "accent" }));
  add(head, wm);
  spring(head);
  add(head, icon("close", 22, "foreground"));

  var body = box("body", { dir: "VERTICAL", gap: 24, pad: [20, 16, 32, 16] });
  add(s, body, { h: "FILL" });
  add(body, searchBar(MOBILE_W - 32), { h: "FILL" });

  var nav = box("nav", { dir: "VERTICAL", gap: 0 });
  add(body, nav, { h: "FILL" });
  var items = ["All products", "Perfumes", "Skincare", "Makeup", "Hair", "Body", "Brands"];
  for (var i = 0; i < items.length; i++) {
    var row = box("item", { dir: "HORIZONTAL", pad: [14, 0], align: "CENTER" });
    add(nav, row, { h: "FILL" });
    add(row, txt(items[i], { size: 16, font: i === 0 ? F.sans.medium : F.sans.regular }));
    spring(row);
    if (i > 0 && i < 6) add(row, icon("chevronRight", 16, "muted"));
    if (i < items.length - 1) divider(nav);
  }

  var acct = box("account", { dir: "VERTICAL", gap: 10, pad: 16, radius: 20, bg: "surface-2" });
  add(body, acct, { h: "FILL" });
  add(acct, txt("Priya Sharma", { size: 15, font: F.sans.medium }), { h: "FILL" });
  add(acct, txt("priya@example.com", { size: 13, color: "muted" }), { h: "FILL" });
  var links = box("links", { dir: "HORIZONTAL", gap: 16 });
  add(links, txt("Orders", { size: 13, color: "accent" }));
  add(links, txt("Wishlist", { size: 13, color: "accent" }));
  add(links, txt("Sign out", { size: 13, color: "muted" }));
  add(acct, links, { h: "FILL" });
  return s;
}

/* --------------------------------------------------------------------------
   14. Foundations page
-------------------------------------------------------------------------- */

function sectionTitle(parent, title, subtitle) {
  var t = box("title", { dir: "VERTICAL", gap: 6 });
  add(t, txt(title, { size: 28, font: F.serif.semibold }));
  if (subtitle) add(t, txt(subtitle, { size: 14, color: "muted", w: 720 }));
  add(parent, t, { h: "FILL" });
  return t;
}

function buildFoundations(page) {
  var root = box("Foundations", { dir: "VERTICAL", gap: 56, pad: 64, bg: "background" });
  page.appendChild(root);
  root.x = 0;
  root.y = 0;

  var head = box("head", { dir: "VERTICAL", gap: 8 });
  add(root, head, { h: "FILL" });
  add(head, txt("Beauty Commerce", { size: 48, font: F.serif.semibold, lh: 54, ls: -1 }));
  add(head, txt("Design foundations generated from apps/web/src/app/globals.css. Colour variables carry both Light and Dark modes; the storefront ships Light only today.", { size: 16, color: "muted", w: 760 }), { h: "FILL" });

  // Colour
  sectionTitle(root, "Colour", "Every swatch is bound to a Figma variable named after its CSS custom property, so switching the frame's mode to Dark re-themes the whole file.");
  var names = Object.keys(TOKENS.Light);
  var swatches = box("swatches", { dir: "HORIZONTAL", gap: 16, wrap: true, rowGap: 16 });
  add(root, swatches, { h: "FILL" });
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    var sw = box("swatch " + n, { dir: "VERTICAL", gap: 0, w: 220, radius: 16, border: "border", clip: true });
    var chip = box("chip", { w: 220, h: 84, bg: n });
    add(sw, chip);
    var meta = box("meta", { dir: "VERTICAL", gap: 3, pad: 14, bg: "surface" });
    add(meta, txt(n, { size: 14, font: F.sans.medium }));
    add(meta, txt(TOKENS.Light[n].toUpperCase() + "  ·  " + TOKENS.Dark[n].toUpperCase(), { size: 11, color: "muted" }));
    add(meta, txt(TOKEN_NOTES[n] || "", { size: 11, color: "muted", w: 192 }));
    add(sw, meta, { h: "FILL" });
    add(swatches, sw);
  }

  // Type
  sectionTitle(root, "Type", "Playfair Display for anything editorial, Geist (Inter as fallback) for UI. Names match the published text styles.");
  var ramp = box("ramp", { dir: "VERTICAL", gap: 20 });
  add(root, ramp, { h: "FILL" });
  for (var t = 0; t < TYPE_RAMP.length; t++) {
    var d = TYPE_RAMP[t];
    var row = box("row", { dir: "HORIZONTAL", gap: 32, align: "CENTER" });
    add(ramp, row, { h: "FILL" });
    var label = box("label", { dir: "VERTICAL", gap: 2, w: 200 });
    add(label, txt(d[0], { size: 13, font: F.sans.medium }));
    add(label, txt(d[3] + "/" + d[4] + "  " + F[d[1]][d[2]].style, { size: 11, color: "muted" }));
    add(label, txt(d[6], { size: 11, color: "muted", w: 190 }));
    add(row, label);
    var sample = txt("Scents chosen with care", { size: d[3], font: F[d[1]][d[2]], lh: d[4], ls: d[5] });
    if (d[0] === "Overline" || d[0] === "Badge") sample.textCase = "UPPER";
    add(row, sample);
  }

  // Elevation + radius + spacing
  var trio = box("trio", { dir: "HORIZONTAL", gap: 64 });
  add(root, trio, { h: "FILL" });

  var elev = box("Elevation", { dir: "VERTICAL", gap: 16 });
  add(trio, elev);
  add(elev, txt("Elevation", { size: 20, font: F.serif.semibold }));
  var elevs = [["Elevation/Soft", "soft", "Cards, inputs, header"], ["Elevation/Lift", "lift", "Hover, dropdowns, hero"]];
  for (var e = 0; e < elevs.length; e++) {
    var ec = box("e", { dir: "VERTICAL", gap: 10 });
    var chipE = box("chip", { w: 200, h: 80, radius: 16, bg: "surface", border: "border", effect: elevs[e][1] });
    add(ec, chipE);
    add(ec, txt(elevs[e][0], { size: 13, font: F.sans.medium }));
    add(ec, txt(elevs[e][2], { size: 11, color: "muted" }));
    add(elev, ec, { h: "FILL" });
  }

  var rad = box("Radius", { dir: "VERTICAL", gap: 16 });
  add(trio, rad);
  add(rad, txt("Radius", { size: 20, font: F.serif.semibold }));
  for (var rk in RADII) {
    var rr = box("r", { dir: "HORIZONTAL", gap: 14, align: "CENTER" });
    add(rr, box("c", { w: 56, h: 40, radius: Math.min(RADII[rk], 20), bg: "surface-2", border: "border" }));
    add(rr, txt(rk + "  ·  " + RADII[rk] + "px", { size: 13, color: "muted" }));
    add(rad, rr, { h: "FILL" });
  }

  var sp = box("Spacing", { dir: "VERTICAL", gap: 16 });
  add(trio, sp);
  add(sp, txt("Spacing", { size: 20, font: F.serif.semibold }));
  for (var si = 0; si < SPACING.length; si++) {
    var srow = box("s", { dir: "HORIZONTAL", gap: 14, align: "CENTER" });
    add(srow, box("bar", { w: SPACING[si], h: 12, radius: 3, bg: "accent" }));
    add(srow, txt(SPACING[si] + "px", { size: 12, color: "muted" }));
    add(sp, srow, { h: "FILL" });
  }

  // Iconography
  sectionTitle(root, "Iconography", "1.75px stroke, round caps and joins, 20px in the header and 16px inline. Mirrors components/ui/icons.tsx.");
  var iconGrid = box("icons", { dir: "HORIZONTAL", gap: 12, wrap: true, rowGap: 12 });
  add(root, iconGrid, { h: "FILL" });
  for (var ik in ICONS) {
    var cell = box(ik, { dir: "VERTICAL", gap: 8, w: 96, pad: [16, 8], radius: 12, bg: "surface", border: "border", align: "CENTER" });
    add(cell, icon(ik, 22, "foreground"));
    add(cell, txt(ik, { size: 10, color: "muted", align: "CENTER", w: 80 }));
    add(iconGrid, cell);
  }
  return root;
}

/* --------------------------------------------------------------------------
   15. Page assembly
-------------------------------------------------------------------------- */

function label(page, text, x, y) {
  var t = txt(text, { size: 28, font: F.serif.semibold });
  page.appendChild(t);
  t.x = x;
  t.y = y;
  return t;
}

/** Lay screens out in a row with generous gutters and a caption above each. */
function layout(page, frames, startX, startY, gap) {
  var x = startX;
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    page.appendChild(f);
    f.x = x;
    f.y = startY;
    var cap = txt(f.name, { size: 20, font: F.sans.medium, color: "muted" });
    page.appendChild(cap);
    cap.x = x;
    cap.y = startY - 40;
    x += f.width + (gap || 120);
  }
  return x;
}

async function main() {
  var t0 = Date.now();
  var fonts = await resolveFonts();

  buildColorVariables();
  buildNumberVariables();
  buildTextStyles();
  buildEffectStyles();

  // Pages
  var p1 = figma.root.children[0];
  p1.name = "01 Foundations";
  var p2 = figma.createPage(); p2.name = "02 Components";
  var p3 = figma.createPage(); p3.name = "03 Storefront";
  var p4 = figma.createPage(); p4.name = "04 Commerce";
  var p5 = figma.createPage(); p5.name = "05 Account";
  var p6 = figma.createPage(); p6.name = "06 Admin";
  var p7 = figma.createPage(); p7.name = "07 Mobile";

  buildFoundations(p1);

  // Components must exist before any screen references them.
  label(p2, "Buttons", 0, -60);
  buildButtonSet(p2, 0, 0);
  label(p2, "Badges", 0, 460);
  buildBadgeSet(p2, 0, 520);
  label(p2, "Fields", 0, 660);
  buildFieldSet(p2, 0, 720);
  label(p2, "Product cards", 0, 960);
  await buildProductCardSet(p2, 0, 1020);
  label(p2, "Header", 0, 1660);
  buildHeader(p2, 0, 1720);
  label(p2, "Footer", 0, 1860);
  buildFooter(p2, 0, 1920);

  // Loose parts that live on the Components page as plain frames.
  var parts = box("Parts", { dir: "VERTICAL", gap: 32, pad: 32, bg: "background" });
  p2.appendChild(parts);
  parts.x = 1560;
  parts.y = 0;
  var partRows = [
    ["Rating", rating(4.7, 128, 14)],
    ["Price — regular", price(3450, null)],
    ["Price — discounted", price(12800, 15500)],
    ["Quantity stepper", qtyStepper(2)],
    ["Search bar", searchBar(320)],
    ["Breadcrumb", breadcrumb(["Home", "Products", "Perfumes", "Velours Noir"])],
  ];
  for (var pr = 0; pr < partRows.length; pr++) {
    var prow = box("part", { dir: "VERTICAL", gap: 10 });
    add(parts, prow, { h: "FILL" });
    add(prow, txt(partRows[pr][0], { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.8 }));
    add(prow, partRows[pr][1]);
  }
  var statusRow = box("Order status badges", { dir: "VERTICAL", gap: 10 });
  add(parts, statusRow, { h: "FILL" });
  add(statusRow, txt("Order status", { size: 12, font: F.sans.semibold, color: "muted", upper: true, ls: 0.8 }));
  var statuses = ["Pending Payment", "Processing", "Paid", "Shipped", "Delivered", "Cancelled", "Refunded", "Payment Failed"];
  var sWrap = box("w", { dir: "HORIZONTAL", gap: 8, wrap: true, rowGap: 8, w: 420 });
  add(statusRow, sWrap, { h: "FILL" });
  for (var st = 0; st < statuses.length; st++) add(sWrap, statusBadge(statuses[st]));

  // Screens
  layout(p3, [await screenHome(), await screenListing(), await screenProductDetail(), await screenSearch()], 0, 0);
  layout(p4, [await screenCart(), await screenCheckout(), await screenOrderDetail(), await screenWishlist()], 0, 0);
  layout(p5, [screenLogin(), screenRegister(), screenAccount(), screenOrders()], 0, 0);
  layout(p6, [screenAdminDashboard(), screenAdminProducts(), screenAdminProductForm()], 0, 0);
  layout(p7, [await screenMobileHome(), await screenMobileProduct(), await screenMobileCart(), screenMobileNav()], 0, 0, 80);

  for (var i = 0; i < figma.root.children.length; i++) {
    var pg = figma.root.children[i];
    if (pg.backgrounds) pg.backgrounds = [{ type: "SOLID", color: hexToRgb("#f3efeb") }];
  }

  if (figma.setCurrentPageAsync) await figma.setCurrentPageAsync(p1);
  else figma.currentPage = p1;

  figma.closePlugin(
    "Beauty Commerce design file built in " +
      Math.round((Date.now() - t0) / 1000) +
      "s — " +
      figma.root.children.length +
      " pages. Fonts: " + fonts.serif + " + " + fonts.sans + "."
  );
}

main().catch(function (e) {
  figma.closePlugin("Generator failed: " + (e && e.message ? e.message : String(e)));
});
