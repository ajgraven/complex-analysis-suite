// main.ts — the Faber transform visualizer entry point. Builds the two-panel DOM imperatively (no
// framework, matching the sibling apps) and repaints on any control change. Two exact input families:
// a monomial zⁿ (→ Fₙ) and a pole 1/(z−z₀)^k with |z₀|>1 (→ the closed-form rational image, pole at
// φ(z₀)∈Ω). Both are labelled `=` (exact). Free-form f + the truncated-series `≈` path arrive at M3;
// the GPU renderer and pan/zoom follow.
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import { formatFaberPoly } from "@cas/faber";
import { PHI_PRESETS, phiPresetById } from "./presets.js";
import {
  boundaryK,
  evalPoleInput,
  evalPoly,
  evalRationalImage,
  monomialTaylor,
  poleImage,
  transformCoeffs,
} from "./faber.js";
import { BASE_HALF, drawAxes, drawDot, drawPolyline, planeMap } from "./render/plane.js";
import type { Vec2, Viewport } from "./render/plane.js";
import { fillPhasePortrait } from "./render/coloring.js";
import {
  DEFAULT_VIEW_STATE,
  MAX_DEGREE,
  MIN_DEGREE,
  MAX_POLE_R,
  MIN_POLE_R,
  decodeFaberState,
  encodeFaberState,
} from "./viewState.js";
import type { FaberViewState, InputState } from "./viewState.js";
import "./styles/main.css";

const AXIS_COLORS = { grid: "rgba(255,255,255,0.06)", axis: "rgba(255,255,255,0.16)" };

interface Marker {
  readonly w: Vec2;
  readonly color: string;
}

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
function fitCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height || rect.width));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { ctx, w, h };
}

