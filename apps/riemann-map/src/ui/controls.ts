// controls.ts — the sidebar. DOM-only (the app's node suite stays DOM-free); the pure logic it drives
// (compileMap, presets, modes, derivativeAt) is unit-tested.
//
// Information architecture (redesign): a single plain-language "Visualize" chooser replaces the old
// Mode + Source pair. It answers *what are you looking at* — a formula φ(z), a region's Riemann map, or
// an imported map — and each choice reveals only its own controls. A region's map carries a Direction
// toggle (𝔻→Ω / Ω→𝔻) and a grouped Shape picker (Smooth regions · Polygons — Schwarz–Christoffel), so
// the SC engine is discoverable by browsing. A Method card names the engine that ran and its honest
// accuracy (= exact / ≈ numerical). Notation (𝔻, Ω, φ) rides alongside the plain words, never instead.
import katex from "katex";
import "katex/dist/katex.min.css";
import { MAP_PRESETS, EXTERIOR_MAP_PRESETS, presetIdForExpr, type MapPreset } from "../presets.js";
import { DOMAIN_PRESETS } from "../domains.js";

/** A prominent, glanceable summary of the conformal engine that produced the current map. */
export interface MethodCard {
  /** Engine name, plain: "Schwarz–Christoffel", "Lightning solver", … */
  readonly name: string;
  /** Short kind tag shown as a pill: "exact map", "numerical", "from a link". */
  readonly tag: string;
  /** Visual accent for the pill/border. */
  readonly tagKind: "sc" | "light";
  /** One-sentence plain-language description of what the engine does. */
  readonly desc: string;
  /** Key readouts (prevertices, modulus, residual, …), honestly = / ≈ tagged by the caller. */
  readonly stats: readonly (readonly [string, string])[];
  /** Optional honesty footnote: [exact-part, approximate-part]. */
  readonly honesty?: readonly [string, string];
}

export interface Controls {
  readonly root: HTMLElement;
  setExpr(expr: string): void;
  setLatex(latex: string): void;
  showError(msg: string | null): void;
  /** Show/hide the "drag the c handle" hint under the formula editor (when φ references c). */
  setFormulaHint(show: boolean): void;
  /** The primary chooser: "formula" | "region" | "import". */
  setVisualize(id: string): void;
  /** A region's map direction: "d2r" (𝔻→Ω) | "r2d" (Ω→𝔻). */
  setDirection(id: string): void;
  /** The unified shape/region preset id (drives both directions). */
  setShape(id: string): void;
  /** Phase C: show/hide the polygon-editing tools (＋/－ vertex, reset), and reflect the vertex count. */
  setPolygonTools(visible: boolean, vertexCount?: number): void;
  setDiskSide(id: string): void;
  setDiskStyle(id: string): void;
  setDiskShow(id: string): void;
  setDiskRadial(n: number): void;
  setDiskAngular(n: number): void;
  setDiskLayout(id: string): void;
  /** Contextual disclosure: reveal only the controls the current view uses (A1). */
  setContext(ctx: { vis: string; dir: string }): void;
  /** The Method card (engine + accuracy), or null to hide it. */
  setMethod(card: MethodCard | null): void;
  /** Mirror the live viewport into the precise-nav fields (skips a field the user is editing). */
  setViewportFields(re: number, im: number, zoom: number): void;
  /** Populate the collapsible details drawer, or hide it when `rows` is null. */
  setAnalysis(rows: readonly (readonly [string, string])[] | null, title?: string): void;
  setHover(rows: readonly (readonly [string, string])[] | null): void;
  onExpr(cb: (expr: string) => void): void;
  onVisualize(cb: (id: string) => void): void;
  onDirection(cb: (id: string) => void): void;
  onShape(cb: (id: string) => void): void;
  /** Phase C: a polygon-editing action from the tools row ("add" | "remove" | "reset"). */
  onEditPolygon(cb: (action: "add" | "remove" | "reset") => void): void;
  onDiskSide(cb: (id: string) => void): void;
  onDiskStyle(cb: (id: string) => void): void;
  onDiskShow(cb: (id: string) => void): void;
  onDiskRadial(cb: (n: number) => void): void;
  onDiskAngular(cb: (n: number) => void): void;
  onDiskLayout(cb: (id: string) => void): void;
  /** Re-fit the disk pane's frame to the current disk (the "Fit" button). */
  onFit(cb: () => void): void;
  onSavePng(cb: () => void): void;
  onResetView(cb: () => void): void;
  /** Paste-import an @cas/interchange "#s=" map link (the "Import map…" action). */
  onImportMap(cb: (link: string) => void): void;
  /** Apply the precise-nav fields (Apply button or Enter) as a new centre + zoom. */
  onApplyViewport(cb: (re: number, im: number, zoom: number) => void): void;
}

