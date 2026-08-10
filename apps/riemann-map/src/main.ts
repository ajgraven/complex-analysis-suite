// apps/riemann-map — the research-grade Riemann-map / conformal-mapping studio.
//
// P1 walking skeleton. P1a: domain-coloring render + pan/zoom. P1b: live φ editor, KaTeX, presets,
// hover readout. P1c: render modes + colormaps. P1d (this file): the "map the grid" view — a source
// coordinate grid on the z-plane and its pushforward φ(grid) in a linked w-plane pane (shared colour
// key), with a linked cursor. Later: PNG export (G2) + the Möbius gauge (A20).
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
import { modeCode, colormapCode, modeIsDynamics } from "./render/modes.js";
import { sourceGrid, pushforward, bounds, type GridKind, type GridLine, type Pt } from "./render/grid.js";
import { Overlay2D } from "./render/overlay2d.js";
import { injectPngText } from "./export/pngMeta.js";
import { createControls } from "./ui/controls.js";

function initialState(): RiemannViewState {
  return decodeRiemannState(window.location.hash) ?? DEFAULT_VIEW_STATE;
}
/** Size the drawing buffer to the CSS box × DPR. Returns true if it changed — a resize clears the
 *  WebGL buffer, so the caller must re-render even when nothing else is dirty (else the plane blanks). */
