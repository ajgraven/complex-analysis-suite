// apps/argument-principle — an educational visualizer for the argument principle.
//
// The theorem: the winding number of the image curve f(γ) about the origin equals the number of zeros
// minus poles of f enclosed by the contour γ. This P0 walking skeleton proves the end-to-end chain —
// parse a user f(z) via @cas/expr, sample a default circular contour, map it through f, draw both the
// z-plane (γ) and w-plane (f(γ)) panes, and read off the winding number — plus the shared `#vs=`
// permalink. Interactivity (a cursor-following contour, pan/zoom, freehand drawing, the zero/pole
// finder and the four readouts) lands in Phases 1–2.
import "./styles/main.css";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import type { Complex } from "@cas/expr/complex";
import {
  DEFAULT_VIEW_STATE,
  decodeArgPrincipleState,
  encodeArgPrincipleState,
  type ArgPrincipleViewState,
  type Viewport,
} from "./viewState.js";
import { FUNCTION_PRESETS, presetIdForExpr } from "./presets.js";
import { sampleCircle, type Circle } from "./contour.js";
import { windingTurns, windingReliable } from "./winding.js";
import {
  planeMap,
  drawAxes,
  drawPolyline,
  drawDot,
  type AxisColors,
  type PlaneMap,
  type Vec2,
} from "./render/plane.js";

const C0: Complex = [0, 0];

interface Compiled {
  readonly f: (z: Vec2) => Vec2;
  readonly error: string | null;
}

/** Parse + compile an @cas/expr source into a CPU evaluator f: ℂ → ℂ (or an error). */
function compile(expr: string): Compiled {
  try {
    const ast = parse(expr);
    const fn = makeComplexFn(ast);
    return {
      f: (z: Vec2): Vec2 => {
        const zc: Complex = [z[0], z[1]];
        const w = fn(zc, C0);
        return [w[0], w[1]];
      },
      error: null,
    };
  } catch (e) {
    return { f: (): Vec2 => [NaN, NaN], error: e instanceof Error ? e.message : String(e) };
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
  const LABEL: Record<Choice, string> = {
    auto: "Theme: auto",
    dark: "Theme: dark",
    light: "Theme: light",
  };
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

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  let state: ArgPrincipleViewState =
    decodeArgPrincipleState(window.location.hash) ?? DEFAULT_VIEW_STATE;

  // ---- DOM shell -----------------------------------------------------------
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.innerHTML = "<strong>Argument Principle</strong><span>winding = zeros − poles</span>";
  const spacer = document.createElement("div");
  spacer.className = "spacer";
  const themeBtn = createThemeToggle(() => render());
  topbar.append(brand, spacer, themeBtn);

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

  const errEl = document.createElement("div");
  errEl.className = "err";
  errEl.hidden = true;

  toolbar.append(presetWrap, exprWrap);

  const stage = document.createElement("div");
  stage.className = "stage";
  const zPane = document.createElement("figure");
  zPane.className = "pane";
  const zCanvas = makeCanvas();
  const zCap = document.createElement("figcaption");
  zCap.innerHTML = "<b>Domain</b> — z-plane · contour γ";
  zPane.append(zCanvas, zCap);
  const wPane = document.createElement("figure");
  wPane.className = "pane";
  const wCanvas = makeCanvas();
  const wCap = document.createElement("figcaption");
  wCap.innerHTML = "<b>Image</b> — w = f(z) · f(γ)";
  wPane.append(wCanvas, wCap);
  stage.append(zPane, wPane);

  const readout = document.createElement("div");
  readout.className = "readout";
  const windingEl = document.createElement("div");
  windingEl.className = "metric";
  const turnsEl = document.createElement("div");
  turnsEl.className = "sub";
  const noteEl = document.createElement("p");
  noteEl.className = "note";
  noteEl.innerHTML =
    "The winding number of f(γ) about 0 equals (zeros − poles) of f enclosed by γ. " +
    "Locating and counting those zeros and poles arrives in Phase&nbsp;2 — for now the winding is read " +
    'directly from the image curve (labelled <span class="approx">≈</span>, a numerical estimate).';
  readout.append(windingEl, turnsEl, noteEl);

  app.append(topbar, toolbar, errEl, stage, readout);

  // ---- rendering -----------------------------------------------------------
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
    const compiled = compile(state.map.expr);
    errEl.hidden = compiled.error === null;
    errEl.textContent = compiled.error ? `Parse error: ${compiled.error}` : "";

    const circle: Circle = {
      centerRe: state.contour.centerRe,
      centerIm: state.contour.centerIm,
      radius: state.contour.radius,
    };
    const zPts = sampleCircle(circle, state.render.resolution);
    const wPts: Vec2[] = compiled.error ? [] : zPts.map((p) => compiled.f(p));

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

    if (compiled.error || wPts.length < 2) {
      windingEl.innerHTML = 'Winding number: <b>—</b>';
      turnsEl.textContent = "";
    } else {
      const turns = windingTurns(wPts);
      const wn = Math.round(turns);
      const reliable = windingReliable(wPts);
      windingEl.innerHTML =
        `Winding of f(γ) about 0: <b>${wn}</b> <span class="approx">≈</span>` +
        (reliable ? "" : ' <span class="warn">γ passes near a singularity — unreliable</span>');
      turnsEl.textContent = `accumulated turns: ${turns.toFixed(3)}`;
    }
  }

  function persist(): void {
    history.replaceState(null, "", encodeArgPrincipleState(state));
  }

  function setExpr(expr: string): void {
    state = { ...state, map: { ...state.map, expr, antiholomorphic: /conjugate/.test(expr) } };
    const id = presetIdForExpr(expr);
    if (id) presetSel.value = id;
    render();
    persist();
  }

  // ---- wiring --------------------------------------------------------------
  presetSel.addEventListener("change", () => {
    const p = FUNCTION_PRESETS.find((q) => q.id === presetSel.value);
    if (p) {
      exprInput.value = p.expr;
      setExpr(p.expr);
    }
  });
  exprInput.addEventListener("input", () => setExpr(exprInput.value));
  window.addEventListener("resize", () => render());

  const initialId = presetIdForExpr(state.map.expr);
  if (initialId) presetSel.value = initialId;

  render();
  persist();
}

main();