interface SegItem { id: string; glyph?: string; cap: string; sym?: string }

const VISUALIZE: readonly SegItem[] = [
  { id: "formula", glyph: "ƒ", cap: "A formula", sym: "φ(z)" },
  { id: "region", glyph: "◐→▱", cap: "A region's map", sym: "𝔻↔Ω" },
  { id: "import", glyph: "↗", cap: "Imported", sym: "link" },
];
const DIRECTIONS: readonly SegItem[] = [
  { id: "d2r", cap: "Disk → Region", sym: "𝔻→Ω" },
  { id: "r2d", cap: "Region → Disk", sym: "Ω→𝔻" },
];
const VIS_EXPLAIN: Record<string, string> = {
  formula: "Type a conformal map φ(z) and watch it bend the unit disk's grid. Values are exact (=), in closed form.",
  region: "The conformal map between the unit disk 𝔻 and a shape Ω. Smooth shapes use the lightning solver; polygons use the exact Schwarz–Christoffel map.",
  import: "Load a map shared from Complex Dynamics — a filled Julia set's exterior map — via a “Riemann Map ↗” link.",
};

const DISK_SIDES = [
  { id: "interior", name: "Interior  𝔻  (|z| ≤ 1)" },
  { id: "exterior", name: "Exterior  𝔻*  (|z| ≥ 1)" },
] as const;

const DISK_STYLES = [
  { id: "filled", name: "Filled cells (arg φ′)" },
  { id: "lines", name: "Grid lines" },
] as const;

const DISK_SHOWS = [
  { id: "both", name: "Circles + rays" },
  { id: "circles", name: "Circles only" },
  { id: "rays", name: "Rays only" },
] as const;

const DISK_LAYOUTS = [
  { id: "split", name: "Two-pane (disk + image)" },
  { id: "image", name: "Image only" },
] as const;

/** Glossary of the notation the studio surfaces (I2) — a self-documenting reference. */
const GLOSSARY: readonly (readonly [string, string])[] = [
  ["Conformal / Riemann map φ", "An angle-preserving map. The Riemann mapping theorem sends any simply-connected region (≠ ℂ) onto the unit disk 𝔻."],
  ["Unit disk 𝔻 · region Ω", "𝔻 = {|z| ≤ 1}, the canonical domain. Ω is the target shape (an ellipse, a square, …) the disk is mapped to and from."],
  ["Schwarz–Christoffel", "The exact formula for the conformal map onto a polygon, built from its corner angles — with meaningful prevertices and accessory constants."],
  ["Lightning solver", "A fast least-squares conformal fit (Gopal–Trefethen) for smooth boundaries; clusters poles at any corners."],
  ["= vs ≈", "“=” is an exact / closed-form value; “≈” is a numerical estimate (a fit or a truncated series)."],
  ["Amplitwist |φ′|, arg φ′", "The local scale factor and rotation the map applies at a point (Needham's term for the derivative's action)."],
  ["Capacity, Robin γ", "cap(K) = e^(−γ), the conformal size of a set K; the leading coefficient of an imported exterior map."],
];

