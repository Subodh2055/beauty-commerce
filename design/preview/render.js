/* Runs code.js against the mock Figma API, then renders the resulting node
   tree to HTML/flexbox so the output can actually be looked at.
   Figma auto-layout maps almost 1:1 onto CSS flexbox. */

const fs = require("fs");
const path = require("path");

const loadedFonts = new Set();
const errors = [];
const warn = (m) => errors.push(m);
let idc = 0;
const nextId = () => `${++idc}:1`;

const styleRegistry = {};
const imageUrls = {};

class Node {
  constructor(type) {
    this.type = type;
    this.id = nextId();
    this.name = type;
    this.children = [];
    this.parent = null;
    this.width = 100;
    this.height = 100;
    this.x = 0;
    this.y = 0;
    this.opacity = 1;
    this._fills = [];
    this.strokes = [];
    this._explicitW = null;
    this._explicitH = null;
  }
  resize(w, h) {
    if (typeof w !== "number" || typeof h !== "number" || isNaN(w) || isNaN(h)) { warn(`resize(${w},${h}) on ${this.name}`); return; }
    if (w <= 0 || h <= 0) warn(`resize(${w},${h}) on ${this.name} must be > 0`);
    this.width = w; this.height = h;
    this._explicitW = w; this._explicitH = h;
    if (this.layoutMode) { this.primaryAxisSizingMode = "FIXED"; this.counterAxisSizingMode = "FIXED"; }
  }
  appendChild(n) {
    if (!n) { warn(`appendChild(undefined) on ${this.name}`); return; }
    if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n);
    n.parent = this; this.children.push(n);
  }
  findOne(fn) {
    for (const c of this.children) { if (fn(c)) return c; const r = c.findOne(fn); if (r) return r; }
    return null;
  }
  findAll(fn) {
    let out = [];
    for (const c of this.children) { if (!fn || fn(c)) out.push(c); out = out.concat(c.findAll(fn)); }
    return out;
  }
  clone() {
    const n = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    n.id = nextId(); n.parent = null;
    n.children = this.children.map((c) => { const k = c.clone(); k.parent = n; return k; });
    return n;
  }
  set fills(v) {
    if (!Array.isArray(v)) { warn(`fills non-array on ${this.name}`); return; }
    for (const p of v) if (p.type === "SOLID") for (const ch of ["r", "g", "b"]) {
      const c = p.color && p.color[ch];
      if (typeof c !== "number" || isNaN(c) || c < 0 || c > 1) warn(`fill ${this.name}.${ch}=${c}`);
    }
    this._fills = v;
  }
  get fills() { return this._fills; }
  set layoutSizingHorizontal(v) {
    if (v === "FILL" && (!this.parent || !this.parent.layoutMode)) warn(`H FILL on "${this.name}" w/o auto-layout parent`);
    this._lsh = v;
  }
  get layoutSizingHorizontal() { return this._lsh; }
  set layoutSizingVertical(v) {
    if (v === "FILL" && (!this.parent || !this.parent.layoutMode)) warn(`V FILL on "${this.name}" w/o auto-layout parent`);
    this._lsv = v;
  }
  get layoutSizingVertical() { return this._lsv; }
  set layoutGrow(v) { if (v && (!this.parent || !this.parent.layoutMode)) warn(`layoutGrow on "${this.name}"`); this._lg = v; }
  get layoutGrow() { return this._lg; }
  set layoutWrap(v) { if (v === "WRAP" && this.layoutMode !== "HORIZONTAL") warn(`WRAP on ${this.layoutMode} "${this.name}"`); this._lw = v; }
  get layoutWrap() { return this._lw; }
  set counterAxisSpacing(v) { if (v != null && this._lw !== "WRAP") warn(`counterAxisSpacing w/o WRAP on "${this.name}"`); this._cas = v; }
  get counterAxisSpacing() { return this._cas; }
  set primaryAxisSizingMode(v) { if (!["FIXED", "AUTO"].includes(v)) warn(`pasm='${v}' on ${this.name}`); this._pasm = v; }
  get primaryAxisSizingMode() { return this._pasm; }
  set counterAxisSizingMode(v) { if (!["FIXED", "AUTO"].includes(v)) warn(`casm='${v}' on ${this.name}`); this._casm = v; }
  get counterAxisSizingMode() { return this._casm; }
  set layoutPositioning(v) {
    if (v === "ABSOLUTE" && (!this.parent || !this.parent.layoutMode)) warn(`ABSOLUTE on unparented "${this.name}"`);
    this._lp = v;
  }
  get layoutPositioning() { return this._lp; }
}