/** Paint one panel: phase portrait of `g`, then axes, an overlay polyline (∂𝔻 or ∂K), and markers. */
function paintPanel(
  canvas: HTMLCanvasElement,
  view: Viewport,
  g: (w: Vec2) => Cx | null,
  overlay: Vec2[],
  overlayColor: string,
  markers: Marker[] = [],
): void {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const map = planeMap(view, fit.w, fit.h);
  fillPhasePortrait(fit.ctx, map, g);
  drawAxes(fit.ctx, map, AXIS_COLORS);
  drawPolyline(fit.ctx, map, overlay, { color: overlayColor, width: 1.8 });
  for (const m of markers) drawDot(fit.ctx, map, m.w, m.color, 4);
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

const fmt = (v: Cx): string => Complex.format(v, { digits: 4 });

/** Default input for a mode when the user toggles into it. */
function defaultInput(kind: InputState["kind"]): InputState {
  return kind === "monomial"
    ? { kind: "monomial", degree: 3 }
    : { kind: "pole", re: 1.6, im: 0.8, order: 1 };
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

  const modeSel = elt("select", { id: "mode" });
  modeSel.append(
    elt("option", { value: "monomial" }, "Monomial  zⁿ"),
    elt("option", { value: "pole" }, "Pole  1/(z−z₀)ᵏ"),
  );
  const modeCtl = elt("div", { class: "control" });
  modeCtl.append(elt("label", { for: "mode" }, "input f"), modeSel);

  // Monomial control
  const degInput = elt("input", { id: "deg", type: "range", min: String(MIN_DEGREE), max: "12", step: "1" });
  const degLabel = elt("label", { for: "deg" }, "degree n");
  const degCtl = elt("div", { class: "control" });
  degCtl.append(degLabel, degInput);

  // Pole controls (polar: r > 1 keeps z₀ outside the disk; θ its angle)
  const rInput = elt("input", { id: "poleR", type: "range", min: "1.05", max: "3", step: "0.01" });
  const rLabel = elt("label", { for: "poleR" }, "|z₀|");
  const rCtl = elt("div", { class: "control" });
  rCtl.append(rLabel, rInput);

  const thInput = elt("input", { id: "poleTh", type: "range", min: "0", max: "6.2832", step: "0.01" });
  const thLabel = elt("label", { for: "poleTh" }, "arg z₀");
  const thCtl = elt("div", { class: "control" });
  thCtl.append(thLabel, thInput);

  const orderSel = elt("select", { id: "order" });
  orderSel.append(elt("option", { value: "1" }, "1 (simple)"), elt("option", { value: "2" }, "2 (double)"));
  const orderCtl = elt("div", { class: "control" });
  orderCtl.append(elt("label", { for: "order" }, "pole order k"), orderSel);

  controls.append(phiCtl, shapeCtl, modeCtl, degCtl, rCtl, thCtl, orderCtl);
  root.append(controls);

  const readout = elt("div", { class: "readout" });
  const exactBadge = elt("span", { class: "badge-exact" }, "=");
  const readoutBody = elt("span", {});
  readout.append(exactBadge, readoutBody);
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
    modeSel.value = state.input.kind;
    const isMono = state.input.kind === "monomial";
    degCtl.style.display = isMono ? "" : "none";
    rCtl.style.display = isMono ? "none" : "";
    thCtl.style.display = isMono ? "none" : "";
    orderCtl.style.display = isMono ? "none" : "";
    if (state.input.kind === "monomial") {
      degInput.value = String(state.input.degree);
      degLabel.textContent = `degree n = ${state.input.degree}`;
    } else {
      const { re, im, order } = state.input;
      rInput.value = String(Math.hypot(re, im));
      let th = Math.atan2(im, re);
      if (th < 0) th += 2 * Math.PI;
      thInput.value = String(th);
      orderSel.value = String(order);
      rLabel.textContent = `|z₀| = ${Math.hypot(re, im).toFixed(2)}`;
      thLabel.textContent = `arg z₀ = ${th.toFixed(2)}`;
    }
  }

  function render(): void {
    const preset = phiPresetById(state.phi);
    const map = preset.build(state.shape);

    if (state.input.kind === "monomial") {
      const n = state.input.degree;
      paintPanel(
        leftCanvas,
        state.zView,
        (w) => {
          const z: Cx = { re: w[0], im: w[1] };
          if (z.re * z.re + z.im * z.im >= 1) return null;
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
    } else {
      const z0: Cx = { re: state.input.re, im: state.input.im };
      const order = state.input.order;
      paintPanel(
        leftCanvas,
        state.zView,
        (w) => {
          const z: Cx = { re: w[0], im: w[1] };
          if (z.re * z.re + z.im * z.im >= 1) return null;
          return evalPoleInput(z0, order, z);
        },
        unitCircle(),
        "rgba(255,255,255,0.55)",
      );
      const img = poleImage(map, z0, order);
      paintPanel(
        rightCanvas,
        state.wView,
        (w) => evalRationalImage(img, { re: w[0], im: w[1] }),
        boundaryK(map),
        "rgba(255,255,255,0.75)",
        [{ w: [img.poleAt.re, img.poleAt.im], color: "#ffffff" }],
      );
      const kexp = order === 1 ? "" : `^${order}`;
      readoutBody.textContent =
        `Φφ(1/(z−z₀)${kexp})(w): image pole at w = φ(z₀) = ${fmt(img.poleAt)}` +
        (order === 1 ? `,  residue φ'(z₀) = ${fmt(img.terms[0])}` : "");
    }
    syncControls();
  }

  function commit(next: FaberViewState): void {
    state = next;
    history.replaceState(null, "", encodeFaberState(state));
    render();
  }

  phiSel.addEventListener("change", () => {
    const preset = phiPresetById(phiSel.value);
    commit({
      ...state,
      phi: preset.id,
      shape: preset.shape ? preset.shape.default : state.shape,
      wView: { centerRe: 0, centerIm: 0, zoom: BASE_HALF / preset.kHalf },
    });
  });
  shapeInput.addEventListener("input", () => commit({ ...state, shape: Number(shapeInput.value) }));
  modeSel.addEventListener("change", () => {
    const kind = modeSel.value === "pole" ? "pole" : "monomial";
    commit({ ...state, input: defaultInput(kind) });
  });
  degInput.addEventListener("input", () => {
    const d = Math.max(MIN_DEGREE, Math.min(MAX_DEGREE, Math.round(Number(degInput.value))));
    commit({ ...state, input: { kind: "monomial", degree: d } });
  });

  function commitPole(): void {
    if (state.input.kind !== "pole") return;
    const r = Math.max(MIN_POLE_R, Math.min(MAX_POLE_R, Number(rInput.value)));
    const th = Number(thInput.value);
    const order = orderSel.value === "2" ? 2 : 1;
    commit({ ...state, input: { kind: "pole", re: r * Math.cos(th), im: r * Math.sin(th), order } });
  }
  rInput.addEventListener("input", commitPole);
  thInput.addEventListener("input", commitPole);
  orderSel.addEventListener("change", commitPole);
  window.addEventListener("resize", render);

  history.replaceState(null, "", encodeFaberState(state));
  render();
}

if (typeof document !== "undefined") main();
