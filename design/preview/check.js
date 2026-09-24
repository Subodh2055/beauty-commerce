/* Minimal Figma Plugin API mock — runs code.js and enforces the rules that
   actually bite (font loading, FILL/HUG parenting, variant properties). */

const fs = require("fs");
const path = require("path");

const loadedFonts = new Set();
const errors = [];
const warn = (m) => errors.push(m);

let idc = 0;
const nextId = () => `${++idc}:1`;

const AUTO_LAYOUT_ONLY = new Set(["FILL", "HUG"]);

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
    this.fills = [];
    this.strokes = [];
    this._layoutSizingH = "FIXED";
    this._layoutSizingV = "FIXED";
  }
  resize(w, h) {
    if (typeof w !== "number" || typeof h !== "number" || isNaN(w) || isNaN(h)) {
      warn(`resize(${w}, ${h}) on ${this.name} — non-numeric`);
      return;
    }
    if (w <= 0 || h <= 0) warn(`resize(${w}, ${h}) on ${this.name} — must be > 0`);
    this.width = w;
    this.height = h;
    if (this.layoutMode) {
      this.primaryAxisSizingMode = "FIXED";
      this.counterAxisSizingMode = "FIXED";
    }
  }
  appendChild(n) {
    if (!n) { warn(`appendChild(undefined) on ${this.name}`); return; }
    if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n);
    n.parent = this;
    this.children.push(n);
  }
  insertChild(i, n) { this.appendChild(n); }
  findOne(fn) {
    for (const c of this.children) {
      if (fn(c)) return c;
      const r = c.findOne(fn);
      if (r) return r;
    }
    return null;
  }
  findAll(fn) {
    let out = [];
    for (const c of this.children) {
      if (!fn || fn(c)) out.push(c);
      out = out.concat(c.findAll(fn));
    }
    return out;
  }
  clone() {
    const n = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    n.id = nextId();
    n.parent = null;
    n.children = this.children.map((c) => { const k = c.clone(); k.parent = n; return k; });
    return n;
  }
  set layoutSizingHorizontal(v) {
    if (AUTO_LAYOUT_ONLY.has(v)) {
      if (v === "FILL" && (!this.parent || !this.parent.layoutMode))
        warn(`layoutSizingHorizontal='FILL' on "${this.name}" but parent "${this.parent ? this.parent.name : "(none)"}" is not auto-layout`);
      if (v === "HUG" && !this.layoutMode && this.type !== "TEXT")
        warn(`layoutSizingHorizontal='HUG' on "${this.name}" (${this.type}) which is not an auto-layout frame or text`);
    }
    this._layoutSizingH = v;
  }
  get layoutSizingHorizontal() { return this._layoutSizingH; }
  set layoutSizingVertical(v) {
    if (AUTO_LAYOUT_ONLY.has(v)) {
      if (v === "FILL" && (!this.parent || !this.parent.layoutMode))
        warn(`layoutSizingVertical='FILL' on "${this.name}" but parent is not auto-layout`);
      if (v === "AUTO") warn(`layoutSizingVertical='AUTO' on "${this.name}" — must be HUG`);
    }
    this._layoutSizingV = v;
  }
  get layoutSizingVertical() { return this._layoutSizingV; }
  set layoutGrow(v) {
    if (v && (!this.parent || !this.parent.layoutMode))
      warn(`layoutGrow on "${this.name}" but parent is not auto-layout`);
    this._layoutGrow = v;
  }
  get layoutGrow() { return this._layoutGrow; }
  set layoutWrap(v) {
    if (v === "WRAP" && this.layoutMode !== "HORIZONTAL")
      warn(`layoutWrap='WRAP' on "${this.name}" but layoutMode is ${this.layoutMode} (must be HORIZONTAL)`);
    this._layoutWrap = v;
  }
  get layoutWrap() { return this._layoutWrap; }
  set counterAxisSpacing(v) {
    if (v != null && this._layoutWrap !== "WRAP")
      warn(`counterAxisSpacing on "${this.name}" without layoutWrap='WRAP'`);
    this._cas = v;
  }
  get counterAxisSpacing() { return this._cas; }
  set primaryAxisSizingMode(v) {
    if (!["FIXED", "AUTO"].includes(v)) warn(`primaryAxisSizingMode='${v}' on "${this.name}"`);
    this._pasm = v;
  }
  get primaryAxisSizingMode() { return this._pasm; }
  set counterAxisSizingMode(v) {
    if (!["FIXED", "AUTO"].includes(v)) warn(`counterAxisSizingMode='${v}' on "${this.name}"`);
    this._casm = v;
  }
  get counterAxisSizingMode() { return this._casm; }
  set layoutPositioning(v) {
    if (v === "ABSOLUTE" && (!this.parent || !this.parent.layoutMode))
      warn(`layoutPositioning='ABSOLUTE' on "${this.name}" but parent is not auto-layout`);
    this._lp = v;
  }
  get layoutPositioning() { return this._lp; }
}