const CUSTOM = "__custom__";

/** A segmented (radio-style) control. Returns the element + a `set(id)` that reflects the pressed state. */
function segmented(items: readonly SegItem[], onPick: (id: string) => void, small = false): { el: HTMLDivElement; set: (id: string) => void } {
  const el = document.createElement("div");
  el.className = small ? "seg small" : "seg";
  el.setAttribute("role", "group");
  const btns = new Map<string, HTMLButtonElement>();
  const set = (id: string): void => btns.forEach((b, k) => b.setAttribute("aria-pressed", String(k === id)));
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    if (small) {
      const cap = document.createElement("span");
      cap.className = "cap";
      cap.textContent = it.cap;
      b.append(cap);
      if (it.sym) {
        const s = document.createElement("span");
        s.className = "sym";
        s.textContent = it.sym;
        b.append(s);
      }
    } else {
      const g = document.createElement("span");
      g.className = "glyph";
      g.textContent = it.glyph ?? "";
      const cap = document.createElement("span");
      cap.className = "cap";
      cap.textContent = it.cap;
      b.append(g, cap);
    }
    b.addEventListener("click", () => {
      set(it.id);
      onPick(it.id);
    });
    btns.set(it.id, b);
    el.append(b);
  }
  return { el, set };
}

function labeledSelect(labelText: string, note: string, options: readonly { id: string; name: string }[]): { field: HTMLLabelElement; select: HTMLSelectElement } {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.append(document.createTextNode(labelText));
  if (note) {
    const s = document.createElement("span");
    s.className = "note-sym";
    s.textContent = note;
    span.append(s);
  }
  const select = document.createElement("select");
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = o.name;
    select.append(opt);
  }
  field.append(span, select);
  return { field, select };
}

function labeledInput(labelText: string): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.inputMode = "decimal";
  field.append(span, input);
  return { field, input };
}

function labeledRange(labelText: string, min: number, max: number, value: number): { field: HTMLLabelElement; input: HTMLInputElement; out: HTMLSpanElement } {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.value = String(value);
  const out = document.createElement("span");
  out.className = "field-value";
  out.textContent = String(value);
  field.append(span, input, out);
  return { field, input, out };
}

/** A collapsible sidebar group (CD's `.control-group` disclosure). */
function controlGroup(titleText: string, open: boolean): { el: HTMLDetailsElement; summary: HTMLElement } {
  const el = document.createElement("details");
  el.className = "control-group";
  el.open = open;
  const summary = document.createElement("summary");
  summary.textContent = titleText;
  el.append(summary);
  return { el, summary };
}