function resizeToDisplay(canvas: HTMLCanvasElement): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}
function fmt(n: number): string {
  return Number.isFinite(n) ? n.toPrecision(5).replace(/\.?0+$/, "") : "∞";
}
function fmtC(re: number, im: number): string {
  if (!Number.isFinite(re) || !Number.isFinite(im)) return "∞ (undefined)";
  return `${fmt(re)} ${im >= 0 ? "+" : "−"} ${fmt(Math.abs(im))}i`;
}
const CURSOR_COLOR = "#ffffff";

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
  const left = document.createElement("div");
  left.className = "pane left";
  const canvas = document.createElement("canvas");
  canvas.className = "plane";
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.className = "overlay";
  const note = document.createElement("div");
  note.className = "note";
  left.append(canvas, overlayCanvas, note);

  const right = document.createElement("div");
  right.className = "pane right";
  const rlabel = document.createElement("div");
  rlabel.className = "panelabel";
  rlabel.textContent = "w = φ(z)  ·  image grid";
  const imageCanvas = document.createElement("canvas");
  imageCanvas.className = "image";
  right.append(rlabel, imageCanvas);

  stage.append(left, right);
  body.append(controls.root, stage);
  app.append(bar, body);

  // ---- renderers -----------------------------------------------------------
  const renderer: Renderer | null = createRenderer(canvas);
  if (!renderer) {
    note.textContent = "WebGL2 is unavailable in this browser — the GPU domain-coloring view needs it.";
    note.classList.add("visible");
  }
  const leftOverlay = new Overlay2D(overlayCanvas);
  const rightPane = new Overlay2D(imageCanvas);

  let current: CompiledMap | null = null;
  let cursorZ: Pt | null = null;
  let gridSource: GridLine[] = [];
  let gridImage: GridLine[] = [];
  let glDirty = true;
  let gridDirty = true;
  let linkDirty = true;

  const gridKind = (): GridKind => (state.render.grid as GridKind) ?? "none";
  const phi = (z: Pt): Pt => {
    if (!current) return z;
    const w = current.jsFn([z[0], z[1]], [0, 0]);
    return [w[0], w[1]];
  };

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
    refreshDynamicsNote();
  }

  /** The Julia-exterior mode iterates f and needs a degree ≥ 2; warn (in the plane note) when it can't. */
  function refreshDynamicsNote(): void {
    if (!renderer) return; // the WebGL-unavailable note owns the banner in that case
    if (modeIsDynamics(state.render.mode) && (!current || current.degree === null)) {
      note.textContent = "Julia exterior needs a polynomial or rational map of degree ≥ 2 — e.g. z*z − 1.";
      note.classList.add("visible");
    } else {
      note.classList.remove("visible");
    }
  }

  function computeGrid(): void {
    const v = state.viewport;
    const aspect = canvas.height > 0 ? canvas.width / canvas.height : 1;
    gridSource = sourceGrid(gridKind(), v.centerRe, v.centerIm, 1 / v.zoom, aspect);
    gridImage = gridKind() !== "none" && current ? pushforward(gridSource, phi) : [];
  }

  function drawOverlays(): void {
    leftOverlay.resize();
    leftOverlay.setCenterSpan(state.viewport.centerRe, state.viewport.centerIm, 1 / state.viewport.zoom);
    leftOverlay.clear();
    leftOverlay.drawLines(gridSource);
    if (cursorZ) leftOverlay.drawMarker(cursorZ, CURSOR_COLOR);

    const split = gridKind() !== "none";
    stage.classList.toggle("split", split);
    if (split && rightPane.resize()) {
      const b = bounds(gridImage);
      if (b) rightPane.fitBounds(b);
      rightPane.clear();
      rightPane.drawLines(gridImage);
      if (cursorZ) rightPane.drawMarker(phi(cursorZ), CURSOR_COLOR);
    }
  }

  function updateReadout(): void {
    const v = state.viewport;
    readout.textContent = `center ${fmtC(v.centerRe, v.centerIm)} · zoom ${fmt(v.zoom)}`;
  }

  // ---- PNG export (G2): composite plane + grid at Nx, embed the view-state ---
  function downloadBytes(bytes: Uint8Array, filename: string): void {
    // Copy into a fresh ArrayBuffer-backed view so the Blob part is definitely non-shared (TS 5.7 typing).
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPng(scale = 2): Promise<void> {
    if (!renderer) return;
    const baseW = canvas.width;
    const baseH = canvas.height;
    const W = Math.max(1, Math.round(baseW * scale));
    const H = Math.max(1, Math.round(baseH * scale));
    canvas.width = W;
    canvas.height = H;
    renderer.render(state.viewport, modeCode(state.render.mode), colormapCode(state.render.palette), current?.degree ?? 2);

    const ex = document.createElement("canvas");
    ex.width = W;
    ex.height = H;
    const ctx = ex.getContext("2d");
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
      if (gridKind() !== "none") {
        const ov = new Overlay2D(ex); // ex.width/height already set → draw without a CSS-box resize
        ov.setCenterSpan(state.viewport.centerRe, state.viewport.centerIm, 1 / state.viewport.zoom);
        ov.drawLines(gridSource, 2);
      }
    }
    const blob = await new Promise<Blob | null>((res) => ex.toBlob(res, "image/png"));

    canvas.width = baseW; // restore the live drawing buffer
    canvas.height = baseH;
    glDirty = true;
    schedule();

    if (!ctx || !blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const permalink = location.origin + location.pathname + encodeRiemannState(state);
    const withMeta = injectPngText(
      injectPngText(bytes, "Software", "Riemann Map — Complex Analysis Suite"),
      "cas:state",
      permalink,
    );
    downloadBytes(withMeta, "riemann-map.png");
  }

  // ---- unified frame (rAF-coalesced; dirty flags decide what to recompute) --
  let frame = 0;
  function schedule(): void {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const resized = resizeToDisplay(canvas); // a resize clears the WebGL buffer → must re-render
      if (gridDirty || resized) {
        computeGrid();
        gridDirty = false;
      }
      if (glDirty || resized) {
        renderer?.render(state.viewport, modeCode(state.render.mode), colormapCode(state.render.palette), current?.degree ?? 2);
        glDirty = false;
      }
      drawOverlays();
      updateReadout();
      if (linkDirty) {
        history.replaceState(null, "", encodeRiemannState(state));
        linkDirty = false;
      }
    });
  }
  function invalidate(gl: boolean, gridChanged: boolean): void {
    if (gl) glDirty = true;
    if (gridChanged) gridDirty = true;
    linkDirty = true;
    schedule();
  }

  function setViewport(v: ViewportState): void {
    state = { ...state, viewport: v };
    invalidate(true, true); // grid follows the z-window
  }

  // ---- controls ------------------------------------------------------------
  controls.setMode(state.render.mode);
  controls.setColormap(state.render.palette);
  controls.setGrid(gridKind());
  controls.onExpr((expr) => {
    state = { ...state, map: { ...state.map, expr, antiholomorphic: /conjugate/.test(expr) } };
    applyMap();
    invalidate(true, true);
  });
  controls.onMode((id) => {
    state = { ...state, render: { ...state.render, mode: id } };
    invalidate(true, false);
    refreshDynamicsNote();
  });
  controls.onColormap((id) => {
    state = { ...state, render: { ...state.render, palette: id } };
    invalidate(true, false);
  });
  controls.onGrid((id) => {
    state = { ...state, render: { ...state.render, grid: id } };
    invalidate(false, true);
  });
  controls.onSavePng(() => void exportPng());
  controls.onResetView(() => setViewport({ ...DEFAULT_VIEW_STATE.viewport }));

  // ---- hover + linked cursor (F4/F2) ---------------------------------------
  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    const r = canvas.getBoundingClientRect();
    const z = pixelToWorld(state.viewport, (e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, r.width / r.height);
    cursorZ = z;
    const w = current.jsFn([z[0], z[1]], [0, 0]);
    const d = derivativeAt(current, z);
    const exact = current.jsDeriv ? "= " : "≈ ";
    controls.setHover([
      ["z", fmtC(z[0], z[1])],
      ["φ(z)", fmtC(w[0], w[1])],
      ["|φ′|", exact + fmt(Math.hypot(d[0], d[1]))],
      ["arg φ′", exact + fmt(Math.atan2(d[1], d[0])) + " rad"],
    ]);
    schedule(); // overlays only (no dirty flags) → redraw the linked markers
  });
  canvas.addEventListener("pointerleave", () => {
    cursorZ = null;
    controls.setHover(null);
    schedule();
  });

  attachPanZoom(canvas, () => state.viewport, setViewport);
  window.addEventListener("resize", () => invalidate(true, true));

  applyMap();
  schedule();
}

main();
