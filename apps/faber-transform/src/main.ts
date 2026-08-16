// main.ts — the Faber transform visualizer entry point. Builds the two-panel DOM imperatively (no
// framework, matching the sibling apps) and repaints on any control change. M1 scope: the interval
// (and ellipse) preset φ, a monomial input zⁿ, and the two CPU phase-portrait panels — f on the unit
// disk (left) beside Φφ(zⁿ) = Fₙ on the bounded complement K (right), with the interval → Chebyshev
// case as the on-screen correctness anchor. Pan/zoom, free-form f, and the GPU renderer come later.
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import { formatFaberPoly } from "@cas/faber";
import { PHI_PRESETS, phiPresetById } from "./presets.js";
import { boundaryK, evalPoly, monomialTaylor, transformCoeffs } from "./faber.js";
import { drawAxes, drawPolyline, planeMap } from "./render/plane.js";
import type { Vec2, Viewport } from "./render/plane.js";
import { fillPhasePortrait } from "./render/coloring.js";
import {
  DEFAULT_VIEW_STATE,
  MAX_DEGREE,
  MIN_DEGREE,
  decodeFaberState,
  encodeFaberState,
} from "./viewState.js";
import type { FaberViewState } from "./viewState.js";
import "./styles/main.css";

const AXIS_COLORS = { grid: "rgba(255,255,255,0.06)", axis: "rgba(255,255,255,0.16)" };

/** A closed unit-circle polyline for the left panel. */
function unitCircle(samples = 256): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    pts.push([Math.cos(t), Math.sin(t)]);
  }
  return pts;
}

/** Size a canvas's backing store to its CSS box and return the 2-D context + pixel size. */
function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height || rect.width));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { ctx, w, h };
}

/** Paint one panel: phase portrait of `g`, then axes and an overlay polyline (∂𝔻 or ∂K). */
function paintPanel(
  canvas: HTMLCanvasElement,
  view: Viewport,
  g: (w: Vec2) => Cx | null,
  overlay: Vec2[],
  overlayColor: string,
): void {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const map = planeMap(view, fit.w, fit.h);
  fillPhasePortrait(fit.ctx, map, g);
  drawAxes(fit.ctx, map, AXIS_COLORS);
  drawPolyline(fit.ctx, map, overlay, { color: overlayColor, width: 1.8 });
}

function elt<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function main(): void {
  const root = document.getElementById("app");
  if (!root) return;

  let state: FaberViewState = decodeFaberState(window.location.hash) ?? DEFAULT_VIEW_STATE;

  root.replaceChildren();

  // --- Header ---------------------------------------------------------------
  const head = elt("header", { class: "app-head" });
  head.append(
    elt("h1", {}, "Faber Transform"),
    elt(
      "p",
      {},
      "The exterior Faber transform Φφ maps a function f analytic on the unit disk to Σ bₙ Fₙ, " +
        "analytic on the bounded complement K = ℂ∖Ω of an unbounded domain. Left: f on the disk. " +
        "Right: its image on K.",
    ),
  );
  root.append(head);

  // --- Panels ---------------------------------------------------------------
  const leftCanvas = elt("canvas", { "aria-label": "f on the unit disk" });
  const rightCanvas = elt("canvas", { "aria-label": "Faber transform of f on K" });
  const panels = elt("div", { class: "panels" });
  const leftPanel = elt("div", { class: "panel" });
  leftPanel.append(elt("h2", {}, "f(z) on the unit disk  𝔻"), leftCanvas);
  const rightPanel = elt("div", { class: "panel" });
  rightPanel.append(elt("h2", {}, "Φφ(f)(w) on K"), rightCanvas);
  panels.append(leftPanel, rightPanel);
  root.append(panels);

  // --- Controls -------------------------------------------------------------
  const controls = elt("div", { class: "controls" });

  const phiSel = elt("select", { id: "phi" });
  for (const p of PHI_PRESETS) phiSel.append(elt("option", { value: p.id }, p.name));
  const phiCtl = elt("div", { class: "control" });
  phiCtl.append(elt("label", { for: "phi" }, "Domain φ: 𝔻* → Ω"), phiSel);

  const shapeInput = elt("input", { id: "shape", type: "range", step: "0.01" });
  const shapeLabel = elt("label", { for: "shape" }, "shape");
  const shapeCtl = elt("div", { class: "control" });
  shapeCtl.append(shapeLabel, shapeInput);

  const degInput = elt("input", {
    id: "deg",
    type: "range",
    min: String(MIN_DEGREE),
    max: "12",
    step: "1",
  });
  const degLabel = elt("label", { for: "deg" }, "input  f(z) = zⁿ");
  const degCtl = elt("div", { class: "control" });
  degCtl.append(degLabel, degInput);

  controls.append(phiCtl, shapeCtl, degCtl);
  root.append(controls);

  const readout = elt("div", { class: "readout" });
  const readoutLabel = elt("span", { class: "label" }, "transform");
  const readoutBody = elt("span", {});
  readout.append(readoutLabel, readoutBody);
  root.append(readout);

  // --- Render + sync --------------------------------------------------------
  function syncControls(): void {
    const preset = phiPresetById(state.phi);
    phiSel.value = preset.id;
    if (preset.shape) {
      shapeCtl.style.display = "";
      shapeInput.min = String(preset.shape.min);
      shapeInput.max = String(preset.shape.max);
      shapeInput.value = String(state.shape);
      shapeLabel.textContent = `${preset.shape.label} = ${state.shape.toFixed(2)}`;
    } else {
      shapeCtl.style.display = "none";
    }
    degInput.value = String(state.input.degree);
    degLabel.textContent = `input  f(z) = z^${state.input.degree}`;
  }

  function render(): void {
    const preset = phiPresetById(state.phi);
    const map = preset.build(state.shape);
    const n = state.input.degree;

    paintPanel(
      leftCanvas,
      state.zView,
      (w) => {
        const z: Cx = { re: w[0], im: w[1] };
        if (z.re * z.re + z.im * z.im >= 1) return null; // mask outside the unit disk
        return Complex.pow(z, n);
      },
      unitCircle(),
      "rgba(255,255,255,0.55)",
    );

    const coeffs = transformCoeffs(map, monomialTaylor(n));
    paintPanel(
      rightCanvas,
      state.wView,
      (w) => evalPoly(coeffs, { re: w[0], im: w[1] }),
      boundaryK(map),
      "rgba(255,255,255,0.75)",
    );

    readoutBody.textContent = `Φφ(z^${n})(w) = ${formatFaberPoly(coeffs, { varSym: "w" })}`;
    syncControls();
  }

  function commit(next: FaberViewState): void {
    state = next;
    history.replaceState(null, "", encodeFaberState(state));
    render();
  }

  phiSel.addEventListener("change", () => {
    const preset = phiPresetById(phiSel.value);
    commit({ ...state, phi: preset.id, shape: preset.shape ? preset.shape.default : state.shape });
  });
  shapeInput.addEventListener("input", () => {
    commit({ ...state, shape: Number(shapeInput.value) });
  });
  degInput.addEventListener("input", () => {
    const d = Math.max(MIN_DEGREE, Math.min(MAX_DEGREE, Math.round(Number(degInput.value))));
    commit({ ...state, input: { kind: "monomial", degree: d } });
  });
  window.addEventListener("resize", render);

  history.replaceState(null, "", encodeFaberState(state));
  render();
}

if (typeof document !== "undefined") main();
