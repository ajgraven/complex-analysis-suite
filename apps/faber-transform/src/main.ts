// main.ts — the Faber transform visualizer entry point. Builds the two-panel DOM imperatively (no
// framework, matching the sibling apps). Each panel layers a WebGL phase-portrait canvas (the shared
// @cas/gpu colorAt) under a 2-D overlay canvas (axes, ∂𝔻/∂K/equipotential, markers); a CPU phase
// portrait is the fallback when WebGL2 is unavailable, and the path for free-form f. Three input
// families: a monomial zⁿ (→ Fₙ, exact), a pole 1/(z−z₀)^k (→ closed-form rational image, exact), and
// a free-form f(z) via @cas/expr (→ Σ_{n≤N} bₙ Fₙ, a truncated series, ≈ — with the convergence
// equipotential Γ_R drawn).
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import { formatFaberPoly } from "@cas/faber";
import { F_PRESETS, MENU_PRESETS, phiPresetById } from "./presets.js";
import {
  boundaryK,
  compileExprF,
  evalRational,
  exprToRational,
  monomialTaylor,
  poleImage,
  poleImageRational,
  poleInputRational,
  polynomialRational,
  radiusOfConvergence,
  taylorAdaptive,
  transformCoeffs,
  transformRational,
  transformRoots,
  trimTail,
} from "./faber.js";
import type { Rational } from "./faber.js";
import { seriesOfExpr } from "./series.js";
import {
  BASE_HALF,
  drawAxes,
  drawDot,
  drawPolyline,
  drawRootMarker,
  panTo,
  planeMap,
  tracePolygon,
  viewPxToWorld,
  zoomAboutCursor,
} from "./render/plane.js";
import type { Vec2, Viewport } from "./render/plane.js";
import { fillPhasePortrait, DEFAULT_COLORING } from "./render/coloring.js";
import type { ColoringOptions } from "./render/coloring.js";
import { createGpuRenderer } from "./render/gpu.js";
import type { GpuRenderer } from "./render/gpu.js";
import {
  DEFAULT_VIEW_STATE,
  MAX_DEGREE,
  MIN_DEGREE,
  MAX_POLE_R,
  MIN_POLE_R,
  MAX_TRUNCATION,
  MIN_TRUNCATION,
  MAX_EXPR_LEN,
  decodeFaberState,
  encodeFaberState,
} from "./viewState.js";
import type { FaberViewState, InputState } from "./viewState.js";
import "./styles/main.css";

const AXIS_COLORS = { grid: "rgba(255,255,255,0.06)", axis: "rgba(255,255,255,0.16)" };
const PANEL_BG: readonly [number, number, number] = [22, 24, 30];
const STAGE_BG = "#16181f"; // must match .stage background so the masked-out region is seamless
const K_COLOR = "rgba(255,255,255,0.75)";
const DISK_COLOR = "rgba(255,255,255,0.55)";

interface Marker {
  readonly w: Vec2;
  readonly color: string;
}
interface Curve {
  readonly pts: Vec2[];
  readonly color: string;
  readonly width?: number;
  readonly dash?: number[];
}
type Source = { readonly kind: "rational"; readonly rat: Rational } | { readonly kind: "fn"; readonly g: (z: Cx) => Cx };

interface PanelModel {
  readonly source: Source;
  /** Grey out |z| ≥ 1 (the unit-disk panel). */
  readonly maskDisk: boolean;
  /** Clip the render to this closed world polygon (the K-side panel → ∂K); undefined = no clip. */
  readonly clip?: Vec2[];
  readonly curves: Curve[];
  readonly markers: Marker[];
  readonly roots: Vec2[];
}
interface RenderModel {
  readonly left: PanelModel;
  readonly right: PanelModel;
  readonly badge: string;
  readonly readout: string;
  readonly error: boolean;
}

function unitCircle(samples = 256): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    pts.push([Math.cos(t), Math.sin(t)]);
  }
  return pts;
}

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
  if (kind === "monomial") return { kind: "monomial", degree: 3 };
  if (kind === "pole") return { kind: "pole", re: 1.6, im: 0.8, order: 1 };
  return { kind: "expr", expr: "1/(z - 2)", N: 32 };
}

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

