// apps/argument-principle — an educational visualizer for the argument principle.
//
// The theorem: the winding number of the image curve f(γ) about the origin equals the number of zeros
// minus poles of f enclosed by the contour γ. Phase 2 makes BOTH sides visible and shows them agree:
// the zeros/poles/critical points are located (exact rational root-finding, or a transcendental grid
// estimate), marked in the z-plane, counted inside γ, and displayed beside the winding of f(γ) — with
// honest `=` / `≈` labels. Phase 1 supplied the live dual view (cursor contour, pan/zoom, KaTeX).
import "./styles/main.css";
import "katex/dist/katex.min.css";
import katex from "katex";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { differentiate } from "@cas/expr/derivative";
import { toLatex } from "@cas/expr/latex";
import type { Node } from "@cas/expr/ast";
import type { Complex } from "@cas/expr/complex";
import {
  DEFAULT_VIEW_STATE,
  DEFAULT_TARGET,
  DEFAULT_PEDAGOGY,
  decodeArgPrincipleState,
  encodeArgPrincipleState,
  type ArgPrincipleViewState,
  type PedagogyState,
} from "./viewState.js";
import { FUNCTION_PRESETS, presetIdForExpr } from "./presets.js";
import {
  contourSamples,
  insideContour,
  contourBBox,
  contourPointAt,
  pathStats,
  orientCCW,
  type ContourShape,
} from "./contour.js";
import {
  windingTurns,
  windingReliable,
  partialWindingTurns,
  cumulativeArg,
  crossesBranchCut,
} from "./winding.js";
import {
  planeMap,
  drawAxes,
  drawPolyline,
  drawDot,
  drawX,
  drawDiamond,
  drawOrderBadge,
  drawWedge,
  drawArrow,
  drawPulseRing,
  fitViewport,
  type AxisColors,
  type PlaneMap,
  type Vec2,
  type Viewport,
} from "./render/plane.js";
import { drawArgGraph } from "./render/argGraph.js";
import { logDerivIntegral, partialLogDerivIntegral, normalizeByTwoPiI, type Cplx } from "./integral.js";
import { attachImagePlane, attachContourPlane } from "./render/nav.js";
import { findSingularities, countInside, type Region, type Singularities } from "./singularities.js";
import { nearestRoot, isolateRadius } from "./hit.js";
import { rootKey, diffEnclosure, type EnclosedRoot, type CrossEvent } from "./crossing.js";
import { importEnvelopeText, type ImportedMap } from "./interchange/importMap.js";
import { injectPngText } from "@cas/export";

const C0: Complex = [0, 0];
const NO_SING: Singularities = { zeros: [], poles: [], critical: [], differentiable: true, exact: false };

interface Model {
  readonly ast: Node | null;
  readonly f: (z: Vec2) => Vec2;
  /** The holomorphic derivative f′, compiled; `null` when f is non-holomorphic (no symbolic f′). The
   *  integral view (§11 B4) and the per-root decomposition (B5) read it; the finder derives its own. */
  readonly fp: ((z: Vec2) => Vec2) | null;
  readonly latex: string | null;
  readonly error: string | null;
}

