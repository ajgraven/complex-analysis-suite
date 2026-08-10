// apps/riemann-map — the research-grade Riemann-map / conformal-mapping studio.
//
// P1 (walking skeleton, first increment): a working custom-φ domain-coloring view. Type/φ is compiled
// once into a JS evaluator + a GLSL body (map.ts), rendered per-pixel as a phase portrait (shader.ts /
// glRenderer.ts), and explored by pan/zoom (nav.ts). The view-state round-trips through the permalink.
// Later P1 increments add render modes (C2–C6), curve grids (D1), linked panes (F2), a live editor
// (F5), and PNG export (G2); every §A construction engine plugs into this same shell.
import {
  DEFAULT_VIEW_STATE,
  decodeRiemannState,
  encodeRiemannState,
  type RiemannViewState,
  type ViewportState,
} from "./viewState.js";
import { compileMap } from "./map.js";
import { createRenderer, type Renderer } from "./render/glRenderer.js";
import { attachPanZoom } from "./render/nav.js";

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
  return Number.isFinite(n) ? n.toPrecision(6).replace(/\.?0+$/, "") : String(n);
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
  const mapLabel = document.createElement("span");
  mapLabel.className = "maplabel";
  const readout = document.createElement("span");
  readout.className = "readout";
  bar.append(title, mapLabel, readout);

  const stage = document.createElement("div");
  stage.className = "stage";
  const canvas = document.createElement("canvas");
  canvas.className = "plane";
  stage.append(canvas);

  const note = document.createElement("div");
  note.className = "note";
  stage.append(note);

  app.append(bar, stage);

  // ---- renderer ------------------------------------------------------------
  const renderer: Renderer | null = createRenderer(canvas);
  if (!renderer) {
    note.textContent = "WebGL2 is unavailable in this browser — the GPU domain-coloring view needs it.";
    note.classList.add("visible");
  }

  function applyMap(): void {
    const compiled = compileMap(state.map);
    mapLabel.textContent = `φ(z) = ${state.map.expr}`;
    if (!compiled.ok) {
      note.textContent = `Cannot compile φ: ${compiled.error}`;
      note.classList.add("visible");
      return;
    }
    if (renderer && renderer.setMap(compiled.map.glslBody)) {
      note.classList.remove("visible");
    }
  }

  function updateReadout(): void {
    const v = state.viewport;
    readout.textContent = `center ${fmt(v.centerRe)} ${v.centerIm >= 0 ? "+" : "−"} ${fmt(Math.abs(v.centerIm))}i · zoom ${fmt(v.zoom)}`;
  }

  // ---- render / permalink scheduling (rAF-coalesced) -----------------------
  let frame = 0;
  function schedule(): void {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      resizeToDisplay(canvas);
      renderer?.render(state.viewport);
      updateReadout();
      history.replaceState(null, "", encodeRiemannState(state));
    });
  }

  function setViewport(v: ViewportState): void {
    state = { ...state, viewport: v };
    schedule();
  }

  attachPanZoom(canvas, () => state.viewport, setViewport);
  window.addEventListener("resize", schedule);

  applyMap();
  schedule();
}

main();