function paintPanel(panel: Panel, view: Viewport, m: PanelModel, coloring: ColoringOptions): void {
  const ov = fit2d(panel.ov);
  if (!ov) return;
  const map = planeMap(view, ov.w, ov.h);
  const ctx = ov.ctx;
  if (m.source.kind === "rational" && panel.renderer) {
    // GPU portrait on the gl canvas behind. The overlay masks it to the clip polygon: paint the overlay
    // background everywhere, then punch a hole inside the clip so the portrait shows through only there.
    panel.renderer.render(view, m.source.rat.num, m.source.rat.den, m.maskDisk, coloring);
    ctx.clearRect(0, 0, ov.w, ov.h);
    if (m.clip) {
      ctx.save();
      ctx.fillStyle = STAGE_BG;
      ctx.fillRect(0, 0, ov.w, ov.h);
      ctx.globalCompositeOperation = "destination-out";
      tracePolygon(ctx, map, m.clip);
      ctx.fill();
      ctx.restore();
    }
  } else {
    // CPU portrait drawn on the overlay itself; then keep only the clip interior.
    const src = m.source;
    const g = src.kind === "rational" ? (w: Vec2): Cx => evalRational(src.rat, { re: w[0], im: w[1] }) : (w: Vec2): Cx => src.g({ re: w[0], im: w[1] });
    fillPhasePortrait(
      ctx,
      map,
      (w) => {
        if (m.maskDisk && w[0] * w[0] + w[1] * w[1] >= 1) return null;
        return g(w);
      },
      { coloring },
    );
    if (m.clip) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      tracePolygon(ctx, map, m.clip);
      ctx.fill();
      ctx.restore();
    }
  }
  drawAxes(ctx, map, AXIS_COLORS);
  for (const c of m.curves) drawPolyline(ctx, map, c.pts, { color: c.color, width: c.width ?? 1.8, dash: c.dash });
  for (const r of m.roots) drawRootMarker(ctx, map, r);
  for (const mk of m.markers) drawDot(ctx, map, mk.w, mk.color, 4);
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
  for (const p of MENU_PRESETS) phiSel.append(elt("option", { value: p.id }, p.name));
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
    elt("option", { value: "expr" }, "Free-form  f(z)"),
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

  const exprList = elt("datalist", { id: "fpresets" });
  for (const s of F_PRESETS) exprList.append(elt("option", { value: s }));
  const exprInput = elt("input", { id: "expr", type: "text", list: "fpresets", spellcheck: "false", autocomplete: "off" });
  const exprCtl = elt("div", { class: "control control-wide" });
  exprCtl.append(elt("label", { for: "expr" }, "f(z) ="), exprInput, exprList);

  const truncInput = elt("input", { id: "trunc", type: "range", min: String(MIN_TRUNCATION), max: String(MAX_TRUNCATION), step: "1" });
  const truncLabel = elt("label", { for: "trunc" }, "series order N");
  const truncCtl = elt("div", { class: "control" });
  truncCtl.append(truncLabel, truncInput);

  const rootsInput = elt("input", { id: "showroots", type: "checkbox" });
  const rootsCtl = elt("div", { class: "control control-check" });
  rootsCtl.append(rootsInput, elt("label", { for: "showroots" }, "Faber roots"));

  // Coloring style: an enhancement overlay, a modulus→lightness transfer, and (for the grid/sector
  // overlays) a density, all applied to both the GPU and CPU phase portraits.
  const enhSel = elt("select", { id: "enh" });
  for (const [v, name] of [
    ["0", "none (flat hue)"],
    ["1", "modulus rings"],
    ["2", "phase sectors"],
    ["3", "conformal grid"],
    ["4", "polar chessboard"],
    ["5", "Re/Im grid"],
  ] as const) {
    enhSel.append(elt("option", { value: v }, name));
  }
  const enhCtl = elt("div", { class: "control" });
  enhCtl.append(elt("label", { for: "enh" }, "enhancement"), enhSel);

  const modSel = elt("select", { id: "mod" });
  for (const [v, name] of [
    ["0", "constant"],
    ["1", "linear"],
    ["2", "rational"],
    ["3", "log"],
    ["4", "log-log"],
  ] as const) {
    modSel.append(elt("option", { value: v }, name));
  }
  const modCtl = elt("div", { class: "control" });
  modCtl.append(elt("label", { for: "mod" }, "modulus → lightness"), modSel);

  const secInput = elt("input", { id: "sectors", type: "range", min: "2", max: "24", step: "1" });
  const secLabel = elt("label", { for: "sectors" }, "density");
  const secCtl = elt("div", { class: "control" });
  secCtl.append(secLabel, secInput);

  const crispInput = elt("input", { id: "crisp", type: "checkbox" });
  const crispCtl = elt("div", { class: "control control-check" });
  crispCtl.append(crispInput, elt("label", { for: "crisp" }, "crisp lines"));

  controls.append(phiCtl, shapeCtl, modeCtl, degCtl, rCtl, thCtl, orderCtl, exprCtl, truncCtl, rootsCtl, enhCtl, modCtl, secCtl, crispCtl);
  root.append(controls);

  const readout = elt("div", { class: "readout" });
  const exactBadge = elt("span", { class: "badge-exact" }, "=");
  const readoutBody = elt("span", {});
  readout.append(exactBadge, readoutBody);
  root.append(readout);

  left.panel.renderer = createGpuRenderer(left.panel.gl, PANEL_BG);
  right.panel.renderer = createGpuRenderer(right.panel.gl, PANEL_BG);

  // --- Model (depends on φ + input, NOT the views, so pan/zoom skips the recompute) -----------------
  let model: RenderModel | null = null;
  let modelKey = "";

  function computeModel(): RenderModel {
    const preset = phiPresetById(state.phi);
    const map = preset.build(state.shape);
    // Polygon domains carry a TRUNCATED exterior SC series, so their φ (and everything derived from it) is
    // ≈, not exact — downgrade the `=` badge and note it (plan §6). Closed-form domains stay exact.
    const approx = preset.approximate === true;
    const exactBadge = approx ? "≈" : "=";
    const domainNote = approx ? "  ·  φ: truncated Schwarz–Christoffel series (≈)" : "";
    const diskCurve: Curve = { pts: unitCircle(), color: DISK_COLOR };
    const kCurve: Curve = { pts: boundaryK(map), color: K_COLOR };
    const showRoots = state.showRoots !== false;
    const rootMarks = (num: Cx[]): Vec2[] => (showRoots ? transformRoots(num).map((r): Vec2 => [r.re, r.im]) : []);

    if (state.input.kind === "monomial") {
      const n = state.input.degree;
      const coeffs = transformCoeffs(map, monomialTaylor(n));
      return {
        left: { source: { kind: "rational", rat: polynomialRational(monomialTaylor(n)) }, maskDisk: true, curves: [diskCurve], markers: [], roots: [] },
        right: { source: { kind: "rational", rat: polynomialRational(coeffs) }, maskDisk: false, clip: kCurve.pts, curves: [kCurve], markers: [], roots: rootMarks(coeffs) },
        badge: exactBadge,
        readout: `Φφ(z^${n})(w) ${approx ? "≈" : "="} ${formatFaberPoly(coeffs, { varSym: "w" })}${domainNote}`,
        error: false,
      };
    }
    if (state.input.kind === "pole") {
      const z0: Cx = { re: state.input.re, im: state.input.im };
      const order = state.input.order;
      const img = poleImage(map, z0, order);
      const rightRat = poleImageRational(img, order);
      const kexp = order === 1 ? "" : `^${order}`;
      return {
        left: { source: { kind: "rational", rat: poleInputRational(z0, order) }, maskDisk: true, curves: [diskCurve], markers: [], roots: [] },
        right: {
          source: { kind: "rational", rat: rightRat },
          maskDisk: false,
          clip: kCurve.pts,
          curves: [kCurve],
          markers: [{ w: [img.poleAt.re, img.poleAt.im], color: "#ffffff" }],
          roots: rootMarks(rightRat.num),
        },
        badge: exactBadge,
        readout:
          `Φφ(1/(z−z₀)${kexp})(w): image pole at w = φ(z₀) = ${fmt(img.poleAt)}` +
          (order === 1 ? `,  residue φ'(z₀) = ${fmt(img.terms[0])}` : "") +
          domainNote,
        error: false,
      };
    }
    // expr
    const compiled = compileExprF(state.input.expr);
    const blankPanel: PanelModel = { source: { kind: "fn", g: () => ({ re: 0, im: 0 }) }, maskDisk: false, curves: [], markers: [], roots: [] };
    if ("error" in compiled) {
      return { left: blankPanel, right: blankPanel, badge: "⚠", readout: `parse error: ${compiled.error}`, error: true };
    }
    const leftFn: PanelModel = { source: { kind: "fn", g: compiled.fn }, maskDisk: true, curves: [diskCurve], markers: [], roots: [] };

    // Exact path when f is a rational function of z (any poles, any orders) analytic on the disk.
    const ratIn = exprToRational(state.input.expr);
    if (ratIn) {
      try {
        const image = transformRational(map, ratIn);
        return {
          left: leftFn,
          right: { source: { kind: "rational", rat: image }, maskDisk: false, clip: kCurve.pts, curves: [kCurve], markers: [], roots: rootMarks(image.num) },
          badge: exactBadge,
          readout: `Φφ(f)(w) ${approx ? "≈" : "="} ${approx ? "rational image on K" : "exact rational image on K"}  ·  ${Math.max(0, image.den.length - 1)} image pole(s) at φ(z_j) ∈ Ω (outside K)${domainNote}`,
          error: false,
        };
      } catch (e) {
        return { left: blankPanel, right: blankPanel, badge: "⚠", readout: e instanceof Error ? e.message : "f is not analytic on the unit disk", error: true };
      }
    }

    const N = state.input.N;
    // Coefficients bₙ: exact power-series arithmetic when the expression is in the closed-form analytic
    // library (exp/log/sin/…), else the adaptive-radius FFT. Both feed the SAME truncated Faber sum.
    const exact = seriesOfExpr(state.input.expr, N);
    const bRaw = exact ?? taylorAdaptive(compiled.fn, N).coeffs;
    const b = trimTail(bRaw); // drop the noise-dominated tail before summing
    const effN = b.length - 1;
    const poly = transformCoeffs(map, b);
    const R = radiusOfConvergence(bRaw);
    // The right panel is masked to K, which sits well inside the convergence region, so the truncation is
    // shown only where it converges fastest — R is reported but the equipotential curve is not drawn.
    let rNote: string;
    if (!Number.isFinite(R)) rNote = "f entire — converges throughout K";
    else if (R < 1) rNote = `⚠ R ≈ ${R.toFixed(3)} < 1: f looks singular inside the unit disk`;
    else rNote = `radius of convergence R ≈ ${R.toFixed(3)} (K sits well inside)`;
    const coeffNote = exact ? "exact Taylor coefficients" : "coefficients by adaptive FFT sampling";
    const orderNote = exact ? "" : effN < N ? ` (coefficients past n=${effN} below the noise floor)` : "";
    return {
      left: leftFn,
      right: { source: { kind: "rational", rat: polynomialRational(poly) }, maskDisk: false, clip: kCurve.pts, curves: [kCurve], markers: [], roots: rootMarks(poly) },
      badge: "≈",
      readout: `Φφ(f) ≈ Σ_{n≤${effN}} bₙ Fₙ  ·  ${coeffNote}${orderNote}  ·  ${rNote}${domainNote}`,
      error: false,
    };
  }

  function syncControls(): void {
    const preset = phiPresetById(state.phi);
    phiSel.value = preset.id;
    rootsInput.checked = state.showRoots !== false;
    if (preset.shape) {
      shapeCtl.style.display = "";
      shapeInput.min = String(preset.shape.min);
      shapeInput.max = String(preset.shape.max);
      shapeInput.value = String(state.shape);
      shapeLabel.textContent = `${preset.shape.label} = ${state.shape.toFixed(2)}`;
    } else {
      shapeCtl.style.display = "none";
    }
    const col = state.coloring ?? DEFAULT_COLORING;
    enhSel.value = String(col.enhance);
    modSel.value = String(col.modulus);
    secInput.value = String(col.sectors);
    crispInput.checked = col.crisp;
    // Density only bites on the sector/grid overlays; disable it (and crisp lines) when they don't apply.
    const densityUsed = col.enhance >= 2;
    secCtl.style.display = densityUsed ? "" : "none";
    crispCtl.style.display = col.enhance !== 0 ? "" : "none";
    secLabel.textContent = `density = ${col.sectors}`;
    modeSel.value = state.input.kind;
    const kind = state.input.kind;
    degCtl.style.display = kind === "monomial" ? "" : "none";
    rCtl.style.display = kind === "pole" ? "" : "none";
    thCtl.style.display = kind === "pole" ? "" : "none";
    orderCtl.style.display = kind === "pole" ? "" : "none";
    exprCtl.style.display = kind === "expr" ? "" : "none";
    truncCtl.style.display = kind === "expr" ? "" : "none";
    if (state.input.kind === "monomial") {
      degInput.value = String(state.input.degree);
      degLabel.textContent = `degree n = ${state.input.degree}`;
    } else if (state.input.kind === "pole") {
      const { re, im, order } = state.input;
      rInput.value = String(Math.hypot(re, im));
      let th = Math.atan2(im, re);
      if (th < 0) th += 2 * Math.PI;
      thInput.value = String(th);
      orderSel.value = String(order);
      rLabel.textContent = `|z₀| = ${Math.hypot(re, im).toFixed(2)}`;
      thLabel.textContent = `arg z₀ = ${th.toFixed(2)}`;
    } else {
      if (document.activeElement !== exprInput) exprInput.value = state.input.expr;
      truncInput.value = String(state.input.N);
      truncLabel.textContent = `series order N = ${state.input.N}`;
    }
  }

  function render(): void {
    const key = JSON.stringify({ phi: state.phi, shape: state.shape, input: state.input, showRoots: state.showRoots });
    if (key !== modelKey || model === null) {
      model = computeModel();
      modelKey = key;
    }
    exactBadge.textContent = model.badge;
    readoutBody.textContent = model.readout;
    syncControls();
    if (model.error) return; // keep the last good render; show the parse error
    const coloring = state.coloring ?? DEFAULT_COLORING;
    paintPanel(left.panel, state.zView, model.left, coloring);
    paintPanel(right.panel, state.wView, model.right, coloring);
  }

  let hashTimer = 0;
  function commit(next: FaberViewState): void {
    state = next;
    render();
    if (hashTimer) window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => history.replaceState(null, "", encodeFaberState(state)), 200);
  }

  // --- Pan / zoom (per panel; the overlay canvas is on top and receives pointer events) --------------
  const viewOf = (which: "zView" | "wView"): Viewport => (which === "zView" ? state.zView : state.wView);
  const withView = (which: "zView" | "wView", vp: Viewport): FaberViewState =>
    which === "zView" ? { ...state, zView: vp } : { ...state, wView: vp };

  function pointerFrac(canvas: HTMLCanvasElement, e: PointerEvent | WheelEvent): { fx: number; fyTop: number; aspect: number } {
    const r = canvas.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / Math.max(1, r.width), fyTop: (e.clientY - r.top) / Math.max(1, r.height), aspect: r.width / Math.max(1, r.height) };
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

  // --- Control events -------------------------------------------------------
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
    const k = modeSel.value;
    const kind = k === "pole" ? "pole" : k === "expr" ? "expr" : "monomial";
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

  let exprTimer = 0;
  function commitExpr(): void {
    if (state.input.kind !== "expr") return;
    const expr = exprInput.value.slice(0, MAX_EXPR_LEN);
    const N = state.input.N;
    if (exprTimer) window.clearTimeout(exprTimer);
    exprTimer = window.setTimeout(() => commit({ ...state, input: { kind: "expr", expr, N } }), 180);
  }
  exprInput.addEventListener("input", commitExpr);
  truncInput.addEventListener("input", () => {
    if (state.input.kind !== "expr") return;
    const N = Math.max(MIN_TRUNCATION, Math.min(MAX_TRUNCATION, Math.round(Number(truncInput.value))));
    commit({ ...state, input: { kind: "expr", expr: state.input.expr, N } });
  });
  rootsInput.addEventListener("change", () => commit({ ...state, showRoots: rootsInput.checked }));

  const withColoring = (patch: Partial<ColoringOptions>): FaberViewState => ({
    ...state,
    coloring: { ...(state.coloring ?? DEFAULT_COLORING), ...patch },
  });
  enhSel.addEventListener("change", () => commit(withColoring({ enhance: Number(enhSel.value) })));
  modSel.addEventListener("change", () => commit(withColoring({ modulus: Number(modSel.value) })));
  secInput.addEventListener("input", () => commit(withColoring({ sectors: Math.max(2, Math.min(64, Math.round(Number(secInput.value)))) })));
  crispInput.addEventListener("change", () => commit(withColoring({ crisp: crispInput.checked })));

  window.addEventListener("resize", render);

  history.replaceState(null, "", encodeFaberState(state));
  render();
}

if (typeof document !== "undefined") main();