export function createControls(initialExpr: string): Controls {
  const exprListeners: ((expr: string) => void)[] = [];
  const visListeners: ((id: string) => void)[] = [];
  const dirListeners: ((id: string) => void)[] = [];
  const shapeListeners: ((id: string) => void)[] = [];
  const editPolygonListeners: ((action: "add" | "remove" | "reset") => void)[] = [];
  const diskSideListeners: ((id: string) => void)[] = [];
  const diskStyleListeners: ((id: string) => void)[] = [];
  const diskShowListeners: ((id: string) => void)[] = [];
  const diskRadialListeners: ((n: number) => void)[] = [];
  const diskAngularListeners: ((n: number) => void)[] = [];
  const diskLayoutListeners: ((id: string) => void)[] = [];
  const fitListeners: (() => void)[] = [];
  const savePngListeners: (() => void)[] = [];
  const resetListeners: (() => void)[] = [];
  const importMapListeners: ((link: string) => void)[] = [];
  const applyViewportListeners: ((re: number, im: number, zoom: number) => void)[] = [];

  const root = document.createElement("aside");
  root.className = "sidebar";

  // --- primary chooser: Visualize -------------------------------------------
  const visWrap = document.createElement("section");
  const visLabel = document.createElement("h2");
  visLabel.textContent = "Visualize";
  const vis = segmented(VISUALIZE, (id) => visListeners.forEach((cb) => cb(id)));
  const visExplain = document.createElement("p");
  visExplain.className = "explainer";
  visWrap.append(visLabel, vis.el, visExplain);

  // --- formula context: the φ(z) editor -------------------------------------
  const mapSection = document.createElement("section");
  const preset = document.createElement("select");
  preset.className = "preset";
  // The formula gallery follows the Disk toggle: interior 𝔻 (default) ⇄ exterior 𝔻*. `activeGallery`
  // is the one currently offered; the picker's options and the typed-edit sync both read from it.
  let activeGallery: readonly MapPreset[] = MAP_PRESETS;
  const fillPresetOptions = (gallery: readonly MapPreset[]): void => {
    preset.replaceChildren();
    for (const p of gallery) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      preset.append(opt);
    }
    const c = document.createElement("option");
    c.value = CUSTOM;
    c.textContent = "Custom…";
    preset.append(c);
  };
  fillPresetOptions(activeGallery);
  /** Point the picker at the gallery for `side` and re-sync it to the current formula. */
  const applyGallery = (side: string): void => {
    activeGallery = side === "exterior" ? EXTERIOR_MAP_PRESETS : MAP_PRESETS;
    fillPresetOptions(activeGallery);
    syncPreset(input.value);
  };
  const exprLabel = document.createElement("span");
  exprLabel.className = "field-label";
  exprLabel.append(document.createTextNode("Map "));
  const exprSym = document.createElement("span");
  exprSym.className = "note-sym";
  exprSym.textContent = "φ(z)";
  exprLabel.append(exprSym);
  const input = document.createElement("input");
  input.type = "text";
  input.className = "expr";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", "map expression");
  const error = document.createElement("div");
  error.className = "error";
  const preview = document.createElement("div");
  preview.className = "preview";
  const cHint = document.createElement("p");
  cHint.className = "explainer c-hint";
  cHint.hidden = true;
  cHint.textContent = "This map has a parameter c — drag the red c handle on the disk to deform it live.";
  mapSection.append(preset, exprLabel, input, error, preview, cHint);

  // --- region context: shape + direction ------------------------------------
  const ctxRegion = document.createElement("section");
  const smooth = DOMAIN_PRESETS.filter((d) => !d.corners);
  const polygons = DOMAIN_PRESETS.filter((d) => d.corners);
  const shapeField = document.createElement("label");
  shapeField.className = "field";
  const shapeLbl = document.createElement("span");
  shapeLbl.className = "field-label";
  shapeLbl.append(document.createTextNode("Shape "));
  const shapeSym = document.createElement("span");
  shapeSym.className = "note-sym";
  shapeSym.textContent = "region Ω";
  shapeLbl.append(shapeSym);
  const shapeSel = document.createElement("select");
  const smoothGroup = document.createElement("optgroup");
  smoothGroup.label = "Smooth regions — Lightning";
  for (const d of smooth) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.name;
    smoothGroup.append(o);
  }
  const polyGroup = document.createElement("optgroup");
  polyGroup.label = "Polygons — Schwarz–Christoffel";
  for (const d of polygons) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.name;
    polyGroup.append(o);
  }
  const customPolyOpt = document.createElement("option");
  customPolyOpt.value = "custom";
  customPolyOpt.textContent = "Custom polygon ✎";
  polyGroup.append(customPolyOpt);
  shapeSel.append(smoothGroup, polyGroup);
  shapeField.append(shapeLbl, shapeSel);
  // Phase C — polygon editing: drag a corner in the Ω pane, or use these to add / remove / reset vertices.
  const polyTools = document.createElement("div");
  polyTools.className = "poly-tools";
  polyTools.hidden = true;
  const polyHint = document.createElement("p");
  polyHint.className = "explainer";
  polyHint.textContent = "Drag a corner in the Ω pane to reshape it — edits fork to a custom polygon.";
  const polyBtns = document.createElement("div");
  polyBtns.className = "buttons";
  const mkPolyBtn = (label: string, title: string, action: "add" | "remove" | "reset"): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", () => editPolygonListeners.forEach((cb) => cb(action)));
    return b;
  };
  const polyCount = document.createElement("span");
  polyCount.className = "note-sym";
  polyBtns.append(
    mkPolyBtn("＋ vertex", "Add a vertex on the longest edge", "add"),
    mkPolyBtn("－ vertex", "Remove a vertex", "remove"),
    mkPolyBtn("reset", "Reset to a regular pentagon", "reset"),
    polyCount,
  );
  polyTools.append(polyHint, polyBtns);
  const dirField = document.createElement("div");
  dirField.className = "field";
  const dirLbl = document.createElement("span");
  dirLbl.className = "field-label";
  dirLbl.textContent = "Direction";
  const dir = segmented(DIRECTIONS, (id) => dirListeners.forEach((cb) => cb(id)), true);
  dirField.append(dirLbl, dir.el);
  ctxRegion.append(shapeField, polyTools, dirField);

  // --- import context -------------------------------------------------------
  const ctxImport = document.createElement("section");
  const importRow = document.createElement("div");
  importRow.className = "buttons";
  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "primary";
  importBtn.textContent = "Import map…";
  importBtn.title = "Paste a Complex Dynamics “Riemann Map ↗” link (#s=…) to render its exterior map";
  importRow.append(importBtn);
  const importNote = document.createElement("p");
  importNote.className = "explainer";
  importNote.textContent = "Paste a “Riemann Map ↗” link from Complex Dynamics to render a filled Julia set's exterior map.";
  ctxImport.append(importRow, importNote);

  // --- the Method card (engine + accuracy) ----------------------------------
  const methodEl = document.createElement("div");
  methodEl.className = "method";
  methodEl.hidden = true;

  // --- display controls -----------------------------------------------------
  const displayGroup = controlGroup("Display", true);
  const diskStyle = labeledSelect("Grid style", "", DISK_STYLES);
  const diskShow = labeledSelect("Show", "", DISK_SHOWS);
  const radial = labeledRange("Radial rings", 4, 48, 18);
  const angular = labeledRange("Angular sectors", 6, 96, 36);
  const diskSide = labeledSelect("Disk", "", DISK_SIDES);
  const layout = labeledSelect("Layout", "", DISK_LAYOUTS);
  displayGroup.el.append(diskStyle.field, diskShow.field, radial.field, angular.field, diskSide.field, layout.field);

  // --- position (precise-nav) -----------------------------------------------
  const navGroup = controlGroup("Position", false);
  const navGrid = document.createElement("div");
  navGrid.className = "nav-grid";
  const navRe = labeledInput("center re");
  const navIm = labeledInput("center im");
  const navZoom = labeledInput("zoom");
  navGrid.append(navRe.field, navIm.field, navZoom.field);
  const navButtons = document.createElement("div");
  navButtons.className = "buttons";
  const navApply = document.createElement("button");
  navApply.type = "button";
  navApply.textContent = "Apply";
  const fitBtn = document.createElement("button");
  fitBtn.type = "button";
  fitBtn.textContent = "Fit";
  fitBtn.title = "Re-frame the disk pane to the current disk";
  navButtons.append(navApply, fitBtn);
  navGroup.el.append(navGrid, navButtons);

  // --- figure / export ------------------------------------------------------
  const figGroup = controlGroup("Figure", false);
  const buttons = document.createElement("div");
  buttons.className = "buttons";
  const savePng = document.createElement("button");
  savePng.type = "button";
  savePng.textContent = "Save PNG";
  const resetView = document.createElement("button");
  resetView.type = "button";
  resetView.textContent = "Reset view";
  buttons.append(savePng, resetView);
  const figNote = document.createElement("p");
  figNote.className = "muted";
  figNote.textContent = "PNG at 2× with the view embedded (reopen to restore). Readouts: = exact · ≈ numerical.";
  figGroup.el.append(buttons, figNote);

  // --- details drawer (supplementary readouts) ------------------------------
  const analysisGroup = controlGroup("Details", false);
  analysisGroup.el.style.display = "none";
  const analysisDl = document.createElement("dl");
  analysisDl.className = "hover analysis-dl";
  analysisGroup.el.append(analysisDl);

  // --- under-cursor ---------------------------------------------------------
  const hoverGroup = controlGroup("Under cursor", true);
  const hover = document.createElement("dl");
  hover.className = "hover";
  const hoverEmpty = document.createElement("p");
  hoverEmpty.className = "muted";
  hoverEmpty.textContent = "Hover the plane to read the map, its derivative, and the local scale/rotation.";
  hoverGroup.el.append(hover, hoverEmpty);

  // --- glossary -------------------------------------------------------------
  const glossaryGroup = controlGroup("Glossary & notation", false);
  const glossaryDl = document.createElement("dl");
  glossaryDl.className = "glossary-dl";
  for (const [term, def] of GLOSSARY) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = def;
    glossaryDl.append(dt, dd);
  }
  glossaryGroup.el.append(glossaryDl);

  root.append(visWrap, mapSection, ctxRegion, ctxImport, methodEl, displayGroup.el, navGroup.el, figGroup.el, analysisGroup.el, hoverGroup.el, glossaryGroup.el);

  // --- behaviour ------------------------------------------------------------
  let ctxVis = "formula";
  input.value = initialExpr;
  syncPreset(initialExpr);

  let debounce = 0;
  input.addEventListener("input", () => {
    syncPreset(input.value);
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => exprListeners.forEach((cb) => cb(input.value.trim())), 180);
  });
  preset.addEventListener("change", () => {
    if (preset.value === CUSTOM) return;
    const p = activeGallery.find((m) => m.id === preset.value);
    if (!p) return;
    input.value = p.expr;
    exprListeners.forEach((cb) => cb(p.expr));
  });
  shapeSel.addEventListener("change", () => shapeListeners.forEach((cb) => cb(shapeSel.value)));
  diskSide.select.addEventListener("change", () => {
    const side = diskSide.select.value;
    // Was the user looking at a stock preset (vs a hand-typed formula) before the toggle?
    const wasStockPreset = presetIdForExpr(input.value, activeGallery) !== null;
    diskSideListeners.forEach((cb) => cb(side));
    applyGallery(side); // swap the offered gallery to the new side + re-sync the picker
    // Switching sides makes the old formula meaningless (an interior map on 𝔻*, or vice-versa). If the
    // user hadn't hand-authored anything, load the new side's canonical map so the toggle shows a real
    // map for that side; a hand-typed custom formula is preserved untouched (picker shows "Custom…").
    if (wasStockPreset && activeGallery.length) {
      const first = activeGallery[0];
      input.value = first.expr;
      syncPreset(first.expr);
      exprListeners.forEach((cb) => cb(first.expr));
    }
  });
  const syncShowVisibility = (): void => {
    const isDisk = ctxVis !== "region-r2d";
    diskShow.field.style.display = isDisk && diskStyle.select.value === "lines" ? "" : "none";
  };
  diskStyle.select.addEventListener("change", () => {
    syncShowVisibility();
    diskStyleListeners.forEach((cb) => cb(diskStyle.select.value));
  });
  diskShow.select.addEventListener("change", () => diskShowListeners.forEach((cb) => cb(diskShow.select.value)));
  radial.input.addEventListener("input", () => {
    const n = Number(radial.input.value);
    radial.out.textContent = String(n);
    diskRadialListeners.forEach((cb) => cb(n));
  });
  angular.input.addEventListener("input", () => {
    const n = Number(angular.input.value);
    angular.out.textContent = String(n);
    diskAngularListeners.forEach((cb) => cb(n));
  });
  layout.select.addEventListener("change", () => diskLayoutListeners.forEach((cb) => cb(layout.select.value)));
  fitBtn.addEventListener("click", () => fitListeners.forEach((cb) => cb()));
  savePng.addEventListener("click", () => savePngListeners.forEach((cb) => cb()));
  resetView.addEventListener("click", () => resetListeners.forEach((cb) => cb()));
  importBtn.addEventListener("click", () => {
    const link = window.prompt("Paste an interchange map link (#s=…) from Complex Dynamics:");
    if (link && link.trim()) importMapListeners.forEach((cb) => cb(link.trim()));
  });
  const applyViewport = (): void => {
    const re = Number(navRe.input.value);
    const im = Number(navIm.input.value);
    const zoom = Number(navZoom.input.value);
    if (Number.isFinite(re) && Number.isFinite(im) && Number.isFinite(zoom) && zoom > 0) {
      applyViewportListeners.forEach((cb) => cb(re, im, zoom));
    }
  };
  navApply.addEventListener("click", applyViewport);
  for (const f of [navRe.input, navIm.input, navZoom.input]) {
    f.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyViewport();
    });
  }

  function syncPreset(expr: string): void {
    preset.value = presetIdForExpr(expr, activeGallery) ?? CUSTOM;
  }

  function renderMethod(card: MethodCard | null): void {
    methodEl.replaceChildren();
    if (!card) {
      methodEl.hidden = true;
      return;
    }
    methodEl.hidden = false;
    methodEl.classList.toggle("light", card.tagKind === "light");
    const top = document.createElement("div");
    top.className = "m-top";
    const name = document.createElement("span");
    name.className = "m-name";
    name.textContent = card.name;
    const tag = document.createElement("span");
    tag.className = "m-tag " + card.tagKind;
    tag.textContent = card.tag;
    top.append(name, tag);
    const desc = document.createElement("p");
    desc.className = "m-desc";
    desc.textContent = card.desc;
    methodEl.append(top, desc);
    if (card.stats.length) {
      const stats = document.createElement("div");
      stats.className = "m-stats";
      for (const [k, v] of card.stats) {
        const cell = document.createElement("div");
        const kk = document.createElement("span");
        kk.className = "k";
        kk.textContent = k;
        const vv = document.createElement("span");
        vv.className = "v mono";
        vv.textContent = v;
        cell.append(kk, vv);
        stats.append(cell);
      }
      methodEl.append(stats);
    }
    if (card.honesty) {
      const h = document.createElement("div");
      h.className = "honesty";
      const a = document.createElement("span");
      const ex = document.createElement("span");
      ex.className = "ex";
      ex.textContent = "= ";
      a.append(ex, document.createTextNode(card.honesty[0].replace(/^=\s*/, "")));
      const b = document.createElement("span");
      b.textContent = card.honesty[1];
      h.append(a, b);
      methodEl.append(h);
    }
  }

  return {
    root,
    setExpr(expr: string): void {
      input.value = expr;
      syncPreset(expr);
    },
    setLatex(latex: string): void {
      if (!latex) {
        preview.replaceChildren();
        return;
      }
      katex.render(latex, preview, { throwOnError: false, displayMode: true });
    },
    showError(msg: string | null): void {
      error.textContent = msg ?? "";
      error.classList.toggle("visible", msg !== null);
    },
    setFormulaHint(show: boolean): void {
      cHint.hidden = !show;
    },
    setVisualize(id: string): void {
      vis.set(id);
    },
    setDirection(id: string): void {
      dir.set(id);
    },
    setShape(id: string): void {
      shapeSel.value = id;
    },
    setPolygonTools(visible: boolean, vertexCount?: number): void {
      polyTools.hidden = !visible;
      if (vertexCount !== undefined) polyCount.textContent = `${vertexCount} vertices`;
    },
    setDiskSide(id: string): void {
      diskSide.select.value = id;
      applyGallery(id); // programmatic set (boot / permalink restore): swap gallery + re-sync, no auto-load
    },
    setDiskStyle(id: string): void {
      diskStyle.select.value = id;
      syncShowVisibility();
    },
    setDiskShow(id: string): void {
      diskShow.select.value = id;
    },
    setDiskRadial(n: number): void {
      radial.input.value = String(n);
      radial.out.textContent = String(n);
    },
    setDiskAngular(n: number): void {
      angular.input.value = String(n);
      angular.out.textContent = String(n);
    },
    setDiskLayout(id: string): void {
      layout.select.value = id;
    },
    setContext(ctx: { vis: string; dir: string }): void {
      const isDisk = !(ctx.vis === "region" && ctx.dir === "r2d");
      ctxVis = ctx.vis === "region" && ctx.dir === "r2d" ? "region-r2d" : ctx.vis;
      mapSection.style.display = ctx.vis === "formula" ? "" : "none";
      ctxRegion.style.display = ctx.vis === "region" ? "" : "none";
      ctxImport.style.display = ctx.vis === "import" ? "" : "none";
      displayGroup.el.style.display = isDisk ? "" : "none";
      diskSide.field.style.display = ctx.vis === "formula" ? "" : "none";
      visExplain.textContent = VIS_EXPLAIN[ctx.vis] ?? "";
      syncShowVisibility();
    },
    setMethod(card: MethodCard | null): void {
      renderMethod(card);
    },
    setViewportFields(re: number, im: number, zoom: number): void {
      const active = document.activeElement;
      const fmtN = (n: number): string => Number(n.toPrecision(8)).toString();
      if (active !== navRe.input) navRe.input.value = fmtN(re);
      if (active !== navIm.input) navIm.input.value = fmtN(im);
      if (active !== navZoom.input) navZoom.input.value = fmtN(zoom);
    },
    setAnalysis(rows: readonly (readonly [string, string])[] | null, title = "Details"): void {
      analysisDl.replaceChildren();
      const hasRows = !!(rows && rows.length);
      analysisGroup.el.style.display = hasRows ? "" : "none";
      if (!hasRows) return;
      analysisGroup.summary.textContent = title;
      for (const [k, v] of rows ?? []) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        analysisDl.append(dt, dd);
      }
    },
    setHover(rows: readonly (readonly [string, string])[] | null): void {
      hover.replaceChildren();
      hoverEmpty.style.display = rows && rows.length ? "none" : "";
      if (!rows) return;
      for (const [k, v] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        hover.append(dt, dd);
      }
    },
    onExpr(cb) { exprListeners.push(cb); },
    onVisualize(cb) { visListeners.push(cb); },
    onDirection(cb) { dirListeners.push(cb); },
    onShape(cb) { shapeListeners.push(cb); },
    onEditPolygon(cb) { editPolygonListeners.push(cb); },
    onDiskSide(cb) { diskSideListeners.push(cb); },
    onDiskStyle(cb) { diskStyleListeners.push(cb); },
    onDiskShow(cb) { diskShowListeners.push(cb); },
    onDiskRadial(cb) { diskRadialListeners.push(cb); },
    onDiskAngular(cb) { diskAngularListeners.push(cb); },
    onDiskLayout(cb) { diskLayoutListeners.push(cb); },
    onFit(cb) { fitListeners.push(cb); },
    onSavePng(cb) { savePngListeners.push(cb); },
    onResetView(cb) { resetListeners.push(cb); },
    onImportMap(cb) { importMapListeners.push(cb); },
    onApplyViewport(cb) { applyViewportListeners.push(cb); },
  };
}
