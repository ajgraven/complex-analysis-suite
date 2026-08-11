// controls.ts — the sidebar: live φ editor (F5), preset gallery (A19), KaTeX preview (I1), the render
// mode picker + disk-image controls, and the under-cursor readout (F4). DOM-only (the app's node suite
// stays DOM-free); the pure logic it drives (compileMap, presets, modes, derivativeAt) is unit-tested.
import katex from "katex";
import "katex/dist/katex.min.css";
import { MAP_PRESETS, presetIdForExpr } from "../presets.js";
import { RENDER_MODES } from "../render/modes.js";
import { DOMAIN_PRESETS } from "../domains.js";

export interface Controls {
  readonly root: HTMLElement;
  setExpr(expr: string): void;
  setLatex(latex: string): void;
  showError(msg: string | null): void;
  setMode(id: string): void;
  setDomain(id: string): void;
  setRegionDomain(id: string): void;
  /** Disk-image mode: source (expression | region), side of ∂𝔻, grid style/subset, densities. */
  setDiskSource(id: string): void;
  setDiskSide(id: string): void;
  setDiskStyle(id: string): void;
  setDiskShow(id: string): void;
  setDiskRadial(n: number): void;
  setDiskAngular(n: number): void;
  setDiskLayout(id: string): void;
  /** Show/hide mode-irrelevant controls (contextual disclosure, A1). `region`/`exterior`/`import` = disk-image sources. */
  setControlVisibility(v: { domain: boolean; disk: boolean; region: boolean; exterior: boolean; import: boolean }): void;
  /** Mirror the live viewport into the precise-nav fields (skips a field the user is editing). */
  setViewportFields(re: number, im: number, zoom: number): void;
  /** Populate the analysis group (rows) under `title`, or hide it entirely when `rows` is null. */
  setAnalysis(rows: readonly (readonly [string, string])[] | null, title?: string): void;
  setHover(rows: readonly (readonly [string, string])[] | null): void;
  onExpr(cb: (expr: string) => void): void;
  onMode(cb: (id: string) => void): void;
  onDomain(cb: (id: string) => void): void;
  onRegionDomain(cb: (id: string) => void): void;
  onDiskSource(cb: (id: string) => void): void;
  onDiskSide(cb: (id: string) => void): void;
  onDiskStyle(cb: (id: string) => void): void;
  onDiskShow(cb: (id: string) => void): void;
  onDiskRadial(cb: (n: number) => void): void;
  onDiskAngular(cb: (n: number) => void): void;
  onDiskLayout(cb: (id: string) => void): void;
  /** Re-fit the disk pane's frame to the current disk (the "Fit" button, roadmap 1.5). */
  onFit(cb: () => void): void;
  onSavePng(cb: () => void): void;
  onResetView(cb: () => void): void;
  /** Paste-import an @cas/interchange "#s=" map link (the "Import map…" action). */
  onImportMap(cb: (link: string) => void): void;
  /** Apply the precise-nav fields (Apply button or Enter) as a new centre + zoom. */
  onApplyViewport(cb: (re: number, im: number, zoom: number) => void): void;
}

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

const DISK_SOURCES = [
  { id: "expression", name: "Expression  φ(z)" },
  { id: "region", name: "Region  𝔻 → Ω  (numeric)" },
  { id: "import", name: "Imported map  (from a link)" },
] as const;

const DISK_LAYOUTS = [
  { id: "split", name: "Two-pane (disk + image)" },
  { id: "image", name: "Image only" },
] as const;

/** Glossary of the notation the studio surfaces (catalog item I2) — a self-documenting reference. */
const GLOSSARY: readonly (readonly [string, string])[] = [
  ["= vs ≈", "“=” is an exact/closed-form value; “≈” is a numerical estimate (a limit or a truncated series)."],
  ["Conformal / Riemann map φ", "An angle-preserving map. The Riemann mapping theorem uniformizes any simply-connected domain (≠ ℂ) onto the unit disk."],
  ["Domain coloring", "A phase portrait: hue = arg φ(z), shaded bands = |φ(z)|. Reads a complex function as an image."],
  ["Amplitwist |φ′|, arg φ′", "The local scale factor and rotation the map applies at a point (Needham’s term for the derivative’s action)."],
  ["Filled Julia set K", "The points whose orbit under f stays bounded. Its boundary ∂K is the Julia set — the source of an imported exterior map."],
  ["Capacity, Robin γ", "cap(K) = e^(−γ), the conformal size of K. It equals |γ₁|, the leading coefficient of ψ; = 1 exactly for a monic map."],
  ["Exterior map ψ, bₖ", "The conformal map ext(𝔻) → ext(K), ψ(w) = γ₁·w + Σ bₖ w^(−k). Imported from Complex Dynamics as a disk-image source."],
];