class TextNode extends Node {
  constructor() { super("TEXT"); this._fontName = { family: "Inter", style: "Regular" }; this._characters = ""; this.fontSize = 12; }
  set fontName(f) { if (!f || !f.family) warn(`bad fontName`); this._fontName = f; }
  get fontName() { return this._fontName; }
  set characters(c) {
    const key = `${this._fontName.family}|${this._fontName.style}`;
    if (!loadedFonts.has(key)) warn(`unloaded font "${key}" on "${this.name}"`);
    this._characters = String(c);
  }
  get characters() { return this._characters; }
  set lineHeight(v) { if (!v || typeof v.value !== "number") warn(`lineHeight ${JSON.stringify(v)}`); this._lh = v; }
  get lineHeight() { return this._lh; }
  set letterSpacing(v) { if (!v || typeof v.value !== "number") warn(`letterSpacing ${JSON.stringify(v)}`); this._ls = v; }
  get letterSpacing() { return this._ls; }
}

class ComponentNode extends Node {
  constructor() { super("COMPONENT"); }
  createInstance() {
    const i = new Node("INSTANCE");
    i.name = this.name; i.mainComponent = this;
    i.width = this.width; i.height = this.height;
    i._explicitW = this._explicitW; i._explicitH = this._explicitH;
    i.layoutMode = this.layoutMode;
    i._pasm = this._pasm; i._casm = this._casm; i._lw = this._lw; i._cas = this._cas;
    i.itemSpacing = this.itemSpacing;
    for (const k of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "cornerRadius", "counterAxisAlignItems", "primaryAxisAlignItems", "strokeWeight",
      "strokeTopWeight", "strokeBottomWeight", "strokeLeftWeight", "strokeRightWeight",
      "effectStyleId", "clipsContent", "dashPattern", "strokeAlign"]) i[k] = this[k];
    i._fills = this._fills; i.strokes = this.strokes;
    i.children = this.children.map((c) => { const k = c.clone(); k.parent = i; return k; });
    i.setProperties = (props) => {
      const set = this.parent;
      if (!set || set.type !== "COMPONENT_SET") { warn(`setProperties on non-variant "${this.name}"`); return; }
      const defs = set.componentPropertyDefinitions;
      for (const k of Object.keys(props)) {
        if (!defs[k]) { warn(`unknown variant prop "${k}"`); continue; }
        if (!defs[k].variantOptions.includes(props[k])) warn(`"${k}"="${props[k]}" not in [${defs[k].variantOptions}]`);
      }
      // Swap to the matching variant so the preview shows the right thing.
      const target = set.children.find((c) => {
        const parts = {};
        for (const pair of c.name.split(",")) { const [a, b] = pair.split("=").map((s) => s.trim()); parts[a] = b; }
        return Object.keys(props).every((k) => parts[k] === props[k]);
      });
      if (!target) { warn(`no variant matches ${JSON.stringify(props)}`); return; }
      i.mainComponent = target;
      i.width = target.width; i.height = target.height;
      i._explicitW = target._explicitW; i._explicitH = target._explicitH;
      i.layoutMode = target.layoutMode;
      i._pasm = target._pasm; i._casm = target._casm;
      i.itemSpacing = target.itemSpacing;
      for (const k of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "cornerRadius", "counterAxisAlignItems", "primaryAxisAlignItems", "strokeWeight", "effectStyleId", "strokeAlign"]) i[k] = target[k];
      i._fills = target._fills; i.strokes = target.strokes;
      i.children = target.children.map((c) => { const k = c.clone(); k.parent = i; return k; });
    };
    return i;
  }
}