class TextNode extends Node {
  constructor() {
    super("TEXT");
    this._fontName = { family: "Inter", style: "Regular" };
    this._characters = "";
    this.fontSize = 12;
  }
  set fontName(f) {
    if (!f || !f.family || !f.style) warn(`fontName set to ${JSON.stringify(f)}`);
    this._fontName = f;
  }
  get fontName() { return this._fontName; }
  set characters(c) {
    const key = `${this._fontName.family}|${this._fontName.style}`;
    if (!loadedFonts.has(key)) warn(`characters set with unloaded font "${key}" on "${this.name}"`);
    if (typeof c !== "string") warn(`characters set to non-string: ${c}`);
    this._characters = c;
    this.width = Math.max(10, String(c).length * this.fontSize * 0.55);
    this.height = this.fontSize * 1.4;
  }
  get characters() { return this._characters; }
  set lineHeight(v) {
    if (!v || typeof v.value !== "number" || !v.unit) warn(`lineHeight must be {unit,value}, got ${JSON.stringify(v)}`);
    this._lh = v;
  }
  get lineHeight() { return this._lh; }
  set letterSpacing(v) {
    if (!v || typeof v.value !== "number" || !v.unit) warn(`letterSpacing must be {unit,value}, got ${JSON.stringify(v)}`);
    this._ls = v;
  }
  get letterSpacing() { return this._ls; }
}

class ComponentNode extends Node {
  constructor() { super("COMPONENT"); }
  createInstance() {
    const i = new Node("INSTANCE");
    i.name = this.name;
    i.mainComponent = this;
    i.width = this.width;
    i.height = this.height;
    i.children = this.children.map((c) => { const k = c.clone(); k.parent = i; return k; });
    i.setProperties = (props) => {
      if (!this.parent || this.parent.type !== "COMPONENT_SET") {
        warn(`setProperties on instance of "${this.name}" whose main is not in a COMPONENT_SET`);
        return;
      }
      const defs = this.parent.componentPropertyDefinitions;
      for (const k of Object.keys(props)) {
        if (!defs[k]) { warn(`setProperties: unknown property "${k}" (have: ${Object.keys(defs).join(", ")})`); continue; }
        if (!defs[k].variantOptions.includes(props[k]))
          warn(`setProperties: "${k}" = "${props[k]}" not in [${defs[k].variantOptions.join(", ")}]`);
      }
    };
    return i;
  }
}

class ComponentSetNode extends Node {
  constructor() { super("COMPONENT_SET"); }
  get defaultVariant() {
    const v = this.children.find((c) => c.type === "COMPONENT");
    if (!v) warn(`defaultVariant on "${this.name}" — no COMPONENT children`);
    return v;
  }
  get componentPropertyDefinitions() {
    const defs = {};
    for (const c of this.children) {
      for (const pair of c.name.split(",")) {
        const [k, v] = pair.split("=").map((s) => s && s.trim());
        if (!k || v === undefined) { warn(`variant name "${c.name}" is not "Prop=Value" form`); continue; }
        if (!defs[k]) defs[k] = { type: "VARIANT", variantOptions: [] };
        if (!defs[k].variantOptions.includes(v)) defs[k].variantOptions.push(v);
      }
    }
    return defs;
  }
}

class PageNode extends Node {
  constructor(name) { super("PAGE"); this.name = name; this.backgrounds = []; }
}

const FONTS = [];
for (const fam of ["Inter", "Playfair Display", "Roboto"]) {
  for (const st of ["Regular", "Medium", "Semi Bold", "SemiBold", "Bold"]) {
    if (fam === "Playfair Display" && st === "Semi Bold") continue;
    if (fam === "Inter" && st === "SemiBold") continue;
    FONTS.push({ fontName: { family: fam, style: st } });
  }
}

const root = new Node("DOCUMENT");
root.children = [new PageNode("Page 1")];
root.children[0].parent = root;

