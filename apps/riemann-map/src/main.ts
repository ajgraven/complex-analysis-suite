// apps/riemann-map — the research-grade Riemann-map / conformal-mapping studio.
//
// A conformal-map studio: the two modes both draw a 2D-canvas picture (source pane + linked image
// pane), not a GPU field. `disk-image` (the default) pushes the unit disk's polar grid forward through
// φ — from the editor, a numerical region map g: 𝔻 → Ω, or an exterior map ψ imported from Complex
// Dynamics; `domain-map` fits the numerical Riemann map of a chosen region. Live φ editor + KaTeX,
// presets, hover readout, pan/zoom, PNG export (G2), and `#vs=` permalinks / `#s=` map hand-off.
import "./styles/main.css";
import {
  DEFAULT_VIEW_STATE,
  decodeRiemannState,
  encodeRiemannState,
  MAX_POLYGON_COORD,
  type RiemannViewState,
  type ViewportState,
} from "./viewState.js";
import { compileMap, derivativeAt, type CompiledMap } from "./map.js";
import { attachPanZoom, pixelToWorld } from "./render/nav.js";
import { modeIsDomain, modeIsDiskImage } from "./render/modes.js";
import {
  pushforwardCells,
  diskGrid,
  bounds,
  type GridLine,
  type DiskSide,
  type Pt,
} from "./render/grid.js";
import { Overlay2D, type FillCell } from "./render/overlay2d.js";
import { polylineSelfIntersects, downsample } from "./analysis/univalence.js";
import { legendModel, renderLegend } from "./ui/legend.js";
import { importExteriorMap, type ImportedExterior } from "./interchange/importMap.js";
import { DOMAIN_PRESETS, domainById, sampleDomainBoundary, conformalSourceGrid, CUSTOM_ID, makeCustomDomain, defaultCustomPolygon, toCCW, polygonNonSimpleReason, type DomainPreset } from "./domains.js";
import { fitConformalMap, fitForwardMap, fitSchwarzChristoffel, type SCMap } from "@cas/conformal";
import { injectPngText } from "@cas/export";
import { createControls, type MethodCard } from "./ui/controls.js";

function initialState(): RiemannViewState {
  return decodeRiemannState(window.location.hash) ?? DEFAULT_VIEW_STATE;
}

/** Reconstruct the in-memory imported map from a view-state's serialized `render.imported` — a permalink of
 *  an imported figure carries the coefficients, so a reload restores the map. Null if absent or malformed. */
function restoreImported(
  imp:
    | { lead: readonly [number, number]; coeffs: readonly (readonly [number, number])[]; app?: string; note?: string }
    | undefined,
): ImportedExterior | null {
  if (!imp || !Array.isArray(imp.lead) || imp.lead.length !== 2 || !Array.isArray(imp.coeffs)) return null;
  return {
    lead: [imp.lead[0], imp.lead[1]],
    coeffs: imp.coeffs.map((c) => [c[0], c[1]] as [number, number]),
    app: imp.app ?? "imported",
    note: imp.note,
  };
}

/** Evaluate a Laurent exterior map ψ(w) = γ₁·w + Σ bₖ·w⁻ᵏ from its coefficients (the imported-map source's
 *  ψ; the coefficients are decoded from an interchange link, not computed here). */
function evalLaurentPsi(
  lead: readonly [number, number],
  coeffs: readonly (readonly [number, number])[],
  w: Pt,
): Pt {
  let re = lead[0] * w[0] - lead[1] * w[1]; // γ₁·w
  let im = lead[0] * w[1] + lead[1] * w[0];
  const den = w[0] * w[0] + w[1] * w[1];
  if (den === 0) return [Infinity, Infinity];
  const invRe = w[0] / den; // w⁻¹
  const invIm = -w[1] / den;
  let pRe = 1; // w⁻ᵏ, k = 0
  let pIm = 0;
  for (const b of coeffs) {
    re += b[0] * pRe - b[1] * pIm;
    im += b[0] * pIm + b[1] * pRe;
    const nRe = pRe * invRe - pIm * invIm;
    const nIm = pRe * invIm + pIm * invRe;
    pRe = nRe;
    pIm = nIm;
  }
  return [re, im];
}
function fmt(n: number): string {
  return Number.isFinite(n) ? n.toPrecision(5).replace(/\.?0+$/, "") : "∞";
}
function fmtC(re: number, im: number): string {
  if (!Number.isFinite(re) || !Number.isFinite(im)) return "∞ (undefined)";
  return `${fmt(re)} ${im >= 0 ? "+" : "−"} ${fmt(Math.abs(im))}i`;
}

/** A unit-disk polar grid as spoke + ring polylines. Pushed FORWARD through the Schwarz–Christoffel map it
 *  becomes the conformal grid inside the polygon — the classic SC picture, and exact + cheap (no inverse).
 *  Spokes stop just shy of ∂𝔻 so the forward map is never evaluated exactly on a corner singularity. */
function diskPolarLines(nSpokes: number, nRings: number, res: number): { spokes: [number, number][][]; rings: [number, number][][] } {
  const spokes: [number, number][][] = [];
  for (let k = 0; k < nSpokes; k++) {
    const a = (2 * Math.PI * k) / nSpokes;
    const line: [number, number][] = [];
    for (let i = 0; i <= res; i++) {
      const s = 0.02 + 0.975 * (i / res);
      line.push([s * Math.cos(a), s * Math.sin(a)]);
    }
    spokes.push(line);
  }
  const rings: [number, number][][] = [];
  for (let i = 1; i <= nRings; i++) {
    const t = i / (nRings + 1);
    const ring: [number, number][] = [];
    for (let j = 0; j <= res; j++) {
      const p = (2 * Math.PI * j) / res;
      ring.push([t * Math.cos(p), t * Math.sin(p)]);
    }
    rings.push(ring);
  }
  return { spokes, rings };
}
const CURSOR_COLOR = "#ffffff";

/** A distinct hue per Schwarz–Christoffel corner index, shared by the prevertex wₖ and the corner vₖ so the
 *  eye pairs them across the two panes. */