class ComponentSetNode extends Node {
  constructor() { super("COMPONENT_SET"); }
  get defaultVariant() { return this.children.find((c) => c.type === "COMPONENT"); }
  get componentPropertyDefinitions() {
    const defs = {};
    for (const c of this.children) for (const pair of c.name.split(",")) {
      const [k, v] = pair.split("=").map((s) => s && s.trim());
      if (!k || v === undefined) { warn(`variant name "${c.name}"`); continue; }
      if (!defs[k]) defs[k] = { type: "VARIANT", variantOptions: [] };
      if (!defs[k].variantOptions.includes(v)) defs[k].variantOptions.push(v);
    }
    return defs;
  }
}

class PageNode extends Node { constructor(n) { super("PAGE"); this.name = n; this.backgrounds = []; } }

const FONTS = [];
for (const fam of ["Inter", "Playfair Display"])
  for (const st of ["Regular", "Medium", "Semi Bold", "SemiBold", "Bold"]) {
    if (fam === "Playfair Display" && st === "Semi Bold") continue;
    if (fam === "Inter" && st === "SemiBold") continue;
    FONTS.push({ fontName: { family: fam, style: st } });
  }

const root = new Node("DOCUMENT");
root.children = [new PageNode("Page 1")];
root.children[0].parent = root;

global.figma = {
  root,
  currentPage: root.children[0],
  createPage() { const p = new PageNode("Page"); p.parent = root; root.children.push(p); return p; },
  createFrame() { const n = new Node("FRAME"); n.name = "Frame"; return n; },
  createText() { return new TextNode(); },
  createRectangle() { return new Node("RECTANGLE"); },
  createEllipse() { return new Node("ELLIPSE"); },
  createVector() { return new Node("VECTOR"); },
  createStar() { return new Node("STAR"); },
  createComponent() { return new ComponentNode(); },
  combineAsVariants(nodes, parent) {
    const s = new ComponentSetNode(); s.name = "Component Set";
    for (const n of nodes) s.appendChild(n);
    parent.appendChild(s); return s;
  },
  async listAvailableFontsAsync() { return FONTS; },
  async loadFontAsync(f) { loadedFonts.add(`${f.family}|${f.style}`); },
  async createImageAsync(url) {
    const h = "img" + nextId();
    imageUrls[h] = url;
    return { hash: h };
  },
  async setCurrentPageAsync(p) { figma.currentPage = p; },
  createTextStyle() { const s = new Node("TEXT_STYLE"); s.id = "S:" + nextId(); styleRegistry[s.id] = s; return s; },
  createEffectStyle() { const s = new Node("EFFECT_STYLE"); s.id = "S:" + nextId(); styleRegistry[s.id] = s; return s; },
  variables: {
    createVariableCollection(name) {
      return {
        name, id: "VC:" + nextId(), variableIds: [], modes: [{ modeId: "m0", name: "Mode 1" }],
        renameMode(id, n) { this.modes.find((m) => m.modeId === id).name = n; },
        addMode(n) { const id = "m" + this.modes.length; this.modes.push({ modeId: id, name: n }); return id; },
      };
    },
    createVariable(name, collection, type) {
      return { id: "V:" + nextId(), name, resolvedType: type, scopes: [], setValueForMode() {} };
    },
    setBoundVariableForPaint(p, field, v) { return Object.assign({}, p, { boundVariables: { [field]: { id: v.id } } }); },
  },
  notify() { warn("figma.notify()"); },
  closePlugin(m) { global.__close = m; },
};

