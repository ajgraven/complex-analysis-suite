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
  setHover(rows: readonly (readonly [string, string])[] | null): void;
  onExpr(cb: (expr: string) => void): void;
  onMode(cb: (id: string) => void): void;
  onColormap(cb: (id: string) => void): void;
}

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
  viewSection.append(viewTitle, mode.field, cmap.field);

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

  root.append(mapSection, viewSection, hoverSection);

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
  };
}