function cornerHue(k: number, n: number): string {
  return `hsl(${Math.round((360 * k) / Math.max(1, n))}, 85%, 62%)`;
}

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
  // A "#s=" interchange deep link (e.g. Complex Dynamics' "Send to Riemann Map") boots straight into the
  // imported map. Its coefficients are recorded IN the view-state (render.imported) so the "#vs=" permalink
  // the first frame writes is self-contained — reopening/refreshing it restores the map without the "#s="
  // link. A "#vs=" permalink of a previously-imported figure carries render.imported; restore it here.
  let importedMap: ImportedExterior | null = importExteriorMap(window.location.hash);
  if (importedMap) {
    state = { ...state, render: { ...state.render, diskSource: "import", mode: "disk-image", imported: importedMap } };
  } else if (state.render.diskSource === "import") {
    importedMap = restoreImported(state.render.imported);
  }
  // An unknown mode id (e.g. a render mode retired in C, in an old permalink) falls back to the default view.
  if (state.render.mode !== "disk-image" && state.render.mode !== "domain-map") {
    state = { ...state, render: { ...state.render, mode: "disk-image" } };
  }

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
  const llabel = document.createElement("div");
  llabel.className = "panelabel";
  llabel.textContent = "z  ·  unit disk";
  // Live parameter readout for a family map φ(z; c) — updates as the c handle is dragged (top-right chip).
  const cChip = document.createElement("div");
  cChip.className = "cchip";
  cChip.hidden = true;
  left.append(canvas, overlayCanvas, llabel, cChip, legendEl, note);

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

  // ---- 2D overlays (the panes are pure 2D canvases; `canvas` is the pan/zoom + pointer surface) ----
  const leftOverlay = new Overlay2D(overlayCanvas);
  const rightPane = new Overlay2D(imageCanvas);

  let current: CompiledMap | null = null;
  let cursorZ: Pt | null = null;
  // Phase B — the Schwarz–Christoffel corner ↔ prevertex correspondence for the active polygon (colour-
  // matched across the two panes), plus which pair (if any) the cursor is over in the source pane.
  interface ScCorrespondence {
    readonly prevertices: readonly Pt[]; // wₖ on ∂𝔻
    readonly corners: readonly Pt[]; // vₖ on ∂Ω
    readonly angles: readonly number[]; // interior angle / π
  }
  let scCorr: ScCorrespondence | null = null;
  let hoverCorner: number | null = null;
  // The region Ω, shared by BOTH directions of a region's map: 𝔻→Ω (disk-image region source) and Ω→𝔻
  // (numeric domain-map mode). Each direction picks its engine by shape: a smooth Ω uses the lightning fit,
  // a polygon Ω the exact Schwarz–Christoffel engine. One "Shape" picker drives both — Direction keeps the shape.
  // Phase C — the editable custom polygon (draggable vertices). Sanitised on decode (hostile permalinks):
  // 3–40 finite vertices, clamped to the coordinate bound, kept counter-clockwise for the SC solver.
  const sanitizeCustom = (raw: unknown): Pt[] | null => {
    if (!Array.isArray(raw) || raw.length < 3 || raw.length > 40) return null;
    const clamp = (x: number): number => Math.max(-MAX_POLYGON_COORD, Math.min(MAX_POLYGON_COORD, x));
    const out: Pt[] = [];
    for (const p of raw) {
      if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
      out.push([clamp(p[0]), clamp(p[1])]);
    }
    return toCCW(out);
  };
  let customPolygon: Pt[] | null = sanitizeCustom(state.render.customPolygon);
  let shapeId = customPolygon ? CUSTOM_ID : domainById(state.render.region ?? state.render.domain ?? "")?.id ?? DOMAIN_PRESETS[0].id;
  /** The active domain: a synthesised custom polygon when shapeId is "custom", else the named preset. */
  const currentDomain = (): DomainPreset | undefined =>
    shapeId === CUSTOM_ID ? (customPolygon && customPolygon.length >= 3 ? makeCustomDomain(customPolygon) : undefined) : domainById(shapeId);
  let scDragging = false; // true during a live vertex drag → fast (lightning) refits for instant feedback
  let lastFastSc: SCMap | null = null; // the last fast solve, to warm-start the precise solve on release
  /** Solve the polygon's SC map at the altitude the moment calls for: FAST (lightning) during a live vertex
   *  drag for instant feedback, PRECISE on release — warm-started from the last fast solve (the engine's
   *  drag-then-refine continuation, ADR-0020). NEVER throws: a degenerate polygon (a vertex dragged onto a
   *  neighbour, or a near-zero interior angle) makes the precise parameter solve throw out of gaussJacobi;
   *  we fall back to the non-throwing lightning fit so the studio degrades gracefully (honestly flagged
   *  `converged: false`) instead of the render loop dying. */
  const solvePolygon = (vertices: readonly Pt[]): SCMap => {
    const vv = vertices.map((p): [number, number] => [p[0], p[1]]);
    if (scDragging) {
      lastFastSc = fitSchwarzChristoffel({ vertices: vv }, { mode: "fast" });
      return lastFastSc;
    }
    try {
      let sc = fitSchwarzChristoffel({ vertices: vv }, { mode: "precise", nGaussLegendre: 12, warmStart: lastFastSc ?? undefined });
      if (!sc.converged && lastFastSc) {
        // A warm start from a DEGRADED fast solve can stall the Gauss–Newton on strongly reentrant shapes;
        // the engine's robust default there is a uniform cold start. Retry once from cold and keep the better.
        const cold = fitSchwarzChristoffel({ vertices: vv }, { mode: "precise", nGaussLegendre: 12 });
        if (cold.converged || cold.residual < sc.residual) sc = cold;
      }
      lastFastSc = null;
      return sc;
    } catch {
      lastFastSc = null;
      return fitSchwarzChristoffel({ vertices: vv }, { mode: "fast" });
    }
  };
  // The Ω→𝔻 map for point queries (hover, linked cursor): the lightning fit for a smooth Ω, or the exact
  // Schwarz–Christoffel inverse for a polygon. Only `.eval` is needed here, so both engines fit one shape.
  // `evalStatus` (SC polygons only) also reports whether the exact inverse actually converged and landed in
  // the disk — so the hover can flag a query outside Ω / a Newton stall rather than show a wrong preimage
  // under the "exact inverse" label (WP6 / A5). Formula regions omit it (their forward eval is unconditional).
  let domainMap: { eval(z: Pt): Pt; evalStatus?(z: Pt): { w: Pt; ok: boolean } } | null = null;
  let domainSource: GridLine[] = [];
  let domainImage: GridLine[] = [];
  // Disk-image mode (the primary view): the unit-disk polar grid and its φ-pushforward.
  let diskSourceCells: FillCell[] = []; // filled style
  let diskImageCells: FillCell[] = [];
  let diskSrcLines: GridLine[] = []; // line style (rings/spokes)
  let diskImgLines: GridLine[] = [];
  let diskUnitSrc: Pt[] = []; // ∂𝔻 in the source pane
  let diskUnitImg: Pt[] = []; // φ(∂𝔻) in the image pane
  let diskFoldReason: string | null = null; // univalence verdict (null ⇒ no fold detected)
  let cParam: [number, number] = state.map.c ? [state.map.c[0], state.map.c[1]] : [0.45, 0.2]; // family param
  let usesC = /\bc\b/.test(state.map.expr); // does φ reference the draggable c?
  // A fitted region map g: 𝔻 → Ω — either the lightning forward map (smooth Ω) or Schwarz–Christoffel
  // (polygon Ω), behind one interface so the pushforward + method card don't care which.
  interface RegionMap {
    eval(w: Pt): Pt;
    engine: "sc" | "lightning";
    residual: number;
    stats: readonly (readonly [string, string])[];
    converged?: boolean;
  }
  let regionMap: RegionMap | null = null; // the forward Riemann map g: 𝔻 → Ω (region source, 2.1 / 3.1)
  // Cached Method-card models, refreshed when each engine (re)fits; updateMethod() picks by view.
  let regionCard: MethodCard | null = null; // 𝔻→Ω (region source)
  let domainCard: MethodCard | null = null; // Ω→𝔻 (domain-map mode)
  let domainDirty = true;
  let diskDirty = true;
  let regionDirty = true; // (re)fit the forward map g when the region source or domain changes
  let fitPending = true; // fit the disk pane to the actual pane aspect on first paint (1.5)
  let linkDirty = true;
  // The right (image) pane's own view: it auto-frames to the image's bounds until the user pans/zooms it,
  // then `imageViewport` drives it (session-only — not serialized; the "Fit" button restores auto-fit).
  let imageViewport: ViewportState = { centerRe: 0, centerIm: 0, zoom: 1 };
  let imageAutoFit = true;

  const IMPORT_LOG_R = 0.9; // exterior grid reach for an imported map (r up to e^0.9 ≈ 2.46)
  const diskSourceIsRegion = (): boolean => state.render.diskSource === "region";
  const diskSourceIsImport = (): boolean => state.render.diskSource === "import";
  const diskSourceIsNumeric = (): boolean => diskSourceIsRegion() || diskSourceIsImport();
  // Region maps are 𝔻 → Ω (interior); an imported exterior map ψ is ext(𝔻) → ext(·) (exterior).
  // Interior/exterior + the draggable c apply only to the explicit-expression source.
  const diskSide = (): DiskSide =>
    diskSourceIsImport() ? "exterior" : !diskSourceIsRegion() && state.render.disk === "exterior" ? "exterior" : "interior";
  const diskRadial = (): number => state.render.diskDensity ?? 18;
  const diskSectors = (): number => state.render.diskSectors ?? 2 * diskRadial();
  const diskStyle = (): string => state.render.diskStyle ?? "filled";
  const diskShow = (): string => state.render.diskShow ?? "both";
  const diskLayout = (): string => state.render.diskLayout ?? "split";
  const diskExtLogR = (): number => (diskSourceIsImport() ? IMPORT_LOG_R : 2.5); // exterior grid reach
  const diskMaxR = (): number => (diskSide() === "exterior" ? Math.exp(diskExtLogR()) : 1);
  const phi = (z: Pt): Pt => {
    if (!current) return z;
    const w = current.jsFn([z[0], z[1]], cParam);
    return [w[0], w[1]];
  };
  const regionPhi = (w: Pt): Pt => (regionMap ? regionMap.eval(w) : w);
  /** An imported exterior map ψ(w) = γ₁·w + Σ bₖ w⁻ᵏ (B): the Laurent coefficients are decoded from an
   *  interchange link (e.g. Complex Dynamics' Böttcher map of a filled Julia set), not computed here. */
  const importedValid = (): boolean => !!importedMap;
  const importedPsi = (w: Pt): Pt => (importedMap ? evalLaurentPsi(importedMap.lead, importedMap.coeffs, w) : w);
  /** The φ the disk-image mode pushes forward: explicit φ, the region map g, or an imported exterior map ψ. */
  const activePhi = (): ((z: Pt) => Pt) =>
    diskSourceIsRegion() ? regionPhi : diskSourceIsImport() ? importedPsi : phi;
  /** φ′ at w for the active source (symbolic for φ; a central difference for the numerical maps). */
  const activeDeriv = (w: Pt): [number, number] => {
    if (diskSourceIsNumeric()) {
      const P = activePhi();
      const h = 1e-4 * Math.max(1, Math.hypot(w[0], w[1]));
      const a = P([w[0] + h, w[1]]);
      const b = P([w[0] - h, w[1]]);
      return [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)];
    }
    return current ? derivativeAt(current, w, cParam) : [1, 0];
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
  }

  // ---- the "Visualize" + "Direction" chooser ⇄ internal (mode, diskSource) state ----
  type Vis = "formula" | "region" | "import";
  type Dir = "d2r" | "r2d";
  const currentVis = (): Vis =>
    modeIsDomain(state.render.mode)
      ? "region"
      : state.render.diskSource === "region"
        ? "region"
        : state.render.diskSource === "import"
          ? "import"
          : "formula";
  const currentDir = (): Dir => (modeIsDomain(state.render.mode) ? "r2d" : "d2r");

  /** Map the plain Visualize + Direction choice onto the internal (mode, diskSource) state. */
  function setModeSource(vis: Vis, dir: Dir): void {
    const r = state.render;
    if (vis === "formula") state = { ...state, render: { ...r, mode: "disk-image", diskSource: "expression" } };
    else if (vis === "import") state = { ...state, render: { ...r, mode: "disk-image", diskSource: "import" } };
    else if (dir === "r2d") state = { ...state, render: { ...r, mode: "domain-map" } };
    else state = { ...state, render: { ...r, mode: "disk-image", diskSource: "region" } };
  }

  /** Set the dirty flags a view change needs, refresh disclosure, and schedule a redraw. */
  function afterViewChange(): void {
    if (modeIsDomain(state.render.mode)) {
      domainDirty = true;
      fitPending = true; // reframe the Ω source pane on entry, symmetric with the disk-image view
    } else {
      diskDirty = true;
      fitPending = true; // reframe the disk pane for the new source
      if (diskSourceIsRegion()) regionDirty = true;
    }
    applyModeContext();
    refreshPolygonTools();
    invalidate();
  }

  // ---- the Method card (the engine that ran + its honest accuracy) ----
  function pendingCard(): MethodCard {
    return currentDomain()?.corners
      ? {
          name: "Schwarz–Christoffel",
          tag: "exact map",
          tagKind: "sc",
          desc: "The exact conformal map onto a polygon, built from its corner angles.",
          stats: [["status", "solving…"]],
          honesty: ["= exact corner angles", "≈ numerical map"],
        }
      : {
          name: "Lightning solver",
          tag: "numerical",
          tagKind: "light",
          desc: "A fast least-squares conformal fit for a smooth boundary.",
          stats: [["status", "fitting…"]],
        };
  }
  function importCard(): MethodCard {
    if (!importedMap) {
      return {
        name: "No map loaded",
        tag: "from a link",
        tagKind: "light",
        desc: "Paste a Complex Dynamics “Riemann Map ↗” link to render its exterior map here.",
        stats: [],
      };
    }
    const cap = Math.hypot(importedMap.lead[0], importedMap.lead[1]);
    return {
      name: "Imported exterior map",
      tag: "from a link",
      tagKind: "light",
      desc: "A filled Julia set's exterior Böttcher map, handed off from Complex Dynamics.",
      stats: [
        ["capacity", "≈ " + fmt(cap)],
        ["terms", importedMap.coeffs.length + " bₖ"],
      ],
    };
  }
  function updateMethod(): void {
    refreshPolygonTools();
    const vis = currentVis();
    if (vis === "formula") return controls.setMethod(null);
    if (vis === "import") return controls.setMethod(importCard());
    if (currentDir() === "r2d") return controls.setMethod(domainCard ?? pendingCard());
    return controls.setMethod(regionCard ?? pendingCard());
  }

  /** Live c-parameter chip on the disk pane (shown for a formula φ that references the draggable c). */
  function updateCChip(): void {
    const show = modeIsDiskImage(state.render.mode) && usesC && !diskSourceIsNumeric();
    cChip.hidden = !show;
    if (show) cChip.textContent = "c = " + fmtC(cParam[0], cParam[1]);
  }

  /** Contextual disclosure (A1): reveal only the controls the current view uses, and label both panes. */
  function applyModeContext(): void {
    const vis = currentVis();
    const dir = currentDir();
    controls.setContext({ vis, dir });
    controls.setVisualize(vis); // keep both chooser widgets truthful when mode/source change indirectly
    controls.setDirection(dir); // (e.g. formula→region re-derives the direction; the pill must follow)
    const [ll, rl] =
      vis === "formula"
        ? ["Source · unit disk 𝔻", "Image · w = φ(z)"]
        : vis === "import"
          ? ["Source · exterior 𝔻*", "Image · ψ — exterior map"]
          : dir === "r2d"
            ? ["Source · region Ω", "Image · unit disk 𝔻"]
            : ["Source · unit disk 𝔻", "Image · region Ω"];
    llabel.textContent = ll;
    rlabel.textContent = rl;
    updateMethod();
    updateCChip();
    renderLegend(legendEl, legendModel(state.render.mode)); // colour-key chip (A4)
  }

  // ---- numerical Riemann map of a domain (P3b) -----------------------------
  const DOMAIN_SAMPLES = 500;
  const DOMAIN_DEGREE = 60;
  const DOMAIN_BG: readonly [number, number, number] = [0.06, 0.07, 0.09];
  const UNIT_CIRCLE: Pt[] = Array.from({ length: 361 }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / 360;
    return [Math.cos(t), Math.sin(t)];
  });

  /** Fit the Ω → 𝔻 map for the selected domain and build its source (Ω) and image (disk) grids. A polygon
   *  goes through the exact Schwarz–Christoffel engine (the same map the 𝔻 → Ω direction uses, inverted); a
   *  smooth Ω uses the lightning least-squares fit. */
  function computeDomain(): void {
    const d = currentDomain();
    if (!d) {
      domainMap = null;
      domainSource = [];
      domainImage = [];
      domainCard = null;
      scCorr = null;
      controls.setAnalysis(null);
      updateMethod();
      return;
    }
    const BDRY = "rgba(200,208,222,0.92)";
    const SPOKE = "rgba(110,168,254,0.8)";
    const RING = "rgba(130,225,255,0.72)";
    const DISK_BDRY = "rgba(120,130,150,0.85)"; // ∂𝔻, for reference

    // A polygon Ω is a Schwarz–Christoffel job. The exact map Ω → 𝔻 is the SAME map the 𝔻 → Ω direction
    // uses, run backwards (sc.inverse) — so hover reads an exact preimage. We DRAW the conformal grid by
    // pushing the disk's polar grid FORWARD (cheap + exact); the ODE inverse is reserved for the single
    // hover point. This reaches ≈ machine precision (subject to the interactive quadrature order) at the
    // reentrant corners the lightning fit only approximates.
    if (d.corners) {
      const sc = solvePolygon(d.corners);
      const evalStatus = (z: Pt): { w: Pt; ok: boolean } => {
        const st = sc.inverseWithStatus([z[0], z[1]]);
        const w: Pt = [st.w[0], st.w[1]];
        // A converged inverse landing in the closed disk is a genuine exact preimage; a Newton stall
        // (!converged) or |w| > 1 (z ∉ Ω, an extrapolated preimage) is NOT — surface that to the hover.
        return { w, ok: st.converged && Math.hypot(w[0], w[1]) <= 1 + 1e-6 };
      };
      domainMap = { eval: (z: Pt): Pt => evalStatus(z).w, evalStatus };
      scCorr = { prevertices: sc.prevertices, corners: d.corners, angles: sc.angles };
      const dg = diskPolarLines(24, 6, 96);
      const outline: Pt[] = [...d.corners, d.corners[0]];
      domainSource = [
        { color: BDRY, pts: outline },
        ...dg.spokes.map((p) => ({ color: SPOKE, pts: sc.forwardMany(p) as Pt[] })),
        ...dg.rings.map((p) => ({ color: RING, pts: sc.forwardMany(p) as Pt[] })),
      ];
      domainImage = [
        { color: DISK_BDRY, pts: UNIT_CIRCLE },
        ...dg.spokes.map((p) => ({ color: SPOKE, pts: p as Pt[] })),
        ...dg.rings.map((p) => ({ color: RING, pts: p as Pt[] })),
      ];
      const maxAngle = Math.max(...sc.angles);
      const rows: [string, string][] = [
        ["engine", "Schwarz–Christoffel"],
        ["domain", d.name],
        ["prevertices", "= " + sc.prevertices.length],
        ["max interior ∠", "= " + fmt(maxAngle) + "·π"],
        ["vertex resid.", "≈ " + fmt(sc.residual)],
      ];
      controls.setAnalysis(rows, "Schwarz–Christoffel map");
      const nonSimple = polygonNonSimpleReason(d.corners);
      domainCard = {
        name: "Schwarz–Christoffel",
        tag: nonSimple ? "⚠ non-simple polygon" : sc.mode === "fast" ? "fast · editing" : sc.converged ? "exact inverse" : "check residual",
        tagKind: "sc",
        desc: nonSimple
          ? `⚠ ${nonSimple} — a non-simple polygon has no conformal map, so the picture below is not meaningful. Drag a vertex to make the outline simple.`
          : "The exact conformal map Ω → 𝔻 — the same map as the 𝔻 → Ω direction, run backwards. Built from the polygon's corner angles, it reaches ≈ machine precision (subject to the interactive quadrature order) even at the reentrant corners the lightning fit only approximates — see the vertex residual.",
        stats: [
          ["prevertices", "= " + sc.prevertices.length],
          ["mode", sc.degraded ? sc.mode + " · degraded" : sc.mode],
          ["vertex resid.", "≈ " + fmt(sc.residual)],
        ],
        honesty: ["= exact corner angles", "≈ numerical map"],
      };
      updateMethod();
      return;
    }

    // A smooth Ω: the polynomial-only lightning least-squares fit (P3a).
    const boundary = sampleDomainBoundary(d, DOMAIN_SAMPLES);
    const f = fitConformalMap(boundary, DOMAIN_DEGREE);
    domainMap = f;
    scCorr = null; // smooth Ω has no corners / prevertices
    const cg = conformalSourceGrid(d, 24, 6, 160);
    domainSource = [
      { color: BDRY, pts: cg.boundary },
      ...cg.spokes.map((p) => ({ color: SPOKE, pts: p as Pt[] })),
      ...cg.rings.map((p) => ({ color: RING, pts: p as Pt[] })),
    ];
    domainImage = [
      { color: DISK_BDRY, pts: UNIT_CIRCLE }, // the target ∂𝔻, for reference
      { color: BDRY, pts: f.evalMany(cg.boundary) as Pt[] },
      ...cg.spokes.map((p) => ({ color: SPOKE, pts: f.evalMany(p) as Pt[] })),
      ...cg.rings.map((p) => ({ color: RING, pts: f.evalMany(p) as Pt[] })),
    ];
    // Honest readout: the map is numerical; the boundary residual is its ≈ accuracy.
    const rows: [string, string][] = [
      ["method", "lightning (LSQ)"],
      ["domain", d.name],
      ["degree", "= " + f.degree],
      ["boundary resid.", "≈ " + fmt(f.boundaryResidual)],
      ["f(0)", "= 0  (exact)"],
    ];
    controls.setAnalysis(rows, "Numerical map");
    domainCard = {
      name: "Lightning solver",
      tag: "numerical",
      tagKind: "light",
      desc: "The Riemann map Ω → 𝔻 by the lightning least-squares fit (Gopal–Trefethen).",
      stats: [
        ["degree", "= " + f.degree],
        ["boundary resid.", "≈ " + fmt(f.boundaryResidual)],
      ],
    };
    updateMethod();
  }

  // ---- the image of the disk (P4 — the primary view) -----------------------
  /** Colour key for a cell: hue = arg φ′ (local rotation), lighter fill + saturated edge. */
  function cellColors(deriv: [number, number]): { fill: string; edge: string } {
    const h = (((Math.atan2(deriv[1], deriv[0]) / (2 * Math.PI)) % 1) + 1) % 1;
    const H = (h * 360).toFixed(0);
    return { fill: `hsla(${H}, 60%, 55%, 0.5)`, edge: `hsl(${H}, 85%, 58%)` };
  }

  const RING_COLOR = "rgba(130,225,255,0.9)";
  const SPOKE_COLOR = "rgba(255,180,120,0.9)";

  /** Fit the forward Riemann map g: 𝔻 → Ω for the selected region (disk-image "region" source). A polygon Ω
   *  is a Schwarz–Christoffel job (3.1) — the parameter solve gives an exact-form map that is stable at the
   *  corners the lightning forward fit is not; a smooth Ω uses the lightning forward map (2.1). */
  function fitRegion(): void {
    const d = currentDomain();
    if (!d) {
      regionMap = null;
      regionCard = null;
      scCorr = null;
      updateMethod();
      return;
    }
    if (d.corners) {
      const sc = solvePolygon(d.corners);
      scCorr = { prevertices: sc.prevertices, corners: d.corners, angles: sc.angles };
      const stats: [string, string][] = [
        ["prevertices", "= " + d.corners.length + (sc.converged ? "  (solved)" : sc.mode === "fast" ? "  (fast)" : "  (not converged)")],
        ["mode", sc.degraded ? sc.mode + " · degraded" : sc.mode],
        ["max interior ∠", "= " + fmt(Math.max(...sc.angles)) + "·π"],
      ];
      if (sc.modulus !== undefined) stats.push(["conf. modulus", "≈ " + fmt(sc.modulus)]);
      stats.push(["residual", "≈ " + fmt(sc.residual)]);
      regionMap = {
        eval: (w: Pt): Pt => {
          const p = sc.forward([w[0], w[1]]);
          return [p[0], p[1]];
        },
        engine: "sc",
        residual: sc.residual,
        stats,
        converged: sc.converged,
      };
      regionCard = {
        name: "Schwarz–Christoffel",
        tag: sc.mode === "fast" ? "fast · editing" : sc.converged ? "exact map" : "check residual",
        tagKind: "sc",
        desc: "The exact conformal map onto a polygon, built from its corner angles — ≈ machine precision (subject to the interactive quadrature order; see the vertex residual), with meaningful prevertices & accessory constants.",
        stats,
        honesty: ["= exact corner angles", "≈ numerical map"],
      };
      updateMethod();
      return;
    }
    scCorr = null; // smooth Ω has no corners / prevertices
    const boundary = sampleDomainBoundary(d, DOMAIN_SAMPLES);
    const f = fitConformalMap(boundary, DOMAIN_DEGREE); // Ω → 𝔻
    const g = fitForwardMap(f, boundary, DOMAIN_DEGREE); // 𝔻 → Ω (the forward map we push the disk through)
    const stats: [string, string][] = [
      ["degree", "= " + g.degree],
      ["boundary resid.", "≈ " + fmt(g.boundaryResidual)],
    ];
    regionMap = {
      eval: (w: Pt): Pt => {
        const p = g.eval([w[0], w[1]]);
        return [p[0], p[1]];
      },
      engine: "lightning",
      residual: g.boundaryResidual,
      stats,
    };
    regionCard = {
      name: "Lightning solver",
      tag: "numerical",
      tagKind: "light",
      desc: "A fast least-squares conformal fit for a smooth boundary (Gopal–Trefethen).",
      stats,
    };
    updateMethod();
  }

  /** Build the unit-disk polar grid and its pushforward — filled cells AND ring/spoke line curves — for
   *  the active source (explicit φ, or the numerical region map g), plus the honest univalence verdict. */
  function computeDiskImage(): void {
    const region = diskSourceIsRegion();
    const imported = diskSourceIsImport();
    const ready = imported ? importedValid() : region ? !!regionMap : !!current;
    if (!ready) {
      diskSourceCells = [];
      diskImageCells = [];
      diskSrcLines = [];
      diskImgLines = [];
      diskUnitSrc = [];
      diskUnitImg = [];
      diskFoldReason = null;
      controls.setAnalysis(
        imported
          ? [
              ["source", "imported exterior map ψ"],
              ["needs", "a map link — open one from Complex Dynamics, or paste via “Import map…”"],
            ]
          : null,
        "Image of the disk",
      );
      return;
    }
    const P = activePhi();
    const side = diskSide();
    const dg = diskGrid(side, diskRadial(), diskSectors(), diskExtLogR());
    diskUnitSrc = dg.unitCircle;
    diskUnitImg = dg.unitCircle.map(P);

    // Filled cells (always built — the per-cell φ′ also powers the interior critical-point check).
    const img = pushforwardCells(dg.cells, P);
    const src: FillCell[] = [];
    const imf: FillCell[] = [];
    const rMax = diskMaxR();
    let maxMag = 0;
    let minBulk = Infinity; // smallest |φ′| away from the radial boundaries (an interior φ′≈0 ⇒ a fold)
    for (let i = 0; i < dg.cells.length; i++) {
      const m = dg.cells[i].mid;
      const d = activeDeriv(m);
      const mag = Math.hypot(d[0], d[1]);
      if (Number.isFinite(mag) && mag > maxMag) maxMag = mag;
      const rr = Math.hypot(m[0], m[1]);
      const inBulk = side === "exterior" ? rr > 1.1 && rr < 0.9 * rMax : rr > 0.05 && rr < 0.9;
      if (inBulk && Number.isFinite(mag) && mag < minBulk) minBulk = mag;
      const { fill, edge } = cellColors(d);
      src.push({ quad: dg.cells[i].quad, fill, edge });
      imf.push({ quad: img[i].quad, fill, edge });
    }
    diskSourceCells = src;
    diskImageCells = imf;

    // Line curves (rings/spokes) for the line-art style, honoring the circles/rays subset.
    const show = diskShow();
    const sLines: GridLine[] = [];
    const iLines: GridLine[] = [];
    if (show !== "rays")
      for (const r of dg.rings) {
        sLines.push({ color: RING_COLOR, pts: r });
        iLines.push({ color: RING_COLOR, pts: r.map(P) });
      }
    if (show !== "circles")
      for (const s of dg.spokes) {
        sLines.push({ color: SPOKE_COLOR, pts: s });
        iLines.push({ color: SPOKE_COLOR, pts: s.map(P) });
      }
    diskSrcLines = sLines;
    diskImgLines = iLines;

    // Univalence: run the fold heuristic for the explicit source; a region Riemann map is a bijection by
    // construction, so it is univalent without a check (honest, ≈): an interior critical point φ′≈0, or a
    // self-intersecting image boundary flags a folded explicit map.
    if (diskSourceIsNumeric()) {
      diskFoldReason = null; // a Riemann / imported exterior map is a bijection by construction
    } else {
      const critical = Number.isFinite(minBulk) && maxMag > 0 && minBulk < 1e-3 * maxMag;
      const boundaryFold = polylineSelfIntersects(downsample(diskUnitImg, 180), true);
      diskFoldReason = critical ? "φ′ ≈ 0 inside (critical point)" : boundaryFold ? "boundary self-intersects" : null;
    }

    let rows: [string, string][];
    if (imported && importedMap) {
      const gamma = importedMap.lead;
      rows = [
        ["source", `imported map  ·  from ${importedMap.app}`],
        ["ψ(w)", "γ₁·w + Σ bₖ w⁻ᵏ"],
        ["γ₁", "≈ " + fmtC(gamma[0], gamma[1])],
        ["terms", `${importedMap.coeffs.length} bₖ  ·  grid ${diskRadial()} × ${diskSectors()}`],
        ["univalent", "= yes  (exterior map, by construction)"],
      ];
    } else if (region && regionMap) {
      const d = currentDomain();
      rows = [
        ["source", "region 𝔻 → Ω  (numeric)"],
        ["region Ω", d ? d.name : shapeId],
        ["engine", regionMap.engine === "sc" ? "Schwarz–Christoffel" : "lightning"],
        ...regionMap.stats.map((r): [string, string] => [r[0], r[1]]),
        ["grid", `${diskRadial()} × ${diskSectors()}  (radial × angular)`],
        ["univalent", "= yes  (Riemann map, by construction)"],
      ];
    } else {
      const exact = current && current.jsDeriv ? "=" : "≈";
      rows = [
        ["map φ", "= " + state.map.expr],
        ["disk", side === "exterior" ? "exterior 𝔻*  (|z| ≥ 1)" : "interior 𝔻  (|z| ≤ 1)"],
        ["grid", `${diskRadial()} × ${diskSectors()}  (radial × angular)`],
        ["colour", exact + " arg φ′  (local rotation)"],
        ["univalent", diskFoldReason ? "≈ no — " + diskFoldReason : "≈ yes  (no fold detected)"],
      ];
      if (usesC) rows.splice(1, 0, ["c", "= " + fmtC(cParam[0], cParam[1]) + "  (drag on 𝔻)"]);
    }
    controls.setAnalysis(rows, "Image of the disk");
  }

  /** All image-cell corners, for auto-framing the image pane. */
  const cellPts = (cells: readonly FillCell[]): Pt[] => {
    const out: Pt[] = [];
    for (const c of cells) for (const p of c.quad) out.push(p);
    return out;
  };

  /** Phase B: draw the SC prevertices wₖ as colour-matched dots on the 𝔻 pane. */
  function drawPrevertexDots(pane: Overlay2D): void {
    if (!scCorr) return;
    const n = scCorr.corners.length;
    for (let k = 0; k < n; k++) pane.drawDot(scCorr.prevertices[k], cornerHue(k, n), hoverCorner === k);
  }
  /** Phase B: draw the SC corners vₖ as colour-matched dots on the Ω pane, each labelled with its interior
   *  angle αₖ·π placed just INSIDE the corner (toward the polygon's area centroid) so it never clips the
   *  pane edge. The area centroid (not the vertex mean) is the anchor: for a reentrant shape the vertex mean
   *  can fall on a corner (e.g. the L-shape's reflex vertex) — a zero offset that would stack the label on
   *  the dot — or outside Ω. Falls back to the vertex mean if the polygon is (near-)degenerate. */
  function drawCornerDots(pane: Overlay2D): void {
    if (!scCorr) return;
    const n = scCorr.corners.length;
    let a2 = 0;
    let sx = 0;
    let sy = 0;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
      const p = scCorr.corners[i];
      const q = scCorr.corners[(i + 1) % n];
      const cross = p[0] * q[1] - q[0] * p[1];
      a2 += cross;
      sx += (p[0] + q[0]) * cross;
      sy += (p[1] + q[1]) * cross;
      mx += p[0];
      my += p[1];
    }
    const cx = Math.abs(a2) > 1e-9 ? sx / (3 * a2) : mx / (n || 1);
    const cy = Math.abs(a2) > 1e-9 ? sy / (3 * a2) : my / (n || 1);
    for (let k = 0; k < n; k++) {
      const v = scCorr.corners[k];
      const emph = hoverCorner === k;
      pane.drawDot(v, cornerHue(k, n), emph);
      // Place the angle label just INSIDE the corner (toward the centroid) so it never clips the pane edge.
      const ux = cx - v[0];
      const uy = cy - v[1];
      const ul = Math.hypot(ux, uy) || 1;
      const anchor: Pt = [v[0] + (ux / ul) * 0.16, v[1] + (uy / ul) * 0.16];
      pane.drawLabel(anchor, fmt(scCorr.angles[k]) + "π", 0, 0, emph);
    }
  }

  /** Frame the right (image) pane. While auto-fit is on (and no vertex drag is freezing it) it fits `target`
   *  and mirrors the result into `imageViewport`, so a first user pan/zoom continues from the framed view;
   *  once the user has grabbed the pane, `imageViewport` drives it. */
  function frameImagePane(target: { minx: number; maxx: number; miny: number; maxy: number }): void {
    if (imageAutoFit && !scDragging) {
      rightPane.fitBounds(target);
      const v = rightPane.view();
      imageViewport = { centerRe: v.centerRe, centerIm: v.centerIm, zoom: 1 / v.halfSpan };
    } else {
      rightPane.setCenterSpan(imageViewport.centerRe, imageViewport.centerIm, 1 / imageViewport.zoom);
    }
  }

  function drawOverlays(): void {
    // Both modes are two-pane (source + linked image), so the stage is always split. Toggle split FIRST,
    // then size the left overlay: the pane's final (half) width must be in effect before resize() reads it,
    // or a full-width buffer gets CSS-squished (the disk turns oval).
    const disk = modeIsDiskImage(state.render.mode);
    const domain = modeIsDomain(state.render.mode);
    stage.classList.add("split");
    stage.classList.toggle("solo", disk && diskLayout() === "image"); // image-only layout (2.4)
    leftOverlay.resize();
    leftOverlay.setCenterSpan(state.viewport.centerRe, state.viewport.centerIm, 1 / state.viewport.zoom);
    leftOverlay.clear();
    if (disk) {
      const lineMode = diskStyle() === "lines";
      // ∂𝔻 turns amber-red when a fold is detected, so a non-univalent image never reads as clean.
      const bCol = diskFoldReason ? "rgba(255,120,90,0.98)" : "rgba(255,255,255,0.72)";
      // Left pane: the unit disk with its polar grid + ∂𝔻, and the draggable c handle if φ uses it.
      if (lineMode) leftOverlay.drawLines(diskSrcLines, 1.1);
      else leftOverlay.fillCells(diskSourceCells, 0.6);
      leftOverlay.drawLines([{ color: bCol, pts: diskUnitSrc }], 1.4);
      if (usesC && !diskSourceIsNumeric()) leftOverlay.drawHandle(cParam, "#ff5a5a", "c");
      if (cursorZ) leftOverlay.drawMarker(cursorZ, CURSOR_COLOR);
      // The prevertices wₖ live on the disk pane's ∂𝔻 (region source only).
      if (diskSourceIsRegion()) drawPrevertexDots(leftOverlay);
      leftOverlay.drawScaleBar();
      // Right pane: the image φ(𝔻), auto-framed, same colour key + φ(∂𝔻).
      if (rightPane.resize()) {
        const b =
          (lineMode ? bounds(diskImgLines) : bounds([{ color: "", pts: cellPts(diskImageCells) }])) ??
          ({ minx: -1, maxx: 1, miny: -1, maxy: 1 } as const);
        // Frame from the interactive view (auto-fit to `b`, or the user's pan/zoom). A vertex drag freezes
        // it so the shape doesn't slide out from under the cursor; on release it re-fits to the edited shape.
        frameImagePane(b);
        rightPane.clear();
        if (lineMode) rightPane.drawLines(diskImgLines, 1.1);
        else rightPane.fillCells(diskImageCells, 0.6);
        rightPane.drawLines([{ color: bCol, pts: diskUnitImg }], 1.4);
        if (cursorZ) rightPane.drawMarker(activePhi()(cursorZ), CURSOR_COLOR);
        // The corners vₖ + interior-angle labels live on the image pane's ∂Ω (region source only).
        if (diskSourceIsRegion()) drawCornerDots(rightPane);
      }
      return;
    }
    if (domain) {
      leftOverlay.drawLines(domainSource, 1.1);
      if (cursorZ) leftOverlay.drawMarker(cursorZ, CURSOR_COLOR);
      // Ω is the source pane here: corners + interior-angle labels on the left, prevertices on the disk.
      drawCornerDots(leftOverlay);
      leftOverlay.drawScaleBar();
      if (rightPane.resize()) {
        frameImagePane({ minx: -1, maxx: 1, miny: -1, maxy: 1 });
        rightPane.clear();
        rightPane.drawLines(domainImage, 1.1);
        if (cursorZ && domainMap) rightPane.drawMarker(domainMap.eval([cursorZ[0], cursorZ[1]]), CURSOR_COLOR);
        drawPrevertexDots(rightPane);
      }
      return;
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

  /** Numeric-domain-map export: a combined [ Ω │ disk ] plate of the region and its conformal image.
   *  Pure 2D (offscreen canvases), mirroring {@link exportDiskPlate}. */
  async function exportDomainPlate(scale = 2): Promise<void> {
    const paneW = Math.max(1, Math.round((canvas.clientWidth || 600) * scale));
    const H = Math.max(1, Math.round((canvas.clientHeight || 600) * scale));
    const bg = `rgb(${Math.round(DOMAIN_BG[0] * 255)},${Math.round(DOMAIN_BG[1] * 255)},${Math.round(DOMAIN_BG[2] * 255)})`;

    const makePane = (draw: (ov: Overlay2D) => void): HTMLCanvasElement => {
      const cv = document.createElement("canvas");
      cv.width = paneW;
      cv.height = H;
      const c2 = cv.getContext("2d");
      if (c2) {
        c2.fillStyle = bg;
        c2.fillRect(0, 0, paneW, H);
      }
      draw(new Overlay2D(cv));
      return cv;
    };

    const left = makePane((ov) => {
      ov.setCenterSpan(state.viewport.centerRe, state.viewport.centerIm, 1 / state.viewport.zoom);
      ov.drawLines(domainSource, 1.4);
    });
    const right = makePane((ov) => {
      if (imageAutoFit) ov.fitBounds({ minx: -1, maxx: 1, miny: -1, maxy: 1 });
      else ov.setCenterSpan(imageViewport.centerRe, imageViewport.centerIm, 1 / imageViewport.zoom);
      ov.drawLines(domainImage, 1.4);
    });

    const plate = document.createElement("canvas");
    plate.width = paneW * 2;
    plate.height = H;
    const ctx = plate.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(left, 0, 0);
    ctx.drawImage(right, paneW, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath();
    ctx.moveTo(paneW, 0);
    ctx.lineTo(paneW, H);
    ctx.stroke();

    const blob = await new Promise<Blob | null>((res) => plate.toBlob(res, "image/png"));
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const permalink = location.origin + location.pathname + encodeRiemannState(state);
    const withMeta = injectPngText(bytes, {
      Software: "Riemann Map — Complex Analysis Suite",
      "cas:state": permalink,
    });
    downloadBytes(withMeta, "riemann-domain-map.png");
  }

  /** Disk-image export (1.2): a combined [ disk │ image ] plate, so the deliverable is the IMAGE, not
   *  just the source pane. Draws to offscreen 2D canvases (the live picture is a 2D overlay, not GL). */
  async function exportDiskPlate(scale = 2): Promise<void> {
    const paneW = Math.max(1, Math.round((canvas.clientWidth || 600) * scale));
    const H = Math.max(1, Math.round((canvas.clientHeight || 600) * scale));
    const bg = `rgb(${Math.round(DOMAIN_BG[0] * 255)},${Math.round(DOMAIN_BG[1] * 255)},${Math.round(DOMAIN_BG[2] * 255)})`;
    const lineMode = diskStyle() === "lines";
    const bCol = diskFoldReason ? "rgba(255,120,90,0.98)" : "rgba(255,255,255,0.82)";

    const makePane = (draw: (ov: Overlay2D) => void): HTMLCanvasElement => {
      const cv = document.createElement("canvas");
      cv.width = paneW;
      cv.height = H;
      const c2 = cv.getContext("2d");
      if (c2) {
        c2.fillStyle = bg;
        c2.fillRect(0, 0, paneW, H);
      }
      draw(new Overlay2D(cv));
      return cv;
    };

    const left = makePane((ov) => {
      ov.setCenterSpan(state.viewport.centerRe, state.viewport.centerIm, 1 / state.viewport.zoom);
      if (lineMode) ov.drawLines(diskSrcLines, 1.4);
      else ov.fillCells(diskSourceCells, 1);
      ov.drawLines([{ color: bCol, pts: diskUnitSrc }], 2);
      if (usesC && !diskSourceIsNumeric()) ov.drawHandle(cParam, "#ff5a5a", "c");
    });
    const right = makePane((ov) => {
      const b =
        (lineMode ? bounds(diskImgLines) : bounds([{ color: "", pts: cellPts(diskImageCells) }])) ??
        ({ minx: -1, maxx: 1, miny: -1, maxy: 1 } as const);
      if (imageAutoFit) ov.fitBounds(b);
      else ov.setCenterSpan(imageViewport.centerRe, imageViewport.centerIm, 1 / imageViewport.zoom);
      if (lineMode) ov.drawLines(diskImgLines, 1.4);
      else ov.fillCells(diskImageCells, 1);
      ov.drawLines([{ color: bCol, pts: diskUnitImg }], 2);
    });

    const plate = document.createElement("canvas");
    plate.width = paneW * 2;
    plate.height = H;
    const ctx = plate.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(left, 0, 0);
    ctx.drawImage(right, paneW, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath();
    ctx.moveTo(paneW, 0);
    ctx.lineTo(paneW, H);
    ctx.stroke();

    const blob = await new Promise<Blob | null>((res) => plate.toBlob(res, "image/png"));
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const permalink = location.origin + location.pathname + encodeRiemannState(state);
    const withMeta = injectPngText(bytes, {
      Software: "Riemann Map — Complex Analysis Suite",
      "cas:state": permalink,
    });
    downloadBytes(withMeta, "riemann-disk-image.png");
  }

  // ---- unified frame (rAF-coalesced; dirty flags decide what to recompute) --
  let frame = 0;
  function schedule(): void {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const domain = modeIsDomain(state.render.mode);
      const disk = modeIsDiskImage(state.render.mode);
      if (domain && domainDirty) {
        computeDomain();
        domainDirty = false;
      }
      if (disk && diskSourceIsRegion() && regionDirty) {
        fitRegion(); // (re)fit the forward map g: 𝔻 → Ω — the expensive step, only on source/domain change
        regionDirty = false;
        diskDirty = true;
      }
      if (disk && diskDirty) {
        computeDiskImage(); // cells live on the unit disk — independent of the canvas size
        diskDirty = false;
      }
      drawOverlays(); // both modes draw pure-2D overlays; the panes' dark background is CSS (no GLSL field)
      // Fit the disk pane to the ACTUAL pane aspect (now that drawOverlays has sized the overlay). 1.5.
      if (fitPending) {
        fitPending = false;
        imageAutoFit = true; // a reframe (mode / shape / source / side / layout / Fit) re-frames BOTH panes
        const w = overlayCanvas.width;
        const h = overlayCanvas.height;
        const aspect = w > 0 && h > 0 ? w / h : 1;
        if (modeIsDiskImage(state.render.mode)) {
          const halfSpan = (diskMaxR() * 1.12) / Math.min(1, aspect);
          setViewport({ centerRe: 0, centerIm: 0, zoom: 1 / halfSpan }); // schedules one more frame
        } else if (modeIsDomain(state.render.mode)) {
          // Frame the source pane to the region Ω's own bounds (the numeric map's source grid).
          const b = bounds(domainSource);
          if (b) {
            const halfSpan = Math.max((b.maxx - b.minx) / (2 * aspect), (b.maxy - b.miny) / 2) * 1.12 || 1;
            setViewport({ centerRe: (b.minx + b.maxx) / 2, centerIm: (b.miny + b.maxy) / 2, zoom: 1 / halfSpan });
          }
        }
      }
      updateReadout();
      if (linkDirty) {
        history.replaceState(null, "", encodeRiemannState(state));
        linkDirty = false;
      }
    });
  }
  /** Mark the permalink stale and schedule a redraw. (The 2D overlays recompute from their own dirty
   *  flags — diskDirty / domainDirty / regionDirty — set by the caller before invalidating.) */
  function invalidate(): void {
    linkDirty = true;
    schedule();
  }

  function setViewport(v: ViewportState): void {
    state = { ...state, viewport: v };
    invalidate();
  }

  // ---- controls ------------------------------------------------------------
  controls.setVisualize(currentVis());
  controls.setDirection(currentDir());
  controls.setShape(shapeId);
  controls.setFormulaHint(usesC);
  controls.setDiskSide(diskSide());
  controls.setDiskStyle(diskStyle());
  controls.setDiskShow(diskShow());
  controls.setDiskRadial(diskRadial());
  controls.setDiskAngular(diskSectors());
  controls.setDiskLayout(diskLayout());
  applyModeContext(); // initial contextual disclosure
  controls.onExpr((expr) => {
    state = { ...state, map: { ...state.map, expr, antiholomorphic: /conjugate/.test(expr) } };
    usesC = /\bc\b/.test(expr); // does the new φ have a draggable parameter?
    controls.setFormulaHint(usesC); // reveal the "drag c" hint iff the map references c
    updateCChip();
    applyMap();
    diskDirty = true; // the disk-image cells are a function of φ
    invalidate();
  });
  controls.onVisualize((id) => {
    setModeSource(id as Vis, currentDir()); // formula / region / import → internal (mode, diskSource)
    afterViewChange();
  });
  controls.onDirection((id) => {
    setModeSource("region", id as Dir); // 𝔻→Ω (disk-image region) vs Ω→𝔻 (numeric domain-map)
    afterViewChange();
  });
  // Paste an @cas/interchange "#s=" link (Complex Dynamics' "Send to Riemann Map", or a QD φ) → import it
  // as the exterior disk-image source. The deep-link path (a "#s=" hash on load) is handled at boot.
  controls.onImportMap((link) => {
    const m = importExteriorMap(link);
    if (!m) {
      note.textContent = "That doesn't look like an exterior-map link (expected a Complex Dynamics “Riemann Map ↗” link).";
      note.classList.add("visible");
      return;
    }
    note.classList.remove("visible");
    importedMap = m;
    // Record the coefficients in the view-state so the permalink is self-contained (survives reload).
    state = { ...state, render: { ...state.render, diskSource: "import", mode: "disk-image", imported: m } };
    controls.setVisualize("import");
    diskDirty = true;
    fitPending = true;
    applyModeContext();
    invalidate();
  });
  controls.onDiskSide((side) => {
    state = { ...state, render: { ...state.render, disk: side } };
    diskDirty = true;
    fitPending = true; // fit the pane to the new side (interior ↔ exterior), replacing the zoom preset
    invalidate();
  });
  controls.onDiskStyle((id) => {
    state = { ...state, render: { ...state.render, diskStyle: id } };
    invalidate(); // both styles are already computed each rebuild — just redraw
  });
  controls.onDiskShow((id) => {
    state = { ...state, render: { ...state.render, diskShow: id } };
    diskDirty = true; // the curve subset is chosen at build time
    invalidate();
  });
  controls.onDiskRadial((n) => {
    state = { ...state, render: { ...state.render, diskDensity: n } };
    diskDirty = true;
    invalidate();
  });
  controls.onDiskAngular((n) => {
    state = { ...state, render: { ...state.render, diskSectors: n } };
    diskDirty = true;
    invalidate();
  });
  controls.onFit(() => {
    fitPending = true;
    schedule();
  });
  controls.onDiskLayout((id) => {
    state = { ...state, render: { ...state.render, diskLayout: id } };
    fitPending = true; // switching back to two-pane re-frames the (now narrower) disk pane
    invalidate();
  });
  controls.onShape((id) => {
    shapeId = id;
    if (id === CUSTOM_ID && (!customPolygon || customPolygon.length < 3)) customPolygon = defaultCustomPolygon();
    // One shape drives both directions; syncShapeState writes both fields (+ the custom vertices) so a
    // permalink + a Direction flip stay in sync.
    syncShapeState();
    lastFastSc = null;
    regionDirty = true; // (re)fit g: 𝔻 → Ω (region source)
    domainDirty = true; // (re)fit f: Ω → 𝔻 (domain-map)
    diskDirty = true;
    fitPending = true; // reframe for the new shape (the fit block handles both directions)
    regionCard = null; // drop the stale card so the Method card reads "solving…" until the refit lands
    domainCard = null;
    updateMethod();
    invalidate();
  });
  controls.onEditPolygon((action) => {
    if (action === "reset") {
      customPolygon = defaultCustomPolygon();
      shapeId = CUSTOM_ID;
      controls.setShape(CUSTOM_ID);
    } else if (!ensureCustomEditable() || !customPolygon) {
      return;
    } else if (action === "add") {
      if (customPolygon.length >= 16) return; // keep the precise solve interactive
      let best = 0;
      let bestLen = -1;
      for (let i = 0; i < customPolygon.length; i++) {
        const a = customPolygon[i];
        const b = customPolygon[(i + 1) % customPolygon.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len > bestLen) {
          bestLen = len;
          best = i;
        }
      }
      const a = customPolygon[best];
      const b = customPolygon[(best + 1) % customPolygon.length];
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const cx = customPolygon.reduce((s, v) => s + v[0], 0) / customPolygon.length;
      const cy = customPolygon.reduce((s, v) => s + v[1], 0) / customPolygon.length;
      let nx = -(b[1] - a[1]) / bestLen;
      let ny = (b[0] - a[0]) / bestLen;
      if (nx * (mid[0] - cx) + ny * (mid[1] - cy) < 0) {
        nx = -nx;
        ny = -ny;
      } // offset outward so the new vertex is a genuine corner (interior angle ≠ π)
      const off = 0.18 * bestLen;
      const nv: Pt = [clampCoord(mid[0] + off * nx), clampCoord(mid[1] + off * ny)];
      customPolygon = toCCW([...customPolygon.slice(0, best + 1), nv, ...customPolygon.slice(best + 1)]);
    } else if (action === "remove") {
      if (customPolygon.length <= 3) return;
      customPolygon = toCCW(customPolygon.slice(0, -1));
    }
    lastFastSc = null;
    syncShapeState();
    markPolygonDirty();
    fitPending = true; // a vertex count change can shift the bounds — reframe once
    regionCard = null;
    domainCard = null;
    updateMethod();
    invalidate();
  });
  controls.onSavePng(() => void (modeIsDiskImage(state.render.mode) ? exportDiskPlate() : exportDomainPlate()));
  controls.onResetView(() => {
    if (modeIsDiskImage(state.render.mode)) {
      fitPending = true; // reset = re-fit the disk pane (the fitPending block also restores the image pane)
      schedule();
    } else {
      imageAutoFit = true; // re-frame the image pane too (domain-map's fitPending isn't set here)
      setViewport({ ...DEFAULT_VIEW_STATE.viewport });
    }
  });
  controls.onApplyViewport((re, im, zoom) => setViewport({ centerRe: re, centerIm: im, zoom }));

  // ---- hover + linked cursor (F4/F2) ---------------------------------------
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const z = pixelToWorld(state.viewport, (e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, r.width / r.height);
    cursorZ = z;
    // SC correspondence hover-link: which corner/prevertex (if any) is under the cursor in the SOURCE pane?
    // Ω→𝔻 the source pane shows the corners; disk-image region source shows the prevertices on ∂𝔻.
    hoverCorner = null;
    if (scCorr) {
      const src = modeIsDomain(state.render.mode) ? scCorr.corners : diskSourceIsRegion() ? scCorr.prevertices : null;
      if (src) {
        let best = 0.05 / state.viewport.zoom; // ~grab radius in world units at the source pane's zoom
        for (let k = 0; k < src.length; k++) {
          const dd = Math.hypot(src[k][0] - z[0], src[k][1] - z[1]);
          if (dd < best) {
            best = dd;
            hoverCorner = k;
          }
        }
      }
    }
    // A grab cursor when hovering a draggable corner on the Ω pane (Ω→𝔻; Ω is the left/source pane here).
    canvas.style.cursor = modeIsDomain(state.render.mode) && hoverCorner !== null ? "grab" : "";
    // Numerical-map mode: read z and its image f(z) under the fitted Riemann map (no φ′ — f is numerical).
    if (modeIsDomain(state.render.mode)) {
      if (domainMap) {
        const st = domainMap.evalStatus
          ? domainMap.evalStatus([z[0], z[1]])
          : { w: domainMap.eval([z[0], z[1]]), ok: true };
        const w = st.w;
        // ⚠ when the exact SC inverse didn't converge or the point is outside Ω — don't dress a wrong
        // preimage as an "exact inverse" (WP6 / A5).
        const mark = st.ok ? "≈ " : "⚠ ";
        controls.setHover([
          ["z", fmtC(z[0], z[1])],
          ["f(z)", (st.ok ? "" : "⚠ ") + fmtC(w[0], w[1])],
          ["|f(z)|", mark + fmt(Math.hypot(w[0], w[1]))],
        ]);
      }
      schedule();
      return;
    }
    // Disk-image numeric source: read the disk point w and its image under g (region) or ψ (imported map).
    if (modeIsDiskImage(state.render.mode) && diskSourceIsNumeric()) {
      const imp = diskSourceIsImport();
      if (imp ? importedValid() : !!regionMap) {
        const p = activePhi()([z[0], z[1]]);
        const rr = Math.hypot(z[0], z[1]);
        controls.setHover([
          ["w", fmtC(z[0], z[1])],
          [imp ? "ψ(w)" : "g(w)", fmtC(p[0], p[1])],
          ["|w|", "≈ " + fmt(rr) + (imp ? (rr >= 1 ? "  (ext 𝔻)" : "  (in 𝔻 — n/a)") : rr <= 1 ? "  (in 𝔻)" : "  (outside 𝔻)")],
        ]);
      }
      schedule();
      return;
    }
    if (!current) return;
    const w = current.jsFn([z[0], z[1]], cParam);
    const d = derivativeAt(current, z, cParam);
    const exact = current.jsDeriv ? "= " : "≈ ";
    const rows: [string, string][] = [
      ["z", fmtC(z[0], z[1])],
      ["φ(z)", fmtC(w[0], w[1])],
      ["|φ′|", exact + fmt(Math.hypot(d[0], d[1]))],
      ["arg φ′", exact + fmt(Math.atan2(d[1], d[0])) + " rad"],
    ];
    controls.setHover(rows);
    schedule(); // overlays only (no dirty flags) → redraw the linked markers
  });
  canvas.addEventListener("pointerleave", () => {
    cursorZ = null;
    hoverCorner = null;
    controls.setHover(null);
    schedule();
  });

  // ---- Phase C: drag polygon vertices directly on the Ω pane --------------
  const clampCoord = (x: number): number => Math.max(-MAX_POLYGON_COORD, Math.min(MAX_POLYGON_COORD, x));

  /** Mirror the custom polygon (and the "custom" id) into the serializable state so a permalink is faithful. */
  function syncShapeState(): void {
    state = {
      ...state,
      render: {
        ...state.render,
        region: shapeId,
        domain: shapeId,
        customPolygon: shapeId === CUSTOM_ID && customPolygon ? customPolygon.map((p): [number, number] => [p[0], p[1]]) : undefined,
      },
    };
  }

  /** Every region view is a function of the polygon — flag them all dirty after an edit. */
  function markPolygonDirty(): void {
    regionDirty = true;
    domainDirty = true;
    diskDirty = true;
  }

  /** Show/hide the ＋/－/reset tools + vertex count for the active polygon shape. */
  function refreshPolygonTools(): void {
    const corners = currentVis() === "region" ? currentDomain()?.corners : undefined;
    controls.setPolygonTools(!!corners, corners?.length);
  }

  /** Editing any polygon forks it to the editable "custom" shape (named presets are never mutated). */
  function ensureCustomEditable(): boolean {
    if (shapeId === CUSTOM_ID) return !!customPolygon;
    const d = currentDomain();
    if (!d?.corners) return false;
    customPolygon = d.corners.map((p): Pt => [p[0], p[1]]);
    shapeId = CUSTOM_ID;
    controls.setShape(CUSTOM_ID);
    return true;
  }

  /** Run a vertex drag: FAST (lightning) refits while moving, a PRECISE warm-started refit on release.
   *  `getWorld` maps a pointer event to a world point in the pane being edited; `cursorEl` shows the
   *  grabbing cursor for the duration. */
  function runVertexDrag(k: number, getWorld: (e: PointerEvent) => Pt, cursorEl: HTMLElement): void {
    scDragging = true;
    cursorEl.style.cursor = "grabbing";
    const move = (ev: PointerEvent): void => {
      if (!customPolygon) return;
      const w = getWorld(ev);
      customPolygon[k] = [clampCoord(w[0]), clampCoord(w[1])];
      markPolygonDirty();
      syncShapeState();
      invalidate();
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      scDragging = false; // release → the render loop runs a precise, warm-started solve
      cursorEl.style.cursor = "";
      // Restore the CCW invariant: a drag that crossed an edge can flip the winding, and the corners are
      // hit-tested next time against the toCCW'd order — without this a later grab would move the mirror vertex.
      if (customPolygon) customPolygon = toCCW(customPolygon);
      markPolygonDirty();
      syncShapeState();
      invalidate();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up); // a cancelled pointer must not leave the drag glued on
  }

  // Ω→𝔻 (domain-map): Ω is the LEFT pane (the pan/zoom surface). Registered before attachPanZoom so a grab
  // on a corner preempts the pan.
  canvas.addEventListener("pointerdown", (e) => {
    if (!modeIsDomain(state.render.mode)) return;
    const d = currentDomain();
    if (!d?.corners) return;
    const r = canvas.getBoundingClientRect();
    const toWorld = (ev: { clientX: number; clientY: number }): Pt =>
      pixelToWorld(state.viewport, (ev.clientX - r.left) / r.width, 1 - (ev.clientY - r.top) / r.height, r.width / r.height);
    const w0 = toWorld(e);
    let hit = -1;
    let best = 0.06 / state.viewport.zoom; // world radius, ≥ the hover grab radius (0.05/zoom) so grab ⟹ drag
    for (let k = 0; k < d.corners.length; k++) {
      const dd = Math.hypot(d.corners[k][0] - w0[0], d.corners[k][1] - w0[1]);
      if (dd < best) {
        best = dd;
        hit = k;
      }
    }
    if (hit < 0) return;
    e.stopImmediatePropagation(); // preempt the pan for this drag
    if (!ensureCustomEditable()) return;
    runVertexDrag(hit, toWorld, canvas);
  });

  // 𝔻→Ω (disk-image): Ω is the RIGHT (image) pane. Hit-test + drag in client space (the pane is auto-fit;
  // its fit is frozen during the drag so the shape stays under the cursor).
  imageCanvas.addEventListener("pointerdown", (e) => {
    if (!(modeIsDiskImage(state.render.mode) && diskSourceIsRegion())) return;
    const d = currentDomain();
    if (!d?.corners) return;
    let hit = -1;
    let best = 14;
    for (let k = 0; k < d.corners.length; k++) {
      const [cx, cy] = rightPane.worldToClient(d.corners[k]);
      const dpx = Math.hypot(cx - e.clientX, cy - e.clientY);
      if (dpx < best) {
        best = dpx;
        hit = k;
      }
    }
    if (hit < 0) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // preempt the image pane's pan for this vertex drag
    if (!ensureCustomEditable()) return;
    runVertexDrag(hit, (ev) => rightPane.clientToWorld(ev.clientX, ev.clientY), imageCanvas);
  });

  // Corner-hover feedback in the image (Ω) pane: a grab cursor + the linked-pair highlight.
  imageCanvas.addEventListener("pointermove", (e) => {
    if (scDragging) return;
    if (!(modeIsDiskImage(state.render.mode) && diskSourceIsRegion() && scCorr)) {
      if (imageCanvas.style.cursor) imageCanvas.style.cursor = "";
      return;
    }
    let hit = -1;
    let best = 14;
    for (let k = 0; k < scCorr.corners.length; k++) {
      const [cx, cy] = rightPane.worldToClient(scCorr.corners[k]);
      const dpx = Math.hypot(cx - e.clientX, cy - e.clientY);
      if (dpx < best) {
        best = dpx;
        hit = k;
      }
    }
    imageCanvas.style.cursor = hit >= 0 ? "grab" : "";
    const next = hit >= 0 ? hit : null;
    if (next !== hoverCorner) {
      hoverCorner = next;
      schedule();
    }
  });
  imageCanvas.addEventListener("pointerleave", () => {
    if (scDragging) return;
    imageCanvas.style.cursor = "";
    if (hoverCorner !== null) {
      hoverCorner = null;
      schedule();
    }
  });

  // ---- drag the family parameter c on the disk pane (1.1) -----------------
  // Registered BEFORE attachPanZoom so a grab on the c handle preempts the pan (stopImmediatePropagation).
  canvas.addEventListener("pointerdown", (e) => {
    if (!(modeIsDiskImage(state.render.mode) && usesC && !diskSourceIsNumeric())) return;
    const r = canvas.getBoundingClientRect();
    const toWorld = (ev: { clientX: number; clientY: number }): Pt =>
      pixelToWorld(state.viewport, (ev.clientX - r.left) / r.width, 1 - (ev.clientY - r.top) / r.height, r.width / r.height);
    const pxPerWorld = r.height / (2 * (1 / state.viewport.zoom));
    const w0 = toWorld(e);
    if (Math.hypot(w0[0] - cParam[0], w0[1] - cParam[1]) * pxPerWorld > 18) return; // not on the handle (generous hit radius)
    e.stopImmediatePropagation(); // preempt attachPanZoom's pan for this drag
    const move = (ev: PointerEvent): void => {
      const w = toWorld(ev);
      let cx = w[0];
      let cy = w[1];
      const rc = Math.hypot(cx, cy);
      if (rc >= 0.995) {
        cx *= 0.995 / rc; // keep |c| < 1 so a Blaschke automorphism stays well-defined
        cy *= 0.995 / rc;
      }
      cParam = [cx, cy];
      state = { ...state, map: { ...state.map, c: [cx, cy] } };
      diskDirty = true;
      updateCChip(); // live-update the c chip as you drag
      invalidate();
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  // The region source's disk pane is the fixed unit disk 𝔻 — panning it is meaningless, so lock the drag
  // there (wheel-zoom, about the centre, stays for grid detail). Expression + import sources keep pan.
  attachPanZoom(canvas, () => state.viewport, setViewport, {
    panEnabled: () => !(modeIsDiskImage(state.render.mode) && diskSourceIsRegion()),
  });
  // The right (image) pane is freely pan/zoomable; a grab starts a manual view (auto-fit off until "Fit").
  // Registered AFTER the vertex-drag pointerdown above so grabbing a corner (stopImmediatePropagation)
  // preempts the pan.
  attachPanZoom(imageCanvas, () => imageViewport, (v) => {
    imageViewport = v;
    imageAutoFit = false;
    schedule();
  });
  window.addEventListener("resize", () => invalidate());

  applyMap();
  schedule();
}

main();
