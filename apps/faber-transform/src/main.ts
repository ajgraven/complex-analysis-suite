// main.ts — the Faber transform visualizer entry point. Builds the two-panel DOM imperatively (no
// framework, matching the sibling apps). Each panel layers a WebGL phase-portrait canvas (the shared
// @cas/gpu colorAt) under a 2-D overlay canvas (axes, ∂𝔻/∂K/equipotential, markers); a CPU phase
// portrait is the fallback when WebGL2 is unavailable, and the path for free-form f. Three input
// families: a monomial zⁿ (→ Fₙ, exact), a pole 1/(z−z₀)^k (→ closed-form rational image, exact), and
// a free-form f(z) via @cas/expr (→ Σ_{n≤N} bₙ Fₙ, a truncated series, ≈ — with the radius of
// convergence R reported; K sits well inside it, so the convergence equipotential itself is not drawn).
import { Complex, orientCCW } from "@cas/core";
import type { Cx } from "@cas/core";
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import { formatFaberPoly } from "@cas/faber";
import { interiorAngles } from "@cas/conformal";
import { F_PRESETS, MENU_PRESETS, phiPresetById } from "./presets.js";
import { cornerNorms, polygonMap, type CornerNorms, type PolygonMapResult } from "./polygon.js";
import { createPolygonEditor } from "./render/polygonEditor.js";
import { rawVertexFromHandleDrag } from "./handleEdit.js";
import { buildPhiFromExpr, univalentByAreaBound } from "./symbolicPhi.js";
import {
  boundaryK,
  compileExprF,
  evalPhi,
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
  weightedMonomialCoeffs,
} from "./faber.js";
import type { Rational } from "./faber.js";
import { seriesOfExpr } from "./series.js";
import {
  BASE_HALF,
  drawAxes,
  drawDot,
  drawHuePolyline,
  drawOutlinedDot,
  drawPolyline,
  drawRootMarker,
  panTo,
  planeMap,
  tracePolygon,
  viewPxToWorld,
  zoomAboutCursor,
} from "./render/plane.js";
import type { Vec2, Viewport, PlaneMap } from "./render/plane.js";
import { matchedBoundaryDots, transplantGrid, transplantResidual } from "./render/correspondence.js";
import { fillPhasePortrait, phaseColor, DEFAULT_COLORING } from "./render/coloring.js";
import type { ColoringOptions } from "./render/coloring.js";
import { computeCornerProfile, drawCornerProfile } from "./render/cornerProfile.js";
import type { CornerProfile } from "./render/cornerProfile.js";
import { createGpuRenderer } from "./render/gpu.js";
import type { GpuRenderer } from "./render/gpu.js";
import {
  CUSTOM_PHI,
  CUSTOM_FORMULA,
  DEFAULT_PHI_EXPR,
  DEFAULT_VIEW_STATE,
  MAX_DEGREE,
  MIN_DEGREE,
  MAX_POLE_R,
  MIN_POLE_R,
  MAX_TRUNCATION,
  MIN_TRUNCATION,
  GPU_COEFF_CAP,
  MAX_EXPR_LEN,
  MIN_SUPPRESS_M,
  MAX_SUPPRESS_M,
  DEFAULT_SUPPRESS_M,
  MAX_POLYGON_COORD,
  decodeFaberState,
  encodeFaberState,
} from "./viewState.js";
import type { FaberViewState, InputState } from "./viewState.js";

/** A default editor polygon (a pentagon) when the user first switches to the custom domain. */
const DEFAULT_CUSTOM_POLYGON: readonly (readonly [number, number])[] = Array.from({ length: 5 }, (_, k): [number, number] => {
  const t = Math.PI / 2 + (2 * Math.PI * k) / 5;
  return [Number((1.2 * Math.cos(t)).toFixed(3)), Number((1.2 * Math.sin(t)).toFixed(3))];
});
import { setMath, mathElt, PHI } from "./mathText.js";
import "./styles/main.css";

const AXIS_COLORS = { grid: "rgba(255,255,255,0.06)", axis: "rgba(255,255,255,0.16)" };
const PANEL_BG: readonly [number, number, number] = [22, 24, 30];
const STAGE_BG = "#16181f"; // must match .stage background so the masked-out region is seamless
const K_COLOR = "rgba(255,255,255,0.75)";
const DISK_COLOR = "rgba(255,255,255,0.55)";

interface Marker {
  readonly w: Vec2;
  readonly color: string;
  /** Draw with a dark outline (a correspondence dot over the portrait) instead of a plain filled dot. */
  readonly outlined?: boolean;
}
interface Curve {
  readonly pts: Vec2[];
  readonly color: string;
  readonly width?: number;
  readonly dash?: number[];
  /** Tint by boundary parameter θ (a hue ramp) instead of the flat `color` — the correspondence overlay. */
  readonly hue?: boolean;
}

/** Transplant-grid line styling: dashed equipotential rings, accent external rays, gold for the k=0 ray. */
const TRANSPLANT_RING = "rgba(255,255,255,0.32)";
const TRANSPLANT_RAY = "rgba(122,162,247,0.62)";
const TRANSPLANT_RAY0 = "rgba(255,212,121,0.92)";
/** Correspondence dot colour from its hue ∈ [0,1) (matches drawHuePolyline's ramp). */
const corrColor = (hue: number): string => `hsl(${(hue * 360).toFixed(1)}, 92%, 62%)`;
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
  /** Caption under the left panel — the input, e.g. `f(z) = z³` (mathText markup). */
  readonly inputCaption: string;
  /** Caption under the right panel — the transform, e.g. `Φᵩ(f)(w) = w³ − 1.275` (mathText markup). */
  readonly outputCaption: string;
  /** Domain / result facts shown as chips below the panels (mathText markup; a `⚠` marks a warning chip). */
  readonly domainChips?: readonly string[];
  readonly error: boolean;
  /**
   * A HARD failure that must paint the (blank) panels rather than keep the last good render — a degenerate
   * polygon fit, where leaving the previous image under a "⚠" badge would be misleading. A soft error (an
   * expr parse error mid-typing) leaves this false so the last good render is kept.
   */
  readonly blank?: boolean;
  /** The M3 corner-overshoot profile along ∂K (monomial input on a polygonal K); undefined ⇒ panel hidden. */
  readonly cornerProfile?: CornerProfile;
  /**
   * Draggable vertex-handle positions (world) on the right (K) panel — the canonical corners φ(wₖ) of a
   * CUSTOM polygon domain, for in-panel editing. Undefined for presets / a failed fit ⇒ no handles.
   */
  readonly rightHandles?: Vec2[];
}