/* ---------------- renderer ---------------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const px = (n) => `${Math.round(n * 100) / 100}px`;

function rgba(p) {
  const c = p.color;
  const o = p.opacity == null ? 1 : p.opacity;
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${o})`;
}

const WEIGHT = { Regular: 400, Medium: 500, "Semi Bold": 600, SemiBold: 600, Bold: 700 };

function boxShadow(node) {
  const st = styleRegistry[node.effectStyleId];
  const fx = (st && st.effects) || node.effects;
  if (!fx || !fx.length) return null;
  return fx.filter((e) => e.type === "DROP_SHADOW").map((e) =>
    `${px(e.offset.x)} ${px(e.offset.y)} ${px(e.radius)} ${px(e.spread || 0)} rgba(${Math.round(e.color.r * 255)},${Math.round(e.color.g * 255)},${Math.round(e.color.b * 255)},${e.color.a})`
  ).join(", ");
}

function renderVector(n) {
  const d = (n.vectorPaths && n.vectorPaths[0] && n.vectorPaths[0].data) || "";
  const stroke = n.strokes && n.strokes[0] ? rgba(n.strokes[0]) : "currentColor";
  const w = n.width || 20;
  const sw = (n.strokeWeight || 1.75) * (24 / w); // path space is 24 units
  return `<svg width="${w}" height="${n.height || w}" viewBox="0 0 24 24" fill="none" style="flex:none;display:block"><path d="${esc(d)}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderStar(n) {
  const w = n.width || 13;
  const inner = (n.innerRadius == null ? 0.42 : n.innerRadius) * 12;
  let pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 12 : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${12 + r * Math.cos(a)},${12 + r * Math.sin(a)}`);
  }
  const fill = n.fills && n.fills[0] ? rgba(n.fills[0]) : "none";
  const stroke = n.strokes && n.strokes[0] ? rgba(n.strokes[0]) : "none";
  return `<svg width="${w}" height="${w}" viewBox="0 0 24 24" style="flex:none;display:block"><polygon points="${pts.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/></svg>`;
}

function render(n) {
  if (n.visible === false) return "";
  const s = [];
  const parent = n.parent;
  const pDir = parent && parent.layoutMode;

  // --- sizing -----------------------------------------------------------
  const hFill = n.layoutSizingHorizontal === "FILL";
  const vFill = n.layoutSizingVertical === "FILL";

  if (n.layoutMode) {
    const mainFixed = n.primaryAxisSizingMode === "FIXED";
    const crossFixed = n.counterAxisSizingMode === "FIXED";
    const wFixed = n.layoutMode === "HORIZONTAL" ? mainFixed : crossFixed;
    const hFixed = n.layoutMode === "HORIZONTAL" ? crossFixed : mainFixed;
    if (!hFill) s.push(`width:${wFixed && n._explicitW ? px(n._explicitW) : "fit-content"}`);
    if (!vFill) s.push(`height:${hFixed && n._explicitH ? px(n._explicitH) : "fit-content"}`);
  } else if (n.type !== "TEXT" && n.type !== "VECTOR" && n.type !== "STAR") {
    if (!hFill) s.push(`width:${px(n._explicitW != null ? n._explicitW : n.width)}`);
    if (!vFill) s.push(`height:${px(n._explicitH != null ? n._explicitH : n.height)}`);
  }

  if (pDir === "HORIZONTAL") {
    if (hFill || n.layoutGrow) s.push("flex:1 1 0;min-width:0");
    else s.push("flex:none");
    if (vFill) s.push("align-self:stretch");
  } else if (pDir === "VERTICAL") {
    if (hFill) s.push("align-self:stretch");
    if (vFill || n.layoutGrow) s.push("flex:1 1 0;min-height:0");
    else s.push("flex:none");
  }

  // --- auto-layout ------------------------------------------------------
  if (n.layoutMode) {
    s.push("display:flex", `flex-direction:${n.layoutMode === "HORIZONTAL" ? "row" : "column"}`);
    if (n.itemSpacing) s.push(`gap:${px(n.itemSpacing)}`);
    if (n.layoutWrap === "WRAP") {
      s.push("flex-wrap:wrap");
      if (n.counterAxisSpacing != null) s.push(`row-gap:${px(n.counterAxisSpacing)};column-gap:${px(n.itemSpacing || 0)}`);
    }
    const A = { MIN: "flex-start", CENTER: "center", MAX: "flex-end", BASELINE: "baseline", SPACE_BETWEEN: "space-between" };
    if (n.counterAxisAlignItems) s.push(`align-items:${A[n.counterAxisAlignItems] || "flex-start"}`);
    if (n.primaryAxisAlignItems) s.push(`justify-content:${A[n.primaryAxisAlignItems] || "flex-start"}`);
    const p = [n.paddingTop || 0, n.paddingRight || 0, n.paddingBottom || 0, n.paddingLeft || 0];
    if (p.some(Boolean)) s.push(`padding:${p.map(px).join(" ")}`);
  }

  if (n.layoutPositioning === "ABSOLUTE") s.push(`position:absolute;left:${px(n.x)};top:${px(n.y)}`);
  if (n.children.length && n.layoutPositioning !== "ABSOLUTE") s.push("position:relative");

  // --- paint ------------------------------------------------------------
  const f = n.fills && n.fills[0];
  if (f) {
    if (f.type === "SOLID") s.push(`background:${rgba(f)}`);
    else if (f.type === "IMAGE") s.push(`background-image:url('${imageUrls[f.imageHash] || ""}');background-size:cover;background-position:center`);
  }
  if (n.strokes && n.strokes[0]) {
    const col = rgba(n.strokes[0]);
    const style = n.dashPattern ? "dashed" : "solid";
    const has = ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"].some((k) => n[k] != null);
    if (has) {
      const sides = [["top", n.strokeTopWeight], ["right", n.strokeRightWeight], ["bottom", n.strokeBottomWeight], ["left", n.strokeLeftWeight]];
      for (const [side, w] of sides) if (w) s.push(`border-${side}:${px(w)} ${style} ${col}`);
    } else {
      s.push(`border:${px(n.strokeWeight == null ? 1 : n.strokeWeight)} ${style} ${col}`);
    }
    s.push("box-sizing:border-box");
  }
  if (n.cornerRadius) s.push(`border-radius:${px(Math.min(n.cornerRadius, 9999))}`);
  const sh = boxShadow(n);
  if (sh) s.push(`box-shadow:${sh}`);
  if (n.opacity != null && n.opacity !== 1) s.push(`opacity:${n.opacity}`);
  if (n.clipsContent) s.push("overflow:hidden");

  // --- leaves -----------------------------------------------------------
  if (n.type === "VECTOR") return renderVector(n);
  if (n.type === "STAR") return renderStar(n);

  if (n.type === "TEXT") {
    const fn = n.fontName || {};
    s.push(`font-family:'${fn.family}',sans-serif`, `font-weight:${WEIGHT[fn.style] || 400}`, `font-size:${px(n.fontSize)}`);
    if (n._lh) s.push(`line-height:${n._lh.unit === "PIXELS" ? px(n._lh.value) : n._lh.value + "%"}`);
    if (n._ls && n._ls.value) s.push(`letter-spacing:${px(n._ls.value)}`);
    if (n.textCase === "UPPER") s.push("text-transform:uppercase");
    if (n.textDecoration === "STRIKETHROUGH") s.push("text-decoration:line-through");
    if (n.textAlignHorizontal) s.push(`text-align:${n.textAlignHorizontal.toLowerCase()}`);
    const tf = n.fills && n.fills[0];
    s.push(`color:${tf ? rgba(tf) : "#000"}`, "background:none", "margin:0", "white-space:pre-wrap");
    if (n.textAutoResize === "HEIGHT" && n._explicitW) s.push(`width:${px(n._explicitW)}`);
    else if (n.textAutoResize !== "HEIGHT") s.push("white-space:pre", "width:max-content");
    return `<div style="${s.join(";")}">${esc(n.characters)}</div>`;
  }

  const kids = n.children.map(render).join("");
  return `<div data-name="${esc(n.name)}" style="${s.join(";")}">${kids}</div>`;
}

/* ---------------- run ---------------- */

