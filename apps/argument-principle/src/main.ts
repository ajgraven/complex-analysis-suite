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
  windingReliable,
  partialWindingTurns,
  cumulativeArg,
  crossesBranchCut,
} from "./winding.js";
import {
  planeMap,
  drawAxes,
  drawPolyline,
  drawDirectionTicks,
  drawDot,
  drawX,
  drawCircleMarker,
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
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import { attachImagePlane, attachContourPlane, type ContourMode } from "./render/nav.js";
import { createTooltip, type Tooltip } from "./render/tooltip.js";
import { findSingularities, countInside, type Region, type Singularities } from "./singularities.js";
import { nearestRoot, isolateRadius } from "./hit.js";
import { rootKey, diffEnclosure, type EnclosedRoot, type CrossEvent } from "./crossing.js";
import { equalitySentence, type EqualityState } from "./announce.js";
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

function createThemeToggle(onChange: () => void, tip: Tooltip): HTMLButtonElement {
  const KEY = "ap.theme";
  const ORDER = ["auto", "dark", "light"] as const;
  type Choice = (typeof ORDER)[number];
  const LABEL: Record<Choice, string> = { auto: "Theme: auto", dark: "Theme: dark", light: "Theme: light" };
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ghost";
  btn.setAttribute("aria-label", "Toggle colour theme");
  tip.attach(btn, "theme");
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

/**
 * The Simple / Explore density switch (§12 decision 4). "Explore" (default) shows everything at once — the
 * organization goal; "Simple" hides the advanced analytic layer (∮ evidence, traverse/root-vector controls,
 * resolution/toggles) for a novice's first look, keeping the planes + equality + legend + strip. The choice
 * rides `data-density` on <html> (CSS does the hiding) and persists per device in localStorage.
 */
function createDensityToggle(onChange: () => void, tip: Tooltip): HTMLElement {
  const KEY = "ap.density";
  type Level = "simple" | "explore";
  const read = (): Level => {
    try {
      return localStorage.getItem(KEY) === "simple" ? "simple" : "explore";
    } catch {
      return "explore";
    }
  };
  const seg = document.createElement("div");
  seg.className = "modeseg";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "Detail level");
  const btns = new Map<Level, HTMLButtonElement>();
  let current = read();
  const apply = (l: Level): void => {
    current = l;
    document.documentElement.dataset.density = l;
    for (const [id, b] of btns) b.setAttribute("aria-pressed", String(id === l));
  };
  for (const l of ["simple", "explore"] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = l === "simple" ? "Simple" : "Explore";
    tip.attach(b, l);
    b.addEventListener("click", () => {
      try {
        localStorage.setItem(KEY, l);
      } catch {
        /* storage unavailable */
      }
      apply(l);
      onChange();
    });
    btns.set(l, b);
    seg.append(b);
  }
  apply(current);
  return seg;
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
  let mode: ContourMode = "move"; // the active contour tool (§12 / ADR-0022) — transient
  // §12 "one cursor": the hovered (mouse) / tapped (touch) z-plane point, linked live to its image f(z)
  // in the w-plane and — when it lies on γ — to its parameter t on the argument strip. Transient.
  let probe: Vec2 | null = null;
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
  // An Isolate tap re-frames γ around one root, so the *other* roots leaving γ are not a crossing the
  // user made — suppress the crossing toast for exactly the render that tap schedules (its own toast wins).
  let suppressCrossOnce = false;
  let flash: { pts: Vec2[]; t0: number } | null = null;
  let flashRaf = 0;
  let toastTimer = 0;
  let toastHideTimer = 0; // second stage: hide the toast (a11y) after its fade-out finishes
  let lastSR = ""; // last text pushed to the ARIA live region (avoid re-announcing an unchanged verdict)

  // ---- DOM shell -----------------------------------------------------------
  const tip = createTooltip(); // shared accessible hover/focus tooltips for the controls
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.innerHTML = "<strong>Argument Principle</strong><span>winding = zeros − poles</span>";
  const spacer = document.createElement("div");
  spacer.className = "spacer";
  // Contour-tool segmented control (§12 / ADR-0022) — visible on mouse and touch alike.
  const modeSeg = document.createElement("div");
  modeSeg.className = "modeseg";
  modeSeg.setAttribute("role", "group");
  modeSeg.setAttribute("aria-label", "Contour tool");
  const MODES: readonly { id: ContourMode; label: string }[] = [
    { id: "move", label: "Move γ" },
    { id: "draw", label: "Draw" },
    { id: "isolate", label: "Isolate" },
  ];
  const modeBtns = new Map<ContourMode, HTMLButtonElement>();
  for (const m of MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = m.label;
    b.setAttribute("aria-pressed", String(m.id === mode));
    b.addEventListener("click", () => setMode(m.id));
    tip.attach(b, m.id);
    modeBtns.set(m.id, b);
    modeSeg.append(b);
  }
  const clearBtn = button("Clear drawn curve");
  const fitBtn = button("Fit image");
  const resetBtn = button("Reset views");
  const pngBtn = button("Save PNG");
  const helpBtn = button("?");
  helpBtn.setAttribute("aria-label", "Help");
  tip.attach(clearBtn, "clear");
  tip.attach(fitBtn, "fit");
  tip.attach(resetBtn, "reset");
  tip.attach(pngBtn, "png");
  tip.attach(helpBtn, "help");
  const densitySeg = createDensityToggle(() => schedule(), tip);
  const themeBtn = createThemeToggle(() => schedule(), tip);
  topbar.append(brand, spacer, modeSeg, clearBtn, fitBtn, resetBtn, pngBtn, densitySeg, helpBtn, themeBtn);

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
  const stopBtn = button("↺ Reset"); // stop the traversal AND clear its overlay (trace dot / wedge / vectors)
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
  drawHint.textContent = "Pick a tool above, then act on the z-plane.";

  // Hover/focus tooltips for the remaining controls. Inputs attach on their wrapping <label> (focusin/out
  // bubble from the inner control, and the label gives a comfortable hover target).
  tip.attach(playBtn, "play");
  tip.attach(stopBtn, "stop");
  tip.attach(presetWrap, "preset");
  tip.attach(exprWrap, "expr");
  tip.attach(radiusWrap, "radius");
  tip.attach(resWrap, "res");
  tip.attach(speedWrap, "speed");
  tip.attach(domainChk.root, "chkDomain");
  tip.attach(imageChk.root, "chkImage");
  tip.attach(decompChk.root, "chkVectors");

  // Grouped, labelled controls (§12 organization): Function · Contour · Explore · View. The `slug` tags
  // each group so the Simple/Explore density switch (decision 4) can hide the advanced ones via CSS.
  const controlGroup = (title: string, slug: string, ...children: HTMLElement[]): HTMLElement => {
    const g = document.createElement("section");
    g.className = `cgroup cgroup-${slug}`;
    const h = document.createElement("h2");
    h.className = "cgroup-t";
    h.textContent = title;
    const body = document.createElement("div");
    body.className = "cgroup-b";
    body.append(...children);
    g.append(h, body);
    return g;
  };
  const controls = document.createElement("div");
  controls.className = "controls";
  controls.append(
    controlGroup("Function", "function", presetWrap, exprWrap),
    controlGroup("Contour", "contour", radiusWrap, drawHint),
    controlGroup("Explore", "explore", playBtn, stopBtn, speedWrap, decompChk.root),
    controlGroup("View", "view", resWrap, domainChk.root, imageChk.root),
  );

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
    "<b>Domain</b> — z-plane · pick a tool above · drag to pan · pinch or scroll to zoom · γ colored by t (matches f(γ)) · " +
    '<span class="key zero">○ zero</span> <span class="key pole">✕ pole</span> ' +
    '<span class="key crit">◆ f′=0</span>';
  zPane.append(zCanvas, zCap);
  // Name each pane for a screen reader (ADR-0028, U5). These are mouse-interactive (draw/pan/drag) but not
  // yet keyboard-driven, so role="img" — the honest choice (role="application" would claim keyboard support
  // the canvas doesn't have). Keyboard operability of the contour tools is a deferred follow-on.
  attachCanvasA11y(zCanvas, {
    role: "img",
    label: "Domain, the z-plane: the contour γ, with the map's zeros, poles, and critical points",
  });
  const wPane = document.createElement("figure");
  wPane.className = "pane";
  const wCanvas = makeCanvas();
  const wCap = document.createElement("figcaption");
  wCap.innerHTML = "<b>Image</b> — w = f(z) · f(γ) · drag the ● target w₀ · drag to pan, scroll to zoom";
  wPane.append(wCanvas, wCap);
  attachCanvasA11y(wCanvas, {
    role: "img",
    label: "Image, the w-plane: the image curve f(γ) and its winding number about the origin",
  });
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
  attachCanvasA11y(argCanvas, {
    role: "img",
    label: "The accumulated argument of f along the contour versus t; one turn is 2π, landing on the winding number",
  });

  // The persistent equality readout, laid out AS the equation (§12 organization). Always present — the
  // badge + numbers + verdict update in place; nothing appears/vanishes. `updateReadout` populates it.
  const eqbar = document.createElement("div");
  eqbar.className = "eqbar";
  eqbar.innerHTML =
    '<span class="eq-badge" aria-hidden="true">·</span>' +
    '<div class="eq-body">' +
    '<div class="eq-expr">' +
    '<span class="eq-term eq-wind"><span class="eq-lbl">winding</span><b class="eq-n">—</b></span>' +
    '<span class="eq-rel">=</span>' +
    '<span class="eq-term eq-zero"><span class="eq-lbl">zeros</span><b class="eq-n">—</b></span>' +
    '<span class="eq-op">−</span>' +
    '<span class="eq-term eq-pole"><span class="eq-lbl">poles</span><b class="eq-n">—</b></span>' +
    "</div>" +
    '<div class="eq-verdict">enter a contour to see the theorem</div>' +
    "</div>";
  const q = (sel: string): HTMLElement => {
    const el = eqbar.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`argument-principle: missing eqbar element ${sel}`);
    return el;
  };
  const eqBadge = q(".eq-badge");
  const eqRel = q(".eq-rel");
  const eqWindLbl = q(".eq-wind .eq-lbl");
  const eqWindNum = q(".eq-wind .eq-n");
  const eqZeroLbl = q(".eq-zero .eq-lbl");
  const eqZeroNum = q(".eq-zero .eq-n");
  const eqPoleNum = q(".eq-pole .eq-n");
  const eqVerdict = q(".eq-verdict");

  // A persistent legend (§12): identity is shape + colour, so it stays visible, not buried in a caption.
  const legend = document.createElement("div");
  legend.className = "legend";
  legend.setAttribute("aria-label", "Legend");
  legend.innerHTML =
    '<span class="lg"><span class="gl gl-zero">○</span> zero</span>' +
    '<span class="lg"><span class="gl gl-pole">✕</span> pole</span>' +
    '<span class="lg"><span class="gl gl-crit">◆</span> f′=0</span>' +
    '<span class="lg"><span class="gl gl-target">●</span> target w₀</span>' +
    '<span class="lg"><span class="sw sw-ramp"></span> colour = position t (γ ↔ f(γ))</span>' +
    '<span class="lg"><span class="gl">▸</span> traversal direction</span>';

  // The evidence group: the analytic ∮ f′/f check (always present), plus the traversal-time decomposition
  // and sweep notes. `integralEl` is never hidden now — it shows a stable line or a "why not" placeholder.
  const evidence = document.createElement("div");
  evidence.className = "evidence";
  const integralEl = document.createElement("div");
  integralEl.className = "integral";
  const decompEl = document.createElement("div");
  decompEl.className = "decomp";
  decompEl.hidden = true;
  const animEl = document.createElement("div");
  animEl.className = "anim";
  animEl.hidden = true;
  evidence.append(integralEl, animEl, decompEl);
  const noteEl = document.createElement("p");
  noteEl.className = "note";
  noteEl.innerHTML =
    "The argument principle: the winding number of f(γ) about 0 equals (zeros − poles) of f enclosed by " +
    "γ. Counts marked <span class=\"approx\">=</span> are exact (f rational, roots found algebraically); " +
    "<span class=\"approx\">≈</span> are numerical estimates (transcendental f, or a winding read from " +
    "the sampled image).";

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
        <li><b>z-plane tools</b> (top bar) — <b>Move γ</b>: tap to place the circular contour, drag to pan; <b>Draw</b>: drag to sketch a freehand γ; <b>Isolate</b>: tap a root to pin a circle around it. Pinch or scroll to zoom; hover a marker (mouse) or tap it (touch) for its value and order.</li>
        <li><b>Markers</b> — <span class="key zero">○ zeros</span>, <span class="key pole">✕ poles</span>, <span class="key crit">◆ critical points</span> (f′ = 0), <span class="key" style="color:var(--target)">● target w₀</span>. Distinct shapes, so identity never depends on colour.</li>
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
        <li><b>Isolate a root</b> — in Isolate mode, tap any ○/✕/◆ to pin a small circle around it; the winding then equals its order. Tap empty space, or <b>Clear</b>, to release.</li>
        <li><b>Cross the boundary</b> — move γ (or its radius) so a root passes through it; the count jumps ±1, flagged by a pulse and a note.</li>
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
  // Screen-reader live region: the equality verdict, announced non-visually (ADR-0023).
  const liveEl = document.createElement("div");
  liveEl.className = "sr-only";
  liveEl.setAttribute("role", "status");
  liveEl.setAttribute("aria-live", "polite");

  // §12 (discoverability) — a first-run coach: a small once-only card that orients a newcomer, then gets out
  // of the way. localStorage-gated (never nags a returning visitor); "?" re-opens the full help any time.
  const coach = document.createElement("div");
  coach.className = "coach-overlay";
  coach.hidden = true;
  coach.innerHTML = `
    <div class="coach-card" role="dialog" aria-label="Getting started">
      <h2>Winding = zeros − poles</h2>
      <p>The <b>left</b> plane is the domain (a loop <b>γ</b>); the <b>right</b> is its image <b>f(γ)</b>.
      How many times f(γ) winds around the origin equals the zeros minus poles of f inside γ — read it live
      in the bar with the ✓ / ⚠ badge.</p>
      <ul>
        <li>Pick a tool — <b>Move γ</b>, <b>Draw</b>, or <b>Isolate</b> — then act on the left plane. Drag to pan, pinch or scroll to zoom.</li>
        <li>Hover (or tap) a point to light up the <b>same point</b> on both planes and the strip.</li>
        <li><b>Simple / Explore</b> (top bar) sets how much detail shows; <b>?</b> opens the full guide.</li>
      </ul>
      <div class="coach-actions"><button class="coach-go" type="button">Got it</button></div>
    </div>`;

  // Responsive workspace (§12 / decision 3): on wide screens the rail is a persistent side column so the
  // equality, legend, and evidence stay visible beside the planes; on narrow screens everything linearizes
  // and the equality bar sticks to the top (CSS `display:contents` + `order` do the reflow — see main.css).
  const mainCol = document.createElement("div");
  mainCol.className = "main";
  mainCol.append(controls, formula, errEl, stage, argPanel);
  const rail = document.createElement("aside");
  rail.className = "rail";
  rail.append(eqbar, legend, evidence, noteEl);
  const workspace = document.createElement("div");
  workspace.className = "workspace";
  workspace.append(mainCol, rail);

  app.append(topbar, importNote, workspace, help, coach, tooltipEl, toastEl, liveEl);
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
  /** Switch the contour tool (§12 / ADR-0022): reflect it on the segmented control, the cursor, the hint. */
  function setMode(m: ContourMode): void {
    mode = m;
    for (const [id, b] of modeBtns) b.setAttribute("aria-pressed", String(id === m));
    zCanvas.style.cursor = m === "draw" ? "crosshair" : m === "isolate" ? "pointer" : "grab";
    drawHint.textContent =
      m === "draw"
        ? "Draw: drag on the z-plane to sketch a contour · two-finger drag to pan."
        : m === "isolate"
          ? "Isolate: tap a root (○ ✕ ◆) to pin a circle around it · tap empty space to release."
          : "Move γ: tap to place the contour · drag to pan · pinch or scroll to zoom.";
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
    if (toastHideTimer) clearTimeout(toastHideTimer);
    requestAnimationFrame(() => toastEl.classList.add("show"));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove("show");
      // Fully remove it from the a11y/DOM tree once the fade completes (opacity alone leaves it exposed).
      toastHideTimer = window.setTimeout(() => {
        toastEl.hidden = true;
      }, 260);
    }, 2600);
  }
  function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  /** Push the equality verdict to the ARIA live region — only on change, to avoid re-announcing (ADR-0023). */
  function announce(s: EqualityState): void {
    const txt = equalitySentence(s);
    if (txt !== lastSR) {
      lastSR = txt;
      liveEl.textContent = txt;
    }
  }
  // C6 — announce a boundary crossing + pulse the root(s) that crossed.
  function announceCrossing(events: CrossEvent[], nmp: number, atOrigin: boolean): void {
    const label = (e: CrossEvent): string => {
      const noun = e.kind === "pole" ? "A pole" : atOrigin ? "A zero" : "A solution";
      return `${noun} ${e.entered ? "entered" : "left"} γ`;
    };
    showToast(`${events.map(label).join(" · ")} — ${atOrigin ? "zeros" : "solutions"} − poles = ${nmp}`);
    const pts = events.map((e) => e.z).filter((z) => Number.isFinite(z[0]) && Number.isFinite(z[1]));
    if (!pts.length || prefersReducedMotion()) return; // the toast still fires; the pulse is decorative motion
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
    if (!anim.on) render(); // while traversing, animFrame already renders every frame (which draws the pulse)
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
  // A pan/zoom or a moved γ changes only the search REGION — which matters solely for the transcendental
  // grid finder. The rational-exact path roots num/den globally (region-independent), so for it a view/γ
  // change needs no re-find and must NOT blank the verdict to "recomputing…" (a flicker on the common
  // presets). Target changes still go through scheduleRefresh directly — they alter the roots for every f.
  function scheduleRegionRefresh(): void {
    if (!sing.exact) scheduleRefresh();
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

  // §12 "one cursor" — a hollow ring + centre dot marking the linked probe point in a plane. Deliberately
  // a distinct shape/weight from the ○✕◆● marks so it reads as a transient cursor, not a located root.
  function drawProbeMarker(ctx: CanvasRenderingContext2D, map: PlaneMap, world: Vec2, color: string): void {
    const p = map.toPx(world);
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 8, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
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

    // The winding accumulation is frame-constant (wPts + about), yet windingTurns() rebuilds the whole
    // cumulativeArg array on every call and windingReliable() re-walks the contour — so derive the shared
    // pieces ONCE here and reuse them across the strip-chart, integral, equation, and animation readouts
    // rather than re-computing them 4–6× per frame (A10 perf). `cumArg` also feeds the strip-chart directly,
    // and `totalTurns` is its last entry (the full winding), so the two can never diverge.
    const haveWinding = !model.error && wPts.length > 1;
    const cumArg = haveWinding ? cumulativeArg(wPts, about) : [0];
    const totalTurns = cumArg[cumArg.length - 1];
    const windReliable = haveWinding && windingReliable(wPts, about);

    const cContour = cssVar("--accent", "#3bb6c0"); // γ (UI accent), distinct from the zero mark
    const cZero = cssVar("--zero", "#4585e0"); // ○ zeros
    const cPole = cssVar("--pole", "#cf7b30"); // ✕ poles
    const cCrit = cssVar("--crit", "#26a86f"); // ◆ critical points
    const cTarget = cssVar("--target", "#cf5691"); // ● target w₀
    const cCenter = cssVar("--muted", "#8c95a9");
    const cTrace = cssVar("--trace", "#a08bff"); // traversal point
    const cProbe = cssVar("--text", "#e7eaf2"); // §12 "one cursor" ring (neutral, distinct from the marks)
    const cBg = cssVar("--bg", "#0f1115"); // halo behind direction arrowheads, so they read on any ramp colour

    // §12 "one cursor": resolve the probe to a z-point, its image f(z), and — when the probe lies within a
    // few px of γ — the parameter t of that spot on the loop, so the argument strip highlights it too.
    let probeZ: Vec2 | null = null;
    let probeW: Vec2 | null = null;
    let probeT: number | null = null;
    if (probe && !model.error) {
      probeZ = probe;
      if (zPts.length > 1) {
        const scale = zPlaneScale(); // px per world unit
        let best = Infinity;
        let bi = -1;
        for (let i = 0; i < zPts.length; i++) {
          const d = Math.hypot(zPts[i][0] - probe[0], zPts[i][1] - probe[1]);
          if (d < best) {
            best = d;
            bi = i;
          }
        }
        if (bi >= 0 && best * scale <= 10) {
          probeZ = zPts[bi]; // snap onto γ so the link reads exactly, and expose its t
          probeT = bi / zPts.length;
        }
      }
      const w = model.f(probeZ);
      probeW = Number.isFinite(w[0]) && Number.isFinite(w[1]) ? w : null;
    }

    const pinned = state.contour.kind === "circle" && state.contour.pinned === true;
    clearBtn.disabled = !(state.contour.kind === "path" || !!draftPath || pinned);
    clearBtn.textContent = pinned ? "Release γ" : "Clear drawn curve";
    radius.disabled = contour.kind === "path"; // radius has no meaning for a freehand contour

    // The animated traversal point (E1): the same parameter t marks a point on γ and its image on f(γ).
    const showAnim = anim.on || anim.t > 0;
    stopBtn.disabled = !showAnim; // nothing to reset when the traversal is at rest (t=0, not playing)
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
    // While a freehand draft is in progress, `effectiveContour()` is the tiny path near the pen — NOT γ
    // moving over the roots — so we freeze the baseline (no false "left/entered γ") and let onDrawEnd
    // re-baseline (via suppressCrossOnce) when the finished contour commits.
    if (singKey !== null && !draftPath) {
      const cur: EnclosedRoot[] = [
        ...encZeros.map((r) => ({ key: rootKey("zero", r.z), kind: "zero" as const, z: r.z, order: r.order })),
        ...encPoles.map((r) => ({ key: rootKey("pole", r.z), kind: "pole" as const, z: r.z, order: r.order })),
      ];
      if (prevStableKey === singKey) {
        const events = diffEnclosure(prevEnclosed, cur);
        if (events.length && !suppressCrossOnce) announceCrossing(events, nmp, about[0] === 0 && about[1] === 0);
      }
      prevEnclosed = new Map(cur.map((e) => [e.key, e]));
      prevStableKey = singKey;
    } else if (singKey === null) {
      prevEnclosed = new Map();
      prevStableKey = null;
    }
    // else (drawing over a stable root set): keep the frozen baseline until the draft commits.
    suppressCrossOnce = false; // one-shot: consumed by the render an Isolate tap / draw-commit scheduled

    drawPane(zCanvas, state.zView, (ctx, map) => {
      if (state.render.showDomainCurve) {
        // A2 — couple γ to f(γ)'s parameter-t ramp so a point on γ maps to the same-colored point on f(γ).
        drawPolyline(
          ctx,
          map,
          zPts,
          ped().coupleColor ? { closed: true, rampByT: true, width: 2 } : { closed: true, color: cContour, width: 2 },
        );
        // ADR-0023 — periodic arrowheads give the traversal direction non-chromatically (CVD/greyscale cue).
        drawDirectionTicks(ctx, map, zPts, true, 8, cProbe, cBg);
      }
      for (const c of sing.critical) drawDiamond(ctx, map, c.z, cCrit);
      for (const p of sing.poles) {
        drawX(ctx, map, p.z, cPole);
        drawOrderBadge(ctx, map, p.z, p.order, cPole);
      }
      for (const z of sing.zeros) {
        drawCircleMarker(ctx, map, z.z, cZero); // ○ — shape-distinct from the pole's ✕
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
      if (probeZ) drawProbeMarker(ctx, map, probeZ, cProbe); // §12 "one cursor" — the linked point
    });
    drawPane(wCanvas, state.wView, (ctx, map) => {
      if (state.render.showImageCurve && wPts.length > 1) {
        drawPolyline(ctx, map, wPts, { closed: true, rampByT: true, width: 2 });
        // ADR-0023 — arrowheads trace the image's winding direction (it may loop the origin several times).
        drawDirectionTicks(ctx, map, wPts, true, 10, cProbe, cBg);
      }
      drawDot(ctx, map, about, cTarget, 5);
      // D8 — a ring around the target marks it as draggable (drag to count solutions of f = w₀).
      {
        const tpx = map.toPx(about);
        if (Number.isFinite(tpx[0]) && Number.isFinite(tpx[1])) {
          ctx.save();
          ctx.strokeStyle = cTarget;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(tpx[0], tpx[1], 9, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = cTarget;
          ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
          ctx.textBaseline = "bottom";
          ctx.fillText("w₀", tpx[0] + 12, tpx[1] - 8); // labelled draggable handle
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
      // §12 "one cursor" — the probe's image f(z), with a dashed arg-vector from the target to it.
      if (probeW) {
        const o = map.toPx(about);
        const pp = map.toPx(probeW);
        if (Number.isFinite(pp[0]) && Number.isFinite(pp[1])) {
          ctx.save();
          ctx.strokeStyle = cProbe;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.25;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(o[0], o[1]);
          ctx.lineTo(pp[0], pp[1]);
          ctx.stroke();
          ctx.restore();
        }
        drawProbeMarker(ctx, map, probeW, cProbe);
      }
    });

    // A1 — the argument strip-chart (always-on): accumulated turns of arg f(γ(t)) climbing to the winding.
    if (ped().showArgGraph) {
      argPanel.hidden = false;
      const turns = cumArg; // the shared accumulation (see the frame-constant block above)
      const wn = haveWinding ? Math.round(totalTurns) : NaN;
      drawArgGraph(
        argCanvas,
        // On a branch cut the total is not a winding number — don't label it as one (the cliff still shows).
        // The strip marker follows the traversal (animating) or, when idle, the linked "one cursor" on γ.
        { turns, marker: showAnim ? anim.t : probeT, winding: !branchCut && Number.isFinite(wn) ? wn : null },
        {
          grid: axisColors().grid,
          axis: axisColors().axis,
          text: cssVar("--text", "#e7eaf2"),
          muted: cssVar("--muted", "#8c95a9"),
          marker: showAnim ? cTrace : cProbe,
        },
      );
    } else {
      argPanel.hidden = true;
    }

    // B4 — the analytic integral (1/2πi)∮ f′/f dz, a quadrature independent of the winding accumulation
    // that rounds to the same Z − P. Honest `≈`: it is a Riemann sum, and the pedagogy is that it agrees.
    // §12: kept always present as evidence — it shows the value, or a plain line saying why it can't.
    const fpFn = model.fp;
    if (!ped().showIntegral) {
      integralEl.hidden = true;
    } else if (!fpFn || !sing.differentiable) {
      integralEl.hidden = false;
      integralEl.innerHTML = "∮<sub>γ</sub> f′/f — the analytic check needs a holomorphic f (no symbolic f′ here).";
    } else if (model.error || wPts.length <= 1) {
      integralEl.hidden = false;
      integralEl.innerHTML = "∮<sub>γ</sub> f′/f — the analytic check appears once a valid f and contour are set.";
    } else {
      const fMinusTarget = (z: Cplx): Cplx => {
        const w = model.f(z);
        return [w[0] - about[0], w[1] - about[1]];
      };
      const atOrigin = about[0] === 0 && about[1] === 0;
      const integrand = atOrigin ? "f′/f" : "f′/(f−w₀)";
      integralEl.hidden = false;
      if (branchCut) {
        // The integral is not near an integer — the tell that f is multivalued around γ.
        const val = normalizeByTwoPiI(logDerivIntegral(fMinusTarget, fpFn, zPts))[0];
        integralEl.innerHTML =
          `<span class="approx">≈</span> (1/2πi) ∮<sub>γ</sub> ${integrand} dz = ` +
          `<b>${Number.isFinite(val) ? val.toFixed(3) : "—"}</b> — not an integer: f is not single-valued around γ.`;
      } else if (showAnim) {
        const vpart = normalizeByTwoPiI(partialLogDerivIntegral(fMinusTarget, fpFn, zPts, anim.t))[0];
        integralEl.innerHTML =
          `<span class="approx">≈</span> (1/2πi) ∮ ${integrand} dz so far = ` +
          `<b>${Number.isFinite(vpart) ? vpart.toFixed(3) : "—"}</b> → converging to ${nmp} = zeros − poles`;
      } else {
        const val = normalizeByTwoPiI(logDerivIntegral(fMinusTarget, fpFn, zPts))[0];
        // Gate the "→ N = zeros − poles" claim on the SAME reliability the verdict panel uses (WP6 / A10):
        // when γ grazes a singularity the trapezoidal f′/f sum is ill-conditioned, so round(val) can
        // disagree with the count the panel (correctly) flags ⚠ unreliable. Don't assert the equality then —
        // show the raw value and the same "nudge γ" guidance instead of a contradicting integer.
        const b4Reliable = windReliable;
        integralEl.innerHTML = !Number.isFinite(val)
          ? `∮<sub>γ</sub> ${integrand} dz — γ passes through a singularity; nudge it to read the integral.`
          : b4Reliable
            ? `<span class="approx">≈</span> analytic check: (1/2πi) ∮<sub>γ</sub> ${integrand} dz = ` +
              `<b>${val.toFixed(3)}</b> → ${Math.round(val)} = zeros − poles`
            : `<span class="approx">≈</span> analytic check: (1/2πi) ∮<sub>γ</sub> ${integrand} dz = ` +
              `<b>${val.toFixed(3)}</b> — γ passes near a singularity; the estimate is unreliable, nudge γ.`;
      }
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

    updateReadout(contour, about, branchCut, haveWinding, totalTurns, windReliable);

    if (showAnim && !model.error && wPts.length > 1) {
      const swept = partialWindingTurns(wPts, anim.t, about);
      const full = Math.round(totalTurns);
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
    about: Vec2,
    branchCut: boolean,
    haveImage: boolean,
    totalTurns: number,
    reliable: boolean,
  ): void {
    // The winding accumulation + reliability are computed once in render() and threaded in (A10 perf).
    const turns = haveImage ? totalTurns : NaN;
    const winding = haveImage ? Math.round(turns) : NaN;
    // Never surface a NaN (a pole on a contour sample), and never a winding across a branch cut (undefined).
    const windFinite = haveImage && !branchCut && Number.isFinite(winding);

    // D8 — when the target w₀ ≠ 0 the counted roots are solutions of f = w₀, not zeros of f.
    const atOrigin = about[0] === 0 && about[1] === 0;
    const noun = atOrigin ? "zeros" : "solutions";
    eqWindLbl.textContent = atOrigin ? "winding" : "winding about w₀";
    eqZeroLbl.textContent = noun;
    eqWindNum.textContent = windFinite ? String(winding) : "—";

    // The equality panel reads as the equation: badge · winding = zeros − poles · verdict. Always present;
    // the relation shows `≠` on a genuine mismatch so equal-looking numbers never imply agreement falsely.
    const setEq = (badge: string, cls: string, rel: string, verdict: string): void => {
      eqBadge.textContent = badge;
      eqRel.textContent = rel;
      eqbar.className = cls ? `eqbar ${cls}` : "eqbar";
      eqVerdict.textContent = verdict;
    };

    if (!sing.differentiable) {
      eqZeroNum.textContent = "—";
      eqPoleNum.textContent = "—";
      setEq("⚠", "warn", "=", "f is not holomorphic — the theorem does not apply (no f′)");
      announce({ kind: "nonholomorphic" });
      return;
    }

    const inside = (p: Vec2): boolean => insideContour(p, contour);
    const zi = countInside(sing.zeros, inside);
    const pi = countInside(sing.poles, inside);
    const nmp = zi - pi;
    const prov = sing.exact ? "exact" : "estimate";
    eqZeroNum.textContent = String(zi);
    eqPoleNum.textContent = String(pi);

    if (!haveImage) {
      setEq("·", "", "=", "enter a contour to see the theorem");
      announce({ kind: "none" });
    } else if (branchCut) {
      setEq("⚠", "warn", "=", "γ crosses a branch cut — f is not single-valued around γ");
      announce({ kind: "branchcut" });
    } else if (refreshPending) {
      // The finder hasn't caught up with the moved contour/view yet — don't assert agreement or a mismatch.
      setEq("·", "", "=", "recomputing zeros & poles…");
    } else if (!reliable || !windFinite) {
      setEq("⚠", "warn", "≈", "γ passes near a singularity — the winding estimate is unreliable; nudge γ");
      announce({ kind: "unreliable" });
    } else if (nmp === winding) {
      setEq(
        "✓",
        "ok",
        "=",
        `holds (${prov}) · accumulated turns ${turns.toFixed(3)}` + (atOrigin ? "" : ` · w₀ = ${fmtComplex(about)}`),
      );
      announce({ kind: "ok", winding, count: zi, poles: pi, noun });
    } else {
      setEq("⚠", "warn", "≠", `mismatch — a root may sit near γ, or the estimate is under-resolved (${prov} count)`);
      announce({ kind: "mismatch", winding, count: zi, poles: pi, noun });
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
  /** Stop the traversal and rewind to t=0 so its overlay (trace dot / swept wedge / arg-vector / root
   *  vectors) clears — a pause keeps the frame for inspection; Reset takes it fully off. */
  function resetTraversal(): void {
    anim.on = false;
    anim.t = 0;
    animLast = 0;
    playBtn.textContent = "▶ Traverse γ";
    schedule(); // animFrame self-terminates on `!anim.on`; this repaints the now-clean scene
  }

  // ---- interaction wiring --------------------------------------------------
  playBtn.addEventListener("click", () => setPlaying(!anim.on));
  stopBtn.addEventListener("click", () => resetTraversal());
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
  // First-run coach: dismiss on "Got it" / backdrop, and remember so it never shows again.
  const dismissCoach = (): void => {
    coach.hidden = true;
    try {
      localStorage.setItem("ap.coached", "1");
    } catch {
      /* storage unavailable */
    }
  };
  coach.querySelector(".coach-go")?.addEventListener("click", dismissCoach);
  coach.addEventListener("click", (e) => {
    if (e.target === coach) dismissCoach();
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
      if (state.contour.kind === "circle") scheduleRegionRefresh(); // radius has no effect on a freehand path
    }
  });
  resetBtn.addEventListener("click", () => {
    commit({ ...state, zView: DEFAULT_VIEW_STATE.zView, wView: DEFAULT_VIEW_STATE.wView }, false);
    scheduleRegionRefresh();
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
      scheduleRegionRefresh(); // the search region moved with the view — re-find (transcendental only)
    },
    getMode: () => mode,
    onHover: (world: Vec2, client: { x: number; y: number }) => {
      updateTooltip(world, client); // F13 root tooltip
      probe = world; // §12 "one cursor": link this point to its image (and the strip when on γ)
      schedule();
    },
    onLeave: () => {
      hideTooltip();
      probe = null;
      schedule();
    },
    onPlace: (world: Vec2) => {
      // Move mode — a tap places the circular contour's centre (converting from a path / releasing a pin).
      // A tap teleports γ, so any roots between the old and new centre aren't "crossed" by the user —
      // re-baseline instead of firing a jumble of entered/left toasts (same rule as Isolate / draw-commit).
      suppressCrossOnce = true;
      commit(
        {
          ...state,
          contour: { kind: "circle", centerRe: world[0], centerIm: world[1], radius: state.contour.radius, pinned: false },
        },
        false,
      );
      scheduleRegionRefresh(); // a moved contour may enclose a singularity outside the last search region (transcendental)
    },
    onIsolate: (world: Vec2) => {
      // Isolate mode — a tap on a marked root pins a small isolating circle (winding = its order); a tap on
      // empty space releases a pinned contour.
      const hit = nearestRoot(world, sing, 14 / zPlaneScale());
      if (hit) {
        const r = isolateRadius(hit.root.z, sing, hit.root);
        suppressCrossOnce = true; // the other roots leaving γ isn't a crossing the user made — see flag decl
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
        showToast("Released γ");
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
        // The finished contour is a fresh γ, not the old one dragged across roots — re-baseline the
        // crossing tracker on the next render instead of announcing every enclosed root as a crossing.
        suppressCrossOnce = true;
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
  setMode(mode); // initial cursor + hint for the default tool
  radiusLabel.textContent = `Radius r = ${state.contour.radius.toFixed(2)}`;
  resLabel.textContent = `Resolution ${state.render.resolution}`;
  refreshSing();
  renderFormula();
  render();
  if (!fromLink) fitImage();
  history.replaceState(null, "", encodeArgPrincipleState(state));
  // First-run coach: show once, unless a returning visitor already dismissed it.
  try {
    if (localStorage.getItem("ap.coached") !== "1") coach.hidden = false;
  } catch {
    /* storage unavailable — skip the coach rather than nag every load */
  }
}

// Run inside @cas/ui's fatal-error boundary (ADR-0028, U5): the explorer boots into a bare <div id="app">
// with no error element, so an uncaught main() throw white-screened; now it surfaces a role=alert banner.
runWithFatalBoundary(main, {
  onError: (e) => console.error("Failed to initialize the Argument Principle explorer:", e),
  genericMessage:
    "Something went wrong starting the Argument Principle explorer. See the browser console for details.",
});
