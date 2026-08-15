// apps/argument-principle — an educational visualizer for the argument principle.
//
// The theorem: the winding number of the image curve f(γ) about the origin equals the number of zeros
// minus poles of f enclosed by the contour γ. Phase 1 makes the right-hand side LIVE — a contour that
// follows the cursor, per-pane pan/zoom, a KaTeX formula preview, an adjustable radius, and the winding
// read off the sampled image curve. The left-hand side (locating and counting zeros/poles) and the four
// N − P = winding readouts arrive in Phase 2.
import "./styles/main.css";
import "katex/dist/katex.min.css";
import katex from "katex";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { toLatex } from "@cas/expr/latex";
import type { Complex } from "@cas/expr/complex";
import {
  DEFAULT_VIEW_STATE,
  decodeArgPrincipleState,
  encodeArgPrincipleState,
  type ArgPrincipleViewState,
  type Viewport as ViewportState,
} from "./viewState.js";
import { FUNCTION_PRESETS, presetIdForExpr } from "./presets.js";
import { sampleCircle, type Circle } from "./contour.js";
import { windingTurns, windingReliable } from "./winding.js";
import {
  planeMap,
  drawAxes,
  drawPolyline,
  drawDot,
  fitViewport,
  type AxisColors,
  type PlaneMap,
  type Vec2,
  type Viewport,
} from "./render/plane.js";
import { attachPanZoom, attachContourPlane } from "./render/nav.js";

const C0: Complex = [0, 0];

interface Model {
  readonly f: (z: Vec2) => Vec2;
  readonly latex: string | null;
  readonly error: string | null;
}

