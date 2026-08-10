// controls.ts — the sidebar: live φ editor (F5), preset gallery (A19), KaTeX preview (I1), and the
// under-cursor readout (F4). DOM-only (the app's node test suite stays DOM-free), so it is exercised
// through the built app / screenshots rather than unit tests; the pure logic it drives (compileMap,
// presets, derivativeAt) is what the node specs cover.
import katex from "katex";
import "katex/dist/katex.min.css";
import { MAP_PRESETS, presetIdForExpr } from "../presets.js";

export interface Controls {
  readonly root: HTMLElement;
  /** Set the editor value and sync the preset picker, WITHOUT firing the change callback. */
  setExpr(expr: string): void;
  /** Render the map as typeset math (empty string clears it). */
  setLatex(latex: string): void;
  /** Show an inline compile error, or clear it with null. */
  showError(msg: string | null): void;
  /** Fill the under-cursor readout with key/value rows, or clear it with null. */
  setHover(rows: readonly (readonly [string, string])[] | null): void;
  /** Register a callback fired (debounced) when the user edits φ or picks a preset. */
  onExpr(cb: (expr: string) => void): void;
}

const CUSTOM = "__custom__";

export function createControls(initialExpr: string): Controls {
  const listeners: ((expr: string) => void)[] = [];
  const fire = (expr: string): void => listeners.forEach((cb) => cb(expr));

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

  root.append(mapSection, hoverSection);

  // --- behaviour ------------------------------------------------------------
  input.value = initialExpr;
  syncPreset(initialExpr);

  let debounce = 0;
  input.addEventListener("input", () => {
    syncPreset(input.value);
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => fire(input.value.trim()), 180);
  });
  preset.addEventListener("change", () => {
    if (preset.value === CUSTOM) return;
    const p = MAP_PRESETS.find((m) => m.id === preset.value);
    if (!p) return;
    input.value = p.expr;
    fire(p.expr);
  });

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
      listeners.push(cb);
    },
  };
}
