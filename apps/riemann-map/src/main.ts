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
import { DOMAIN_PRESETS, domainById, sampleDomainBoundary, conformalSourceGrid, cornerBoundary, cornerPoles } from "./domains.js";
import { fitConformalMap, fitForwardMap, fitSchwarzChristoffel, type ConformalMap } from "@cas/conformal";
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
  // The region Ω, shared by BOTH directions of a region's map: 𝔻→Ω (disk-image region source; smooth Ω
  // uses the lightning forward map, polygon Ω the Schwarz–Christoffel engine) and Ω→𝔻 (numeric domain-map
  // mode; lightning f: Ω→𝔻). One "Shape" picker drives both — so switching Direction keeps the shape.
  let shapeId = domainById(state.render.region ?? state.render.domain ?? "")?.id ?? DOMAIN_PRESETS[0].id;
  let domainMap: ConformalMap | null = null;
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
    if (modeIsDomain(state.render.mode)) domainDirty = true;
    else {
      diskDirty = true;
      fitPending = true; // reframe the disk pane for the new source
      if (diskSourceIsRegion()) regionDirty = true;
    }
    applyModeContext();
    invalidate();
  }

  // ---- the Method card (the engine that ran + its honest accuracy) ----
  function pendingCard(): MethodCard {
    return domainById(shapeId)?.corners
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

  /** Fit f: Ω → 𝔻 for the selected domain and build its source (Ω) and image (disk) conformal grids. */
  function computeDomain(): void {
    const d = domainById(shapeId);
    if (!d) {
      domainMap = null;
      domainSource = [];
      domainImage = [];
      domainCard = null;
      controls.setAnalysis(null);
      updateMethod();
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
    domainCard = {
      name: f.poles.length ? "Lightning + corner poles" : "Lightning solver",
      tag: "numerical",
      tagKind: "light",
      desc: d.corners
        ? "The Riemann map Ω → 𝔻 by the lightning fit with clustered corner poles. (Schwarz–Christoffel maps 𝔻 → Ω; the reverse here uses this fit.)"
        : "The Riemann map Ω → 𝔻 by the lightning least-squares fit (Gopal–Trefethen).",
      stats: [
        ["degree", "= " + f.degree],
        ...(f.poles.length ? [["poles", "= " + f.poles.length] as [string, string]] : []),
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
    const d = domainById(shapeId);
    if (!d) {
      regionMap = null;
      regionCard = null;
      updateMethod();
      return;
    }
    if (d.corners) {
      // A lower Gauss–Legendre order keeps the per-point pushforward cheap for interactive rendering.
      const sc = fitSchwarzChristoffel({ vertices: d.corners }, { nGaussLegendre: 12 });
      const stats: [string, string][] = [
        ["prevertices", "= " + d.corners.length + (sc.converged ? "  (solved)" : "  (not converged)")],
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
        tag: sc.converged ? "exact map" : "check residual",
        tagKind: "sc",
        desc: "The exact conformal map onto a polygon, built from its corner angles — machine precision, with meaningful prevertices & accessory constants.",
        stats,
        honesty: ["= exact corner angles", "≈ numerical map"],
      };
      updateMethod();
      return;
    }
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
      const d = domainById(shapeId);
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
      leftOverlay.drawScaleBar();
      // Right pane: the image φ(𝔻), auto-framed, same colour key + φ(∂𝔻).
      if (rightPane.resize()) {
        const b =
          (lineMode ? bounds(diskImgLines) : bounds([{ color: "", pts: cellPts(diskImageCells) }])) ??
          ({ minx: -1, maxx: 1, miny: -1, maxy: 1 } as const);
        rightPane.fitBounds(b);
        rightPane.clear();
        if (lineMode) rightPane.drawLines(diskImgLines, 1.1);
        else rightPane.fillCells(diskImageCells, 0.6);
        rightPane.drawLines([{ color: bCol, pts: diskUnitImg }], 1.4);
        if (cursorZ) rightPane.drawMarker(activePhi()(cursorZ), CURSOR_COLOR);
      }
      return;
    }
    if (domain) {
      leftOverlay.drawLines(domainSource, 1.1);
      if (cursorZ) leftOverlay.drawMarker(cursorZ, CURSOR_COLOR);
      leftOverlay.drawScaleBar();
      if (rightPane.resize()) {
        rightPane.fitBounds({ minx: -1, maxx: 1, miny: -1, maxy: 1 });
        rightPane.clear();
        rightPane.drawLines(domainImage, 1.1);
        if (cursorZ && domainMap) rightPane.drawMarker(domainMap.eval([cursorZ[0], cursorZ[1]]), CURSOR_COLOR);
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
      ov.fitBounds({ minx: -1, maxx: 1, miny: -1, maxy: 1 });
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
      ov.fitBounds(b);
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
        if (modeIsDiskImage(state.render.mode)) {
          const w = overlayCanvas.width;
          const h = overlayCanvas.height;
          const aspect = w > 0 && h > 0 ? w / h : 1;
          const halfSpan = (diskMaxR() * 1.12) / Math.min(1, aspect);
          setViewport({ centerRe: 0, centerIm: 0, zoom: 1 / halfSpan }); // schedules one more frame
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
    // One shape drives both directions; set both fields so a permalink + a Direction flip stay in sync.
    state = { ...state, render: { ...state.render, region: id, domain: id } };
    regionDirty = true; // (re)fit g: 𝔻 → Ω (region source)
    domainDirty = true; // (re)fit f: Ω → 𝔻 (domain-map)
    diskDirty = true;
    if (modeIsDiskImage(state.render.mode)) fitPending = true;
    regionCard = null; // drop the stale card so the Method card reads "solving…" until the refit lands
    domainCard = null;
    updateMethod();
    invalidate();
  });
  controls.onSavePng(() => void (modeIsDiskImage(state.render.mode) ? exportDiskPlate() : exportDomainPlate()));
  controls.onResetView(() => {
    if (modeIsDiskImage(state.render.mode)) {
      fitPending = true; // reset = re-fit the disk pane
      schedule();
    } else setViewport({ ...DEFAULT_VIEW_STATE.viewport });
  });
  controls.onApplyViewport((re, im, zoom) => setViewport({ centerRe: re, centerIm: im, zoom }));

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
    controls.setHover(null);
    schedule();
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
  window.addEventListener("resize", () => invalidate());

  applyMap();
  schedule();
}

main();