/** Parse + compile an @cas/expr source into a CPU evaluator f: ℂ → ℂ, its LaTeX, or an error. */
function buildModel(expr: string): Model {
  try {
    const ast = parse(expr);
    const fn = makeComplexFn(ast);
    let latex: string | null = null;
    try {
      latex = toLatex(ast);
    } catch {
      latex = null;
    }
    return {
      f: (z: Vec2): Vec2 => {
        const zc: Complex = [z[0], z[1]];
        const w = fn(zc, C0);
        return [w[0], w[1]];
      },
      latex,
      error: null,
    };
  } catch (e) {
    return { f: (): Vec2 => [NaN, NaN], latex: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function axisColors(): AxisColors {
  return { grid: cssVar("--grid", "#2a3140"), axis: cssVar("--axis", "#4a5468") };
}

/** A tri-state theme toggle (auto → dark → light), persisted, driving `data-theme` on <html>. */
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
      /* storage unavailable — theme still applies for this session */
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

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  const fromLink = decodeArgPrincipleState(window.location.hash);
  let state: ArgPrincipleViewState = fromLink ?? DEFAULT_VIEW_STATE;
  let model = buildModel(state.map.expr);

  // ---- DOM shell -----------------------------------------------------------
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.innerHTML = "<strong>Argument Principle</strong><span>winding = zeros − poles</span>";
  const spacer = document.createElement("div");
  spacer.className = "spacer";
  const resetBtn = button("Reset views");
  const fitBtn = button("Fit image");
  const themeBtn = createThemeToggle(() => schedule());
  topbar.append(brand, spacer, fitBtn, resetBtn, themeBtn);

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

  const formula = document.createElement("div");
  formula.className = "formula";
  const errEl = document.createElement("div");
  errEl.className = "err";
  errEl.hidden = true;

  const stage = document.createElement("div");
  stage.className = "stage";
  const zPane = document.createElement("figure");
  zPane.className = "pane";
  const zCanvas = makeCanvas();
  const zCap = document.createElement("figcaption");
  zCap.innerHTML = "<b>Domain</b> — z-plane · move to place γ, right-drag to pan, scroll to zoom";
  zPane.append(zCanvas, zCap);
  const wPane = document.createElement("figure");
  wPane.className = "pane";
  const wCanvas = makeCanvas();
  const wCap = document.createElement("figcaption");
  wCap.innerHTML = "<b>Image</b> — w = f(z) · f(γ) · drag to pan, scroll to zoom";
  wPane.append(wCanvas, wCap);
  stage.append(zPane, wPane);

  const readout = document.createElement("div");
  readout.className = "readout";
  const windingEl = document.createElement("div");
  windingEl.className = "metric";
  const subEl = document.createElement("div");
  subEl.className = "sub";
  const noteEl = document.createElement("p");
  noteEl.className = "note";
  noteEl.innerHTML =
    "The winding number of f(γ) about 0 equals (zeros − poles) of f enclosed by γ. Locating and counting " +
    'those zeros and poles arrives in Phase&nbsp;2 — for now the winding is read directly from the image ' +
    'curve (labelled <span class="approx">≈</span>, a numerical estimate).';
  readout.append(windingEl, subEl, noteEl);

  app.append(topbar, toolbar, formula, errEl, stage, readout);

  // ---- state helpers -------------------------------------------------------
  function currentCircle(): Circle {
    return {
      centerRe: state.contour.centerRe,
      centerIm: state.contour.centerIm,
      radius: state.contour.radius,
    };
  }
  function imagePoints(): Vec2[] {
    if (model.error) return [];
    return sampleCircle(currentCircle(), state.render.resolution).map((p) => model.f(p));
  }
  function canvasAspect(canvas: HTMLCanvasElement): number {
    const r = canvas.getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 1;
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
  function commit(next: ArgPrincipleViewState): void {
    state = next;
    schedule();
    schedulePersist();
  }

  function setExpr(expr: string): void {
    model = buildModel(expr);
    state = { ...state, map: { ...state.map, expr, antiholomorphic: /conjugate/.test(expr) } };
    const id = presetIdForExpr(expr);
    if (id) presetSel.value = id;
    renderFormula();
    schedule();
    schedulePersist();
  }
  function fitImage(): void {
    commit({ ...state, wView: fitViewport(imagePoints(), canvasAspect(wCanvas)) });
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
        /* fall through to the plain-text form */
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
    const circle = currentCircle();
    const zPts = sampleCircle(circle, state.render.resolution);
    const wPts: Vec2[] = model.error ? [] : zPts.map((p) => model.f(p));

    const contourColor = cssVar("--accent", "#3bb6c0");
    const originColor = cssVar("--pole", "#e8608f");
    const centerColor = cssVar("--muted", "#8c95a9");

    drawPane(zCanvas, state.zView, (ctx, map) => {
      if (state.render.showDomainCurve) {
        drawPolyline(ctx, map, zPts, { closed: true, color: contourColor, width: 2 });
      }
      drawDot(ctx, map, [circle.centerRe, circle.centerIm], centerColor, 3);
    });
    drawPane(wCanvas, state.wView, (ctx, map) => {
      if (state.render.showImageCurve && wPts.length > 1) {
        drawPolyline(ctx, map, wPts, { closed: true, rainbow: true, width: 2 });
      }
      drawDot(ctx, map, [0, 0], originColor, 5);
    });

    if (model.error || wPts.length < 2) {
      windingEl.innerHTML = "Winding number: <b>—</b>";
      subEl.textContent = model.error ? "fix the expression to continue" : "";
    } else {
      const turns = windingTurns(wPts);
      const wn = Math.round(turns);
      const reliable = windingReliable(wPts);
      windingEl.innerHTML =
        `Winding of f(γ) about 0: <b>${wn}</b> <span class="approx">≈</span>` +
        (reliable ? "" : ' <span class="warn">γ passes near a singularity — unreliable</span>');
      const c = circle;
      subEl.textContent =
        `γ: circle at (${c.centerRe.toFixed(2)}, ${c.centerIm.toFixed(2)}), r = ${c.radius.toFixed(2)}` +
        ` · accumulated turns: ${turns.toFixed(3)}`;
    }
  }

  // ---- interaction wiring --------------------------------------------------
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
      commit({ ...state, contour: { ...state.contour, radius: r } });
    }
  });
  resetBtn.addEventListener("click", () => {
    commit({ ...state, zView: DEFAULT_VIEW_STATE.zView, wView: DEFAULT_VIEW_STATE.wView });
  });
  fitBtn.addEventListener("click", () => fitImage());

  attachContourPlane(zCanvas, {
    getView: () => state.zView,
    setView: (v: ViewportState) => commit({ ...state, zView: v }),
    onHover: (world: Vec2) =>
      commit({ ...state, contour: { ...state.contour, centerRe: world[0], centerIm: world[1] } }),
  });
  attachPanZoom(
    wCanvas,
    () => state.wView,
    (v: ViewportState) => commit({ ...state, wView: v }),
  );
  window.addEventListener("resize", () => schedule());

  // ---- boot ----------------------------------------------------------------
  const initialId = presetIdForExpr(state.map.expr);
  if (initialId) presetSel.value = initialId;
  radiusLabel.textContent = `Radius r = ${state.contour.radius.toFixed(2)}`;
  renderFormula();
  render();
  if (!fromLink) fitImage(); // a fresh session auto-frames the image; a shared link keeps its saved view
  history.replaceState(null, "", encodeArgPrincipleState(state));
}

main();