const code = fs.readFileSync(path.join(__dirname, "..", "figma-plugin", "code.js"), "utf8");

(async () => {
  try { eval(code); await new Promise((r) => setTimeout(r, 400)); }
  catch (e) { console.log("THREW:", e.stack); process.exit(1); }

  const only = process.argv[2]; // optional page-name filter
  let html = `<!doctype html><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
 body{margin:0;background:#e8e2dc;font-family:Inter,sans-serif}
 h2{font:600 15px Inter,sans-serif;color:#5b524c;margin:48px 0 6px;letter-spacing:.06em;text-transform:uppercase}
 h3{font:500 13px Inter,sans-serif;color:#8a807a;margin:0 0 10px}
 .page{padding:32px 40px 56px}
 .row{display:flex;gap:64px;align-items:flex-start;overflow-x:auto;padding-bottom:12px}
 .art{box-shadow:0 8px 40px rgba(0,0,0,.14);background:#fff}
</style>`;

  for (const pg of root.children) {
    if (only && !pg.name.toLowerCase().includes(only.toLowerCase())) continue;
    html += `<div class="page"><h2>${esc(pg.name)}</h2><div class="row">`;
    for (const top of pg.children) {
      if (top.type === "TEXT") continue; // the canvas captions
      html += `<div><h3>${esc(top.name)}</h3><div class="art">${render(top)}</div></div>`;
    }
    html += `</div></div>`;
  }

  // --- structural audit -------------------------------------------------
  // No layout engine here, so this checks declared geometry only: fixed-width
  // children wider than their fixed-width parent's content box, empty text,
  // zero/negative sizes. Visual spacing still needs a look in the browser.
  const audit = [];
  function contentWidth(n) {
    if (!n._explicitW) return null;
    return n._explicitW - (n.paddingLeft || 0) - (n.paddingRight || 0);
  }
  function walk(n, depth, screen) {
    if (n.type === "TEXT") {
      if (!n.characters.trim()) audit.push(`empty text in ${screen} ("${n.name}")`);
    }
    if (n._explicitW != null && n._explicitW <= 0) audit.push(`width ${n._explicitW} on ${screen} > ${n.name}`);
    if (n._explicitH != null && n._explicitH <= 0) audit.push(`height ${n._explicitH} on ${screen} > ${n.name}`);
    const p = n.parent;
    if (p && p.layoutMode && n._explicitW && n.layoutSizingHorizontal !== "FILL" && !n.layoutGrow
        && n.layoutPositioning !== "ABSOLUTE") {
      const cw = contentWidth(p);
      if (cw != null && p.layoutMode === "VERTICAL" && n._explicitW > cw + 0.5)
        audit.push(`overflow: "${n.name}" ${n._explicitW}px inside "${p.name}" content box ${cw}px (${screen})`);
    }
    if (depth > 24) audit.push(`depth ${depth} at ${screen} > ${n.name}`);
    for (const c of n.children) walk(c, depth + 1, screen);
  }

  const summary = [];
  for (const pg of root.children) {
    for (const top of pg.children) {
      if (top.type === "TEXT") continue;
      walk(top, 0, top.name);
      let nodes = 0, texts = 0;
      (function count(n) { nodes++; if (n.type === "TEXT") texts++; n.children.forEach(count); })(top);
      summary.push(`  ${pg.name.padEnd(16)} ${String(top._explicitW || top.width).padStart(5)}w  ${String(nodes).padStart(5)} nodes ${String(texts).padStart(4)} text  ${top.name}`);
    }
  }
  console.log("\n--- structure ---");
  console.log(summary.join("\n"));
  const ua = [...new Set(audit)];
  console.log(`\n--- audit: ${audit.length} findings (${ua.length} unique) ---`);
  for (const a of ua.slice(0, 30)) console.log(`  [x${audit.filter((x) => x === a).length}] ${a}`);

  const out = path.join(__dirname, "preview.html");
  fs.writeFileSync(out, html);
  const uniq = [...new Set(errors)];
  console.log(`rendered -> ${out}`);
  console.log(`pages: ${root.children.length}, issues: ${errors.length} (${uniq.length} unique)`);
  for (const e of uniq.slice(0, 40)) console.log(`  [x${errors.filter((x) => x === e).length}] ${e}`);
})();
