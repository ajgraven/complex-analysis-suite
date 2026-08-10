// apps/riemann-map — the research-grade Riemann-map / conformal-mapping studio.
//
// P1 walking skeleton. P1a: domain-coloring render + pan/zoom. P1b: live φ editor, KaTeX, presets,
// hover readout. P1c: render modes + colormaps. P1d (this file): the "map the grid" view — a source
// coordinate grid on the z-plane and its pushforward φ(grid) in a linked w-plane pane (shared colour
// key), with a linked cursor. Later: PNG export (G2) + the Möbius gauge (A20).
import "./styles/main.css";
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
import { modeCode, colormapCode, modeIsDynamics, modeIsDomain, modeUsesColormap } from "./render/modes.js";
import { sourceGrid, pushforward, bounds, type GridKind, type GridLine, type Pt } from "./render/grid.js";
import { Overlay2D } from "./render/overlay2d.js";
import { analyzeExterior, reconstructedBoundary, type ExteriorAnalysis } from "./analysis/exterior.js";
import { juliaExternalRays, quadraticJuliaC, DEFAULT_RAY_ANGLES } from "./analysis/rays.js";
import { greenPotential, externalAngleQuadratic } from "./analysis/potential.js";
import { juliaDynamics, type DynamicsStats } from "./analysis/dynamicsStats.js";
import { legendModel, renderLegend } from "./ui/legend.js";
import { exteriorMapLink } from "./interchange/exteriorMap.js";
import { DOMAIN_PRESETS, domainById, sampleDomainBoundary, conformalSourceGrid, cornerBoundary, cornerPoles } from "./domains.js";
import { fitConformalMap, type ConformalMap } from "./solve/lightning.js";
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