function buildModel(expr: string): Model {
  try {
    const ast = parse(expr);
    const fn = makeComplexFn(ast);
    let fp: ((z: Vec2) => Vec2) | null = null;
    try {
      const dfn = makeComplexFn(differentiate(ast, "z"));
      fp = (z: Vec2): Vec2 => {
        const w = dfn([z[0], z[1]], C0);
        return [w[0], w[1]];
      };
    } catch {
      fp = null; // non-holomorphic (e.g. conjugate) — no symbolic derivative
    }
    let latex: string | null = null;
    try {
      latex = toLatex(ast);
    } catch {
      latex = null;
    }
    return {
      ast,
      f: (z: Vec2): Vec2 => {
        const zc: Complex = [z[0], z[1]];
        const w = fn(zc, C0);
        return [w[0], w[1]];
      },
      fp,
      latex,
      error: null,
    };
  } catch (e) {
    return {
      ast: null,
      f: (): Vec2 => [NaN, NaN],
      fp: null,
      latex: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function axisColors(): AxisColors {
  return { grid: cssVar("--grid", "#2a3140"), axis: cssVar("--axis", "#4a5468") };
}

function createThemeToggle(onChange: () => void): HTMLButtonElement {
  const KEY = "ap.theme";
  const ORDER = ["auto", "dark", "light"] as const;
  type Choice = (typeof ORDER)[number];
  const LABEL: Record<Choice, string> = { auto: "Theme: auto", dark: "Theme: dark", light: "Theme: light" };
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ghost";
  btn.setAttribute("aria-label", "Toggle colour theme");
  const read = (): Choice => {
    let v: string | null = null;
    try {
      v = localStorage.getItem(KEY);
    } catch {
      v = null;
    }
    return v === "dark" || v === "light" ? v : "auto";
  };
  const apply = (c: Choice): void => {
    if (c === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = c;
    btn.textContent = LABEL[c];
  };
  let current = read();
  apply(current);
  btn.addEventListener("click", () => {
    current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    try {
      if (current === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, current);
    } catch {
      /* storage unavailable */
    }
    apply(current);
    onChange();
  });
  return btn;
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.className = "plane";
  return c;
}
function button(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ghost";
  b.textContent = label;
  return b;
}

function checkbox(label: string, checked: boolean): { root: HTMLLabelElement; input: HTMLInputElement } {
  const root = document.createElement("label");
  root.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const span = document.createElement("span");
  span.textContent = label;
  root.append(input, span);
  return { root, input };
}

interface Cell {
  readonly root: HTMLElement;
  set(value: string, tag: string): void;
  setLabel(text: string): void;
}
function metricCell(label: string, accent: string): Cell {
  const root = document.createElement("div");
  root.className = "cell";
  const l = document.createElement("div");
  l.className = "cl";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "cv";
  v.style.color = accent;
  root.append(l, v);
  return {
    root,
    set(value: string, tag: string): void {
      v.innerHTML = `${value}<span class="tag">${tag}</span>`;
    },
    setLabel(text: string): void {
      l.textContent = text;
    },
  };
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  // A suite hand-off arrives as an `#s=` interchange link; the app's own share-links are `#vs=`.
  const rawHash = window.location.hash;
  let imported: ImportedMap | null = null;
  let importError: string | null = null;
  if (rawHash.startsWith("#s=")) {
    try {
      imported = importEnvelopeText(rawHash);
    } catch (e) {
      importError = e instanceof Error ? e.message : String(e);
    }
  }
  const fromLink = imported ? null : decodeArgPrincipleState(rawHash);
  let state: ArgPrincipleViewState = imported
    ? {
        ...DEFAULT_VIEW_STATE,
        map: {
          expr: imported.expr,
          vars: ["z"],
          antiholomorphic: /conjugate/.test(imported.expr),
        },
        ...(imported.center
          ? {
              zView: { centerRe: imported.center.re, centerIm: imported.center.im, zoom: DEFAULT_VIEW_STATE.zView.zoom },
              contour: { ...DEFAULT_VIEW_STATE.contour, centerRe: imported.center.re, centerIm: imported.center.im },
            }
          : {}),
      }
    : (fromLink ?? DEFAULT_VIEW_STATE);
  let model = buildModel(state.map.expr);
  let sing: Singularities = NO_SING;
  let draftPath: Vec2[] | null = null; // the freehand path being drawn (transient, not persisted)
  const anim = { on: false, t: 0, speed: 0.25 }; // traversal animation (transient)
  let animRaf = 0;
  let animLast = 0;
  // §11 C6 (boundary crossing) + its pulse — all transient.
  let prevEnclosed = new Map<string, EnclosedRoot>();
  // Crossings are only genuine when the ROOT SET is fixed. `singKey` = the (expr@target) that `sing` was
  // actually computed for (set in refreshSing); keying off it — not the live target — means a root-set
  // change (new f or new target) always resets the baseline, even across the debounced finder's lag, so
  // only γ moving over a fixed root set counts as a crossing. null on the transcendental/error path.
  let prevStableKey: string | null = null;
  let singKey: string | null = null;
  let flash: { pts: Vec2[]; t0: number } | null = null;
  let flashRaf = 0;
  let toastTimer = 0;

  // ---- DOM shell -----------------------------------------------------------
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.innerHTML = "<strong>Argument Principle</strong><span>winding = zeros − poles</span>";
  const spacer = document.createElement("div");
  spacer.className = "spacer";
  const clearBtn = button("Clear drawn curve");
  const fitBtn = button("Fit image");
  const resetBtn = button("Reset views");
  const pngBtn = button("Save PNG");
  const helpBtn = button("?");
  helpBtn.setAttribute("aria-label", "Help");
  const themeBtn = createThemeToggle(() => schedule());
  topbar.append(brand, spacer, clearBtn, fitBtn, resetBtn, pngBtn, helpBtn, themeBtn);

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const presetWrap = document.createElement("label");
  presetWrap.className = "field";
  presetWrap.innerHTML = "<span>Preset</span>";
  const presetSel = document.createElement("select");
  for (const p of FUNCTION_PRESETS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    presetSel.append(opt);
  }
  presetWrap.append(presetSel);
  const exprWrap = document.createElement("label");
  exprWrap.className = "field grow";
  exprWrap.innerHTML = "<span>f(z) =</span>";
  const exprInput = document.createElement("input");
  exprInput.type = "text";
  exprInput.spellcheck = false;
  exprInput.autocomplete = "off";
  exprInput.value = state.map.expr;
  exprWrap.append(exprInput);
  const radiusWrap = document.createElement("label");
  radiusWrap.className = "field";
  const radiusLabel = document.createElement("span");
  radiusWrap.append(radiusLabel);
  const radius = document.createElement("input");
  radius.type = "range";
  radius.min = "0.05";
  radius.max = "4";
  radius.step = "0.01";
  radius.value = String(state.contour.radius);
  radiusWrap.append(radius);
  toolbar.append(presetWrap, exprWrap, radiusWrap);

  const controls2 = document.createElement("div");
  controls2.className = "toolbar sub";
  const resWrap = document.createElement("label");
  resWrap.className = "field";
  const resLabel = document.createElement("span");
  resWrap.append(resLabel);
  const resInput = document.createElement("input");
  resInput.type = "range";
  resInput.min = "60";
  resInput.max = "2000";
  resInput.step = "20";
  resInput.value = String(state.render.resolution);
  resWrap.append(resInput);
  const playBtn = button("▶ Traverse γ");
  const speedWrap = document.createElement("label");
  speedWrap.className = "field";
  const speedLabel = document.createElement("span");
  speedLabel.textContent = "Speed";
  const speedInput = document.createElement("input");
  speedInput.type = "range";
  speedInput.min = "0.05";
  speedInput.max = "1";
  speedInput.step = "0.05";
  speedInput.value = "0.25";
  speedWrap.append(speedLabel, speedInput);
  const domainChk = checkbox("Domain curve γ", state.render.showDomainCurve);
  const imageChk = checkbox("Image curve f(γ)", state.render.showImageCurve);
  const decompChk = checkbox("Root vectors", ped().showDecomposition);
  const drawHint = document.createElement("span");
  drawHint.className = "hint";
  drawHint.textContent = "Tip: click a root to isolate it · left-drag to draw a contour · hover a marker for details.";
  controls2.append(resWrap, playBtn, speedWrap, domainChk.root, imageChk.root, decompChk.root, drawHint);

  const formula = document.createElement("div");
  formula.className = "formula";
  const errEl = document.createElement("div");
  errEl.className = "err";
  errEl.hidden = true;
  const importNote = document.createElement("div");
  importNote.className = "import-note";
  importNote.hidden = true;

  const stage = document.createElement("div");
  stage.className = "stage";
  const zPane = document.createElement("figure");
  zPane.className = "pane";
  const zCanvas = makeCanvas();
  const zCap = document.createElement("figcaption");
  zCap.innerHTML =
    "<b>Domain</b> — z-plane · move to place γ, right-drag pan, scroll zoom · γ colored by t (matches f(γ)) · " +
    '<span class="key zero">✕ zero</span> <span class="key pole">✕ pole</span> ' +
    '<span class="key crit">◆ f′=0</span>';
  zPane.append(zCanvas, zCap);
  const wPane = document.createElement("figure");
  wPane.className = "pane";
  const wCanvas = makeCanvas();
  const wCap = document.createElement("figcaption");
  wCap.innerHTML = "<b>Image</b> — w = f(z) · f(γ) · drag the ● target w₀ · drag to pan, scroll to zoom";
  wPane.append(wCanvas, wCap);
  stage.append(zPane, wPane);

  // A1 — the always-on argument strip-chart: accumulated turns of arg f(γ(t)) vs t.
  const argPanel = document.createElement("figure");
  argPanel.className = "pane arg-panel";
  const argCanvas = document.createElement("canvas");
  argCanvas.className = "argplot";
  const argCap = document.createElement("figcaption");
  argCap.innerHTML =
    "<b>Argument</b> — accumulated turns of arg f(γ(t)) vs t · one turn = 2π · " +
    "the curve lands on the winding number";
  argPanel.append(argCanvas, argCap);

  const readout = document.createElement("div");
  readout.className = "readout";
  const metrics = document.createElement("div");
  metrics.className = "metrics";
  const zerosCell = metricCell("Zeros inside", cssVar("--accent", "#3bb6c0"));
  const polesCell = metricCell("Poles inside", cssVar("--pole", "#e8608f"));
  const nmpCell = metricCell("Zeros − Poles", cssVar("--text", "#e7eaf2"));
  const windCell = metricCell("Winding of f(γ)", cssVar("--gold", "#dbb057"));
  metrics.append(zerosCell.root, polesCell.root, nmpCell.root, windCell.root);
  const status = document.createElement("div");
  status.className = "status";
  const integralEl = document.createElement("div");
  integralEl.className = "integral";
  integralEl.hidden = true;
  const decompEl = document.createElement("div");
  decompEl.className = "decomp";
  decompEl.hidden = true;
  const animEl = document.createElement("div");
  animEl.className = "anim";
  animEl.hidden = true;
  const noteEl = document.createElement("p");
  noteEl.className = "note";
  noteEl.innerHTML =
    "The argument principle: the winding number of f(γ) about 0 equals (zeros − poles) of f enclosed by " +
    "γ. Counts marked <span class=\"approx\">=</span> are exact (f rational, roots found algebraically); " +
    "<span class=\"approx\">≈</span> are numerical estimates (transcendental f, or a winding read from " +
    "the sampled image).";
  readout.append(metrics, status, integralEl, animEl, decompEl, noteEl);

  const help = document.createElement("div");
  help.className = "help-overlay";
  help.hidden = true;
  help.innerHTML = `
    <div class="help-card" role="dialog" aria-label="Help">
      <button class="help-close ghost" type="button" aria-label="Close help">✕</button>
      <h2>The Argument Principle</h2>
      <p>For a meromorphic <em>f</em> and a closed contour <em>γ</em> passing through no zero or pole, the
      number of times the image curve <em>f(γ)</em> winds around the origin equals the zeros minus poles of
      <em>f</em> enclosed by <em>γ</em>, counted with multiplicity:</p>
      <p class="help-eq">wind( f(γ), 0 ) &nbsp;=&nbsp; Z − P &nbsp;=&nbsp; (1 / 2πi) ∮<sub>γ</sub> f′/f dz</p>
      <h3>Using the tool</h3>
      <ul>
        <li><b>f(z)</b> — pick a preset or type your own: <code>z, i, pi, sin, cos, tan, exp, log, sqrt, ^</code> and more.</li>
        <li><b>z-plane</b> — move the cursor to place the circular contour γ; <b>click a root</b> to isolate it; <b>hover a marker</b> for its value and order; <b>left-drag</b> to draw a freehand γ; <b>right-drag</b> to pan; <b>scroll</b> to zoom.</li>
        <li><b>Markers</b> — <span class="key zero">✕ zeros</span>, <span class="key pole">✕ poles</span>, <span class="key crit">◆ critical points</span> (f′ = 0).</li>
        <li><b>Readouts</b> — zeros / poles inside γ, their difference, and the winding of f(γ). <span class="approx">=</span> is exact (f rational); <span class="approx">≈</span> is a numerical estimate. If γ crosses a <b>branch cut</b> (e.g. √z, log z), f is not single-valued and the tool says the theorem doesn't apply — the ∮ f′/f then reads a non-integer.</li>
      </ul>
      <h3>Seeing the argument accumulate</h3>
      <ul>
        <li><b>Traverse γ</b> — animate a point around γ; γ and f(γ) share a colour ramp, so each arc maps to its image.</li>
        <li><b>Argument strip</b> — the panel below plots the accumulated turns of arg f(γ(t)); it climbs and lands on the winding number (one turn = 2π). The <b>swept wedge</b> in the image plane fills each revolution.</li>
        <li><b>∮ f′/f</b> — the analytic contour integral, computed by quadrature, converges to the same Z − P (labelled <span class="approx">≈</span>: a Riemann sum rounding to the exact count).</li>
        <li><b>Root vectors</b> — turn on to draw the factor vector (z − root) from each enclosed zero (+1) and pole (−1); their windings sum to Z − P.</li>
      </ul>
      <h3>Explore</h3>
      <ul>
        <li><b>Isolate a root</b> — click any ✕/◆ to pin a small circle around it; the winding then equals its order. <b>Release γ</b> resumes cursor-follow.</li>
        <li><b>Cross the boundary</b> — drag γ so a root passes through it; the count jumps ±1, flagged by a pulse and a note.</li>
        <li><b>Target w₀</b> — drag the ● in the image plane to count <em>solutions of f(z) = w₀</em> instead of zeros (drag it back to the origin to snap to the classic case).</li>
      </ul>
      <h3>Hand-off &amp; export</h3>
      <ul>
        <li>Open an <code>#s=</code> link from the <b>Complex Function Plotter</b> or <b>Complex Dynamics</b> to study their f(z) here.</li>
        <li><b>Save PNG</b> embeds this view's permalink in the image, so a figure carries its own recipe.</li>
      </ul>
    </div>`;

  // F13 root tooltip + C6 crossing toast (fixed-position overlays).
  const tooltipEl = document.createElement("div");
  tooltipEl.className = "root-tip";
  tooltipEl.hidden = true;
  const toastEl = document.createElement("div");
  toastEl.className = "toast";
  toastEl.hidden = true;

  app.append(topbar, importNote, toolbar, controls2, formula, errEl, stage, argPanel, readout, help, tooltipEl, toastEl);
  if (imported) {
    importNote.hidden = false;
    importNote.textContent = `Imported f(z) from ${imported.source}${imported.note ? ` — ${imported.note}` : ""}.`;
  } else if (importError) {
    importNote.hidden = false;
    importNote.classList.add("bad");
    importNote.textContent = `Could not import the hand-off link: ${importError}`;
  }

  // ---- state + finder ------------------------------------------------------
  /** The contour in effect: the path being drawn (if any), otherwise the committed contour. */
  function effectiveContour(): ContourShape {
    if (draftPath && draftPath.length >= 2) {
      const s = pathStats(draftPath);
      return { kind: "path", points: draftPath, centerRe: s.centerRe, centerIm: s.centerIm, radius: s.radius };
    }
    return state.contour;
  }
  function canvasAspect(canvas: HTMLCanvasElement): number {
    const r = canvas.getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 1;
  }
  function imagePoints(): Vec2[] {
    if (model.error) return [];
    return contourSamples(effectiveContour(), state.render.resolution).map((p) => model.f(p));
  }
  /** The point w₀ the winding is measured about — the origin classically; a draggable target later (D8). */
  function aboutPoint(): Vec2 {
    const t = state.target ?? DEFAULT_TARGET;
    return [t.re, t.im];
  }
  /** The pedagogy toggles in effect (always complete — decode back-fills, DEFAULT carries them). */
  function ped(): PedagogyState {
    return state.pedagogy ?? DEFAULT_PEDAGOGY;
  }
  /** World units per pixel in the z-plane — turns a pixel hit-tolerance into a world tolerance. */
  function zPlaneScale(): number {
    const rect = zCanvas.getBoundingClientRect();
    const halfH = 2 / state.zView.zoom; // BASE_HALF = 2 in plane.ts
    return rect.height > 0 ? rect.height / (2 * halfH) : 1;
  }
  function wPlaneScale(): number {
    const rect = wCanvas.getBoundingClientRect();
    const halfH = 2 / state.wView.zoom;
    return rect.height > 0 ? rect.height / (2 * halfH) : 1;
  }
  function fmtComplex(z: Vec2): string {
    const trim = (v: number): string =>
      (Math.abs(v) < 1e-9 ? 0 : v).toFixed(3).replace(/\.?0+$/, "") || "0";
    const re = trim(z[0]);
    if (Math.abs(z[1]) < 1e-9) return re;
    const sign = z[1] < 0 ? "−" : "+";
    return `${re} ${sign} ${trim(Math.abs(z[1]))}i`;
  }
  // F13 — a hover tooltip on the nearest marked root (value · order · exact/≈).
  function updateTooltip(world: Vec2, client: { x: number; y: number }): void {
    if (!sing.differentiable) return hideTooltip();
    const hit = nearestRoot(world, sing, 12 / zPlaneScale());
    if (!hit) return hideTooltip();
    const label = hit.kind === "zero" ? "Zero" : hit.kind === "pole" ? "Pole" : "Critical point (f′ = 0)";
    const order = hit.root.order > 1 ? ` · order ${hit.root.order}` : "";
    const prov = sing.exact ? "exact" : "≈ estimated";
    tooltipEl.innerHTML = `<b>${label}</b><br>z = ${fmtComplex(hit.root.z)}${order}<br><span class="prov">${prov}</span>`;
    tooltipEl.style.left = `${client.x + 14}px`;
    tooltipEl.style.top = `${client.y + 14}px`;
    tooltipEl.hidden = false;
  }
  function hideTooltip(): void {
    tooltipEl.hidden = true;
  }
  function showToast(msg: string): void {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2600);
  }
  // C6 — announce a boundary crossing + pulse the root(s) that crossed.
  function announceCrossing(events: CrossEvent[], nmp: number, atOrigin: boolean): void {
    const label = (e: CrossEvent): string => {
      const noun = e.kind === "pole" ? "A pole" : atOrigin ? "A zero" : "A solution";
      return `${noun} ${e.entered ? "entered" : "left"} γ`;
    };
    showToast(`${events.map(label).join(" · ")} — ${atOrigin ? "zeros" : "solutions"} − poles = ${nmp}`);
    const pts = events.map((e) => e.z).filter((z) => Number.isFinite(z[0]) && Number.isFinite(z[1]));
    if (!pts.length) return;
    flash = { pts, t0: performance.now() };
    if (!flashRaf) flashRaf = requestAnimationFrame(flashTick);
  }
  function flashTick(now: number): void {
    if (!flash || now - flash.t0 > 1000) {
      flash = null;
      flashRaf = 0;
      schedule();
      return;
    }
    render();
    flashRaf = requestAnimationFrame(flashTick);
  }
  /** The finder's search region: the union of the z-view and the contour, padded — so every marker in
   *  view and every root inside γ is covered (the transcendental grid only finds what it samples). */
  function searchRegion(): Region {
    const halfH = 2 / state.zView.zoom;
    const halfW = halfH * canvasAspect(zCanvas);
    const bb = contourBBox(effectiveContour());
    const xMin = Math.min(state.zView.centerRe - halfW, bb.minX);
    const xMax = Math.max(state.zView.centerRe + halfW, bb.maxX);
    const yMin = Math.min(state.zView.centerIm - halfH, bb.minY);
    const yMax = Math.max(state.zView.centerIm + halfH, bb.maxY);
    return {
      cx: (xMin + xMax) / 2,
      cy: (yMin + yMax) / 2,
      halfW: ((xMax - xMin) / 2) * 1.1,
      halfH: ((yMax - yMin) / 2) * 1.1,
    };
  }
  function refreshSing(): void {
    const t = state.target ?? DEFAULT_TARGET;
    sing = model.error || !model.ast ? NO_SING : findSingularities(model.ast, searchRegion(), [t.re, t.im]);
    // Only the rational-exact path has a stable, region-independent root set to track crossings against.
    singKey = sing.exact && sing.differentiable && !model.error ? `${state.map.expr}@${t.re},${t.im}` : null;
  }

  let frame = 0;
  function schedule(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }
  let persistTimer = 0;
  function schedulePersist(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = 0;
      history.replaceState(null, "", encodeArgPrincipleState(state));
    }, 200);
  }
  // Coalesced finder refresh. Moving γ (or panning/zooming) changes the search region, so the finder must
  // re-run — but not every pointer frame (the transcendental grid is a 64×64 sweep). Debounce it ~120 ms
  // after the last change; `refreshPending` suppresses a stale verdict in between.
  let refreshTimer = 0;
  let refreshPending = false;
  function scheduleRefresh(): void {
    refreshPending = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      refreshPending = false;
      refreshSing();
      schedule();
    }, 120);
  }
  function cancelRefresh(): void {
    refreshPending = false;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = 0;
    }
  }
  function commit(next: ArgPrincipleViewState, refresh: boolean): void {
    state = next;
    if (refresh) {
      refreshSing();
      cancelRefresh(); // sing is fresh now — drop any pending debounce
    }
    schedule();
    schedulePersist();
  }
  function setExpr(expr: string): void {
    model = buildModel(expr);
    // A new f moves the roots, so release any pinned isolate circle (it no longer isolates the old root).
    state = {
      ...state,
      map: { ...state.map, expr, antiholomorphic: /conjugate/.test(expr) },
      contour: { ...state.contour, pinned: false },
    };
    const id = presetIdForExpr(expr);
    if (id) presetSel.value = id;
    refreshSing();
    cancelRefresh();
    renderFormula();
    schedule();
    schedulePersist();
  }
  function fitImage(): void {
    commit({ ...state, wView: fitViewport(imagePoints(), canvasAspect(wCanvas)) }, false);
  }
  /** Composite the two panes into a PNG with this view's permalink embedded as `tEXt` (a figure that
   *  carries its own recipe — @cas/export). */
  function savePng(): void {
    const gap = 8;
    const topW = zCanvas.width + wCanvas.width + gap;
    const topH = Math.max(zCanvas.height, wCanvas.height);
    const stripH = !argPanel.hidden && argCanvas.width > 0 ? argCanvas.height : 0;
    const w = Math.max(topW, stripH ? argCanvas.width : 0);
    const h = topH + (stripH ? stripH + gap : 0);
    if (w < 4 || h < 4) return;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = cssVar("--bg", "#0f1115");
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(zCanvas, 0, 0);
    ctx.drawImage(wCanvas, zCanvas.width + gap, 0);
    if (stripH) ctx.drawImage(argCanvas, 0, topH + gap);
    off.toBlob((blob) => {
      if (!blob) return;
      void blob.arrayBuffer().then((buf) => {
        const url = location.origin + location.pathname + encodeArgPrincipleState(state);
        const stamped = injectPngText(new Uint8Array(buf), {
          Software: "Argument Principle — Complex Analysis Suite",
          "ap:url": url,
        });
        const ab = new ArrayBuffer(stamped.byteLength);
        new Uint8Array(ab).set(stamped);
        const outBlob = new Blob([ab], { type: "image/png" });
        const dl = URL.createObjectURL(outBlob);
        const a = document.createElement("a");
        a.href = dl;
        a.download = "argument-principle.png";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(dl), 1000);
      });
    }, "image/png");
  }

  // ---- rendering -----------------------------------------------------------
  function renderFormula(): void {
    if (model.error) {
      errEl.hidden = false;
      errEl.textContent = `Parse error: ${model.error}`;
      formula.classList.add("dim");
      return;
    }
    errEl.hidden = true;
    errEl.textContent = "";
    formula.classList.remove("dim");
    if (model.latex) {
      try {
        katex.render(`f(z) = ${model.latex}`, formula, { throwOnError: false, displayMode: true });
        return;
      } catch {
        /* fall through */
      }
    }
    formula.textContent = `f(z) = ${state.map.expr}`;
  }

  function drawPane(
    canvas: HTMLCanvasElement,
    view: Viewport,
    paint: (ctx: CanvasRenderingContext2D, map: PlaneMap) => void,
  ): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const wCss = Math.max(1, Math.floor(rect.width));
    const hCss = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(wCss * dpr);
    canvas.height = Math.floor(hCss * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);
    const map = planeMap(view, wCss, hCss);
    drawAxes(ctx, map, axisColors());
    paint(ctx, map);
  }

  function render(): void {
    const contour = effectiveContour();
    const about = aboutPoint();
    const zPts = contourSamples(contour, state.render.resolution);
    const wPts: Vec2[] = model.error ? [] : zPts.map((p) => model.f(p));
    // Not-single-valued guard: if γ crosses a branch cut, f(γ) is discontinuous and the argument
    // principle does not apply — the winding/∮ readouts must not assert a count.
    const branchCut = wPts.length > 1 && crossesBranchCut(wPts);

    const cZero = cssVar("--accent", "#3bb6c0");
    const cPole = cssVar("--pole", "#e8608f");
    const cCrit = cssVar("--gold", "#dbb057");
    const cCenter = cssVar("--muted", "#8c95a9");
    const cTrace = cssVar("--trace", "#8b7bf0");

    const pinned = state.contour.kind === "circle" && state.contour.pinned === true;
    clearBtn.disabled = !(state.contour.kind === "path" || !!draftPath || pinned);
    clearBtn.textContent = pinned ? "Release γ" : "Clear drawn curve";
    radius.disabled = contour.kind === "path"; // radius has no meaning for a freehand contour

    // The animated traversal point (E1): the same parameter t marks a point on γ and its image on f(γ).
    const showAnim = anim.on || anim.t > 0;
    const zAnim = showAnim ? contourPointAt(contour, anim.t, state.render.resolution) : null;
    const wAnim = zAnim && !model.error ? model.f(zAnim) : null;

    // Roots enclosed by γ — shared by the four readouts, the analytic integral (B4), and the vectors (B5).
    const encZeros = sing.differentiable ? sing.zeros.filter((r) => insideContour(r.z, contour)) : [];
    const encPoles = sing.differentiable ? sing.poles.filter((r) => insideContour(r.z, contour)) : [];
    const zCount = encZeros.reduce((s, r) => s + r.order, 0);
    const pCount = encPoles.reduce((s, r) => s + r.order, 0);
    const nmp = zCount - pCount;

    // C6 — boundary crossings. `singKey` fixes the root set (expr + target that `sing` reflects); a change
    // to it resets the baseline, so only γ moving over a fixed set flips membership (a real crossing). The
    // transcendental grid's roots drift with the view, so singKey is null there and crossings are off.
    if (singKey !== null) {
      const cur: EnclosedRoot[] = [
        ...encZeros.map((r) => ({ key: rootKey("zero", r.z), kind: "zero" as const, z: r.z, order: r.order })),
        ...encPoles.map((r) => ({ key: rootKey("pole", r.z), kind: "pole" as const, z: r.z, order: r.order })),
      ];
      if (prevStableKey === singKey) {
        const events = diffEnclosure(prevEnclosed, cur);
        if (events.length) announceCrossing(events, nmp, about[0] === 0 && about[1] === 0);
      }
      prevEnclosed = new Map(cur.map((e) => [e.key, e]));
      prevStableKey = singKey;
    } else {
      prevEnclosed = new Map();
      prevStableKey = null;
    }

    drawPane(zCanvas, state.zView, (ctx, map) => {
      if (state.render.showDomainCurve) {
        // A2 — couple γ to f(γ)'s parameter-t ramp so a point on γ maps to the same-colored point on f(γ).
        drawPolyline(
          ctx,
          map,
          zPts,
          ped().coupleColor ? { closed: true, rainbow: true, width: 2 } : { closed: true, color: cZero, width: 2 },
        );
      }
      for (const c of sing.critical) drawDiamond(ctx, map, c.z, cCrit);
      for (const p of sing.poles) {
        drawX(ctx, map, p.z, cPole);
        drawOrderBadge(ctx, map, p.z, p.order, cPole);
      }
      for (const z of sing.zeros) {
        drawX(ctx, map, z.z, cZero);
        drawOrderBadge(ctx, map, z.z, z.order, cZero);
      }
      if (contour.kind === "circle") drawDot(ctx, map, [contour.centerRe, contour.centerIm], cCenter, 3);
      // B5 — the factor vectors (z(t) − root): each enclosed zero (+1) and pole (−1) winds once as z
      // circles γ, and the signed sum is Z − P. Drawn during traversal so the winding is watchable.
      if (showAnim && ped().showDecomposition && zAnim) {
        for (const r of encZeros) drawArrow(ctx, map, r.z, zAnim, cZero, false);
        for (const r of encPoles) drawArrow(ctx, map, r.z, zAnim, cPole, true);
      }
      if (zAnim) drawDot(ctx, map, zAnim, cTrace, 6);
      // C6 — the crossing pulse (expanding ring on a root that just entered/left γ).
      if (flash) {
        const fr = (performance.now() - flash.t0) / 1000;
        for (const p of flash.pts) drawPulseRing(ctx, map, p, fr, cCrit);
      }
    });
    drawPane(wCanvas, state.wView, (ctx, map) => {
      if (state.render.showImageCurve && wPts.length > 1) {
        drawPolyline(ctx, map, wPts, { closed: true, rainbow: true, width: 2 });
      }
      drawDot(ctx, map, about, cPole, 5);
      // D8 — a ring around the target marks it as draggable (drag to count solutions of f = w₀).
      {
        const tpx = map.toPx(about);
        if (Number.isFinite(tpx[0]) && Number.isFinite(tpx[1])) {
          ctx.save();
          ctx.strokeStyle = cPole;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(tpx[0], tpx[1], 9, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.restore();
        }
      }
      // A3 — the swept-wedge about the target: a pie slice filling the current revolution, aligned to the
      // argument-vector; a "×k" badge banks completed turns. Paired with the strip-chart, it reads as
      // "the wedge fills one turn, the counter ticks, it fills again…".
      if (
        showAnim &&
        ped().showWedge &&
        wAnim &&
        Number.isFinite(wAnim[0]) &&
        Number.isFinite(wAnim[1]) &&
        wPts.length > 1
      ) {
        const swept = partialWindingTurns(wPts, anim.t, about);
        const frac = swept - Math.trunc(swept);
        const w0 = wPts[0];
        const startAng = Math.atan2(w0[1] - about[1], w0[0] - about[0]);
        const scale = map.heightPx / (2 * map.halfH); // world→px (uniform)
        const rWorld = Math.hypot(wAnim[0] - about[0], wAnim[1] - about[1]);
        const capWorld = (0.42 * Math.min(map.widthPx, map.heightPx)) / scale;
        const radiusWorld = Math.max(24 / scale, Math.min(rWorld, capWorld));
        drawWedge(ctx, map, about, startAng, 2 * Math.PI * frac, radiusWorld, cTrace, Math.floor(Math.abs(swept)));
      }
      if (wAnim && Number.isFinite(wAnim[0]) && Number.isFinite(wAnim[1])) {
        const o = map.toPx(about);
        const pp = map.toPx(wAnim);
        ctx.save();
        ctx.strokeStyle = cTrace;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(o[0], o[1]);
        ctx.lineTo(pp[0], pp[1]); // the arg vector: origin → f(z(t))
        ctx.stroke();
        ctx.restore();
        drawDot(ctx, map, wAnim, cTrace, 6);
      }
    });

    // A1 — the argument strip-chart (always-on): accumulated turns of arg f(γ(t)) climbing to the winding.
    if (ped().showArgGraph) {
      argPanel.hidden = false;
      const haveImg = !model.error && wPts.length > 1;
      const turns = haveImg ? cumulativeArg(wPts, about) : [0];
      const wn = haveImg ? Math.round(windingTurns(wPts, about)) : NaN;
      drawArgGraph(
        argCanvas,
        // On a branch cut the total is not a winding number — don't label it as one (the cliff still shows).
        { turns, marker: showAnim ? anim.t : null, winding: !branchCut && Number.isFinite(wn) ? wn : null },
        {
          grid: axisColors().grid,
          axis: axisColors().axis,
          text: cssVar("--text", "#e7eaf2"),
          muted: cssVar("--muted", "#8c95a9"),
          marker: cTrace,
        },
      );
    } else {
      argPanel.hidden = true;
    }

    // B4 — the analytic integral (1/2πi)∮ f′/f dz, a quadrature independent of the winding accumulation
    // that rounds to the same Z − P. Honest `≈`: it is a Riemann sum, and the pedagogy is that it agrees.
    const fpFn = model.fp;
    if (ped().showIntegral && fpFn && sing.differentiable && !model.error && wPts.length > 1) {
      const fMinusTarget = (z: Cplx): Cplx => {
        const w = model.f(z);
        return [w[0] - about[0], w[1] - about[1]];
      };
      const atOrigin = about[0] === 0 && about[1] === 0;
      const integrand = atOrigin ? "f′/f" : "f′/(f−w₀)";
      if (branchCut) {
        // The integral is not near an integer — the tell that f is multivalued around γ.
        const val = normalizeByTwoPiI(logDerivIntegral(fMinusTarget, fpFn, zPts))[0];
        integralEl.hidden = false;
        integralEl.innerHTML =
          `<span class="approx">≈</span> (1/2πi) ∮<sub>γ</sub> ${integrand} dz = ` +
          `<b>${Number.isFinite(val) ? val.toFixed(3) : "—"}</b> — not an integer: f is not single-valued around γ.`;
      } else if (showAnim) {
        const vpart = normalizeByTwoPiI(partialLogDerivIntegral(fMinusTarget, fpFn, zPts, anim.t))[0];
        integralEl.hidden = false;
        integralEl.innerHTML =
          `<span class="approx">≈</span> (1/2πi) ∮ ${integrand} dz so far = ` +
          `<b>${Number.isFinite(vpart) ? vpart.toFixed(3) : "—"}</b> → converging to ${nmp} = zeros − poles`;
      } else {
        const val = normalizeByTwoPiI(logDerivIntegral(fMinusTarget, fpFn, zPts))[0];
        if (Number.isFinite(val)) {
          integralEl.hidden = false;
          integralEl.innerHTML =
            `<span class="approx">≈</span> analytic check: (1/2πi) ∮<sub>γ</sub> ${integrand} dz = ` +
            `<b>${val.toFixed(3)}</b> → ${Math.round(val)} = zeros − poles`;
        } else {
          integralEl.hidden = true;
        }
      }
    } else {
      integralEl.hidden = true;
    }

    // B5 — the decomposition note (the vectors are drawn in the z-pane above).
    if (ped().showDecomposition && showAnim && zAnim && sing.differentiable) {
      const eq = sing.exact ? "=" : "≈";
      decompEl.hidden = false;
      decompEl.innerHTML =
        `Root vectors: each enclosed <span class="key zero">zero</span> winds +1, each ` +
        `<span class="key pole">pole</span> −1 as z circles γ · Σ = ${zCount} − ${pCount} ` +
        `<span class="approx">${eq}</span> ${nmp}` +
        (sing.exact ? " (exact — f rational)" : " (illustrative — f transcendental)");
    } else {
      decompEl.hidden = true;
    }

    updateReadout(contour, wPts, about, branchCut);

    if (showAnim && !model.error && wPts.length > 1) {
      const swept = partialWindingTurns(wPts, anim.t, about);
      const full = Math.round(windingTurns(wPts, about));
      animEl.hidden = false;
      if (Number.isFinite(swept) && Number.isFinite(full)) {
        animEl.innerHTML =
          `▶ traversing γ: t = ${anim.t.toFixed(2)} · arg of f(z) swept <b>${swept.toFixed(2)}</b> turns` +
          ` — reaches <b>${full}</b> over the full loop (that is the winding number).`;
      } else {
        animEl.textContent = `▶ traversing γ: t = ${anim.t.toFixed(2)} · γ passes through a singularity — winding undefined here.`;
      }
    } else {
      animEl.hidden = true;
    }
  }

  function updateReadout(
    contour: ContourShape,
    wPts: readonly Vec2[],
    about: Vec2,
    branchCut: boolean,
  ): void {
    const haveImage = !model.error && wPts.length > 1;
    const turns = haveImage ? windingTurns(wPts, about) : NaN;
    const winding = haveImage ? Math.round(turns) : NaN;
    const reliable = haveImage && windingReliable(wPts, about);
    // Never surface a NaN (a pole on a contour sample), and never a winding across a branch cut (undefined).
    const windFinite = haveImage && !branchCut && Number.isFinite(winding);
    const windText = windFinite ? String(winding) : "—";
    const windTag = windFinite ? "≈" : "";

    // D8 — when the target w₀ ≠ 0 the counted roots are solutions of f = w₀, not zeros of f.
    const atOrigin = about[0] === 0 && about[1] === 0;
    const noun = atOrigin ? "zeros" : "solutions";
    zerosCell.setLabel(atOrigin ? "Zeros inside" : "Solutions inside");
    nmpCell.setLabel(atOrigin ? "Zeros − Poles" : "Solutions − Poles");
    windCell.setLabel(atOrigin ? "Winding of f(γ)" : "Winding about w₀");

    if (!sing.differentiable) {
      zerosCell.set("—", "");
      polesCell.set("—", "");
      nmpCell.set("—", "");
      windCell.set(windText, windTag);
      status.className = "status warn";
      status.textContent = "f is not holomorphic — the argument principle does not apply (no f′).";
      return;
    }

    const inside = (p: Vec2): boolean => insideContour(p, contour);
    const zi = countInside(sing.zeros, inside);
    const pi = countInside(sing.poles, inside);
    const nmp = zi - pi;
    const eq = sing.exact ? "=" : "≈";
    zerosCell.set(String(zi), eq);
    polesCell.set(String(pi), eq);
    nmpCell.set(String(nmp), eq);
    windCell.set(windText, windTag);

    if (!haveImage) {
      status.className = "status";
      status.textContent = "";
    } else if (branchCut) {
      status.className = "status warn";
      status.textContent =
        "γ crosses a branch cut — f is not single-valued around this contour, so the argument principle does not apply here.";
    } else if (refreshPending) {
      // The finder hasn't caught up with the moved contour/view yet — don't assert agreement or a
      // mismatch against stale counts.
      status.className = "status";
      status.textContent = "recomputing zeros & poles…";
    } else if (!reliable || !windFinite) {
      status.className = "status warn";
      status.textContent = "γ passes near a singularity — the winding estimate is unreliable; nudge γ.";
    } else if (nmp === winding) {
      status.className = "status ok";
      status.textContent =
        `✓ winding ${winding} = ${noun} ${zi} − poles ${pi}  ·  accumulated turns ${turns.toFixed(3)}` +
        (atOrigin ? "" : `  ·  w₀ = ${fmtComplex(about)}`);
    } else {
      status.className = "status warn";
      status.textContent = `mismatch: winding ${winding} vs ${noun} − poles ${nmp} — a root may sit near γ, or the estimate is under-resolved.`;
    }
  }

  // ---- animation -----------------------------------------------------------
  function animFrame(ts: number): void {
    if (!anim.on) {
      animRaf = 0;
      return;
    }
    const dt = animLast ? (ts - animLast) / 1000 : 0;
    animLast = ts;
    const next = anim.t + dt * anim.speed;
    if (next >= 1) {
      anim.t = 1; // land exactly on the loop's end for one frame so the sweep reaches the full winding
      render();
      anim.t = next % 1;
    } else {
      anim.t = next;
      render();
    }
    animRaf = requestAnimationFrame(animFrame);
  }
  function setPlaying(on: boolean): void {
    anim.on = on;
    playBtn.textContent = on ? "⏸ Pause traversal" : "▶ Traverse γ";
    if (on) {
      animLast = 0;
      if (!animRaf) animRaf = requestAnimationFrame(animFrame);
    } else {
      schedule();
    }
  }

  // ---- interaction wiring --------------------------------------------------
  playBtn.addEventListener("click", () => setPlaying(!anim.on));
  speedInput.addEventListener("input", () => {
    const s = Number(speedInput.value);
    if (Number.isFinite(s) && s > 0) anim.speed = s;
  });
  pngBtn.addEventListener("click", () => savePng());
  const helpClose = help.querySelector(".help-close");
  helpBtn.addEventListener("click", () => {
    help.hidden = false;
  });
  if (helpClose) {
    helpClose.addEventListener("click", () => {
      help.hidden = true;
    });
  }
  help.addEventListener("click", (e) => {
    if (e.target === help) help.hidden = true; // click the backdrop to dismiss
  });
  presetSel.addEventListener("change", () => {
    const p = FUNCTION_PRESETS.find((q) => q.id === presetSel.value);
    if (p) {
      exprInput.value = p.expr;
      setExpr(p.expr);
      fitImage();
    }
  });
  exprInput.addEventListener("input", () => setExpr(exprInput.value));
  radius.addEventListener("input", () => {
    const r = Number(radius.value);
    if (Number.isFinite(r) && r > 0) {
      radiusLabel.textContent = `Radius r = ${r.toFixed(2)}`;
      commit({ ...state, contour: { ...state.contour, radius: r } }, false);
      if (state.contour.kind === "circle") scheduleRefresh(); // radius has no effect on a freehand path
    }
  });
  resetBtn.addEventListener("click", () => {
    commit({ ...state, zView: DEFAULT_VIEW_STATE.zView, wView: DEFAULT_VIEW_STATE.wView }, false);
    scheduleRefresh();
  });
  fitBtn.addEventListener("click", () => fitImage());
  resInput.addEventListener("input", () => {
    const r = Math.round(Number(resInput.value));
    if (Number.isFinite(r) && r >= 3) {
      resLabel.textContent = `Resolution ${r}`;
      commit({ ...state, render: { ...state.render, resolution: r } }, false);
    }
  });
  domainChk.input.addEventListener("change", () =>
    commit({ ...state, render: { ...state.render, showDomainCurve: domainChk.input.checked } }, false),
  );
  imageChk.input.addEventListener("change", () =>
    commit({ ...state, render: { ...state.render, showImageCurve: imageChk.input.checked } }, false),
  );
  decompChk.input.addEventListener("change", () =>
    commit({ ...state, pedagogy: { ...ped(), showDecomposition: decompChk.input.checked } }, false),
  );
  clearBtn.addEventListener("click", () => {
    draftPath = null;
    commit({ ...state, contour: { ...state.contour, kind: "circle", pinned: false } }, true);
  });

  attachContourPlane(zCanvas, {
    getView: () => state.zView,
    setView: (v: Viewport) => {
      commit({ ...state, zView: v }, false);
      scheduleRefresh(); // the search region moved with the view — re-find after the pan/zoom settles
    },
    onHover: (world: Vec2, client: { x: number; y: number }) => {
      updateTooltip(world, client); // F13 — regardless of follow/pin/path mode
      const pinned = state.contour.kind === "circle" && state.contour.pinned === true;
      if (state.contour.kind !== "circle" || pinned) return; // a path or pinned contour is fixed
      commit({ ...state, contour: { ...state.contour, centerRe: world[0], centerIm: world[1] } }, false);
      scheduleRefresh(); // the moved contour may now enclose a singularity outside the last search region
    },
    onLeave: () => hideTooltip(),
    onClick: (world: Vec2) => {
      // C7 — click a marked root to pin a small isolating circle around it (winding = its order); click
      // empty space to release a pinned contour back to cursor-follow.
      const hit = nearestRoot(world, sing, 12 / zPlaneScale());
      if (hit) {
        const r = isolateRadius(hit.root.z, sing, hit.root);
        commit(
          {
            ...state,
            contour: { kind: "circle", centerRe: hit.root.z[0], centerIm: hit.root.z[1], radius: r, pinned: true },
          },
          true,
        );
        const kindText = hit.kind === "critical" ? "critical point (f′=0)" : hit.kind;
        const wind = hit.kind === "zero" ? `+${hit.root.order}` : hit.kind === "pole" ? `−${hit.root.order}` : "0";
        showToast(`Isolated a ${kindText} · winding ${wind}`);
      } else if (state.contour.kind === "circle" && state.contour.pinned === true) {
        commit({ ...state, contour: { ...state.contour, pinned: false } }, true);
        showToast("Released γ — it follows the cursor again");
      }
    },
    onDrawStart: (world: Vec2) => {
      draftPath = [world];
      schedule();
    },
    onDrawMove: (world: Vec2) => {
      if (!draftPath) return;
      const last = draftPath[draftPath.length - 1];
      const minD = (2 / state.zView.zoom) * 0.008; // decimate to ~1/125 of the view height
      if (!last || Math.hypot(world[0] - last[0], world[1] - last[1]) > minD) {
        draftPath.push(world);
        schedule();
      }
    },
    onDrawEnd: () => {
      if (draftPath && draftPath.length >= 3) {
        const points = orientCCW(draftPath); // normalize to positive orientation so winding = N − P
        const s = pathStats(points);
        commit(
          { ...state, contour: { kind: "path", centerRe: s.centerRe, centerIm: s.centerIm, radius: s.radius, points } },
          true,
        );
      }
      draftPath = null;
      schedule();
    },
  });
  attachImagePlane(wCanvas, {
    getView: () => state.wView,
    setView: (v: Viewport) => commit({ ...state, wView: v }, false),
    targetPx: (): [number, number] | null => {
      const rect = wCanvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      return planeMap(state.wView, rect.width, rect.height).toPx(aboutPoint());
    },
    setTargetWorld: (world: Vec2) => {
      // Snap back to the origin (the classic zero-counting case) when dragged close to it.
      const snap = 8 / wPlaneScale();
      const t =
        Math.hypot(world[0], world[1]) < snap ? { re: 0, im: 0 } : { re: world[0], im: world[1] };
      commit({ ...state, target: t }, false);
      scheduleRefresh(); // the preimages of the new w₀ change
    },
  });
  window.addEventListener("resize", () => schedule());

  // ---- boot ----------------------------------------------------------------
  const initialId = presetIdForExpr(state.map.expr);
  if (initialId) presetSel.value = initialId;
  radiusLabel.textContent = `Radius r = ${state.contour.radius.toFixed(2)}`;
  resLabel.textContent = `Resolution ${state.render.resolution}`;
  refreshSing();
  renderFormula();
  render();
  if (!fromLink) fitImage();
  history.replaceState(null, "", encodeArgPrincipleState(state));
}

main();
