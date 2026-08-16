// main.ts — the Faber transform visualizer entry point. Builds the two-panel DOM imperatively (no
// framework, matching the sibling apps). Each panel layers a WebGL phase-portrait canvas (the shared
// @cas/gpu colorAt) under a 2-D overlay canvas (axes, ∂𝔻/∂K, markers); a CPU phase portrait is the
// fallback when WebGL2 is unavailable. Two exact input families: a monomial zⁿ (→ Fₙ) and a pole
// 1/(z−z₀)^k with |z₀|>1 (→ the closed-form rational image, pole at φ(z₀)∈Ω), both labelled `=`.
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import { formatFaberPoly } from "@cas/faber";
import { PHI_PRESETS, phiPresetById } from "./presets.js";
import {
  boundaryK,
  evalRational,
  monomialTaylor,
  poleImage,
  poleImageRational,
  poleInputRational,
  polynomialRational,
  transformCoeffs,
} from "./faber.js";
import type { Rational } from "./faber.js";
import {
  BASE_HALF,
  drawAxes,
  drawDot,
  drawPolyline,
  panTo,
  planeMap,
  viewPxToWorld,
  zoomAboutCursor,
} from "./render/plane.js";
import type { Vec2, Viewport } from "./render/plane.js";
import { fillPhasePortrait } from "./render/coloring.js";
import { createGpuRenderer } from "./render/gpu.js";
import type { GpuRenderer } from "./render/gpu.js";
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
const PANEL_BG: readonly [number, number, number] = [22, 24, 30];

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
function fit2d(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height || rect.width));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { ctx, w, h };
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

function defaultInput(kind: InputState["kind"]): InputState {
  return kind === "monomial"
    ? { kind: "monomial", degree: 3 }
    : { kind: "pole", re: 1.6, im: 0.8, order: 1 };
}

/** One panel: a WebGL canvas (phase portrait) under a 2-D overlay canvas (axes / curves / markers). */
interface Panel {
  readonly gl: HTMLCanvasElement;
  readonly ov: HTMLCanvasElement;
  renderer: GpuRenderer | null;
}

function makePanel(title: string): { panel: Panel; el: HTMLElement } {
  const gl = elt("canvas", { class: "gl" });
  const ov = elt("canvas", { class: "ov" });
  const stage = elt("div", { class: "stage" });
  stage.append(gl, ov);
  const box = elt("div", { class: "panel" });
  box.append(elt("h2", {}, title), stage);
  return { panel: { gl, ov, renderer: null }, el: box };
}

function paintPanel(
  panel: Panel,
  view: Viewport,
  rat: Rational,
  maskDisk: boolean,
  overlay: Vec2[],
  overlayColor: string,
  markers: Marker[],
): void {
  const ov = fit2d(panel.ov);
  if (!ov) return;
  const map = planeMap(view, ov.w, ov.h);
  if (panel.renderer) {
    panel.renderer.render(view, rat.num, rat.den, maskDisk);
    ov.ctx.clearRect(0, 0, ov.w, ov.h); // transparent overlay above the GL portrait
  } else {
    fillPhasePortrait(ov.ctx, map, (w) => {
      if (maskDisk && w[0] * w[0] + w[1] * w[1] >= 1) return null;
      return evalRational(rat, { re: w[0], im: w[1] });
    });
  }
  drawAxes(ov.ctx, map, AXIS_COLORS);
  drawPolyline(ov.ctx, map, overlay, { color: overlayColor, width: 1.8 });
  for (const m of markers) drawDot(ov.ctx, map, m.w, m.color, 4);
}

function main(): void {
  const root = document.getElementById("app");
  if (!root) return;

  let state: FaberViewState = decodeFaberState(window.location.hash) ?? DEFAULT_VIEW_STATE;
  root.replaceChildren();

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

  const left = makePanel("f(z) on the unit disk  𝔻");
  const right = makePanel("Φφ(f)(w) on K");
  const panels = elt("div", { class: "panels" });
  panels.append(left.el, right.el);
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

  const degInput = elt("input", { id: "deg", type: "range", min: String(MIN_DEGREE), max: "12", step: "1" });
  const degLabel = elt("label", { for: "deg" }, "degree n");
  const degCtl = elt("div", { class: "control" });
  degCtl.append(degLabel, degInput);

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

  // GPU renderers (null ⇒ CPU fallback). Created after the panels are in the DOM (need a sized canvas).
  left.panel.renderer = createGpuRenderer(left.panel.gl, PANEL_BG);
  right.panel.renderer = createGpuRenderer(right.panel.gl, PANEL_BG);

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
      paintPanel(left.panel, state.zView, polynomialRational(monomialTaylor(n)), true, unitCircle(), "rgba(255,255,255,0.55)", []);
      const coeffs = transformCoeffs(map, monomialTaylor(n));
      paintPanel(right.panel, state.wView, polynomialRational(coeffs), false, boundaryK(map), "rgba(255,255,255,0.75)", []);
      readoutBody.textContent = `Φφ(z^${n})(w) = ${formatFaberPoly(coeffs, { varSym: "w" })}`;
    } else {
      const z0: Cx = { re: state.input.re, im: state.input.im };
      const order = state.input.order;
      paintPanel(left.panel, state.zView, poleInputRational(z0, order), true, unitCircle(), "rgba(255,255,255,0.55)", []);
      const img = poleImage(map, z0, order);
      paintPanel(
        right.panel,
        state.wView,
        poleImageRational(img, order),
        false,
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

  // Update state + repaint immediately; write the permalink on a trailing debounce so a drag / slider
  // sweep doesn't thrash history.replaceState.
  let hashTimer = 0;
  function commit(next: FaberViewState): void {
    state = next;
    render();
    if (hashTimer) window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(
      () => history.replaceState(null, "", encodeFaberState(state)),
      200,
    );
  }

  // --- Pan / zoom (per panel; the overlay canvas is on top and receives pointer events) --------------
  const viewOf = (which: "zView" | "wView"): Viewport => (which === "zView" ? state.zView : state.wView);
  const withView = (which: "zView" | "wView", vp: Viewport): FaberViewState =>
    which === "zView" ? { ...state, zView: vp } : { ...state, wView: vp };

  function pointerFrac(canvas: HTMLCanvasElement, e: PointerEvent | WheelEvent): {
    fx: number;
    fyTop: number;
    aspect: number;
  } {
    const r = canvas.getBoundingClientRect();
    return {
      fx: (e.clientX - r.left) / Math.max(1, r.width),
      fyTop: (e.clientY - r.top) / Math.max(1, r.height),
      aspect: r.width / Math.max(1, r.height),
    };
  }

  function attachNav(canvas: HTMLCanvasElement, which: "zView" | "wView"): void {
    let grab: Vec2 | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      const f = pointerFrac(canvas, e);
      grab = viewPxToWorld(viewOf(which), f.fx, f.fyTop, f.aspect);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (grab === null) return;
      const f = pointerFrac(canvas, e);
      commit(withView(which, panTo(viewOf(which), grab, f.fx, f.fyTop, f.aspect)));
    });
    const end = (e: PointerEvent): void => {
      grab = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const f = pointerFrac(canvas, e);
        const factor = Math.exp(-e.deltaY * 0.0015);
        commit(withView(which, zoomAboutCursor(viewOf(which), f.fx, f.fyTop, f.aspect, viewOf(which).zoom * factor)));
      },
      { passive: false },
    );
  }
  attachNav(left.panel.ov, "zView");
  attachNav(right.panel.ov, "wView");

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