const HANDLE_HIT_PX = 9; // pointer-to-handle grab radius on the K panel (px)

/** Draw the draggable vertex handles (dots) at world points on the K panel; `active` is highlighted. */
function drawHandles(ctx: CanvasRenderingContext2D, map: PlaneMap, handles: readonly Vec2[], active: number): void {
  for (let i = 0; i < handles.length; i++) {
    const [x, y] = map.toPx(handles[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = i === active ? "#ffd479" : "#eaf0ff";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.stroke();
    ctx.restore();
  }
}

/** Canvas fraction (fx from left, fyTop from top) of a world point under `view` — inverse of viewPxToWorld. */
function worldToFrac(view: Viewport, world: Vec2, aspect: number): { fx: number; fyTop: number } {
  const halfH = BASE_HALF / view.zoom;
  const halfW = halfH * aspect;
  return {
    fx: (world[0] - view.centerRe) / (2 * halfW) + 0.5,
    fyTop: 0.5 - (world[1] - view.centerIm) / (2 * halfH),
  };
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

/** A labeled control group: a small uppercase title over a flex-wrap body of the given controls. */
function ctrlGroup(title: string, kids: readonly HTMLElement[], cls = ""): HTMLElement {
  const g = elt("div", { class: `ctrl-group ${cls}`.trim() });
  g.append(mathElt("div", title, { class: "group-title" }));
  const body = elt("div", { class: "group-body" });
  body.append(...kids);
  g.append(body);
  return g;
}

/** Draw the phase-portrait colour key (hue = arg, brightness = |·|) using the app's own phaseColor. */
function drawColorKey(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const S = 54;
  canvas.width = Math.round(S * dpr);
  canvas.height = Math.round(S * dpr);
  canvas.style.width = `${S}px`;
  canvas.style.height = `${S}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const n = canvas.width;
  const img = ctx.createImageData(n, n);
  const c = n / 2;
  const R = c - dpr;
  const opts: ColoringOptions = { enhance: 0, sectors: 6, crisp: false, modulus: 1, modScale: 1 };
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const dx = px - c + 0.5;
      const dy = -(py - c + 0.5); // world y is up
      const rr = Math.hypot(dx, dy) / R;
      const idx = 4 * (py * n + px);
      if (rr > 1) {
        img.data[idx + 3] = 0;
        continue;
      }
      const th = Math.atan2(dy, dx);
      const [r, g, b] = phaseColor({ re: rr * Math.cos(th), im: rr * Math.sin(th) }, opts);
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * A compact header schematic: the disk 𝔻 (carrying f) — Φφ ⟶ — the bounded complement K (carrying Φφ f).
 * Purely decorative-but-orienting: it names the two panels and the operator between them at a glance.
 */
function makeSchematic(): HTMLElement {
  const wrap = elt("div", { class: "schematic", role: "img", "aria-label": "f on the disk D, mapped by the Faber transform to its image on K" });
  const disk = elt("div", { class: "sch-shape sch-disk" });
  disk.append(mathElt("span", "𝔻", { class: "sch-tag" }), mathElt("span", "f", { class: "sch-fn" }));
  const op = elt("div", { class: "sch-op" });
  op.append(mathElt("span", PHI, { class: "sch-phi" }), elt("span", { class: "sch-arrow" }, "⟶"));
  const k = elt("div", { class: "sch-shape sch-k" });
  k.append(mathElt("span", "K", { class: "sch-tag" }), mathElt("span", `${PHI}f`, { class: "sch-fn" }));
  wrap.append(disk, op, k);
  return wrap;
}

/** Render the domain/result chips into `container` (mathText markup; a `⚠` in the text marks a warning chip). */
function renderChips(container: HTMLElement, chips: readonly string[]): void {
  container.replaceChildren();
  for (const c of chips) {
    container.append(mathElt("span", c, { class: c.includes("⚠") ? "chip warn" : "chip" }));
  }
}

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
  // The GPU render layer sits behind the interactive `ov` overlay; hide it from the screen reader so only
  // the overlay (named + keyboard-operable via attachCanvasA11y in attachNav) is announced (ADR-0028, U2).
  gl.setAttribute("aria-hidden", "true");
  const stage = elt("div", { class: "stage" });
  stage.append(gl, ov);
  const box = elt("div", { class: "panel" });
  box.append(mathElt("h2", title), stage);
  return { panel: { gl, ov, renderer: null }, el: box };
}

function paintPanel(
  panel: Panel,
  view: Viewport,
  m: PanelModel,
  coloring: ColoringOptions,
  overlay?: (ctx: CanvasRenderingContext2D, map: PlaneMap) => void,
): void {
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
  for (const c of m.curves) {
    if (c.hue) drawHuePolyline(ctx, map, c.pts, { width: c.width ?? 2.4 });
    else drawPolyline(ctx, map, c.pts, { color: c.color, width: c.width ?? 1.8, dash: c.dash });
  }
  for (const r of m.roots) drawRootMarker(ctx, map, r);
  for (const mk of m.markers) {
    if (mk.outlined) drawOutlinedDot(ctx, map, mk.w, mk.color);
    else drawDot(ctx, map, mk.w, mk.color, 4);
  }
  if (overlay) overlay(ctx, map);
}

function main(): void {
  const root = document.getElementById("app");
  if (!root) return;

  let state: FaberViewState = decodeFaberState(window.location.hash) ?? DEFAULT_VIEW_STATE;
  root.replaceChildren();

  const head = elt("header", { class: "app-head" });
  const headText = elt("div", { class: "head-text" });
  headText.append(
    elt("h1", {}, "Faber Transform"),
    mathElt(
      "p",
      `The exterior Faber transform ${PHI} maps a function f analytic on the unit disk to Σ b_{n} F_{n}, ` +
        "analytic on the bounded complement K = ℂ∖Ω of an unbounded domain. Left: f on the disk. " +
        "Right: its image on K.",
    ),
  );
  head.append(headText, makeSchematic());
  root.append(head);

  const left = makePanel("f on the unit disk 𝔻");
  left.el.classList.add("side-left");
  const leftCaption = elt("div", { class: "caption" });
  left.el.append(leftCaption);

  const right = makePanel(`${PHI}(f) on K = ℂ∖Ω`);
  right.el.classList.add("side-right");
  const rightCaption = elt("div", { class: "caption" });
  const exactBadge = elt("span", { class: "badge-exact" }, "=");
  const outCaption = elt("span", {});
  rightCaption.append(exactBadge, outCaption);
  right.el.append(rightCaption);

  // The centre connector between the panels: the operator Φᵩ ▶ and a phase-portrait colour key drawn from
  // the app's own phaseColor (so it matches the plots). Rotates to a horizontal divider on narrow screens.
  const connector = elt("div", { class: "connector" });
  const colorKey = elt("canvas", { class: "color-key" });
  connector.append(
    mathElt("div", PHI, { class: "op" }),
    elt("div", { class: "op-arrow" }, "▶"),
    colorKey,
    mathElt("div", "hue = arg", { class: "key-cap" }),
    mathElt("div", "val = |·|", { class: "key-cap" }),
  );

  // --- Controls -------------------------------------------------------------
  const phiSel = elt("select", { id: "phi" });
  for (const p of MENU_PRESETS) phiSel.append(elt("option", { value: p.id }, p.name));
  phiSel.append(elt("option", { value: CUSTOM_PHI }, "Custom polygon (edit)…"));
  phiSel.append(elt("option", { value: CUSTOM_FORMULA }, "Custom φ (formula)…"));
  const phiCtl = elt("div", { class: "control" });
  phiCtl.append(mathElt("label", "map φ", { for: "phi" }), phiSel);

  // The custom-formula domain: a symbolic exterior map φ(z) = c·z + Σ cₖ z⁻ᵏ typed by the user (a simple
  // pole at ∞). Shown only when the domain is "Custom φ (formula)…". Mirrors the free-form f(z) field.
  const PHI_PRESETS = ["z + 0.5/z", "z + 0.4/z^2", "z + 0.2/z^4", "z + 0.15/z + 0.1/z^3", "z + (0.2 + 0.1*i)/z^2"];
  const phiExprList = elt("datalist", { id: "phipresets" });
  for (const s of PHI_PRESETS) phiExprList.append(elt("option", { value: s }));
  const phiExprInput = elt("input", { id: "phiexpr", type: "text", list: "phipresets", spellcheck: "false", autocomplete: "off" });
  const phiExprCtl = elt("div", { class: "control control-wide" });
  phiExprCtl.append(mathElt("label", "φ(z) =", { for: "phiexpr" }), phiExprInput, phiExprList);

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
  modeCtl.append(elt("label", { for: "mode" }, "family"), modeSel);

  const degInput = elt("input", { id: "deg", type: "range", min: String(MIN_DEGREE), max: String(MAX_DEGREE), step: "1" });
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

  // Corner suppression (M3): render the weighted Faber polynomial Q_{n,m} instead of Fₙ for a monomial input
  // on a polygonal K — flattening the corner overshoot. Shown only for polygon domains + monomial input.
  const suppressInput = elt("input", { id: "suppress", type: "checkbox" });
  const suppressCtl = elt("div", { class: "control control-check" });
  suppressCtl.append(suppressInput, mathElt("label", "suppress corners (Q_{n,m})", { for: "suppress" }));

  const mInput = elt("input", { id: "suppressm", type: "range", min: String(MIN_SUPPRESS_M), max: String(MAX_SUPPRESS_M), step: "1" });
  const mLabel = elt("label", { for: "suppressm" }, "strength m");
  const mCtl = elt("div", { class: "control" });
  mCtl.append(mLabel, mInput);

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

  // Boundary correspondence: hue-match ∂𝔻 and ∂K by θ (φ: e^{iθ} ↦ φ(e^{iθ})). Applies to any input.
  const bndryInput = elt("input", { id: "bndry", type: "checkbox" });
  const bndryCtl = elt("div", { class: "control control-check" });
  bndryCtl.append(bndryInput, mathElt("label", "∂𝔻 ↔ ∂K correspondence", { for: "bndry" }));

  // Transplant grid (monomial input): the disk's exterior polar grid carried through φ — the Fₙ∘φ ≈ zⁿ
  // property drawn as K's external rays + equipotentials. Shown only for a monomial f.
  const transplantInput = elt("input", { id: "transplant", type: "checkbox" });
  const transplantCtl = elt("div", { class: "control control-check" });
  transplantCtl.append(transplantInput, mathElt("label", "transplant grid (F_{n}∘φ ≈ z^{n})", { for: "transplant" }));

  // Workspace: each panel with the controls that shape it beneath — input-f under the left panel, the
  // domain (φ / K) under the right — and the Φᵩ connector + colour key between them.
  const inputGroup = ctrlGroup("Input  f", [modeCtl, degCtl, rCtl, thCtl, orderCtl, exprCtl, truncCtl, rootsCtl, suppressCtl, mCtl], "for-left");
  const domainGroup = ctrlGroup("Domain  K   ·   φ: 𝔻^{*} → Ω", [phiCtl, shapeCtl, phiExprCtl], "for-right");
  const workspace = elt("div", { class: "workspace" });
  workspace.append(left.el, connector, right.el, inputGroup, domainGroup);
  root.append(workspace);

  // Domain / result facts as chips (populated in render).
  const domainInfo = elt("div", { class: "domain-info" });
  root.append(domainInfo);

  // Coloring affects BOTH panels, so it's a full-width group below.
  const coloringGroup = ctrlGroup("Coloring", [enhCtl, modCtl, secCtl, crispCtl, bndryCtl, transplantCtl], "for-full");
  root.append(coloringGroup);

  // The polygon editor (shown only for the custom domain). Live drag redraws the editor; the expensive SC
  // refit + permalink write happen on release / button action (committed = true).
  const editor = createPolygonEditor((verts) => {
    commit({ ...state, phi: CUSTOM_PHI, customPolygon: verts });
  });
  const editorWrap = elt("div", { class: "poly-editor-wrap" });
  editorWrap.append(editor.el);
  root.append(editorWrap);

  // The M3 corner-overshoot profile (paper Fig. 2): |Fₙ| along ∂K, with |Q_{n,m}| overlaid when suppressing.
  // Shown only for a monomial input on a polygonal K (when computeModel attaches a cornerProfile).
  const profileWrap = elt("div", { class: "corner-profile-wrap" });
  const profileCaption = mathElt(
    "div",
    "Corner overshoot along ∂K — |φ^{−n}F_{n}| → 1 on the smooth arcs, → Λ_{k} at the corners",
    { class: "corner-profile-cap" },
  );
  const profileCanvas = elt("canvas", { class: "corner-profile" });
  profileWrap.append(profileCaption, profileCanvas);
  root.append(profileWrap);

  left.panel.renderer = createGpuRenderer(left.panel.gl, PANEL_BG);
  right.panel.renderer = createGpuRenderer(right.panel.gl, PANEL_BG);
  drawColorKey(colorKey); // static legend; hue = arg, brightness = |·|

  // --- Model (depends on φ + input, NOT the views, so pan/zoom skips the recompute) -----------------
  let model: RenderModel | null = null;
  let modelKey = "";

  // Custom-polygon domain: the exterior SC fit is a nonlinear solve, so cache it per distinct polygon (an
  // f-change reuses the same fit). `domainStatus` carries the last custom fit's converged/degraded flags
  // for the editor's status line.
  let customFit: { key: string; result: PolygonMapResult } | null = null;
  let domainStatus: { converged: boolean; degraded: boolean } | null = null;
  function getCustomMap(poly: readonly (readonly [number, number])[]): PolygonMapResult {
    const key = JSON.stringify(poly);
    if (!customFit || customFit.key !== key) customFit = { key, result: polygonMap(poly) };
    return customFit.result;
  }

  // A hard-failure panel: `g` returns a non-finite value so fillPhasePortrait paints the neutral panel
  // background (NOT a phase color) — a fit failure reads as blank, not a solid red field (arg 0 → red).
  const blankPanel: PanelModel = { source: { kind: "fn", g: () => ({ re: NaN, im: NaN }) }, maskDisk: false, curves: [], markers: [], roots: [] };

  function computeModel(): RenderModel {
    // Resolve the domain: a closed-form/regular preset, or the editor's custom polygon (fitted).
    let map;
    let approx: boolean;
    let cornerN: CornerNorms | undefined;
    let cornerImages: readonly Cx[] = []; // wₖ = 1/uₖ on |w|=1 (z-plane prevertices, NOT φ(zₖ)), for the M3 weighted Faber Q_{n,m}
    // Draggable in-panel handles: the canonical corners φ(wₖ) of a converged CUSTOM polygon (undefined otherwise).
    let handles: Vec2[] | undefined;
    // Domain facts shown as chips below the panels (name, capacity, exact/≈, corner-norm, univalence).
    let domainName = "";
    let univalent: boolean | null = null;
    if (state.phi === CUSTOM_FORMULA) {
      const built = buildPhiFromExpr(state.phiExpr ?? "");
      domainStatus = null;
      if ("error" in built) {
        // Soft error (like an f(z) parse error): keep the last good render, show the message in the caption.
        return { left: blankPanel, right: blankPanel, badge: "⚠", inputCaption: "", outputCaption: `⚠ φ error: ${built.error}`, error: true };
      }
      map = built.map;
      approx = !built.exact;
      cornerN = undefined;
      cornerImages = [];
      domainName = "custom φ";
      univalent = univalentByAreaBound(built.map);
    } else if (state.phi === CUSTOM_PHI && state.customPolygon) {
      const r = getCustomMap(state.customPolygon);
      domainStatus = { converged: r.converged, degraded: r.degraded };
      // A degenerate / self-intersecting polygon drives the exterior SC solve to a non-convergent or
      // non-finite map — don't paint garbage as an ordinary ≈ image (honesty guardrail); show a warning.
      // Require c > 0 (positive logarithmic capacity), not just finite: faberPolynomials / transformCoeffs /
      // weightedMonomialCoeffs throw for c ≤ 0 and (unlike the rational branch) aren't wrapped in try/catch, so
      // a converged-but-c≤0 fit would throw out of render() instead of taking the ⚠-blank path (WP8 / A4).
      const finite =
        Number.isFinite(r.map.c) && r.map.c > 0 && r.map.laurent.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im));
      if (!r.converged || !finite) {
        return { left: blankPanel, right: blankPanel, badge: "⚠", inputCaption: "", outputCaption: "⚠ polygon fit failed — the domain may be degenerate or self-intersecting", error: true, blank: true };
      }
      map = r.map;
      approx = true;
      cornerN = cornerNorms(interiorAngles(state.customPolygon.map((v): [number, number] => [v[0], v[1]])));
      cornerImages = r.cornerImages;
      // Corner positions on the drawn ∂K = φ(wₖ) — the handles the user grabs to reshape the polygon.
      handles = r.cornerImages.map((w): Vec2 => {
        const p = evalPhi(r.map, w);
        return [p.re, p.im];
      });
      domainName = "custom polygon";
    } else {
      const preset = phiPresetById(state.phi);
      map = preset.build(state.shape);
      approx = preset.approximate === true;
      cornerN = preset.cornerNorms;
      cornerImages = preset.cornerImages?.() ?? [];
      domainStatus = null;
      domainName = preset.name.split(" — ")[0]; // short label (drop the closed-form after the em dash)
    }
    // Polygon / formula domains carry a TRUNCATED series, so their φ (and everything from it) is ≈ not exact.
    const exactSym = approx ? "≈" : "=";
    // Base domain-info chips; the input branches append result-specific ones (poles, coefficient source, …).
    const domainChips: string[] = [domainName, `capacity c = ${Number(map.c.toPrecision(4))}`, approx ? "φ ≈ (truncated)" : "φ exact"];
    if (cornerN) domainChips.push(`max corner-norm Λ = ${cornerN.maxLambda.toFixed(2)}`);
    if (univalent !== null) domainChips.push(univalent ? "univalent ✓" : "⚠ may not be univalent");
    // Boundary correspondence overlay (input-independent): tint ∂𝔻 / ∂K by θ and drop matched dots at
    // even angles, so a point e^{iθ} and its image φ(e^{iθ}) read as the same colour across the panels.
    const hueBoundary = state.boundaryCorr === true;
    const diskCurve: Curve = { pts: unitCircle(), color: DISK_COLOR, hue: hueBoundary };
    const kCurve: Curve = { pts: boundaryK(map), color: K_COLOR, hue: hueBoundary };
    const corr = hueBoundary ? matchedBoundaryDots(map, 12) : null;
    const leftCorr: Marker[] = corr ? corr.disk.map((d): Marker => ({ w: d.w, color: corrColor(d.hue), outlined: true })) : [];
    const rightCorr: Marker[] = corr ? corr.k.map((d): Marker => ({ w: d.w, color: corrColor(d.hue), outlined: true })) : [];
    const showRoots = state.showRoots !== false;
    const rootMarks = (num: Cx[]): Vec2[] => (showRoots ? transformRoots(num).map((r): Vec2 => [r.re, r.im]) : []);
    // The GPU (and the CPU fallback, which reads the same source.rat) can only upload GPU_COEFF_CAP
    // coefficients per array, so a rational image above that degree renders truncated. Clamp num/den so
    // ALL paths agree (GPU · CPU · root markers · caption) and flag the truncation honestly (≈, not =).
    const capForGpu = (rat: Rational): { rat: Rational; truncated: boolean } => {
      if (rat.num.length <= GPU_COEFF_CAP && rat.den.length <= GPU_COEFF_CAP) return { rat, truncated: false };
      return {
        rat: { ...rat, num: rat.num.slice(0, GPU_COEFF_CAP), den: rat.den.slice(0, GPU_COEFF_CAP) },
        truncated: true,
      };
    };

    if (state.input.kind === "monomial") {
      const n = state.input.degree;
      // Corner suppression (M3): on a polygonal K, render Q_{n,m} = Σⱼ gⱼ F_{n−j} instead of Fₙ, flattening
      // the corner overshoot. Only when the toggle is on AND the domain actually has corner images.
      const suppress = state.suppressCorners === true && cornerImages.length > 0;
      const m = state.suppressStrength ?? DEFAULT_SUPPRESS_M;
      const coeffs = suppress ? weightedMonomialCoeffs(map, cornerImages, n, m) : transformCoeffs(map, monomialTaylor(n));
      const poly = formatFaberPoly(coeffs, { varSym: "w", sup: (k) => `^{${k}}` });
      const inputCaption = `f(z) = ${n === 0 ? "1" : n === 1 ? "z" : `z^{${n}}`}`;
      const outputCaption = suppress
        ? `${PHI}(f)(w) ≈ Q_{${n},${m}}(w) = ${poly}`
        : `${PHI}(f)(w) ${exactSym} ${poly}`;
      let chips = suppress ? [...domainChips, `corner-suppressed Q_{${n},${m}} (m = ${m})`] : domainChips;
      // Transplant overlay (Fₙ∘φ ≈ zⁿ): carry the disk's exterior polar grid through φ to K's external rays
      // + equipotentials, and report the honest residual max|Fₙ∘φ − zⁿ| on |z|=R (→ 0 as R grows).
      const diskGrid: Curve[] = [];
      const kGrid: Curve[] = [];
      if (state.transplant === true) {
        const tg = transplantGrid(map, n);
        for (const ring of tg.rings) {
          diskGrid.push({ pts: ring.disk, color: TRANSPLANT_RING, width: 1, dash: [4, 4] });
          kGrid.push({ pts: ring.k, color: TRANSPLANT_RING, width: 1, dash: [4, 4] });
        }
        tg.rays.forEach((ray, i) => {
          const color = i === 0 ? TRANSPLANT_RAY0 : TRANSPLANT_RAY;
          const width = i === 0 ? 1.8 : 1;
          diskGrid.push({ pts: ray.disk, color, width });
          kGrid.push({ pts: ray.k, color, width });
        });
        const faberCoeffs = suppress ? transformCoeffs(map, monomialTaylor(n)) : coeffs;
        const resid = transplantResidual(faberCoeffs, map, n, 1.6);
        const residTxt = !Number.isFinite(resid) ? "—" : resid < 1e-3 ? resid.toExponential(1) : resid.toFixed(3);
        chips = [...chips, `F_{${n}}∘φ = z^{${n}} + O(1/z)`, `max resid ${residTxt} on |z|=1.6`];
      }
      // On a polygonal K, plot the corner-overshoot profile |Fₙ| along ∂K (and |Q_{n,m}| when suppressing).
      const cornerProfile =
        cornerImages.length > 0
          ? computeCornerProfile(map, cornerImages, n, suppress ? m : null, cornerN?.maxLambda ?? 1)
          : undefined;
      return {
        left: { source: { kind: "rational", rat: polynomialRational(monomialTaylor(n)) }, maskDisk: true, curves: [...diskGrid, diskCurve], markers: leftCorr, roots: [] },
        right: { source: { kind: "rational", rat: polynomialRational(coeffs) }, maskDisk: false, clip: kCurve.pts, curves: [...kGrid, kCurve], markers: rightCorr, roots: rootMarks(coeffs) },
        badge: suppress ? "≈" : exactSym,
        inputCaption,
        outputCaption,
        domainChips: chips,
        error: false,
        cornerProfile,
        rightHandles: handles,
      };
    }
    if (state.input.kind === "pole") {
      const z0: Cx = { re: state.input.re, im: state.input.im };
      const order = state.input.order;
      const img = poleImage(map, z0, order);
      const rightRat = poleImageRational(img, order);
      const kexp = order === 1 ? "" : `^{${order}}`;
      return {
        left: { source: { kind: "rational", rat: poleInputRational(z0, order) }, maskDisk: true, curves: [diskCurve], markers: leftCorr, roots: [] },
        right: {
          source: { kind: "rational", rat: rightRat },
          maskDisk: false,
          clip: kCurve.pts,
          curves: [kCurve],
          markers: [{ w: [img.poleAt.re, img.poleAt.im], color: "#ffffff" }, ...rightCorr],
          roots: rootMarks(rightRat.num),
        },
        badge: exactSym,
        inputCaption: `f(z) = 1/(z − z_{0})${kexp}   ·   z_{0} = ${fmt(z0)}`,
        outputCaption:
          `${PHI}(f)(w): image pole at w = φ(z_{0}) = ${fmt(img.poleAt)}` +
          (order === 1 ? `,  residue φ'(z_{0}) = ${fmt(img.terms[0])}` : ""),
        domainChips,
        error: false,
        rightHandles: handles,
      };
    }
    // expr
    const compiled = compileExprF(state.input.expr);
    if ("error" in compiled) {
      return { left: blankPanel, right: blankPanel, badge: "⚠", inputCaption: `f(z) = ${state.input.expr}`, outputCaption: `⚠ parse error: ${compiled.error}`, error: true };
    }
    const leftFn: PanelModel = { source: { kind: "fn", g: compiled.fn }, maskDisk: true, curves: [diskCurve], markers: leftCorr, roots: [] };

    // Exact path when f is a rational function of z (any poles, any orders) analytic on the disk.
    const ratIn = exprToRational(state.input.expr);
    if (ratIn) {
      try {
        const image = transformRational(map, ratIn);
        const { rat, truncated } = capForGpu(image);
        return {
          left: leftFn,
          right: { source: { kind: "rational", rat }, maskDisk: false, clip: kCurve.pts, curves: [kCurve], markers: rightCorr, roots: rootMarks(rat.num) },
          badge: truncated ? "≈" : exactSym,
          inputCaption: `f(z) = ${state.input.expr}`,
          outputCaption: truncated
            ? `${PHI}(f)(w) ≈ rational image on K, truncated to degree ${GPU_COEFF_CAP - 1} (GPU cap)`
            : `${PHI}(f)(w) ${exactSym} ${approx ? "rational image on K" : "exact rational image on K"}`,
          domainChips: [...domainChips, `${Math.max(0, (truncated ? rat.den.length : image.den.length) - 1)} image pole(s) at φ(z_{j}) ∈ Ω`],
          error: false,
          rightHandles: handles,
        };
      } catch (e) {
        return { left: blankPanel, right: blankPanel, badge: "⚠", inputCaption: `f(z) = ${state.input.expr}`, outputCaption: `⚠ ${e instanceof Error ? e.message : "f is not analytic on the unit disk"}`, error: true };
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
    const orderNote = exact ? "" : effN < N ? ` (past n=${effN} below the noise floor)` : "";
    return {
      left: leftFn,
      right: { source: { kind: "rational", rat: polynomialRational(poly) }, maskDisk: false, clip: kCurve.pts, curves: [kCurve], markers: rightCorr, roots: rootMarks(poly) },
      badge: "≈",
      inputCaption: `f(z) = ${state.input.expr}`,
      outputCaption: `${PHI}(f) ≈ Σ_{n≤${effN}} b_{n} F_{n}`,
      domainChips: [...domainChips, `${coeffNote}${orderNote}`, rNote],
      error: false,
      rightHandles: handles,
    };
  }

  function syncControls(): void {
    const isCustom = state.phi === CUSTOM_PHI;
    const isFormula = state.phi === CUSTOM_FORMULA;
    phiSel.value = state.phi;
    rootsInput.checked = state.showRoots !== false;
    // The φ-formula field shows only for the custom-formula domain (don't clobber the box mid-edit).
    phiExprCtl.style.display = isFormula ? "" : "none";
    if (isFormula && document.activeElement !== phiExprInput) phiExprInput.value = state.phiExpr ?? "";
    const preset = isCustom || isFormula ? null : phiPresetById(state.phi);
    if (preset?.shape) {
      shapeCtl.style.display = "";
      shapeInput.min = String(preset.shape.min);
      shapeInput.max = String(preset.shape.max);
      shapeInput.value = String(state.shape);
      shapeLabel.textContent = `${preset.shape.label} = ${state.shape.toFixed(2)}`;
    } else {
      shapeCtl.style.display = "none";
    }
    // The polygon editor is shown only for the custom domain; reflect the last fit's honesty in its status.
    editorWrap.style.display = isCustom ? "" : "none";
    if (isCustom && domainStatus) {
      const { converged, degraded } = domainStatus;
      editor.setStatus(
        degraded ? "⚠ fit degraded (crowded corners)" : converged ? "fit ✓" : "⚠ fit did not converge",
        degraded || !converged,
      );
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
    bndryInput.checked = state.boundaryCorr === true;
    modeSel.value = state.input.kind;
    const kind = state.input.kind;
    // The transplant grid (Fₙ∘φ ≈ zⁿ) is defined for a monomial input only.
    transplantCtl.style.display = kind === "monomial" ? "" : "none";
    transplantInput.checked = state.transplant === true;
    degCtl.style.display = kind === "monomial" ? "" : "none";
    rCtl.style.display = kind === "pole" ? "" : "none";
    thCtl.style.display = kind === "pole" ? "" : "none";
    orderCtl.style.display = kind === "pole" ? "" : "none";
    exprCtl.style.display = kind === "expr" ? "" : "none";
    truncCtl.style.display = kind === "expr" ? "" : "none";
    // Corner suppression (M3) applies only to a monomial input on a polygonal K (one with corner images):
    // the polygon presets + a converged custom fit. The strength slider shows only when the toggle is on.
    const hasCorners = isCustom ? (domainStatus?.converged ?? false) : preset?.cornerImages !== undefined;
    const showSuppress = hasCorners && kind === "monomial";
    suppressCtl.style.display = showSuppress ? "" : "none";
    suppressInput.checked = state.suppressCorners === true;
    const mVal = state.suppressStrength ?? DEFAULT_SUPPRESS_M;
    mCtl.style.display = showSuppress && state.suppressCorners === true ? "" : "none";
    mInput.value = String(mVal);
    mLabel.textContent = `strength m = ${mVal}`;
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
    const key = JSON.stringify({
      phi: state.phi,
      shape: state.shape,
      input: state.input,
      showRoots: state.showRoots,
      customPolygon: state.customPolygon,
      phiExpr: state.phiExpr,
      suppressCorners: state.suppressCorners,
      suppressStrength: state.suppressStrength,
      boundaryCorr: state.boundaryCorr,
      transplant: state.transplant,
    });
    if (key !== modelKey || model === null) {
      model = computeModel();
      modelKey = key;
    }
    setMath(leftCaption, model.inputCaption);
    setMath(outCaption, model.outputCaption);
    exactBadge.textContent = model.badge;
    // State-coloured badge: exact `=` green, approximate `≈` accent-blue, warning `⚠` amber.
    exactBadge.className = "badge-exact " + (model.badge === "=" ? "is-exact" : model.badge === "⚠" ? "is-warn" : "is-approx");
    renderChips(domainInfo, model.domainChips ?? []);
    syncControls();
    // A soft error (expr parse mid-typing) keeps the last good render; a hard failure (a degenerate polygon
    // fit, `blank`) falls through to paint the blank panels so a "⚠" badge never sits over a stale image.
    if (model.error && !model.blank) return;
    const coloring = state.coloring ?? DEFAULT_COLORING;
    const rightHandles = model.rightHandles;
    const handleOverlay = rightHandles
      ? (ctx: CanvasRenderingContext2D, map: PlaneMap): void => drawHandles(ctx, map, rightHandles, -1)
      : undefined;
    paintPanel(left.panel, state.zView, model.left, coloring);
    paintPanel(right.panel, state.wView, model.right, coloring, handleOverlay);
    if (model.cornerProfile) {
      profileWrap.style.display = "";
      drawCornerProfile(profileCanvas, model.cornerProfile);
    } else {
      profileWrap.style.display = "none";
    }
  }

  let hashTimer = 0;
  function commit(next: FaberViewState): void {
    state = next;
    render();
    if (hashTimer) window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => history.replaceState(null, "", encodeFaberState(state)), 200);
  }

  // --- In-panel polygon editing (custom domain): drag a corner directly on the K panel ---------------
  // The K panel shows the CANONICAL polygon (centred/rotated/scaled by the SC fit), so a dragged corner is
  // mapped back to the raw editor vertex via the similarity (handleEdit.ts). The SC refit runs on release
  // (matching the separate editor's commit-on-release); the drag itself just previews a straight-edge outline.
  /** Live preview during a handle drag: repaint the frozen K portrait with the reshaped outline + handles. */
  function previewVertexDrag(index: number, world: Vec2): void {
    if (!model || !model.rightHandles) return;
    const pts = model.rightHandles.map((h, i): Vec2 => (i === index ? world : h));
    const coloring = state.coloring ?? DEFAULT_COLORING;
    paintPanel(right.panel, state.wView, model.right, coloring, (ctx, map) => {
      if (pts.length >= 2) {
        ctx.save();
        ctx.beginPath();
        const [x0, y0] = map.toPx(pts[0]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < pts.length; i++) {
          const [x, y] = map.toPx(pts[i]);
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(255,212,121,0.9)";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.restore();
      }
      drawHandles(ctx, map, pts, index);
    });
  }

  /** Commit a handle drag: map the cursor (canonical) back to a raw vertex, refit, and sync the editor. */
  function commitVertexDrag(index: number, world: Vec2): void {
    if (state.phi !== CUSTOM_PHI || !state.customPolygon || !model?.rightHandles) {
      render();
      return;
    }
    const raw = state.customPolygon.map((v): Vec2 => [v[0], v[1]]);
    const rawV = rawVertexFromHandleDrag(raw, model.rightHandles, world);
    if (!rawV || !Number.isFinite(rawV[0]) || !Number.isFinite(rawV[1])) {
      render(); // undetermined similarity — discard the preview
      return;
    }
    const clamp = (x: number): number => Math.max(-MAX_POLYGON_COORD, Math.min(MAX_POLYGON_COORD, x));
    const moved = raw.map((v, i): [number, number] => (i === index ? [clamp(rawV[0]), clamp(rawV[1])] : [v[0], v[1]]));
    // Normalize to CCW exactly as the sidebar editor's emit() does: a reflex-inducing drag can flip the
    // loop's orientation, which the exterior SC solver would then reject as a spurious ⚠-blank (the sidebar
    // silently auto-repairs it, so the two edit paths must agree). @cas/core's shared orientCCW, ADR-0007.
    const next = orientCCW(moved);
    editor.setPolygon(next); // keep the separate editor's handles in sync
    commit({ ...state, phi: CUSTOM_PHI, customPolygon: next });
  }

  // --- Pan / zoom (per panel; the overlay canvas is on top and receives pointer events) --------------
  const viewOf = (which: "zView" | "wView"): Viewport => (which === "zView" ? state.zView : state.wView);
  const withView = (which: "zView" | "wView", vp: Viewport): FaberViewState =>
    which === "zView" ? { ...state, zView: vp } : { ...state, wView: vp };

  function pointerFrac(canvas: HTMLCanvasElement, e: PointerEvent | WheelEvent): { fx: number; fyTop: number; aspect: number } {
    const r = canvas.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / Math.max(1, r.width), fyTop: (e.clientY - r.top) / Math.max(1, r.height), aspect: r.width / Math.max(1, r.height) };
  }

  /** Optional in-panel vertex editing (the right/K panel, custom domain): grab a handle to reshape K. */
  interface EditHooks {
    /** Is vertex editing live right now (custom domain, converged fit)? */
    active: () => boolean;
    /** Current handle world positions (the canonical K corners). */
    handles: () => readonly Vec2[];
    /** Live redraw while dragging handle `index` to `world`. */
    preview: (index: number, world: Vec2) => void;
    /** Finish the drag (refit) with handle `index` at `world`. */
    commit: (index: number, world: Vec2) => void;
  }

  function attachNav(
    canvas: HTMLCanvasElement,
    which: "zView" | "wView",
    label: string,
    edit?: EditHooks,
  ): void {
    let grab: Vec2 | null = null;
    let dragVertex = -1;
    const worldAt = (f: { fx: number; fyTop: number; aspect: number }): Vec2 => viewPxToWorld(viewOf(which), f.fx, f.fyTop, f.aspect);
    // Nearest editable handle under the cursor (within HANDLE_HIT_PX), or -1.
    const handleAt = (f: { fx: number; fyTop: number; aspect: number }): number => {
      if (!edit || !edit.active()) return -1;
      const view = viewOf(which);
      const rect = canvas.getBoundingClientRect();
      const hs = edit.handles();
      let best = -1;
      let bestD = HANDLE_HIT_PX;
      for (let i = 0; i < hs.length; i++) {
        const { fx, fyTop } = worldToFrac(view, hs[i], f.aspect);
        const d = Math.hypot((fx - f.fx) * rect.width, (fyTop - f.fyTop) * rect.height);
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    canvas.addEventListener("pointerdown", (e) => {
      const f = pointerFrac(canvas, e);
      const hit = edit ? handleAt(f) : -1;
      canvas.setPointerCapture(e.pointerId);
      if (edit && hit >= 0) {
        dragVertex = hit; // grab a vertex instead of panning
        edit.preview(hit, worldAt(f));
        return;
      }
      grab = worldAt(f);
    });
    canvas.addEventListener("pointermove", (e) => {
      const f = pointerFrac(canvas, e);
      if (dragVertex >= 0) {
        if (edit) edit.preview(dragVertex, worldAt(f));
        return;
      }
      if (grab === null) return;
      commit(withView(which, panTo(viewOf(which), grab, f.fx, f.fyTop, f.aspect)));
    });
    const end = (e: PointerEvent, doCommit: boolean): void => {
      if (dragVertex >= 0) {
        if (doCommit && edit) edit.commit(dragVertex, worldAt(pointerFrac(canvas, e)));
        else render(); // aborted drag — repaint the committed model
        dragVertex = -1;
      } else {
        grab = null;
      }
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerup", (e) => end(e, true));
    canvas.addEventListener("pointercancel", (e) => end(e, false));
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

    // Keyboard operability + screen-reader name (ADR-0028, U2): arrows pan, +/− zoom about centre — the
    // same viewport ops the pointer/wheel drive above, so a keyboard-only user gets the pane too. The
    // aria-label names the visualization for assistive tech (the gl layer behind is aria-hidden).
    attachCanvasA11y(canvas, {
      label,
      onKey: (a) => {
        const v = viewOf(which);
        if (a.kind === "pan") {
          const step = (BASE_HALF / v.zoom) * 0.15;
          commit(
            withView(which, {
              ...v,
              centerRe: v.centerRe + a.dx * step,
              centerIm: v.centerIm - a.dy * step,
            }),
          );
        } else if (a.kind === "zoom") {
          commit(withView(which, { ...v, zoom: v.zoom * (a.direction > 0 ? 1.25 : 1 / 1.25) }));
        }
      },
    });
  }
  attachNav(left.panel.ov, "zView", "Domain: the function f on the unit disk — arrow keys pan, + and − zoom");
  attachNav(
    right.panel.ov,
    "wView",
    "Image: the Faber transform of f on the compact set K — arrow keys pan, + and − zoom",
    {
      active: () => state.phi === CUSTOM_PHI && !!model && !!model.rightHandles,
      handles: () => model?.rightHandles ?? [],
      preview: previewVertexDrag,
      commit: commitVertexDrag,
    },
  );

  // --- Control events -------------------------------------------------------
  /** Frame the K-panel to a domain's boundary extent (used for the custom polygon, whose size varies). */
  const kHalfOf = (map: Parameters<typeof boundaryK>[0]): number => {
    let m = 0.2;
    for (const [x, y] of boundaryK(map)) m = Math.max(m, Math.hypot(x, y));
    return 1.35 * m;
  };
  phiSel.addEventListener("change", () => {
    if (phiSel.value === CUSTOM_PHI) {
      const poly = state.customPolygon ?? DEFAULT_CUSTOM_POLYGON;
      editor.setPolygon(poly);
      commit({ ...state, phi: CUSTOM_PHI, customPolygon: poly, wView: { centerRe: 0, centerIm: 0, zoom: BASE_HALF / kHalfOf(getCustomMap(poly).map) } });
      return;
    }
    if (phiSel.value === CUSTOM_FORMULA) {
      const expr = state.phiExpr ?? DEFAULT_PHI_EXPR;
      phiExprInput.value = expr;
      const built = buildPhiFromExpr(expr);
      const wView = "error" in built ? state.wView : { centerRe: 0, centerIm: 0, zoom: BASE_HALF / kHalfOf(built.map) };
      commit({ ...state, phi: CUSTOM_FORMULA, phiExpr: expr, wView });
      return;
    }
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
    exprTimer = window.setTimeout(() => {
      // A mode switch (→ monomial / pole) during the debounce window wins: don't snap the input back to
      // free-form from a stale timer.
      if (state.input.kind !== "expr") return;
      commit({ ...state, input: { kind: "expr", expr, N } });
    }, 180);
  }
  exprInput.addEventListener("input", commitExpr);

  // The custom-formula domain φ: debounced like the f(z) field. Keeps the current K framing (the user's
  // pan/zoom is preserved — reframing happens only when the domain is first selected from the menu).
  let phiTimer = 0;
  function commitPhiExpr(): void {
    if (state.phi !== CUSTOM_FORMULA) return;
    const expr = phiExprInput.value.slice(0, MAX_EXPR_LEN);
    if (phiTimer) window.clearTimeout(phiTimer);
    phiTimer = window.setTimeout(() => {
      if (state.phi !== CUSTOM_FORMULA) return; // a domain switch during the debounce wins
      commit({ ...state, phi: CUSTOM_FORMULA, phiExpr: expr });
    }, 180);
  }
  phiExprInput.addEventListener("input", commitPhiExpr);
  truncInput.addEventListener("input", () => {
    if (state.input.kind !== "expr") return;
    const N = Math.max(MIN_TRUNCATION, Math.min(MAX_TRUNCATION, Math.round(Number(truncInput.value))));
    commit({ ...state, input: { kind: "expr", expr: state.input.expr, N } });
  });
  rootsInput.addEventListener("change", () => commit({ ...state, showRoots: rootsInput.checked }));
  suppressInput.addEventListener("change", () =>
    commit({ ...state, suppressCorners: suppressInput.checked, suppressStrength: state.suppressStrength ?? DEFAULT_SUPPRESS_M }),
  );
  mInput.addEventListener("input", () => {
    const m = Math.max(MIN_SUPPRESS_M, Math.min(MAX_SUPPRESS_M, Math.round(Number(mInput.value))));
    commit({ ...state, suppressStrength: m });
  });

  const withColoring = (patch: Partial<ColoringOptions>): FaberViewState => ({
    ...state,
    coloring: { ...(state.coloring ?? DEFAULT_COLORING), ...patch },
  });
  enhSel.addEventListener("change", () => commit(withColoring({ enhance: Number(enhSel.value) })));
  modSel.addEventListener("change", () => commit(withColoring({ modulus: Number(modSel.value) })));
  secInput.addEventListener("input", () => commit(withColoring({ sectors: Math.max(2, Math.min(64, Math.round(Number(secInput.value)))) })));
  crispInput.addEventListener("change", () => commit(withColoring({ crisp: crispInput.checked })));
  bndryInput.addEventListener("change", () => commit({ ...state, boundaryCorr: bndryInput.checked }));
  transplantInput.addEventListener("change", () => commit({ ...state, transplant: transplantInput.checked }));

  window.addEventListener("resize", render);

  // Load a decoded custom polygon into the editor at startup (a shared `#vs=` permalink of a custom domain).
  if (state.phi === CUSTOM_PHI && state.customPolygon) editor.setPolygon(state.customPolygon);

  history.replaceState(null, "", encodeFaberState(state));
  render();
}

// Run init inside @cas/ui's shared fatal-error boundary (ADR-0028, U2): an uncaught init throw used to
// white-screen into the empty <div id="app"> — now it surfaces a role=alert banner instead. (WebGL is not
// fatal here — createGpuRenderer falls back to a CPU portrait — so this guards unexpected init failures.)
if (typeof document !== "undefined") {
  runWithFatalBoundary(main, {
    onError: (e) => console.error("Failed to initialize the Faber transform visualizer:", e),
    genericMessage:
      "Something went wrong starting the Faber transform visualizer. See the browser console for details.",
  });
}