/** A CD-style tri-state theme toggle (auto → dark → light), persisted, driving `data-theme` on <html>. */
function createThemeToggle(): HTMLButtonElement {
  const KEY = "rm.theme";
  const ORDER = ["auto", "dark", "light"] as const;
  type Choice = (typeof ORDER)[number];
  const LABEL: Record<Choice, string> = { auto: "Theme: auto", dark: "Theme: dark", light: "Theme: light" };
  const btn = document.createElement("button");
  btn.type = "button";
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
  });
  return btn;
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
  bar.append(title, readout, createThemeToggle());

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
  const legendEl = document.createElement("div");
  legendEl.className = "legend-chip";
  left.append(canvas, overlayCanvas, legendEl, note);

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
  let analysis: ExteriorAnalysis | null = null;
  let dynamics: DynamicsStats | null = null; // z²+c dynamical stats, when the map is that family
  let dynC: [number, number] | null = null; // the z²+c parameter, or null when the map is not z²+c
  let cursorZ: Pt | null = null;
  let gridSource: GridLine[] = [];
  let gridImage: GridLine[] = [];
  let boundaryLines: GridLine[] = [];
  let rayLines: GridLine[] = [];
  let rayLandings: Pt[] = [];
  // Numerical-Riemann-map (domain) mode (P3b): the fitted map + its source/image conformal grids.
  let domainId = domainById(state.render.domain ?? "")?.id ?? DOMAIN_PRESETS[0].id;
  let domainMap: ConformalMap | null = null;
  let domainSource: GridLine[] = [];
  let domainImage: GridLine[] = [];
  let glDirty = true;
  let gridDirty = true;
  let domainDirty = true;
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
    analysis = analyzeExterior(state.map.expr); // exterior invariants (E2/E6), null for non-degree-≥2 maps
    dynC = quadraticJuliaC(state.map.expr); // z²+c parameter (E12), null otherwise
    dynamics = dynC ? juliaDynamics(dynC) : null;
    if (renderer && renderer.setMap(compiled.map.glslBody, compiled.map.glslDerivBody)) note.classList.remove("visible");
    refreshDynamicsNote();
    updateAnalysisPanel();
  }

  /**
   * The exterior conformal map ψ (and so its coefficients bₖ, the reconstructed-boundary overlay, and the
   * exterior-map export) is only valid for a CONNECTED K — a disconnected Julia set's complement is not a
   * topological disk exterior, so ψ does not exist. We only *know* connectivity for the z²+c family; for
   * any other map we assume valid. The escape-based objects (Green's-function render, G(z), rays) stay valid.
   */
  function exteriorConformalValid(): boolean {
    return !(dynamics && !dynamics.connected);
  }

  /** Show capacity / Robin / exterior coefficients + z²+c dynamics in the sidebar, only in the Julia mode. */
  function updateAnalysisPanel(): void {
    if (modeIsDomain(state.render.mode)) return; // the domain view owns the panel (set in computeDomain)
    if (!(modeIsDynamics(state.render.mode) && analysis)) {
      controls.setAnalysis(null);
      return;
    }
    // Capacity + Robin: for monic z²+c these are exactly 1 and 0 by theorem, connected or not.
    const rows: [string, string][] = [
      ["capacity cap(K)", analysis.monic ? "= 1  (monic)" : "= " + fmt(analysis.capacity)],
      ["Robin γ", "= " + fmt(analysis.robin)],
    ];
    const valid = exteriorConformalValid();
    if (valid) {
      // bₖ describe the global conformal map ψ — only meaningful for a connected K.
      const c = analysis.coeffs;
      if (c.length > 1) rows.push(["|b₁|", "≈ " + fmt(Math.hypot(c[1][0], c[1][1]))]);
      if (c.length > 2) rows.push(["|b₂|", "≈ " + fmt(Math.hypot(c[2][0], c[2][1]))]);
    }
    // Dynamical invariants for the z²+c family (E12): parameter, connectedness, attracting cycle.
    if (dynC && dynamics) {
      rows.push(["c", "= " + fmtC(dynC[0], dynC[1])]);
      rows.push(["K", dynamics.connected ? "= connected" : "= Cantor set (ψ n/a)"]);
      if (dynamics.cycle) {
        const sup = dynamics.cycle.multiplier < 1e-9;
        rows.push(["attracting cycle", "period " + dynamics.cycle.period + (sup ? " (superattracting)" : "")]);
        rows.push(["multiplier |λ|", sup ? "= 0" : "≈ " + fmt(dynamics.cycle.multiplier)]);
      }
    }
    controls.setAnalysis(rows, "Exterior invariants");
    controls.setExteriorExportAvailable(valid); // no ψ ⇒ no exterior-map export
  }

  /** Contextual disclosure (A1): show only the controls the current mode uses, and label the w-pane. */
  function applyModeContext(): void {
    const m = state.render.mode;
    controls.setControlVisibility({
      colormap: modeUsesColormap(m), // only the ramp modes (|φ′|, log|φ′|, Julia) read it
      grid: !modeIsDomain(m), // the numeric-map mode draws its own conformal grid
      domain: modeIsDomain(m), // the domain picker is only for the numeric-map mode
    });
    rlabel.textContent = modeIsDomain(m) ? "w = f(z)  ·  unit disk" : "w = φ(z)  ·  image grid";
    renderLegend(legendEl, legendModel(m, state.render.palette)); // colour-key chip (A4)
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
    boundaryLines =
      modeIsDynamics(state.render.mode) && analysis && exteriorConformalValid()
        ? [{ color: "rgba(130,225,255,0.95)", pts: reconstructedBoundary(analysis, 1.02, 512) }]
        : [];
    const rays = modeIsDynamics(state.render.mode) ? juliaExternalRays(state.map.expr, DEFAULT_RAY_ANGLES) : null;
    rayLines = rays ? rays.map((r) => ({ color: "rgba(255,170,70,0.9)", pts: r.pts })) : [];
    rayLandings = rays ? rays.map((r) => r.pts[r.pts.length - 1]) : [];
  }

  // ---- numerical Riemann map of a domain (P3b) -----------------------------
  const DOMAIN_SAMPLES = 500;
  const DOMAIN_DEGREE = 60;
  const DOMAIN_BG: readonly [number, number, number] = [0.06, 0.07, 0.09];
  const UNIT_CIRCLE: Pt[] = Array.from({ length: 361 }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / 360;
    return [Math.cos(t), Math.sin(t)];
  });

  /** Fit f: Ω → 𝔻 for the selected domain and build its source (Ω) and image (disk) conformal grids. */
  function computeDomain(): void {
    const d = domainById(domainId);
    if (!d) {
      domainMap = null;
      domainSource = [];
      domainImage = [];
      controls.setAnalysis(null);
      return;
    }
    // Corner domains (polygons) cluster poles at the vertices (lightning, P3c) and sample the boundary
    // densely near the corners; smooth domains use the polynomial-only fit (P3a).
    const corners = d.corners;
    const boundary = corners ? cornerBoundary(corners, 110) : sampleDomainBoundary(d, DOMAIN_SAMPLES);
    const poles = corners ? cornerPoles(corners, 16, 4) : [];
    const f = fitConformalMap(boundary, corners ? 24 : DOMAIN_DEGREE, poles);
    domainMap = f;
    const cg = conformalSourceGrid(d, 24, 6, 160);
    const BDRY = "rgba(200,208,222,0.92)";
    const SPOKE = "rgba(110,168,254,0.8)";
    const RING = "rgba(130,225,255,0.72)";
    domainSource = [
      { color: BDRY, pts: cg.boundary },
      ...cg.spokes.map((p) => ({ color: SPOKE, pts: p as Pt[] })),
      ...cg.rings.map((p) => ({ color: RING, pts: p as Pt[] })),
    ];
    domainImage = [
      { color: "rgba(120,130,150,0.85)", pts: UNIT_CIRCLE }, // the target ∂𝔻, for reference
      { color: BDRY, pts: f.evalMany(cg.boundary) as Pt[] },
      ...cg.spokes.map((p) => ({ color: SPOKE, pts: f.evalMany(p) as Pt[] })),
      ...cg.rings.map((p) => ({ color: RING, pts: f.evalMany(p) as Pt[] })),
    ];
    // Honest readout: the map is numerical; the boundary residual is its ≈ accuracy.
    const rows: [string, string][] = [
      ["method", f.poles.length ? "lightning + corner poles" : "lightning (LSQ)"],
      ["domain", d.name],
      ["degree", "= " + f.degree],
    ];
    if (f.poles.length) rows.push(["poles", "= " + f.poles.length + " (clustered)"]);
    rows.push(["boundary resid.", "≈ " + fmt(f.boundaryResidual)], ["f(0)", "= 0  (exact)"]);
    controls.setAnalysis(rows, "Numerical map");
    controls.setExteriorExportAvailable(false);
  }

  function drawOverlays(): void {
    leftOverlay.resize();
    leftOverlay.setCenterSpan(state.viewport.centerRe, state.viewport.centerIm, 1 / state.viewport.zoom);
    leftOverlay.clear();
    if (modeIsDomain(state.render.mode)) {
      leftOverlay.drawLines(domainSource, 1.1);
      if (cursorZ) leftOverlay.drawMarker(cursorZ, CURSOR_COLOR);
      leftOverlay.drawScaleBar();
      stage.classList.add("split");
      if (rightPane.resize()) {
        rightPane.fitBounds({ minx: -1, maxx: 1, miny: -1, maxy: 1 });
        rightPane.clear();
        rightPane.drawLines(domainImage, 1.1);
        if (cursorZ && domainMap) rightPane.drawMarker(domainMap.eval([cursorZ[0], cursorZ[1]]), CURSOR_COLOR);
      }
      return;
    }
    leftOverlay.drawLines(gridSource);
    leftOverlay.drawLines(boundaryLines, 1.6); // reconstructed ∂K in the Julia-exterior mode
    leftOverlay.drawLines(rayLines, 1.3); // external rays
    for (const p of rayLandings) leftOverlay.drawMarker(p, "rgba(255,170,70,1)");
    if (cursorZ) leftOverlay.drawMarker(cursorZ, CURSOR_COLOR);
    leftOverlay.drawScaleBar();

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
    controls.setViewportFields(v.centerRe, v.centerIm, v.zoom); // keep the precise-nav fields live (A5)
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
      const domain = modeIsDomain(state.render.mode);
      if (domain && domainDirty) {
        computeDomain();
        domainDirty = false;
      }
      if ((gridDirty || resized) && !domain) {
        computeGrid();
        gridDirty = false;
      }
      if (glDirty || resized) {
        if (domain) renderer?.clear(DOMAIN_BG[0], DOMAIN_BG[1], DOMAIN_BG[2]); // no GLSL field — overlay only
        else renderer?.render(state.viewport, modeCode(state.render.mode), colormapCode(state.render.palette), current?.degree ?? 2);
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
  controls.setDomain(domainId);
  applyModeContext(); // initial contextual disclosure
  controls.onExpr((expr) => {
    state = { ...state, map: { ...state.map, expr, antiholomorphic: /conjugate/.test(expr) } };
    applyMap();
    invalidate(true, true);
  });
  controls.onMode((id) => {
    state = { ...state, render: { ...state.render, mode: id } };
    if (modeIsDomain(id)) domainDirty = true; // (re)fit f on entering the numerical-map mode
    invalidate(true, true); // the boundary overlay + analysis panel depend on the mode
    applyModeContext(); // show/hide mode-irrelevant controls + relabel the w-pane (A1/A8)
    refreshDynamicsNote();
    updateAnalysisPanel();
  });
  controls.onDomain((id) => {
    domainId = id;
    state = { ...state, render: { ...state.render, domain: id } };
    domainDirty = true;
    invalidate(true, false);
  });
  controls.onColormap((id) => {
    state = { ...state, render: { ...state.render, palette: id } };
    renderLegend(legendEl, legendModel(state.render.mode, id)); // the ramp bar follows the colormap (A4)
    invalidate(true, false);
  });
  controls.onGrid((id) => {
    state = { ...state, render: { ...state.render, grid: id } };
    invalidate(false, true);
  });
  controls.onSavePng(() => void exportPng());
  controls.onResetView(() => setViewport({ ...DEFAULT_VIEW_STATE.viewport }));
  controls.onApplyViewport((re, im, zoom) => setViewport({ centerRe: re, centerIm: im, zoom }));
  controls.onCopyExteriorMap(() => {
    if (!analysis || !exteriorConformalValid()) return; // no valid ψ ⇒ nothing to export (button is hidden too)
    const link = exteriorMapLink(analysis, { sourceExpr: state.map.expr });
    // The interchange fragment ("#s=…") is what another suite tool's "Import map" consumes.
    navigator.clipboard.writeText(link).then(
      () => controls.setExportStatus("Exterior map copied — paste into another tool's Import map."),
      () => {
        console.warn("exterior-map interchange link:", link); // clipboard blocked — surface it for copy
        controls.setExportStatus("Clipboard blocked — the link was logged to the console.");
      },
    );
  });

  // ---- hover + linked cursor (F4/F2) ---------------------------------------
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const z = pixelToWorld(state.viewport, (e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, r.width / r.height);
    cursorZ = z;
    // Numerical-map mode: read z and its image f(z) under the fitted Riemann map (no φ′ — f is numerical).
    if (modeIsDomain(state.render.mode)) {
      if (domainMap) {
        const w = domainMap.eval([z[0], z[1]]);
        controls.setHover([
          ["z", fmtC(z[0], z[1])],
          ["f(z)", fmtC(w[0], w[1])],
          ["|f(z)|", "≈ " + fmt(Math.hypot(w[0], w[1]))],
        ]);
      }
      schedule();
      return;
    }
    if (!current) return;
    const w = current.jsFn([z[0], z[1]], [0, 0]);
    const d = derivativeAt(current, z);
    const exact = current.jsDeriv ? "= " : "≈ ";
    const rows: [string, string][] = [
      ["z", fmtC(z[0], z[1])],
      ["φ(z)", fmtC(w[0], w[1])],
      ["|φ′|", exact + fmt(Math.hypot(d[0], d[1]))],
      ["arg φ′", exact + fmt(Math.atan2(d[1], d[0])) + " rad"],
    ];
    // In the Julia-exterior mode, add the escape-rate potential G(z) and (for z²+c) the external angle
    // of the ray through the cursor (E3) — both numerical limits, so honestly labelled ≈.
    if (modeIsDynamics(state.render.mode) && current.degree !== null) {
      const pot = greenPotential(current.jsFn, current.degree, z);
      rows.push(["G(z)", pot.escaped ? "≈ " + fmt(pot.G) : "≈ 0  (in K)"]);
      if (dynC) {
        const theta = externalAngleQuadratic(dynC, z);
        if (theta !== null) rows.push(["ext. angle θ", "≈ " + fmt(theta) + " turns"]);
      }
    }
    controls.setHover(rows);
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
