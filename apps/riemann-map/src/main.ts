// apps/riemann-map — the research-grade Riemann-map / conformal-mapping studio.
//
// P1 (walking skeleton). P1a: custom-φ domain-coloring render + pan/zoom. P1b (this file): a live φ
// editor with KaTeX preview + a preset gallery, and an under-cursor readout of φ(z), φ′(z) and the
// local amplitwist (scale |φ′|, rotation arg φ′). Later P1 increments add render modes (C2–C6), curve
// grids (D1), linked panes (F2), and PNG export (G2).
import {
  DEFAULT_VIEW_STATE,
  decodeRiemannState,
  encodeRiemannState,
  type RiemannViewState,
  type ViewportState,
} from "./viewState.js";
import { compileMap, derivativeAt, type CompiledMap } from "./map.js";
import { createRenderer, type Renderer } from "./render/glRenderer.js";
import { attachPanZoom, pixelToWorld } from "./render/nav.js";
import { modeCode, colormapCode } from "./render/modes.js";
import { createControls } from "./ui/controls.js";

function initialState(): RiemannViewState {
  return decodeRiemannState(window.location.hash) ?? DEFAULT_VIEW_STATE;
}

/** Size the drawing buffer to the element's CSS box × devicePixelRatio (crisp on HiDPI). */
function resizeToDisplay(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toPrecision(5).replace(/\.?0+$/, "") : "∞";
}
function fmtC(re: number, im: number): string {
  if (!Number.isFinite(re) || !Number.isFinite(im)) return "∞ (undefined)";
  return `${fmt(re)} ${im >= 0 ? "+" : "−"} ${fmt(Math.abs(im))}i`;
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  let state = initialState();

  // ---- DOM shell -----------------------------------------------------------
  app.replaceChildren();
  const bar = document.createElement("header");
  bar.className = "topbar";
  const title = document.createElement("span");
  title.className = "brand";
  title.textContent = "Riemann Map";
  const readout = document.createElement("span");
  readout.className = "readout";
  bar.append(title, readout);

  const body = document.createElement("div");
  body.className = "body";
  const controls = createControls(state.map.expr);
  const stage = document.createElement("div");
  stage.className = "stage";
  const canvas = document.createElement("canvas");
  canvas.className = "plane";
  const note = document.createElement("div");
  note.className = "note";
  stage.append(canvas, note);
  body.append(controls.root, stage);
  app.append(bar, body);

  // ---- renderer ------------------------------------------------------------
  const renderer: Renderer | null = createRenderer(canvas);
  if (!renderer) {
    note.textContent = "WebGL2 is unavailable in this browser — the GPU domain-coloring view needs it.";
    note.classList.add("visible");
  }

  let current: CompiledMap | null = null;

  function applyMap(): void {
    const compiled = compileMap(state.map);
    if (!compiled.ok) {
      controls.showError(compiled.error);
      controls.setLatex("");
      current = null;
      return;
    }
    controls.showError(null);
    controls.setLatex(compiled.map.latex);
    current = compiled.map;
    if (renderer && renderer.setMap(compiled.map.glslBody, compiled.map.glslDerivBody)) note.classList.remove("visible");
  }

  function updateReadout(): void {
    const v = state.viewport;
    readout.textContent = `center ${fmtC(v.centerRe, v.centerIm)} · zoom ${fmt(v.zoom)}`;
  }

  // ---- render / permalink scheduling (rAF-coalesced) -----------------------
  let frame = 0;
  function schedule(): void {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      resizeToDisplay(canvas);
      renderer?.render(state.viewport, modeCode(state.render.mode), colormapCode(state.render.palette));
      updateReadout();
      history.replaceState(null, "", encodeRiemannState(state));
    });
  }
  function setViewport(v: ViewportState): void {
    state = { ...state, viewport: v };
    schedule();
  }

  // ---- editing φ + view --------------------------------------------------
  controls.setMode(state.render.mode);
  controls.setColormap(state.render.palette);
  controls.onExpr((expr) => {
    state = { ...state, map: { ...state.map, expr, antiholomorphic: /conjugate/.test(expr) } };
    applyMap();
    schedule();
  });
  controls.onMode((id) => {
    state = { ...state, render: { ...state.render, mode: id } };
    schedule();
  });
  controls.onColormap((id) => {
    state = { ...state, render: { ...state.render, palette: id } };
    schedule();
  });

  // ---- hover readout (F4) --------------------------------------------------
  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    const r = canvas.getBoundingClientRect();
    const z = pixelToWorld(state.viewport, (e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, r.width / r.height);
    const w = current.jsFn([z[0], z[1]], [0, 0]);
    const d = derivativeAt(current, z);
    const exact = current.jsDeriv ? "= " : "≈ ";
    controls.setHover([
      ["z", fmtC(z[0], z[1])],
      ["φ(z)", fmtC(w[0], w[1])],
      ["|φ′|", exact + fmt(Math.hypot(d[0], d[1]))],
      ["arg φ′", exact + fmt(Math.atan2(d[1], d[0])) + " rad"],
    ]);
  });
  canvas.addEventListener("pointerleave", () => controls.setHover(null));

  attachPanZoom(canvas, () => state.viewport, setViewport);
  window.addEventListener("resize", schedule);

  applyMap();
  schedule();
}

main();
