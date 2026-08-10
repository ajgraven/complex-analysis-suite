// controls.ts — the sidebar: live φ editor (F5), preset gallery (A19), KaTeX preview (I1), the render
// mode + colormap pickers (C1–C6), and the under-cursor readout (F4). DOM-only (the app's node suite
// stays DOM-free); the pure logic it drives (compileMap, presets, modes, derivativeAt) is unit-tested.
import katex from "katex";
import "katex/dist/katex.min.css";
import { MAP_PRESETS, presetIdForExpr } from "../presets.js";
import { RENDER_MODES, COLORMAPS } from "../render/modes.js";

export interface Controls {
  readonly root: HTMLElement;
  setExpr(expr: string): void;
  setLatex(latex: string): void;
  showError(msg: string | null): void;
  setMode(id: string): void;
  setColormap(id: string): void;
  setGrid(id: string): void;
  setAnalysis(rows: readonly (readonly [string, string])[] | null): void;
  setHover(rows: readonly (readonly [string, string])[] | null): void;
  /** Transient status under the exterior-map export button (copied / unavailable). */
  setExportStatus(msg: string): void;
  onExpr(cb: (expr: string) => void): void;
  onMode(cb: (id: string) => void): void;
  onColormap(cb: (id: string) => void): void;
  onGrid(cb: (id: string) => void): void;
  onSavePng(cb: () => void): void;
  onResetView(cb: () => void): void;
  onCopyExteriorMap(cb: () => void): void;
}

const GRID_KINDS = [
  { id: "none", name: "None" },
  { id: "cartesian", name: "Cartesian grid" },
  { id: "polar", name: "Polar grid" },
] as const;

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

export function createControls(initialExpr: string): Controls {
  const exprListeners: ((expr: string) => void)[] = [];
  const modeListeners: ((id: string) => void)[] = [];
  const cmapListeners: ((id: string) => void)[] = [];
  const gridListeners: ((id: string) => void)[] = [];
  const savePngListeners: (() => void)[] = [];
  const resetListeners: (() => void)[] = [];
  const copyExtListeners: (() => void)[] = [];

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

  // --- View section ---------------------------------------------------------
  const viewSection = document.createElement("section");
  const viewTitle = document.createElement("h2");
  viewTitle.textContent = "View";
  const mode = labeledSelect("Mode", RENDER_MODES);
  const cmap = labeledSelect("Colormap", COLORMAPS);
  const grid = labeledSelect("Grid", GRID_KINDS);
  viewSection.append(viewTitle, mode.field, cmap.field, grid.field);

  // --- Figure / export section ----------------------------------------------
  const figSection = document.createElement("section");
  const figTitle = document.createElement("h2");
  figTitle.textContent = "Figure";
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
  figSection.append(figTitle, buttons, figNote);

  // --- Exterior invariants section (E2/E6) ----------------------------------
  const analysisSection = document.createElement("section");
  const analysisTitle = document.createElement("h2");
  analysisTitle.textContent = "Exterior invariants";
  const analysisDl = document.createElement("dl");
  analysisDl.className = "hover";
  const analysisHint = document.createElement("p");
  analysisHint.className = "muted";
  analysisHint.textContent = "In the Julia-exterior mode, a polynomial/rational map shows its capacity, Robin constant, and exterior-map coefficients.";
  // Hand off ψ (the exterior conformal map) as an @cas/interchange link (G8). Shown only when an
  // exterior analysis exists — setAnalysis(null) hides it (an empty analysis has nothing to export).
  const exportRow = document.createElement("div");
  exportRow.className = "buttons";
  exportRow.style.display = "none";
  const copyExt = document.createElement("button");
  copyExt.type = "button";
  copyExt.textContent = "Copy exterior-map link";
  exportRow.append(copyExt);
  const exportStatus = document.createElement("p");
  exportStatus.className = "muted";
  exportStatus.setAttribute("role", "status");
  exportStatus.setAttribute("aria-live", "polite");
  analysisSection.append(analysisTitle, analysisDl, analysisHint, exportRow, exportStatus);

  // --- Under-cursor section -------------------------------------------------
  const hoverSection = document.createElement("section");
  const hoverTitle = document.createElement("h2");
  hoverTitle.textContent = "Under cursor";
  const hover = document.createElement("dl");
  hover.className = "hover";
  const hoverEmpty = document.createElement("p");
  hoverEmpty.className = "muted";
  hoverEmpty.textContent = "Hover the plane to read φ(z), φ′(z), and the local scale/rotation.";
  hoverSection.append(hoverTitle, hover, hoverEmpty);

  root.append(mapSection, viewSection, figSection, analysisSection, hoverSection);

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
  cmap.select.addEventListener("change", () => cmapListeners.forEach((cb) => cb(cmap.select.value)));
  grid.select.addEventListener("change", () => gridListeners.forEach((cb) => cb(grid.select.value)));
  savePng.addEventListener("click", () => savePngListeners.forEach((cb) => cb()));
  resetView.addEventListener("click", () => resetListeners.forEach((cb) => cb()));
  copyExt.addEventListener("click", () => copyExtListeners.forEach((cb) => cb()));

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
    setColormap(id: string): void {
      cmap.select.value = id;
    },
    setGrid(id: string): void {
      grid.select.value = id;
    },
    setAnalysis(rows: readonly (readonly [string, string])[] | null): void {
      analysisDl.replaceChildren();
      const hasRows = !!(rows && rows.length);
      analysisHint.style.display = hasRows ? "none" : "";
      exportRow.style.display = hasRows ? "" : "none";
      if (!hasRows) exportStatus.textContent = "";
      if (!rows) return;
      for (const [k, v] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        analysisDl.append(dt, dd);
      }
    },
    setExportStatus(msg: string): void {
      exportStatus.textContent = msg;
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
    onColormap(cb: (id: string) => void): void {
      cmapListeners.push(cb);
    },
    onGrid(cb: (id: string) => void): void {
      gridListeners.push(cb);
    },
    onSavePng(cb: () => void): void {
      savePngListeners.push(cb);
    },
    onResetView(cb: () => void): void {
      resetListeners.push(cb);
    },
    onCopyExteriorMap(cb: () => void): void {
      copyExtListeners.push(cb);
    },
  };
}