let variableCount = 0;
const collections = [];

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
  createAutoLayout: undefined, // deliberately absent: real plugins don't have it
  combineAsVariants(nodes, parent) {
    const set = new ComponentSetNode();
    set.name = "Component Set";
    for (const n of nodes) {
      if (n.type !== "COMPONENT") warn(`combineAsVariants got a ${n.type}`);
      set.appendChild(n);
    }
    parent.appendChild(set);
    return set;
  },
  async listAvailableFontsAsync() { return FONTS; },
  async loadFontAsync(f) { loadedFonts.add(`${f.family}|${f.style}`); },
  async createImageAsync(url) {
    if (process.env.OFFLINE) throw new Error("offline in harness");
    if (!/^https:\/\/picsum\.photos\//.test(url)) warn(`createImageAsync to un-allowlisted host: ${url}`);
    return { hash: "img" + nextId() };
  },
  async setCurrentPageAsync(p) { figma.currentPage = p; },
  createTextStyle() { const s = new Node("TEXT_STYLE"); s.id = "S:" + nextId(); return s; },
  createEffectStyle() { const s = new Node("EFFECT_STYLE"); s.id = "S:" + nextId(); return s; },
  variables: {
    createVariableCollection(name) {
      const c = {
        name, id: "VC:" + nextId(), variableIds: [],
        modes: [{ modeId: "m0", name: "Mode 1" }],
        renameMode(id, n) { this.modes.find((m) => m.modeId === id).name = n; },
        addMode(n) { const id = "m" + this.modes.length; this.modes.push({ modeId: id, name: n }); return id; },
      };
      collections.push(c);
      return c;
    },
    createVariable(name, collection, type) {
      if (!collection || !collection.modes) warn(`createVariable("${name}") got a bad collection`);
      if (!["COLOR", "FLOAT", "STRING", "BOOLEAN"].includes(type)) warn(`createVariable type "${type}"`);
      variableCount++;
      return {
        id: "V:" + nextId(), name, resolvedType: type, scopes: [],
        setValueForMode(modeId, val) {
          if (!collection.modes.some((m) => m.modeId === modeId)) warn(`setValueForMode bad mode on ${name}`);
          if (type === "COLOR") {
            for (const ch of ["r", "g", "b"]) {
              if (typeof val[ch] !== "number" || val[ch] < 0 || val[ch] > 1 || isNaN(val[ch]))
                warn(`variable ${name}: channel ${ch} = ${val[ch]} out of 0..1`);
            }
            if ("a" in val) warn(`variable ${name}: colour has an 'a' field`);
          }
        },
      };
    },
    setBoundVariableForPaint(p, field, v) {
      if (!p || p.type !== "SOLID") warn(`setBoundVariableForPaint on non-solid paint`);
      if (!v) warn(`setBoundVariableForPaint with no variable`);
      return Object.assign({}, p, { boundVariables: { [field]: { type: "VARIABLE_ALIAS", id: v.id } } });
    },
  },
  notify() { warn("figma.notify() is not implemented in this environment"); },
  closePlugin(msg) { global.__closeMessage = msg; },
};

// Validate colour paints as they are assigned anywhere.
const origFillsDesc = Object.getOwnPropertyDescriptor(Node.prototype, "fills");
Object.defineProperty(Node.prototype, "fills", {
  get() { return this._fills || []; },
  set(v) {
    if (!Array.isArray(v)) { warn(`fills set to non-array on ${this.name}`); return; }
    for (const p of v) {
      if (p.type === "SOLID") {
        for (const ch of ["r", "g", "b"]) {
          const c = p.color && p.color[ch];
          if (typeof c !== "number" || isNaN(c) || c < 0 || c > 1)
            warn(`fill on "${this.name}": colour.${ch} = ${c}`);
        }
        if (p.color && "a" in p.color) warn(`fill on "${this.name}": colour has 'a' field`);
      }
    }
    this._fills = v;
  },
});

const code = fs.readFileSync(path.join(__dirname, "..", "figma-plugin", "code.js"), "utf8");

(async () => {
  try {
    // eslint-disable-next-line no-eval
    eval(code);
    await new Promise((r) => setTimeout(r, 300));
  } catch (e) {
    console.log("THREW:", e.stack || e.message);
  }
  console.log("close message:", global.__closeMessage);
  console.log("pages:", root.children.map((p) => `${p.name} (${p.children.length} top-level)`).join("\n       "));
  console.log("variables:", variableCount, "collections:", collections.length);
  const uniq = [...new Set(errors)];
  console.log(`\n=== ${errors.length} issues (${uniq.length} unique) ===`);
  for (const e of uniq.slice(0, 60)) {
    const n = errors.filter((x) => x === e).length;
    console.log(` [x${n}] ${e}`);
  }
})();