const CUSTOM = "__custom__";

function labeledSelect(labelText: string, options: readonly { id: string; name: string }[]): { field: HTMLLabelElement; select: HTMLSelectElement } {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = labelText;
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

/** A compact label-over-input field (for the precise-nav numbers). */
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

/** A label-over-slider field (disk grid density). `out` shows the live value. */
function labeledRange(
  labelText: string,
  min: number,
  max: number,
  value: number,
): { field: HTMLLabelElement; input: HTMLInputElement; out: HTMLSpanElement } {
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

/** A collapsible sidebar group (CD's `.control-group` disclosure). Returns the <details> + its summary. */
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
  const modeListeners: ((id: string) => void)[] = [];
  const domainListeners: ((id: string) => void)[] = [];
  const regionDomainListeners: ((id: string) => void)[] = [];
  const diskSourceListeners: ((id: string) => void)[] = [];
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

  // --- Map section ----------------------------------------------------------
  const mapSection = document.createElement("section");
  const mapTitle = document.createElement("h2");
  mapTitle.textContent = "Map φ(z)";

  const preset = document.createElement("select");
  preset.className = "preset";
  for (const p of MAP_PRESETS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    preset.append(opt);
  }
  const customOpt = document.createElement("option");
  customOpt.value = CUSTOM;
  customOpt.textContent = "Custom…";
  preset.append(customOpt);

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
  mapSection.append(mapTitle, preset, input, error, preview);

  // --- View group (collapsible; primary controls) ---------------------------
  // Order leads with the disk-image knobs (the default view): Mode, then Disk side + Density. The
  // Colormap / Grid / Domain fields below are contextual — shown only for the modes that use them.
  const viewGroup = controlGroup("View", true);
  const mode = labeledSelect("Mode", RENDER_MODES);
  const diskSource = labeledSelect("Source", DISK_SOURCES);
  const diskSide = labeledSelect("Disk", DISK_SIDES);
  const diskStyle = labeledSelect("Grid style", DISK_STYLES);
  const diskShow = labeledSelect("Show", DISK_SHOWS);
  const radial = labeledRange("Radial rings", 4, 48, 18);
  const angular = labeledRange("Angular sectors", 6, 96, 36);
  const layout = labeledSelect("Layout", DISK_LAYOUTS);
  const domain = labeledSelect("Domain (numeric map)", DOMAIN_PRESETS.map((d) => ({ id: d.id, name: d.name })));
  // The region SOURCE offers only smooth domains — the forward map g: 𝔻 → Ω is stable there; polygon
  // corners need a Schwarz–Christoffel engine (roadmap 3.1).
  const regionDomain = labeledSelect("Region Ω", DOMAIN_PRESETS.filter((d) => !d.corners).map((d) => ({ id: d.id, name: d.name })));
  // "Import map…" action for the imported-map source (B2): paste an interchange "#s=" link (a filled
  // Julia set's exterior Riemann map, handed off from Complex Dynamics). Shown only for that source.
  const importField = document.createElement("div");
  importField.className = "field";
  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.textContent = "Import map…";
  importBtn.title = "Paste a Complex Dynamics “Riemann Map ↗” link (#s=…) to render its exterior map";
  importField.append(importBtn);
  viewGroup.el.append(mode.field, diskSource.field, importField, diskSide.field, diskStyle.field, diskShow.field, radial.field, angular.field, layout.field, domain.field, regionDomain.field);

  // --- Position group (precise-nav fields, A5; collapsed by default) ---------
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

  // --- Figure / export group (collapsed by default) -------------------------
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

  // --- Analysis group (contextual: title + visibility track the mode, A1) ----
  const analysisGroup = controlGroup("Analysis", true);
  analysisGroup.el.style.display = "none"; // shown only when the mode produces analysis
  const analysisDl = document.createElement("dl");
  analysisDl.className = "hover analysis-dl";
  analysisGroup.el.append(analysisDl);

  // --- Under-cursor group (collapsible; live readout) -----------------------
  const hoverGroup = controlGroup("Under cursor", true);
  const hover = document.createElement("dl");
  hover.className = "hover";
  const hoverEmpty = document.createElement("p");
  hoverEmpty.className = "muted";
  hoverEmpty.textContent = "Hover the plane to read φ(z), φ′(z), and the local scale/rotation.";
  hoverGroup.el.append(hover, hoverEmpty);

  // --- Glossary group (I2; collapsed by default) ----------------------------
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

  root.append(mapSection, viewGroup.el, navGroup.el, figGroup.el, analysisGroup.el, hoverGroup.el, glossaryGroup.el);

  // --- behaviour ------------------------------------------------------------
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
    const p = MAP_PRESETS.find((m) => m.id === preset.value);
    if (!p) return;
    input.value = p.expr;
    exprListeners.forEach((cb) => cb(p.expr));
  });
  mode.select.addEventListener("change", () => modeListeners.forEach((cb) => cb(mode.select.value)));
  domain.select.addEventListener("change", () => domainListeners.forEach((cb) => cb(domain.select.value)));
  regionDomain.select.addEventListener("change", () => regionDomainListeners.forEach((cb) => cb(regionDomain.select.value)));
  diskSource.select.addEventListener("change", () => diskSourceListeners.forEach((cb) => cb(diskSource.select.value)));
  diskSide.select.addEventListener("change", () => diskSideListeners.forEach((cb) => cb(diskSide.select.value)));
  // "Show" (circles/rays subset) only bites in the line-art style; hide it for filled cells.
  const syncShowVisibility = (): void => {
    diskShow.field.style.display = diskStyle.select.value === "lines" ? "" : "none";
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
    preset.value = presetIdForExpr(expr) ?? CUSTOM;
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
    setMode(id: string): void {
      mode.select.value = id;
    },
    setDomain(id: string): void {
      domain.select.value = id;
    },
    setRegionDomain(id: string): void {
      regionDomain.select.value = id;
    },
    setDiskSource(id: string): void {
      diskSource.select.value = id;
    },
    setDiskSide(id: string): void {
      diskSide.select.value = id;
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
    setControlVisibility(v: { domain: boolean; disk: boolean; region: boolean; exterior: boolean; import: boolean }): void {
      domain.field.style.display = v.domain ? "" : "none"; // numeric domain→disk mode
      regionDomain.field.style.display = v.region ? "" : "none"; // disk-image region source (smooth only)
      diskSource.field.style.display = v.disk ? "" : "none";
      importField.style.display = v.import ? "" : "none"; // "Import map…" — imported-map source only
      for (const f of [diskStyle.field, radial.field, angular.field, layout.field]) f.style.display = v.disk ? "" : "none";
      // interior/exterior is expression-only (region is 𝔻 → Ω interior; an imported map is ext(𝔻) → ext(·))
      diskSide.field.style.display = v.disk && !v.region && !v.exterior ? "" : "none";
      // the "Show" subset field is disk-only AND line-style-only
      diskShow.field.style.display = v.disk && diskStyle.select.value === "lines" ? "" : "none";
    },
    setViewportFields(re: number, im: number, zoom: number): void {
      const active = document.activeElement; // don't clobber a field the user is typing into
      const fmtN = (n: number): string => Number(n.toPrecision(8)).toString();
      if (active !== navRe.input) navRe.input.value = fmtN(re);
      if (active !== navIm.input) navIm.input.value = fmtN(im);
      if (active !== navZoom.input) navZoom.input.value = fmtN(zoom);
    },
    setAnalysis(rows: readonly (readonly [string, string])[] | null, title = "Analysis"): void {
      analysisDl.replaceChildren();
      const hasRows = !!(rows && rows.length);
      // Hide the whole group when the mode produces no analysis; else title it contextually (A1).
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
    onExpr(cb: (expr: string) => void): void {
      exprListeners.push(cb);
    },
    onMode(cb: (id: string) => void): void {
      modeListeners.push(cb);
    },
    onDomain(cb: (id: string) => void): void {
      domainListeners.push(cb);
    },
    onRegionDomain(cb: (id: string) => void): void {
      regionDomainListeners.push(cb);
    },
    onDiskSource(cb: (id: string) => void): void {
      diskSourceListeners.push(cb);
    },
    onDiskSide(cb: (id: string) => void): void {
      diskSideListeners.push(cb);
    },
    onDiskStyle(cb: (id: string) => void): void {
      diskStyleListeners.push(cb);
    },
    onDiskShow(cb: (id: string) => void): void {
      diskShowListeners.push(cb);
    },
    onDiskRadial(cb: (n: number) => void): void {
      diskRadialListeners.push(cb);
    },
    onDiskAngular(cb: (n: number) => void): void {
      diskAngularListeners.push(cb);
    },
    onDiskLayout(cb: (id: string) => void): void {
      diskLayoutListeners.push(cb);
    },
    onFit(cb: () => void): void {
      fitListeners.push(cb);
    },
    onSavePng(cb: () => void): void {
      savePngListeners.push(cb);
    },
    onResetView(cb: () => void): void {
      resetListeners.push(cb);
    },
    onImportMap(cb: (link: string) => void): void {
      importMapListeners.push(cb);
    },
    onApplyViewport(cb: (re: number, im: number, zoom: number) => void): void {
      applyViewportListeners.push(cb);
    },
  };
}
