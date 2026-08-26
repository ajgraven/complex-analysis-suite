// Complex Function Plotting Tool — the app entry: it wires the DOM to the render engine and the CPU
// instruments (2D research tool through the Phase-5 3D analytic landscape):
//
// Type f(z) (or pick a preset); it is parsed and compiled by @cas/expr (to GLSL for the render and to
// a JS evaluator for the probe/instruments), typeset live with KaTeX, and drawn by the layered coloring
// engine (colorShader.ts): phase colormap × modulus transfer × an fwidth-AA enhancement (rings /
// sectors / conformal grid / …), plus level sets, a CVD preview, and an honest-labeling uncertainty
// hatch. Input niceties: name autocomplete (ui/autocomplete.ts), two function slots f / g with a toggle
// (A7), and copy-as-LaTeX (A9). Any free variable that isn't z/c is a live NAMED PARAMETER (ADR-0011):
// freeParameters drives one ℂ-pad + real-slider control each (ui/params.ts), bound to a uParam_<name>
// uniform so dragging is a re-uniform (the instruments rebuild with the same values, keeping CPU ≡ GPU).
// The reserved name `t` is animated by a transport (play / scrub / loop / speed, ui/animate.ts) instead
// of a pad. Around it: pan / zoom / reset, axes + grid + scale bar, phase-wheel and modulus legends, a
// cursor readout, the zero/pole finder (analysis/singularities.ts), a parameter-sweep montage
// (ui/sweep.ts: a grid of thumbnails across one parameter's range, click a cell to jump), share-links
// (#vs= via @cas/interchange), and PNG export. The Phase-4 special functions Γ / ζ are in the language;
// when the active map calls one, an honest float32 precision badge (ui/precision.ts) labels the picture
// `≈`. A View toggle (2D / 3D / Sphere / Linked / Riemann) swaps the flat portrait for the Phase-5
// analytic **landscape** (a height surface, orbit/dolly, coloured by the same colorAt so top-down = the
// 2D portrait), the **Riemann sphere** (a ray-cast of ℂ∪{∞}, arcball-rotated, so ∞ is the north pole), or
// the true multi-sheeted **Riemann surface** (ADR-0028, `riemann/` + `render3d/riemannSurface.ts`): for a
// recognized invertible primitive (√, ⁿ√, z^(p/q), log, arcsin/arccos/arctan + affine wraps) it renders
// the parametrize-by-w surface, its sheets glued across the branch cut. The ∞-inspector (plot f(1/z)) and
// export (Phase 6) round it out.
import "katex/dist/katex.min.css";
import katex from "katex";
import { runWithFatalBoundary, drawDirectionTicks } from "@cas/ui";
import { parse } from "@cas/expr/parser";
import { toLatex } from "@cas/expr/latex";
import {
  ExprError,
  COMPLEX_FUNCTIONS,
  BINARY_FUNCTIONS,
  calledFunctions,
  substitute,
  referencesVar,
  type Node,
} from "@cas/expr/ast";
import { makeComplexFn } from "@cas/expr/evaluate";
import { differentiate } from "@cas/expr/derivative";
import type { Complex } from "@cas/expr/complex";
import { windingNumber } from "./riemann/winding.js";
import {
  generatorLoopAround,
  generatorRadius,
  lassoLoop,
  enclosingLoop,
  commonBasePoint,
} from "./riemann/generatorLoop.js";
import {
  cycles,
  cycleCount,
  generatedGroup,
  riemannHurwitzGenus,
  namedGroup,
  type Perm,
} from "./riemann/permGroup.js";
import { drawPermDiagram, permDiagramWidth, DIAGRAM_HEIGHT } from "./riemann/permDiagram.js";
import { Plot } from "./render/plot.js";
import { COLORMAPS } from "./render/colormaps.js";
import { PRESETS } from "./presets.js";
import { drawModulusBar, drawPhaseWheel } from "./ui/legends.js";
import { drawAxes } from "./ui/axes.js";
import { drawMarkers } from "./ui/markers.js";
import { createParamControls } from "./ui/params.js";
import { createAnimator, DEFAULT_ANIM } from "./ui/animate.js";
import { sweepValues, renderMontage } from "./ui/sweep.js";
import { createAutocomplete, type Candidate } from "./ui/autocomplete.js";
import { precisionNote } from "./ui/precision.js";
import {
  keyToNav,
  pointerDistance,
  pointerMidpoint,
  pinchFactor,
  leftHalf,
  rightHalf,
  isLeftHalf,
  type NavIntent,
  type Pt,
} from "./ui/navigation.js";
import { heightAt } from "./render3d/height.js";
import { gridResolutionForField, GRID_SCAN_N, GRID_N_BASE } from "./render3d/mesh.js";
import {
  findSingularities,
  type Singularities,
  type Singularity,
} from "./analysis/singularities.js";
import {
  decodeState,
  encodeState,
  shareUrl,
  DEFAULT_V3D,
  type PlotterState,
} from "./state/viewState.js";
import { importEnvelopeText } from "./interchange/importMap.js";
import {
  encodeViewLink,
  cdHandoffUrl,
  type InterchangeVar,
} from "./interchange/exportView.js";

// The fresh-boot state (no share-link). The app now opens 3D-first on a Γ(z) landscape: a phase-only
// HSV portrait draped over a linear-|f| surface, the map whose poles best show off the 3D view. NOTE:
// these are the NO-LINK defaults only — `DEFAULT_V3D` / `cleanV3d` stay 2D-neutral so an existing
// share-link (which always carries its own colormap/modulus/view) still reopens exactly as it was.
const DEFAULTS: PlotterState = {
  expr: "gamma(z)",
  exprF: "gamma(z)",
  exprG: "1/z",
  active: "f",
  cx: 0,
  cy: 0,
  span: 4, // frames Γ's poles at 0, −1, −2, −3
  colormap: 1, // HSV (classic)
  modulus: 0, // phase only
  enhance: 0,
  sectors: 12,
  crisp: 1,
  hueShift: 0,
  hueSign: 1,
  params: {},
  anim: { ...DEFAULT_ANIM },
  implicit: "", // ordinary f(z) mode (M2c implicit mode off)
  v3d: { ...DEFAULT_V3D, mode: "3d", heightMode: 1 }, // 3D landscape, linear-|f| height
};

function addOption(sel: HTMLSelectElement, value: string, label: string): void {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  sel.appendChild(opt);
}

function clampIndex(v: number, n: number): number {
  const i = Math.floor(v);
  return i >= 0 && i < n ? i : 0;
}

function main(): void {
  const byId = (id: string): HTMLElement | null => document.getElementById(id);

  // Color theme (matches the CD app): `auto` follows the OS; the toggle cycles auto → light → dark and
  // persists the choice by stamping `data-theme` on <html> (absent = auto). The CSS defines the palette
  // for all three states, so this just flips the attribute.
  const THEME_KEY = "cfp-theme";
  const THEME_GLYPH: Record<string, string> = { auto: "◐", light: "☀", dark: "☾" };
  const applyTheme = (mode: string): void => {
    if (mode === "light" || mode === "dark")
      document.documentElement.setAttribute("data-theme", mode);
    else document.documentElement.removeAttribute("data-theme");
    const btn = byId("themeToggle");
    if (btn) {
      btn.textContent = THEME_GLYPH[mode] ?? "◐";
      btn.setAttribute("title", `Color theme: ${mode} (click to change)`);
    }
  };
  let themeMode = "auto";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "auto") themeMode = saved;
  } catch {
    /* localStorage can throw in private mode — fall back to auto */
  }
  applyTheme(themeMode);
  byId("themeToggle")?.addEventListener("click", () => {
    themeMode = themeMode === "auto" ? "light" : themeMode === "light" ? "dark" : "auto";
    applyTheme(themeMode);
    try {
      localStorage.setItem(THEME_KEY, themeMode);
    } catch {
      /* ignore persistence failure */
    }
  });

  const canvas = byId("view");
  const axesCanvas = byId("axes");
  const exprInput = byId("expr");
  const exprLabel = byId("exprLabel");
  const fnF = byId("fnF");
  const fnG = byId("fnG");
  const acMenu = byId("acMenu");
  const previewEl = byId("preview");
  const errorEl = byId("error");
  const precisionBadge = byId("precisionBadge");
  const colormapSel = byId("colormap");
  const modulusSel = byId("modulus");
  const presetSel = byId("preset");
  const paramsGroup = byId("paramsGroup");
  const paramsContainer = byId("params");
  const animGroup = byId("animGroup");
  const animRoot = byId("anim");
  const sweepGroup = byId("sweepGroup");
  const sweepParam = byId("sweepParam");
  const sweepFrom = byId("sweepFrom");
  const sweepTo = byId("sweepTo");
  const sweepSteps = byId("sweepSteps");
  const sweepStepsVal = byId("sweepStepsVal");
  const sweepShow = byId("sweepShow");
  const sweepOverlay = byId("sweepOverlay");
  const sweepGrid = byId("sweepGrid");
  const sweepTitle = byId("sweepTitle");
  const sweepClose = byId("sweepClose");
  const view2d = byId("view2d");
  const view3d = byId("view3d");
  const viewSphere = byId("viewSphere");
  const viewLinked = byId("viewLinked");
  const viewRiemann = byId("viewRiemann");
  const sphereHint = byId("sphereHint");
  const surfaceControls = byId("surfaceControls");
  const riemannControls = byId("riemannControls");
  const riemannInfo = byId("riemannInfo");
  const riemannHeightSel = byId("riemannHeight");
  const riemannSheetsInput = byId("riemannSheets");
  const riemannSheetsVal = byId("riemannSheetsVal");
  const riemannSheetsRow = byId("riemannSheetsRow");
  const riemannExag = byId("riemannExag");
  const riemannExagVal = byId("riemannExagVal");
  const riemannLinkedInput = byId("riemannLinked");
  const riemannMonodromyInput = byId("riemannMonodromy");
  const monodromyResult = byId("monodromyResult");
  const generatorLoopsEl = byId("generatorLoops");
  const generatorChipsEl = byId("generatorChips");
  const computeGroupBtn = byId("computeGroupBtn");
  const monodromyGroupEl = byId("monodromyGroup");
  const monodromyReportEl = byId("monodromyReport");
  const reportBodyEl = byId("reportBody");
  const reportCloseBtn = byId("reportClose");
  const riemannReset = byId("riemannReset");
  const heightModeSel = byId("heightMode");
  const heightScaleInput = byId("heightScale");
  const heightScaleVal = byId("heightScaleVal");
  const topDownBtn = byId("topDown");
  const resetViewBtn = byId("resetView");
  const specularInput = byId("specular");
  const opacityInput = byId("opacity");
  const opacityVal = byId("opacityVal");
  const enhanceSel = byId("enhance");
  const sectorsInput = byId("sectors");
  const sectorsVal = byId("sectorsVal");
  const crispInput = byId("crisp");
  const hueShiftInput = byId("hueShift");
  const hueSignInput = byId("hueSign");
  const cvdSel = byId("cvd");
  const markSingsInput = byId("markSings");
  const singCount = byId("singCount");
  const markCriticalInput = byId("markCritical");
  const critCount = byId("critCount");
  const inspectInfInput = byId("inspectInf");
  const plotDerivInput = byId("plotDeriv");
  // Input-kind segmented toggle (Option A): "w = f(z)" vs "F(w, z) = 0", replacing the old implicit-mode
  // checkbox. The f/g slot header + the Transform sub-group step aside (hide) for the implicit kind rather
  // than greying out; `implicitHint` explains the Riemann-only rule.
  const inputFnBtn = byId("inputFn");
  const inputImplicitBtn = byId("inputImplicit");
  const fnSlotHead = byId("fnSlotHead");
  const transformGroup = byId("transformGroup");
  const implicitHint = byId("implicitHint");
  const uncInput = byId("uncertainty");
  const levelAbsInput = byId("levelAbs");
  const levelArgInput = byId("levelArg");
  const levelArgOnInput = byId("levelArgOn");
  const homeBtn = byId("home");
  const savePngBtn = byId("savePng");
  const copyImgBtn = byId("copyImg");
  const exportSizeSel = byId("exportSize");
  const copyLinkBtn = byId("copyLink");
  const copyTexBtn = byId("copyTex");
  const importMapBtn = byId("importMap");
  const copyInteropBtn = byId("copyInterop");
  const toDynamicsBtn = byId("toDynamics");
  const interopNote = byId("interopNote");
  const wheelCanvas = byId("wheel");
  const modbarCanvas = byId("modbar");
  const pz = byId("pz");
  const pfz = byId("pfz");
  const pabs = byId("pabs");
  const parg = byId("parg");
  const pbranch = byId("pbranch");
  const pbranchDt = byId("pbranchDt");
  const riemannProbeHint = byId("riemannProbeHint");
  if (
    !(canvas instanceof HTMLCanvasElement) ||
    !(axesCanvas instanceof HTMLCanvasElement)
  )
    return;

  const setError = (msg: string): void => {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.visibility = msg ? "visible" : "hidden";
    }
  };

  const initial = decodeState(location.hash) ?? DEFAULTS;

  let plot: Plot;
  try {
    plot = new Plot(canvas, "gamma(z)"); // seed; the real map is applied from `initial` via setActive, below
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    return;
  }
  plot.view = { cx: initial.cx, cy: initial.cy, span: initial.span };
  plot.color.colormap = clampIndex(initial.colormap, COLORMAPS.length);
  plot.color.modulus = clampIndex(initial.modulus, 5);
  plot.color.enhance = clampIndex(initial.enhance, 6);
  plot.color.sectors = initial.sectors >= 2 ? initial.sectors : 12;
  plot.color.crisp = initial.crisp ? 1 : 0;
  plot.color.hueShift = initial.hueShift;
  plot.color.hueSign = initial.hueSign < 0 ? -1 : 1;
  // Restore the 3D camera + surface-height settings from the share-link (the mode itself is applied via
  // setView once the view controls are wired, below). Set here — before the height controls initialise
  // their values from `plot.*` — so the UI reflects the restored state without extra syncing.
  plot.camera.azimuth = initial.v3d.azimuth;
  plot.camera.elevation = initial.v3d.elevation;
  plot.camera.distance = initial.v3d.distance;
  plot.camera.ortho = initial.v3d.ortho;
  plot.heightMode = initial.v3d.heightMode;
  plot.heightScale = initial.v3d.heightScale;
  plot.specular = initial.v3d.specular;
  plot.opacity = initial.v3d.opacity;
  let framingSpan = initial.span;

  // Linked-view geometry (I7). In the linked mode the flat portrait fills the LEFT half of the canvas and
  // the surface the right half, so a client pixel is measured against the flat pane's rect (`twoDRect`) and
  // the effective interaction (`effMode`) depends on which half the cursor is in.
  const canvasRect = (): DOMRect => canvas.getBoundingClientRect();
  // The flat-portrait pane rect — the whole canvas in 2D, the LEFT half in the linked view and in the
  // Riemann view's base-plane pane (M3.2).
  const splitLeft = (): boolean =>
    plot.mode === "linked" || (plot.mode === "riemann" && plot.riemannLinked);
  const twoDRect = (): DOMRect | ReturnType<typeof leftHalf> =>
    splitLeft() ? leftHalf(canvasRect()) : canvasRect();
  // The surface pane's rect — the whole canvas in 3D, the right half in the linked view — for the 3D pick.
  const threeDRect = (): DOMRect | ReturnType<typeof rightHalf> =>
    plot.mode === "linked" ? rightHalf(canvasRect()) : canvasRect();
  // The Riemann surface pane rect — the whole canvas in the plain Riemann view, the RIGHT half when the
  // base-plane pane is on — for the hover-pick.
  const riemannPaneRect = (): DOMRect | ReturnType<typeof rightHalf> =>
    plot.riemannLinked ? rightHalf(canvasRect()) : canvasRect();
  const effMode = (clientX: number): "2d" | "3d" | "sphere" | "riemann" => {
    const m = plot.mode;
    if (m === "linked") return isLeftHalf(clientX, canvasRect()) ? "2d" : "3d";
    if (m === "riemann" && plot.riemannLinked)
      return isLeftHalf(clientX, canvasRect()) ? "2d" : "riemann";
    return m; // "2d" | "3d" | "sphere" | "riemann"
  };
  // Drag / wheel / pinch act on the surface everywhere in the Riemann view (both panes orbit/dolly it);
  // only hover is pane-specific. Elsewhere this is just `effMode`.
  const navMode = (clientX: number): "2d" | "3d" | "sphere" | "riemann" =>
    plot.mode === "riemann" ? "riemann" : effMode(clientX);

  // Two function slots (catalog A7). One expression box edits the ACTIVE slot; a toggle switches which
  // slot is active (and therefore plotted). Both persist in the share-link.
  const exprs: Record<"f" | "g", string> = { f: initial.exprF, g: initial.exprG };
  let active: "f" | "g" = initial.active;

  let probeFn: ((z: Complex, c: Complex) => Complex) | null = null;
  let fpFn: ((z: Complex, c: Complex) => Complex) | null = null;
  // True when the map calls a float32-limited special function (ζ / Γ / W): those are series /
  // iterations, so the cursor readout is an estimate too (the CPU path is float64, but still not a
  // closed form) — labelled `≈` to match the picture's precision badge. Cached on each formula change.
  let probeEstimate = false;
  let sings: Singularities | null = null;
  let markSings = false;
  let crits: Singularity[] = []; // located critical points (f′ = 0), catalog H6
  let markCritical = false;
  let inspectInfinity = false; // ∞-inspector (F8): plot f(1/z). Transient (not persisted).
  let plotDerivative = false; // derivative overlay (H9): plot f′(z). Transient (not persisted).
  // Implicit-surface mode (M2c, ADR-0031): the dedicated `F(w,z)=0` mode. `implicitSrc` is its own source,
  // kept separate from the f/g slots; `implicitMode` gates the box + views. Persisted via `state.implicit`.
  let implicitMode = initial.implicit.trim().length > 0;
  let implicitSrc = implicitMode ? initial.implicit : "w^3 - w - z";
  // Keep the parsed f (and its z-derivative, when holomorphic) so the CPU instruments can be rebuilt
  // with the current parameter values baked in — without re-parsing — whenever a parameter moves.
  let fAst: Node | null = null;
  let fpAst: Node | null = null;
  let fppAst: Node | null = null; // f″, so the critical-point finder (H6) can Newton-refine zeros of f′
  let fppFn: ((z: Complex, c: Complex) => Complex) | null = null;
  const rebuildInstrumentFns = (): void => {
    if (!fAst) {
      probeFn = null;
      fpFn = null;
      fppFn = null;
      return;
    }
    const params = plot.paramsRecord(); // GLSL and JS read the same parameter values (dual-backend)
    probeFn = makeComplexFn(fAst, params);
    fpFn = fpAst ? makeComplexFn(fpAst, params) : null;
    fppFn = fppAst ? makeComplexFn(fppAst, params) : null;
  };
  const updateFns = (src: string): void => {
    try {
      let ast = parse(src);
      if (inspectInfinity) ast = substitute(ast, "z", parse("1/z")); // instruments track f(1/z) too
      if (plotDerivative) ast = differentiate(ast, "z"); // …and f′ when the derivative overlay is on
      fAst = ast; // `fAst` is always the *plotted* map, so every instrument describes what's on screen
      try {
        fpAst = differentiate(fAst, "z");
        fppAst = differentiate(fpAst, "z");
      } catch {
        fpAst = null; // non-holomorphic — the singularity / critical-point finders need f′ (and f″)
        fppAst = null;
      }
    } catch {
      fAst = null;
      fpAst = null;
      fppAst = null;
    }
    rebuildInstrumentFns();
  };

  const currentState = (): PlotterState => ({
    expr: exprs[active],
    exprF: exprs.f,
    exprG: exprs.g,
    active,
    cx: plot.view.cx,
    cy: plot.view.cy,
    span: plot.view.span,
    colormap: plot.color.colormap,
    modulus: plot.color.modulus,
    enhance: plot.color.enhance,
    sectors: plot.color.sectors,
    crisp: plot.color.crisp,
    hueShift: plot.color.hueShift,
    hueSign: plot.color.hueSign,
    params: plot.paramsRecord(),
    anim: { ...animConfig },
    implicit: implicitMode ? implicitSrc : "",
    v3d: {
      mode: plot.mode,
      azimuth: plot.camera.azimuth,
      elevation: plot.camera.elevation,
      distance: plot.camera.distance,
      ortho: plot.camera.ortho,
      heightMode: plot.heightMode,
      heightScale: plot.heightScale,
      specular: plot.specular,
      opacity: plot.opacity,
      riemannHeight: plot.riemannHeightSource,
      riemannSheets: plot.riemannSheets,
      riemannLinked: plot.riemannLinked,
    },
  });

  let hashTimer = 0;
  const scheduleHash = (): void => {
    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      history.replaceState(null, "", encodeState(currentState()));
    }, 350);
  };

  // Coarse-scan the plotted surface's height field over the current view and return the mesh resolution it
  // warrants (`gridResolutionForField`): the steepest step between adjacent samples flags a pole spike /
  // clamp cliff, which then drives a finer, zoom-aware mesh so sharp features stay smooth even zoomed out.
  const surfaceResolutionTarget = (): number => {
    const pf = probeFn;
    if (!pf) return GRID_N_BASE;
    const aspect = canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
    const { cx, cy, span } = plot.view;
    const N = GRID_SCAN_N;
    const mode = plot.heightMode;
    const scale = plot.color.modScale;
    const ex = plot.heightScale;
    const h = new Float64Array(N * N);
    for (let j = 0; j < N; j++) {
      const im = cy - span + (2 * span * j) / (N - 1);
      for (let i = 0; i < N; i++) {
        const re = cx - span * aspect + (2 * span * aspect * i) / (N - 1);
        let w: Complex;
        try {
          w = pf([re, im], [0, 0]);
        } catch {
          w = [0, 0];
        }
        h[j * N + i] = heightAt(mode, Math.hypot(w[0], w[1]), scale) * ex;
      }
    }
    let maxJump = 0;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const c = h[j * N + i];
        if (i + 1 < N) maxJump = Math.max(maxJump, Math.abs(h[j * N + i + 1] - c));
        if (j + 1 < N) maxJump = Math.max(maxJump, Math.abs(h[(j + 1) * N + i] - c));
      }
    return gridResolutionForField(maxJump, span * Math.max(1, aspect));
  };

  // The base point last read on the Riemann surface (or hovered on the base plane), drawn as a crosshair on
  // the linked base-plane pane (M3.2) so you can see which base point the touched sheet sits over.
  let linkedZ: Complex | null = null;
  // Monodromy explorer (M3.3): draw a closed loop on the base plane; `loopPoints` accumulates it during the
  // drag, `lastLoop` holds the finished loop for the overlay. The result is transient (never persisted).
  let monodromyOn = false;
  let loopPoints: Complex[] | null = null;
  let lastLoop: Complex[] | null = null;
  // Estimated branch (ramification) points over the surface's base plane (M3.4), drawn on the base-plane
  // pane and counted in the badge. Recomputed on a formula / sheet-count / view change while in Riemann mode.
  let branchPts: Complex[] = [];
  let branchExact = false; // true when the markers are the EXACT discriminant locus (M2c.2), else the ≈ scan
  // Per-branch-point winding numbers of the current monodromy loop (B2): the signed, EXACT (`=`) integer count
  // of times the loop encircles each branch point — the topological input the ≈ permutation depends on. Only
  // the enclosed ones (winding ≠ 0) are kept. Empty when no loop is drawn.
  let loopWindings: { pt: Complex; wind: number }[] = [];
  const recomputeBranchPoints = (): void => {
    if (plot.mode !== "riemann") {
      branchPts = [];
      branchExact = false;
      return;
    }
    const exact = plot.riemannBranchPointsExact(); // M2c.2: exact locus for a Gaussian-rational implicit F
    if (exact) {
      branchPts = exact;
      branchExact = true;
    } else if (plot.riemannModeKind() === "param") {
      // Parametric primitives: the cut-ray origins ARE the exact finite branch points — use them instead of
      // the mesh-limited scan (which sprays spurious points across a folded z^(p/q) surface).
      branchPts = plot.riemannParamBranchPoints();
      branchExact = true;
    } else {
      branchPts = plot.riemannBranchPoints();
      branchExact = false;
    }
  };
  const drawRiemannLink = (): void => {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(cssW * d));
    const H = Math.max(1, Math.round(cssH * d));
    if (axesCanvas.width !== W || axesCanvas.height !== H) {
      axesCanvas.width = W;
      axesCanvas.height = H;
    }
    const ctx = axesCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(d, 0, 0, d, 0, 0); // draw in CSS pixels
    const halfW = cssW / 2;
    const v = plot.view;
    const aspect = cssH > 0 ? halfW / cssH : 1;
    const xmin = v.cx - v.span * aspect;
    const xmax = v.cx + v.span * aspect;
    const ymin = v.cy - v.span;
    const ymax = v.cy + v.span;
    const sx = (wx: number): number => ((wx - xmin) / (xmax - xmin)) * halfW;
    const sy = (wy: number): number => ((ymax - wy) / (ymax - ymin)) * cssH;
    ctx.strokeStyle = "rgba(150,165,190,0.28)"; // the pane divider
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, cssH);
    ctx.stroke();
    ctx.fillStyle = "rgba(165,180,205,0.85)";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("base plane (z)", 6, 6);
    // Branch cut(s) on the base plane (B1): the principal cut the sheets glue across, a dashed ray from each
    // branch point to infinity. Clipped to the base-plane (left) pane so the ray doesn't bleed onto the
    // surface pane. Parametric primitives only (curve / implicit surfaces glue with no canonical cut).
    const cuts = plot.riemannCutRays();
    if (cuts.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, halfW, cssH);
      ctx.clip();
      ctx.strokeStyle = "rgba(232,236,246,0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      const reach = (Math.abs(xmax - xmin) + Math.abs(ymax - ymin)) * 2; // long enough to exit the pane
      for (const c of cuts) {
        ctx.beginPath();
        ctx.moveTo(sx(c.origin[0]), sy(c.origin[1]));
        ctx.lineTo(sx(c.origin[0] + c.dir[0] * reach), sy(c.origin[1] + c.dir[1] * reach));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
    // Monodromy loop (M3.3): the in-progress drag, else the finished loop — a filled, outlined polyline.
    const loop = loopPoints ?? lastLoop;
    if (loop && loop.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(sx(loop[0][0]), sy(loop[0][1]));
      for (let i = 1; i < loop.length; i++) ctx.lineTo(sx(loop[i][0]), sy(loop[i][1]));
      if (!loopPoints) ctx.closePath(); // a finished loop is closed; an in-progress one stays open
      ctx.fillStyle = "rgba(120,180,255,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(150,200,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Direction arrows (D1): the loop's traversal orientation — a non-colour cue for which way it's traced.
      // Arc-length spaced (the freehand loop is non-uniform); closed once the drag finishes.
      if (loop.length >= 3)
        drawDirectionTicks(ctx, (w) => [sx(w[0]), sy(w[1])], loop, {
          closed: !loopPoints,
          count: 6,
          fill: "rgba(150,200,255,0.95)",
          halo: "rgba(10,12,16,0.85)",
          sizePx: 5,
          byArcLength: true,
        });
    }
    // Branch-point markers (M3.4): amber ⊕ where sheets merge — the ramification the monodromy loops encircle.
    if (branchPts.length) {
      ctx.strokeStyle = "rgba(245,180,90,0.95)";
      ctx.lineWidth = 1.25;
      for (const b of branchPts) {
        const px = sx(b[0]);
        const py = sy(b[1]);
        if (px < 0 || px > halfW || py < 0 || py > cssH) continue;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, 2 * Math.PI);
        ctx.moveTo(px - 6.5, py);
        ctx.lineTo(px + 6.5, py);
        ctx.moveTo(px, py - 6.5);
        ctx.lineTo(px, py + 6.5);
        ctx.stroke();
        // Winding-number label (B2): the EXACT signed turns of the current loop about this branch point.
        const wound = loopWindings.find((w) => w.pt === b);
        if (wound) {
          const lbl = `${wound.wind > 0 ? "+" : ""}${wound.wind}`;
          ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(10,12,16,0.9)"; // halo so the digit reads over the coloured field
          ctx.strokeText(lbl, px + 8, py - 6);
          ctx.fillStyle = "rgba(255,214,140,0.98)";
          ctx.fillText(lbl, px + 8, py - 6);
          ctx.strokeStyle = "rgba(245,180,90,0.95)"; // restore for the next marker's ⊕
          ctx.lineWidth = 1.25;
        }
      }
    }
    if (linkedZ) {
      const px = sx(linkedZ[0]);
      const py = sy(linkedZ[1]);
      if (px >= 0 && px <= halfW && py >= 0 && py <= cssH) {
        ctx.strokeStyle = "rgba(245,248,255,0.92)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(px - 7, py);
        ctx.lineTo(px + 7, py);
        ctx.moveTo(px, py - 7);
        ctx.lineTo(px, py + 7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
    // Direction arrows on the lifted paths over the SURFACE pane (D2): project each sheet's 3D polyline to
    // screen through the same camera, then arrow it in that sheet's colour. Open arcs (each ends on the
    // sheet it permutes to), so `closed: false`.
    const sheetPaths = plot.riemannLoopScreenPaths();
    if (sheetPaths) {
      const identity = (p: readonly [number, number]): [number, number] => [p[0], p[1]];
      for (const sp of sheetPaths) {
        if (sp.screen.length < 2) continue;
        const [r, g, b] = sp.color;
        const fill = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        drawDirectionTicks(ctx, identity, sp.screen, {
          closed: false,
          count: 4,
          fill,
          halo: "rgba(8,10,14,0.9)",
          sizePx: 5,
          byArcLength: true,
        });
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const redraw = (draft = false): void => {
    // On a committed frame in a surface mode, adapt the mesh density to the field + zoom (§B / poles) — a
    // cheap no-op when unchanged; skipped on draft frames so a zoom/drag burst never rebuilds mid-gesture.
    if (!draft && (plot.mode === "3d" || plot.mode === "linked"))
      plot.reconcileMeshResolution(surfaceResolutionTarget());
    plot.draw(draft);
    if (plot.mode === "riemann" && plot.riemannLinked) {
      // The linked Riemann view: the base-plane pane gets a light overlay (divider + label + the
      // hover-link crosshair) on its left half; the surface half stands alone (M3.2).
      drawRiemannLink();
    } else if (plot.mode !== "2d") {
      // The axes / grid / markers are full-canvas 2D-projection overlays; in the 3D landscape, on the
      // sphere, AND in the linked view they'd be wrong (in linked mode drawAxes spans the whole canvas
      // and would bleed across the surface half), so clear the overlay and let the surface stand alone.
      const ax = axesCanvas.getContext("2d");
      if (ax) ax.clearRect(0, 0, axesCanvas.width, axesCanvas.height);
    } else {
      drawAxes(axesCanvas, plot.view, canvas.clientWidth, canvas.clientHeight);
      if ((markSings && sings) || (markCritical && crits.length))
        drawMarkers(
          axesCanvas,
          plot.view,
          canvas.clientWidth,
          canvas.clientHeight,
          markSings ? sings : null,
          markCritical ? crits : [],
        );
    }
    // Only committed frames update the share-link — a draft (drag / animation frame) settles with a
    // full redraw, so this keeps the hash off the per-frame path (no history churn while `t` plays).
    if (!draft) scheduleHash();
  };

  const showCounts = (): void => {
    if (singCount instanceof HTMLElement) {
      if (!markSings) {
        singCount.textContent = "";
      } else if (!sings) {
        singCount.textContent = "—";
      } else if (!sings.differentiable) {
        singCount.textContent = "needs a holomorphic f";
      } else {
        const z = sings.zeros.reduce((n, s) => n + s.order, 0);
        const p = sings.poles.reduce((n, s) => n + s.order, 0);
        singCount.textContent = `zeros ${sings.zeros.length} (Σ ${z}) · poles ${sings.poles.length} (Σ ${p}) ≈`;
      }
    }
    // Critical-point count (H6): distinct located points; a degenerate one is flagged by its order label.
    if (critCount instanceof HTMLElement) {
      if (!markCritical) critCount.textContent = "";
      else if (!fpFn) critCount.textContent = "needs a holomorphic f";
      else critCount.textContent = `critical points ${crits.length} ≈`;
    }
  };
  const recomputeSings = (): void => {
    const aspect =
      canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
    sings = markSings && probeFn ? findSingularities(probeFn, fpFn, plot.view, aspect) : null;
    // Critical points = zeros of f′ (H6): reuse the zero-finder on f′ itself — it needs f″ to
    // Newton-refine and order each root — and keep only its zeros.
    crits =
      markCritical && fpFn ? findSingularities(fpFn, fppFn, plot.view, aspect).zeros : [];
    showCounts();
  };
  let singTimer = 0;
  const recomputeSingsSoon = (): void => {
    if (!markSings && !markCritical) return;
    window.clearTimeout(singTimer);
    singTimer = window.setTimeout(() => {
      recomputeSings();
      redraw(false);
    }, 140);
  };

  const renderPreview = (src: string): void => {
    if (!(previewEl instanceof HTMLElement)) return;
    try {
      const body = implicitMode ? `${toLatex(parse(src))} = 0` : `w = ${toLatex(parse(src))}`;
      katex.render(body, previewEl, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      previewEl.textContent = "";
    }
  };

  // Honest-labeling for the float32 special functions (Phase 4): when the active map calls a
  // precision-limited builtin (ζ strongly, Γ mildly), show a badge so a domain-coloured ζ/Γ reads as
  // an estimate (≈), not certified structure. Derived from the parsed map, so it needs no state.
  const updatePrecisionBadge = (): void => {
    const note = fAst ? precisionNote(calledFunctions(fAst)) : null;
    probeEstimate = note !== null; // drives the cursor readout's `≈` prefix too
    if (!(precisionBadge instanceof HTMLElement)) return;
    precisionBadge.hidden = !note;
    precisionBadge.textContent = note ? note.text : "";
    precisionBadge.classList.toggle("warn", note?.severity === "warn");
    precisionBadge.classList.toggle("note", note?.severity === "note");
  };

  // Live parameter controls (catalog G1): one ℂ-pad + real slider per named parameter the map reads.
  // Moving a value is a re-uniform (draft render while dragging) and, on release, a full render plus a
  // singularity recompute — the same interaction shape as pan/zoom.
  const paramControls = createParamControls(
    paramsContainer instanceof HTMLElement
      ? paramsContainer
      : document.createElement("div"),
    {
      get: (name) => plot.paramValue(name),
      onInput: (name, value) => {
        plot.setParamValue(name, value);
        redraw(true);
      },
      onCommit: (name, value) => {
        plot.setParamValue(name, value);
        rebuildInstrumentFns();
        recomputeSings();
        redraw(false);
      },
    },
  );
  // The animation variable `t` (catalog G2): an ordinary named parameter, but driven by a transport
  // (play / scrub / loop / speed) instead of a ℂ-pad. `animConfig` is owned here (mutated by the
  // transport's fields) so it round-trips in the share-link.
  const animConfig = { ...initial.anim };
  const animator = createAnimator(
    animRoot instanceof HTMLElement ? animRoot : document.createElement("div"),
    animConfig,
    {
      getT: () => plot.paramValue("t")[0],
      setT: (t, committed) => {
        plot.setParamValue("t", [t, 0]);
        if (committed) {
          rebuildInstrumentFns();
          recomputeSings();
          redraw(false);
        } else {
          redraw(true); // a play frame / live scrub — GPU-only, no per-frame instrument recompute
        }
      },
    },
  );

  // Populate the sweep parameter selector from the current parameters (any of them, `t` included),
  // preserving the selection when it survives a formula edit.
  const syncSweepSelector = (names: readonly string[]): void => {
    if (sweepParam instanceof HTMLSelectElement) {
      const prev = sweepParam.value;
      sweepParam.replaceChildren();
      for (const n of names) addOption(sweepParam, n, n);
      sweepParam.value = names.includes(prev) ? prev : (names[0] ?? "");
    }
    if (sweepGroup instanceof HTMLElement) sweepGroup.hidden = names.length === 0;
  };

  const syncParamsUI = (): void => {
    const names = plot.paramNames();
    const generic = names.filter((n) => n !== "t"); // `t` gets the animation transport, not a ℂ-pad
    const hasT = names.includes("t");
    if (paramsGroup instanceof HTMLElement) paramsGroup.hidden = generic.length === 0;
    paramControls.refresh(generic);
    if (animGroup instanceof HTMLElement) animGroup.hidden = !hasT;
    if (hasT) animator.sync();
    else animator.stop();
    syncSweepSelector(names);
  };

  // Parameter sweep (catalog G4): render a small-multiples montage of the map across one parameter's
  // real range, reusing the live GPU program per cell. The whole loop is synchronous, so the
  // thumbnail-sized intermediate renders never reach the screen (no flicker) — only the final restored
  // full-res frame does. Clicking a cell jumps the live plot to that value. Transient: not persisted.
  const SWEEP_THUMB = 240;
  const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
  const sweepLabel = (name: string, re: number, im: number): string =>
    Math.abs(im) < 1e-9
      ? `${name} = ${round4(re)}`
      : `${name} = ${round4(re)} ${im < 0 ? "−" : "+"} ${round4(Math.abs(im))}i`;
  const hideSweep = (): void => {
    if (sweepOverlay instanceof HTMLElement) sweepOverlay.hidden = true;
  };
  const runSweep = (): void => {
    if (!(sweepGrid instanceof HTMLElement)) return;
    const names = plot.paramNames();
    const name = sweepParam instanceof HTMLSelectElement ? sweepParam.value : "";
    if (!names.includes(name)) return;
    const v0 = sweepFrom instanceof HTMLInputElement ? Number(sweepFrom.value) : -2;
    const v1 = sweepTo instanceof HTMLInputElement ? Number(sweepTo.value) : 2;
    const steps = sweepSteps instanceof HTMLInputElement ? Number(sweepSteps.value) : 9;
    if (!Number.isFinite(v0) || !Number.isFinite(v1)) return;
    const saved = plot.paramValue(name); // sweep the real part; hold the imaginary part
    const cells = sweepValues(v0, v1, steps).map((v) => {
      const value: [number, number] = [v, saved[1]];
      plot.setParamValue(name, value);
      const url = plot.renderThumbnail(SWEEP_THUMB);
      return {
        label: sweepLabel(name, v, saved[1]),
        url,
        onPick: (): void => {
          plot.setParamValue(name, value);
          paramControls.sync();
          if (name === "t") animator.sync();
          rebuildInstrumentFns();
          recomputeSings();
          redraw(false);
          hideSweep();
        },
      };
    });
    plot.setParamValue(name, saved);
    redraw(false); // restore the full-resolution live view
    renderMontage(sweepGrid, cells);
    if (sweepTitle instanceof HTMLElement)
      sweepTitle.textContent = `${name}: ${round4(v0)} → ${round4(v1)} · ${cells.length} steps`;
    if (sweepOverlay instanceof HTMLElement) sweepOverlay.hidden = false;
  };
  if (sweepSteps instanceof HTMLInputElement) {
    const showSteps = (): void => {
      if (sweepStepsVal instanceof HTMLElement)
        sweepStepsVal.textContent = sweepSteps.value;
    };
    showSteps();
    sweepSteps.addEventListener("input", showSteps);
  }
  if (sweepShow instanceof HTMLElement) sweepShow.addEventListener("click", runSweep);
  if (sweepClose instanceof HTMLElement) sweepClose.addEventListener("click", hideSweep);

  // Returns true when `src` parsed and rendered, false on a parse error (the box keeps the bad text but
  // the caller can then decline to persist it). Never throws.
  const applyExpr = (src: string): boolean => {
    try {
      plot.setFunction(src);
      setError("");
      renderPreview(src);
      updateFns(src);
      updatePrecisionBadge();
      syncParamsUI();
      updateRiemannAvail(); // enable/disable the Riemann tab for this map (ADR-0028)
      recomputeSings();
      redraw(false);
      return true;
    } catch (err) {
      if (err instanceof ExprError) {
        setError(err.pos >= 0 ? `${err.message} (position ${err.pos})` : err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      return false;
    }
  };

  const setExprBox = (src: string): void => {
    if (exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement)
      exprInput.value = src;
  };

  // The active-function toggle (A7): switch which slot is edited + plotted, loading its source.
  // Reflect a toggle button's on/off state to BOTH the CSS class (visual) and `aria-pressed` (screen
  // readers), so the f/g and View groups announce which option is active.
  const setPressed = (el: Element | null, on: boolean): void => {
    if (el instanceof HTMLElement) {
      el.classList.toggle("active", on);
      el.setAttribute("aria-pressed", String(on));
    }
  };
  const setActive = (which: "f" | "g"): void => {
    active = which;
    setPressed(fnF, which === "f");
    setPressed(fnG, which === "g");
    if (exprLabel instanceof HTMLElement) exprLabel.textContent = `Function  ${which}(z)`;
    setExprBox(exprs[which]);
    applyExpr(exprs[which]);
  };
  if (fnF instanceof HTMLElement) fnF.addEventListener("click", () => setActive("f"));
  if (fnG instanceof HTMLElement) fnG.addEventListener("click", () => setActive("g"));

  // View toggle 2D / 3D landscape / Sphere (Phase 5). Each mode swaps the pointer interaction (pan+zoom /
  // orbit+dolly / arcball+dolly — handled in the pointer code) and shows its own controls.
  const ORBIT_SPEED = 0.01; // radians of orbit per pixel of drag
  // Reflect the Riemann-surface controls + honest badge for the current recognized form (ADR-0028). The
  // sheet-count row shows only for infinite-sheeted families (log / inverse trig); finite ones (√, z^(p/q))
  // render all their sheets. The info line is the honest label: form + monodromy + where the principal cut
  // is (the surface glues it), or a "principal-branch only" note when the map isn't a recognized primitive.
  const syncRiemannControls = (): void => {
    const d = plot.riemannDescriptor();
    if (riemannHeightSel instanceof HTMLSelectElement)
      riemannHeightSel.value = String(plot.riemannHeightSource);
    if (riemannSheetsInput instanceof HTMLInputElement)
      riemannSheetsInput.value = String(plot.riemannSheets);
    if (riemannSheetsVal instanceof HTMLElement)
      riemannSheetsVal.textContent = String(plot.riemannSheets);
    if (riemannExag instanceof HTMLInputElement) riemannExag.value = String(plot.heightScale);
    if (riemannExagVal instanceof HTMLElement)
      riemannExagVal.textContent = String(plot.heightScale);
    if (riemannLinkedInput instanceof HTMLInputElement)
      riemannLinkedInput.checked = plot.riemannLinked;
    // The sheet-count control applies only to infinite-sheeted parametric families (log / inverse trig);
    // finite parametric forms and the finite algebraic curves render all their sheets.
    if (riemannSheetsRow instanceof HTMLElement)
      riemannSheetsRow.hidden = !d || d.sheetKind !== "infinite";
    // Branch-point count: the exact discriminant locus (M2c.2, `=`) when available, else the M3.4 scan (`≈`).
    const bp = d
      ? ` · ${branchExact ? "=" : "≈"}${branchPts.length} branch point${branchPts.length === 1 ? "" : "s"}`
      : "";
    if (riemannInfo instanceof HTMLElement)
      riemannInfo.textContent = d
        ? `${d.label} · ${d.monodromy}${bp}. Cut: ${d.branchNote}.` +
          (d.capped ? " ⚠ budget capped — surface incomplete." : "")
        : "Not a recognized surface — showing principal-branch views only.";
  };

  const setView = (m: "2d" | "3d" | "sphere" | "linked" | "riemann"): void => {
    // The Riemann surface exists only for a recognized invertible primitive; fall back to 2D otherwise so
    // the button (or a restored link) never lands on a blank surface.
    if (m === "riemann" && !plot.riemannAvailable()) m = "2d";
    plot.mode = m;
    setPressed(view2d, m === "2d");
    setPressed(view3d, m === "3d");
    setPressed(viewSphere, m === "sphere");
    setPressed(viewLinked, m === "linked");
    setPressed(viewRiemann, m === "riemann");
    // The surface height controls apply whenever a surface is on screen — the 3D view or the linked pane.
    if (surfaceControls instanceof HTMLElement)
      surfaceControls.hidden = m !== "3d" && m !== "linked";
    if (sphereHint instanceof HTMLElement) sphereHint.hidden = m !== "sphere";
    if (riemannControls instanceof HTMLElement) riemannControls.hidden = m !== "riemann";
    // The cursor readout is pane-specific — reset it on any view switch. The sheet row + Riemann hint
    // (M3.1) show only in the Riemann view; f(z)/|f|/arg f then read the picked sheet's value.
    for (const el of [pz, pfz, pabs, parg, pbranch]) if (el instanceof HTMLElement) el.textContent = "—";
    linkedZ = null;
    loopPoints = null;
    lastLoop = null; // a stale monodromy loop doesn't belong to the new view
    loopWindings = [];
    if (monodromyResult instanceof HTMLElement) {
      monodromyResult.hidden = !(m === "riemann" && monodromyOn);
      if (m === "riemann" && monodromyOn)
        monodromyResult.textContent =
          "Drag a closed loop on the base plane to estimate its monodromy.";
    }
    const inRiemann = m === "riemann";
    if (pbranchDt instanceof HTMLElement) pbranchDt.hidden = !inRiemann;
    if (pbranch instanceof HTMLElement) pbranch.hidden = !inRiemann;
    if (riemannProbeHint instanceof HTMLElement) riemannProbeHint.hidden = !inRiemann;
    branchPts = [];
    if (m === "riemann") {
      plot.reframeRiemann(); // build the curve mesh over the current view / refresh the parametric framing
      if (plot.riemannLinked) plot.frameRiemannBaseView(); // frame the base-plane pane on the surface (M3.2)
      recomputeBranchPoints(); // estimate ramification for the markers + badge count (M3.4)
      syncRiemannControls();
    }
    renderGeneratorChips(); // show generator chips in the Riemann view (C1); hide otherwise
    redraw(false);
  };
  if (view2d instanceof HTMLElement)
    view2d.addEventListener("click", () => setView("2d"));
  if (view3d instanceof HTMLElement)
    view3d.addEventListener("click", () => setView("3d"));
  if (viewSphere instanceof HTMLElement)
    viewSphere.addEventListener("click", () => setView("sphere"));
  if (viewLinked instanceof HTMLElement)
    viewLinked.addEventListener("click", () => setView("linked"));
  if (viewRiemann instanceof HTMLElement)
    viewRiemann.addEventListener("click", () => setView("riemann"));

  // Enable the Riemann tab only for a recognized invertible primitive, and drop out of Riemann mode if the
  // active map stops being one. Called on every formula change (from applyExpr).
  const updateRiemannAvail = (): void => {
    const ok = plot.riemannAvailable();
    if (viewRiemann instanceof HTMLButtonElement) {
      viewRiemann.disabled = !ok;
      const label = plot.riemannDescriptor()?.label;
      viewRiemann.title = ok
        ? `True Riemann surface${label ? `: ${label}` : ""}`
        : "Riemann surface: for invertible primitives (√, ⁿ√, log, arcsin, …) and single-radical algebraic maps (√(z²−1), …)";
    }
    // Drop out of a blank Riemann view only in ORDINARY mode; in implicit mode the Riemann view is pinned
    // (the other tabs are disabled), so an invalid F(w,z) stays on Riemann showing the error badge, not the
    // f(z) 2D plot.
    if (!implicitMode && plot.mode === "riemann" && !ok) setView("2d");
    else if (plot.mode === "riemann") {
      recomputeBranchPoints(); // the surface changed — re-estimate ramification (M3.4)
      syncRiemannControls();
      renderGeneratorChips(); // the branch points changed — refresh the generator chips (C1)
    }
  };

  // Implicit-surface mode (M2c, ADR-0031): a dedicated `F(w,z)=0` mode with its own box, distinct from the
  // f/g slots. Entering it pins the Riemann view and disables the tabs / f-only controls that don't apply;
  // leaving it restores the ordinary f(z) map + views.
  const updateViewTabsForImplicit = (): void => {
    for (const b of [view2d, view3d, viewSphere, viewLinked])
      if (b instanceof HTMLButtonElement) {
        b.disabled = implicitMode;
        b.title = implicitMode ? "Disabled in implicit F(w,z)=0 mode — Riemann view only" : "";
      }
  };
  // Recompile + refresh the implicit surface for the current `implicitSrc` (used on entry and on each edit).
  const applyImplicit = (): void => {
    plot.setImplicitSource(implicitSrc);
    setError(
      plot.implicitInvalid()
        ? "Implicit F(w, z): need a bivariate polynomial in w, z (deg_w ≥ 2, constant coefficients)."
        : "",
    );
    renderPreview(implicitSrc);
    updateRiemannAvail();
    redraw(false);
  };
  const setImplicitMode = (on: boolean): void => {
    implicitMode = on;
    // Reflect the input-kind segmented toggle (Option A): the two buttons behave like the f/g and View
    // toggles — exactly one is pressed.
    setPressed(inputFnBtn, !on);
    setPressed(inputImplicitBtn, on);
    // The f/g slots and the function transforms don't apply to an implicit relation — step them aside
    // (hide) rather than grey them out, and show the Riemann-only hint. The preset picker (a separate
    // group that loads an f(z)) stays disabled while implicit.
    if (fnSlotHead instanceof HTMLElement) fnSlotHead.hidden = on;
    if (transformGroup instanceof HTMLElement) transformGroup.hidden = on;
    if (implicitHint instanceof HTMLElement) implicitHint.hidden = !on;
    if (presetSel instanceof HTMLSelectElement) presetSel.disabled = on;
    if (exprLabel instanceof HTMLElement) exprLabel.textContent = `Function  ${active}(z)`;
    setExprBox(on ? implicitSrc : exprs[active]);
    updateViewTabsForImplicit();
    if (on) {
      applyImplicit();
      setView("riemann"); // the only view that renders an implicit relation
    } else {
      plot.setImplicitSource(null);
      applyExpr(exprs[active]); // restore the f(z) surface + instruments
      setView("2d");
    }
  };
  // The input-kind buttons are single-select: clicking the already-active one is a no-op (avoids a needless
  // recompile + view reset).
  if (inputFnBtn instanceof HTMLElement)
    inputFnBtn.addEventListener("click", () => {
      if (implicitMode) setImplicitMode(false);
    });
  if (inputImplicitBtn instanceof HTMLElement)
    inputImplicitBtn.addEventListener("click", () => {
      if (!implicitMode) setImplicitMode(true);
    });

  // Riemann-surface controls (ADR-0028): charisma axis, sheets shown (infinite families), exaggeration
  // (shares plot.heightScale), reset. Each re-frames the orbit camera (the surface's extent moved).
  if (riemannHeightSel instanceof HTMLSelectElement)
    riemannHeightSel.addEventListener("change", () => {
      plot.riemannHeightSource = Number(riemannHeightSel.value) === 1 ? 1 : 0;
      plot.reframeRiemannLight(); // charisma axis is a shader uniform — no mesh rebuild
      redraw(false);
    });
  if (riemannSheetsInput instanceof HTMLInputElement)
    riemannSheetsInput.addEventListener("input", () => {
      plot.riemannSheets = Number(riemannSheetsInput.value);
      if (riemannSheetsVal instanceof HTMLElement)
        riemannSheetsVal.textContent = riemannSheetsInput.value;
      plot.reframeRiemann();
      redraw(false);
    });
  if (riemannExag instanceof HTMLInputElement)
    riemannExag.addEventListener("input", () => {
      plot.heightScale = Number(riemannExag.value);
      if (riemannExagVal instanceof HTMLElement) riemannExagVal.textContent = riemannExag.value;
      plot.reframeRiemannLight(); // exaggeration is a shader uniform — no mesh rebuild
      redraw(false);
    });
  // Linked base-plane pane (M3.2): split the Riemann view with the flat base plane, hover-linked.
  if (riemannLinkedInput instanceof HTMLInputElement)
    riemannLinkedInput.addEventListener("change", () => {
      plot.riemannLinked = riemannLinkedInput.checked;
      if (plot.riemannLinked) plot.frameRiemannBaseView(); // frame the base pane on the surface's z-extent
      else if (monodromyOn) {
        // the monodromy explorer needs the base pane to draw a loop on — turn it off with the pane
        monodromyOn = false;
        if (riemannMonodromyInput instanceof HTMLInputElement) riemannMonodromyInput.checked = false;
        loopPoints = null;
        lastLoop = null;
        loopWindings = [];
        plot.setRiemannLoop(null); // clear the lifted paths on the surface
        showMonodromy(null);
        renderGeneratorChips(); // the explorer went off with the pane — hide the generator chips
      }
      linkedZ = null;
      redraw(false);
    });
  // Monodromy explorer (M3.3): drag a closed loop on the base plane; the sheets' permutation is estimated
  // (≈, uncertified — RISKS §3). Needs the base-plane pane, so turning it on turns that on too.
  if (riemannMonodromyInput instanceof HTMLInputElement)
    riemannMonodromyInput.addEventListener("change", () => {
      monodromyOn = riemannMonodromyInput.checked;
      if (monodromyOn) {
        plot.riemannLinked = true;
        if (riemannLinkedInput instanceof HTMLInputElement) riemannLinkedInput.checked = true;
        plot.frameRiemannBaseView();
      }
      loopPoints = null;
      lastLoop = null;
      loopWindings = [];
      plot.setRiemannLoop(null); // clear any lifted paths on the surface (on: fresh start / off: hide)
      showMonodromy(null); // placeholder hint (on) / hidden (off)
      renderGeneratorChips(); // show the generator chips when the explorer is on, hide when off (C1)
      redraw(false);
    });
  if (riemannReset instanceof HTMLElement)
    riemannReset.addEventListener("click", () => {
      plot.resetCamera();
      plot.resetRiemann();
      redraw(false);
    });
  if (heightModeSel instanceof HTMLSelectElement) {
    heightModeSel.value = String(plot.heightMode);
    heightModeSel.addEventListener("change", () => {
      plot.heightMode = Number(heightModeSel.value);
      redraw(false);
    });
  }
  if (heightScaleInput instanceof HTMLInputElement) {
    const showHeightScale = (): void => {
      if (heightScaleVal instanceof HTMLElement)
        heightScaleVal.textContent = heightScaleInput.value;
    };
    heightScaleInput.value = String(plot.heightScale);
    showHeightScale();
    heightScaleInput.addEventListener("input", () => {
      plot.heightScale = Number(heightScaleInput.value);
      showHeightScale();
      redraw(false);
    });
  }
  if (topDownBtn instanceof HTMLElement)
    topDownBtn.addEventListener("click", () => {
      plot.topDown();
      redraw(false);
    });
  if (resetViewBtn instanceof HTMLElement)
    resetViewBtn.addEventListener("click", () => {
      plot.resetCamera();
      plot.view = { cx: 0, cy: 0, span: framingSpan }; // also restore the framing (pan/zoom move it in 3D)
      redraw(false);
    });
  if (specularInput instanceof HTMLInputElement) {
    specularInput.checked = plot.specular;
    specularInput.addEventListener("change", () => {
      plot.specular = specularInput.checked;
      redraw(false);
    });
  }
  // Surface opacity (§E): a translucent landscape lets you see through to its own far side.
  if (opacityInput instanceof HTMLInputElement) {
    const showOpacity = (): void => {
      if (opacityVal instanceof HTMLElement) opacityVal.textContent = opacityInput.value;
    };
    opacityInput.value = String(plot.opacity);
    showOpacity();
    opacityInput.addEventListener("input", () => {
      plot.opacity = Number(opacityInput.value);
      showOpacity();
      redraw(false);
    });
  }
  // ∞-inspector (F8): plot f(1/z) so the origin shows f near ∞. Toggling recompiles the map (GPU) and
  // rebuilds the instruments (CPU) from the same z → 1/z substitution, so they stay in step.
  if (inspectInfInput instanceof HTMLInputElement) {
    inspectInfInput.checked = inspectInfinity;
    inspectInfInput.addEventListener("change", () => {
      inspectInfinity = inspectInfInput.checked;
      plot.inspectInfinity = inspectInfInput.checked;
      applyExpr(exprs[active]);
    });
  }
  // Derivative overlay (H9): plot f′(z). Like the ∞-inspector, toggling recompiles the map (GPU) and
  // rebuilds the instruments (CPU) from the same symbolic derivative, so probe / finders track f′. A map
  // with no symbolic derivative can't be overlaid — `applyExpr` surfaces the error and keeps the plot.
  if (plotDerivInput instanceof HTMLInputElement) {
    plotDerivInput.checked = plotDerivative;
    plotDerivInput.addEventListener("change", () => {
      plotDerivative = plotDerivInput.checked;
      plot.plotDerivative = plotDerivInput.checked;
      // A map with no symbolic derivative (e.g. conjugate) can't be overlaid — replace the shared
      // package's implementation-detail error ("…for Newton's method (position 0)") with a plain one.
      if (!applyExpr(exprs[active]) && plotDerivative)
        setError("Plot f′: this map has no symbolic derivative.");
    });
  }

  // Autocomplete (A5): builtins + constants + z/c + the current map's parameters.
  const FN_NAMES = [...COMPLEX_FUNCTIONS, ...BINARY_FUNCTIONS, "f", "if", "not"];
  const acCandidates = (): Candidate[] => {
    const fns: Candidate[] = FN_NAMES.map((name) => ({ name, fn: true }));
    const bare = ["z", "c", "w", "i", "e", "pi", "tau", "phi", "γ", ...plot.paramNames()];
    const names: Candidate[] = [...new Set(bare)].map((name) => ({ name, fn: false }));
    return [...fns, ...names];
  };
  if (
    (exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement) &&
    acMenu instanceof HTMLElement
  ) {
    // On accept, the value changed programmatically (no input event) — re-run the app's handling.
    createAutocomplete(exprInput, acMenu, acCandidates, () => {
      if (implicitMode) {
        implicitSrc = exprInput.value;
        applyImplicit();
      } else {
        exprs[active] = exprInput.value;
        applyExpr(exprInput.value);
      }
    });
  }

  // Copy-as-LaTeX (A9): the active function as `f(z) = …` / `g(z) = …`.
  if (copyTexBtn instanceof HTMLElement) {
    copyTexBtn.addEventListener("click", () => {
      try {
        const tex = `${active}(z) = ${toLatex(parse(exprs[active]))}`;
        if (navigator.clipboard)
          navigator.clipboard.writeText(tex).catch(() => undefined);
      } catch {
        /* a malformed expression has nothing to copy */
      }
    });
  }

  const drawLegends = (): void => {
    if (wheelCanvas instanceof HTMLCanvasElement)
      drawPhaseWheel(
        wheelCanvas,
        plot.color.colormap,
        plot.color.hueShift,
        plot.color.hueSign,
      );
    if (modbarCanvas instanceof HTMLCanvasElement)
      drawModulusBar(modbarCanvas, plot.color.modulus, plot.color.modScale);
  };

  if (colormapSel instanceof HTMLSelectElement) {
    COLORMAPS.forEach((cm, i) => addOption(colormapSel, String(i), cm.label));
    colormapSel.value = String(plot.color.colormap);
    colormapSel.addEventListener("change", () => {
      plot.color.colormap = Number(colormapSel.value);
      drawLegends();
      redraw(false);
    });
  }
  if (modulusSel instanceof HTMLSelectElement) {
    modulusSel.value = String(plot.color.modulus);
    modulusSel.addEventListener("change", () => {
      plot.color.modulus = Number(modulusSel.value);
      drawLegends();
      redraw(false);
    });
  }
  if (enhanceSel instanceof HTMLSelectElement) {
    enhanceSel.value = String(plot.color.enhance);
    enhanceSel.addEventListener("change", () => {
      plot.color.enhance = Number(enhanceSel.value);
      redraw(false);
    });
  }
  if (sectorsInput instanceof HTMLInputElement) {
    const showSectors = (): void => {
      if (sectorsVal instanceof HTMLElement)
        sectorsVal.textContent = String(plot.color.sectors);
    };
    sectorsInput.value = String(plot.color.sectors);
    showSectors();
    sectorsInput.addEventListener("input", () => {
      plot.color.sectors = Number(sectorsInput.value);
      showSectors();
      redraw(false);
    });
  }
  if (crispInput instanceof HTMLInputElement) {
    crispInput.checked = plot.color.crisp === 1;
    crispInput.addEventListener("change", () => {
      plot.color.crisp = crispInput.checked ? 1 : 0;
      redraw(false);
    });
  }
  if (hueShiftInput instanceof HTMLInputElement) {
    hueShiftInput.value = String(Math.round((plot.color.hueShift * 180) / Math.PI));
    hueShiftInput.addEventListener("input", () => {
      plot.color.hueShift = (Number(hueShiftInput.value) * Math.PI) / 180;
      drawLegends();
      redraw(false);
    });
  }
  if (hueSignInput instanceof HTMLInputElement) {
    hueSignInput.checked = plot.color.hueSign < 0;
    hueSignInput.addEventListener("change", () => {
      plot.color.hueSign = hueSignInput.checked ? -1 : 1;
      drawLegends();
      redraw(false);
    });
  }
  if (cvdSel instanceof HTMLSelectElement) {
    cvdSel.value = String(plot.color.cvd);
    cvdSel.addEventListener("change", () => {
      plot.color.cvd = Number(cvdSel.value);
      redraw(false);
    });
  }
  if (markSingsInput instanceof HTMLInputElement) {
    markSingsInput.checked = markSings;
    markSingsInput.addEventListener("change", () => {
      markSings = markSingsInput.checked;
      recomputeSings();
      redraw(false);
    });
  }
  // Critical points (H6): mark where f′ = 0 with diamonds, computed on demand like the zero/pole finder.
  if (markCriticalInput instanceof HTMLInputElement) {
    markCriticalInput.checked = markCritical;
    markCriticalInput.addEventListener("change", () => {
      markCritical = markCriticalInput.checked;
      recomputeSings();
      redraw(false);
    });
  }
  if (uncInput instanceof HTMLInputElement) {
    uncInput.checked = plot.color.uncertainty === 1;
    uncInput.addEventListener("change", () => {
      plot.color.uncertainty = uncInput.checked ? 1 : 0;
      redraw(false);
    });
  }
  if (levelAbsInput instanceof HTMLInputElement) {
    levelAbsInput.addEventListener("input", () => {
      const v = Number(levelAbsInput.value);
      plot.color.levelAbs = Number.isFinite(v) && v > 0 ? v : 0;
      redraw(false);
    });
  }
  if (levelArgInput instanceof HTMLInputElement) {
    levelArgInput.addEventListener("input", () => {
      const v = Number(levelArgInput.value);
      plot.color.levelArg = ((Number.isFinite(v) ? v : 0) * Math.PI) / 180;
      redraw(false);
    });
  }
  if (levelArgOnInput instanceof HTMLInputElement) {
    levelArgOnInput.addEventListener("change", () => {
      plot.color.levelArgOn = levelArgOnInput.checked ? 1 : 0;
      redraw(false);
    });
  }
  if (presetSel instanceof HTMLSelectElement) {
    addOption(presetSel, "", "Presets…");
    PRESETS.forEach((p, i) => addOption(presetSel, String(i), p.label));
    presetSel.addEventListener("change", () => {
      if (presetSel.value === "") return; // the "Presets…" placeholder — Number("") is 0, so guard it
      const preset = PRESETS[Number(presetSel.value)];
      if (!preset) return;
      exprs[active] = preset.expr; // a preset loads into the active slot
      setExprBox(preset.expr);
      plot.view = { cx: 0, cy: 0, span: preset.span };
      framingSpan = preset.span;
      applyExpr(preset.expr);
      presetSel.value = "";
    });
  }

  if (exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement) {
    // Debounce the recompile: each keystroke otherwise rebuilds three GPU shader programs synchronously
    // (2D + surface + sphere), which janks on slow GPUs mid-formula. A short delay coalesces a burst of
    // keystrokes into one compile once typing pauses.
    let exprTimer = 0;
    exprInput.addEventListener("input", () => {
      window.clearTimeout(exprTimer);
      exprTimer = window.setTimeout(() => {
        if (implicitMode) {
          // Implicit mode: the box holds `F(w,z)`; edits drive the implicit surface (M2c).
          implicitSrc = exprInput.value;
          applyImplicit();
          return;
        }
        // Only a parseable expression is written back to the active slot (and thus to currentState /
        // the share-link): a half-typed, invalid formula stays visible in the box but never gets
        // persisted, so a later committed redraw (a pan, "Copy link") can't bake a broken map into the
        // URL and lose the last good function on reload.
        if (applyExpr(exprInput.value)) exprs[active] = exprInput.value;
      }, 140);
    });
  }

  if (homeBtn instanceof HTMLElement) {
    homeBtn.addEventListener("click", () => {
      plot.view = { cx: 0, cy: 0, span: framingSpan };
      recomputeSings();
      redraw(false);
    });
  }
  // Export (K1 hi-res PNG · K3 reproducibility metadata · K9 copy-to-clipboard). The embedded metadata is
  // the share URL, so an exported figure carries the exact map/params/view that produced it.
  const exportEdge = (): number => {
    const v =
      exportSizeSel instanceof HTMLSelectElement ? Number(exportSizeSel.value) : 2000;
    return Number.isFinite(v) && v > 0 ? v : 2000;
  };
  // Offer only sizes the device can actually render: disable any export long-edge above the GL
  // MAX_TEXTURE_SIZE. exportBlob self-clamps, but the dropdown shouldn't advertise a size that would
  // silently downscale. The limit is fixed per context, so this runs once.
  if (exportSizeSel instanceof HTMLSelectElement) {
    const maxEdge = plot.maxExportEdge();
    for (const opt of Array.from(exportSizeSel.options)) {
      if (Number(opt.value) > maxEdge) {
        opt.disabled = true;
        opt.textContent += " (too large)";
      }
    }
    if (exportSizeSel.selectedOptions[0]?.disabled) {
      const ok = Array.from(exportSizeSel.options).find((o) => !o.disabled);
      if (ok) exportSizeSel.value = ok.value; // never leave a disabled size selected
    }
  }
  const exportMeta = (): Record<string, string> => ({
    Software: "Complex Function Plotting Tool",
    "cfp:url": shareUrl(currentState()),
  });
  if (savePngBtn instanceof HTMLElement) {
    savePngBtn.addEventListener("click", () => {
      plot
        .exportBlob(exportEdge(), exportMeta())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "complex-function-plot.png";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        })
        .catch((err) => {
          // exportBlob rejects if toBlob or the metadata stamp fails — surface it rather than
          // leaving a silent unhandled rejection (Copy image swallows the same failure by design).
          setError(err instanceof Error ? `PNG export failed: ${err.message}` : "PNG export failed");
        });
    });
  }
  if (copyImgBtn instanceof HTMLElement) {
    copyImgBtn.addEventListener("click", () => {
      // Pass the export promise straight to ClipboardItem so the blob resolves inside the user gesture
      // (Safari requires that); silently no-op where the async Clipboard image API is unavailable.
      if (
        typeof ClipboardItem === "undefined" ||
        typeof navigator.clipboard?.write !== "function"
      )
        return;
      const item = new ClipboardItem({
        "image/png": plot.exportBlob(exportEdge(), exportMeta()),
      });
      navigator.clipboard.write([item]).catch(() => undefined);
    });
  }
  if (copyLinkBtn instanceof HTMLElement) {
    copyLinkBtn.addEventListener("click", () => {
      const url = shareUrl(currentState());
      history.replaceState(null, "", encodeState(currentState()));
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => undefined);
    });
  }

  // Suite hand-off (interop, K7/K8). Import an @cas/interchange map from another tool (a QD φ / σ, a saved
  // View, a bare map); export the current map + view as an #s= link, or a deep-link straight into Complex
  // Dynamics. This is the cross-app `#s=` Envelope — distinct from the plotter's own `#vs=` share-link.
  const currentVars = (src: string): InterchangeVar[] => {
    try {
      const ast = parse(src);
      const vs = (["z", "c", "a"] as InterchangeVar[]).filter((n) =>
        referencesVar(ast, n),
      );
      return vs.length ? vs : ["z"];
    } catch {
      return ["z"];
    }
  };
  const currentViewExport = () => ({
    expr: exprs[active],
    vars: currentVars(exprs[active]),
    center: { re: plot.view.cx, im: plot.view.cy },
    span: plot.view.span,
    coloring: COLORMAPS[plot.color.colormap]?.id,
    createdAt: new Date().toISOString(),
  });
  const showInteropNote = (msg: string): void => {
    if (!(interopNote instanceof HTMLElement)) return;
    interopNote.textContent = msg;
    interopNote.hidden = msg === "";
  };
  if (importMapBtn instanceof HTMLElement) {
    importMapBtn.addEventListener("click", () => {
      const text = window.prompt(
        "Paste a suite hand-off link (#s=…) or interchange JSON:",
      );
      if (!text) return;
      try {
        const imported = importEnvelopeText(text);
        exprs[active] = imported.expr;
        setExprBox(imported.expr);
        if (imported.viewport) {
          plot.view = {
            cx: imported.viewport.center.re,
            cy: imported.viewport.center.im,
            span: imported.viewport.span,
          };
          framingSpan = imported.viewport.span;
        }
        applyExpr(imported.expr);
        const from =
          imported.source && imported.source !== "unknown"
            ? ` from ${imported.source}`
            : "";
        showInteropNote(
          imported.note ? `Imported${from} — ${imported.note}` : `Imported a map${from}.`,
        );
      } catch (err) {
        showInteropNote(
          `Import failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }
  if (copyInteropBtn instanceof HTMLElement) {
    copyInteropBtn.addEventListener("click", () => {
      const link = encodeViewLink(currentViewExport());
      if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => undefined);
      showInteropNote("Copied a suite hand-off link (#s=…) for the current map + view.");
    });
  }
  if (toDynamicsBtn instanceof HTMLElement) {
    toDynamicsBtn.addEventListener("click", () => {
      window.open(
        cdHandoffUrl(location.href, encodeViewLink(currentViewExport())),
        "_blank",
        "noopener",
      );
    });
  }

  // Cursor probe (H1).
  const fmtNum = (x: number): string => {
    if (Number.isNaN(x)) return "NaN";
    if (!Number.isFinite(x)) return x > 0 ? "∞" : "-∞";
    return String(Math.round(x * 1e4) / 1e4);
  };
  const fmtComplex = (z: Complex): string =>
    `${fmtNum(z[0])} ${z[1] < 0 ? "-" : "+"} ${fmtNum(Math.abs(z[1]))}i`;
  // Fill the readout from a domain point `z` (its f, |f|, arg), or blank it (`—`) when `z` is null — the
  // cursor is off the surface. Shared by the 2D screen→world probe and the 3D surface pick.
  const renderProbe = (z: Complex | null): void => {
    if (!(pz instanceof HTMLElement)) return;
    if (!z) {
      for (const el of [pz, pfz, pabs, parg]) if (el instanceof HTMLElement) el.textContent = "—";
      return;
    }
    pz.textContent = fmtComplex(z);
    if (!probeFn) return;
    let w: Complex;
    try {
      w = probeFn(z, [0, 0]);
    } catch {
      w = [NaN, NaN];
    }
    // `≈` when f uses a float32-limited special function (ζ/Γ/W): the value is a good float64 estimate,
    // not a certified closed form — matching the picture's precision badge (honest labeling).
    const pre = probeEstimate && Number.isFinite(w[0]) && Number.isFinite(w[1]) ? "≈ " : "";
    if (pfz instanceof HTMLElement) pfz.textContent = pre + fmtComplex(w);
    if (pabs instanceof HTMLElement) pabs.textContent = pre + fmtNum(Math.hypot(w[0], w[1]));
    if (parg instanceof HTMLElement) parg.textContent = pre + fmtNum(Math.atan2(w[1], w[0]));
  };
  const updateProbe = (clientX: number, clientY: number): void =>
    renderProbe(plot.screenToWorld(clientX, clientY, twoDRect()));
  // The CPU height field (|f| → surface height), matching the GPU vertex law, so the 3D pick lands on the
  // drawn surface. Then the value inspector reads the exact point under the cursor (height + occlusion).
  const surfaceHeight = (re: number, im: number): number => {
    if (!probeFn) return 0;
    let w: Complex;
    try {
      w = probeFn([re, im], [0, 0]);
    } catch {
      return 0;
    }
    return heightAt(plot.heightMode, Math.hypot(w[0], w[1]), plot.color.modScale) * plot.heightScale;
  };
  const updateProbe3d = (clientX: number, clientY: number): void =>
    renderProbe(plot.pickSurface(clientX, clientY, surfaceHeight, threeDRect()));

  const setBranchText = (text: string): void => {
    if (pbranch instanceof HTMLElement) pbranch.textContent = text;
  };
  // Multi-sheet hover-pick (M3.1): ray-cast the Riemann surface under the cursor and read the point on the
  // sheet the eye sees — z, the sheet's value w (= f(z) on that branch), |w|, arg w, and the local sheet
  // ordinal. All `≈` (barycentric-interpolated from a finite mesh), matching how the surface is drawn. The
  // Riemann view uses the whole canvas, so the pick measures against the full canvas rect.
  const updateProbeRiemann = (clientX: number, clientY: number): void => {
    const hit = plot.pickRiemann(clientX, clientY, riemannPaneRect());
    if (!hit) {
      renderProbe(null);
      setBranchText("—");
      if (plot.riemannLinked) {
        linkedZ = null;
        drawRiemannLink();
      }
      return;
    }
    if (pz instanceof HTMLElement) pz.textContent = fmtComplex(hit.z);
    if (pfz instanceof HTMLElement) pfz.textContent = "≈ " + fmtComplex(hit.w);
    if (pabs instanceof HTMLElement) pabs.textContent = "≈ " + fmtNum(Math.hypot(hit.w[0], hit.w[1]));
    if (parg instanceof HTMLElement) parg.textContent = "≈ " + fmtNum(Math.atan2(hit.w[1], hit.w[0]));
    setBranchText(`${hit.sheetIndex} / ${hit.sheetCount}`);
    if (plot.riemannLinked) {
      linkedZ = hit.z; // mark the touched sheet's base point on the base-plane pane
      drawRiemannLink();
    }
  };

  // Monodromy explorer (M3.3): show the estimated sheet permutation for the drawn loop. Always labeled an
  // uncertified estimate (RISKS §3); a low-confidence flag warns when the loop ran near a branch point.
  const showMonodromy = (res: ReturnType<typeof plot.computeRiemannMonodromy>): void => {
    if (!(monodromyResult instanceof HTMLElement)) return;
    if (!res) {
      monodromyResult.hidden = !monodromyOn;
      if (monodromyOn)
        monodromyResult.textContent =
          "Drag a closed loop on the base plane to estimate its monodromy.";
      return;
    }
    monodromyResult.hidden = false;
    const nontrivial = res.cycles.filter((c) => c.length > 1);
    const cyc = !res.isPermutation
      ? "ambiguous (no clean permutation)"
      : nontrivial.length === 0
        ? "identity — no sheet swap"
        : nontrivial.map((c) => `(${c.map((k) => k + 1).join(" ")})`).join("");
    const shape =
      res.isPermutation && nontrivial.length === 1 && nontrivial[0].length === res.sheetCount
        ? ` · ${res.sheetCount}-cycle`
        : "";
    const conf = res.lowConfidence
      ? " · ⚠ low confidence (near a branch point / under-resolved)"
      : "";
    // Winding numbers are EXACT (`=`) integer topology — stated separately from the ≈ permutation (B2).
    const wind = loopWindings.length
      ? " Winding = " +
        loopWindings
          .map((w) => `${w.wind > 0 ? "+" : ""}${w.wind} about ${fmtComplex(w.pt)}`)
          .join(", ") +
        "."
      : "";
    monodromyResult.textContent = `≈ ${cyc}${shape} over ${res.sheetCount} sheets${conf} — uncertified estimate (RISKS §3).${wind}`;
  };
  // Commit a closed base-plane loop (hand-drawn or a one-click generator): record its per-branch-point winding
  // (B2), lift its per-sheet paths onto the surface (M3.3), and show the estimate. Shared by finalizeLoop and
  // the generator chips (C1).
  const applyLoop = (loop: Complex[]): void => {
    lastLoop = loop;
    // Winding number per branch point (B2) — exact integer topology; keep only the enclosed ones (≠ 0).
    loopWindings = branchPts
      .map((pt) => ({ pt, wind: windingNumber(loop, pt) }))
      .filter((w) => w.wind !== 0);
    const res = plot.computeRiemannMonodromy(loop);
    plot.setRiemannLoop(res); // lift the per-sheet continuation paths onto the 3D surface (M3.3)
    if (!res && monodromyResult instanceof HTMLElement) {
      monodromyResult.hidden = false;
      monodromyResult.textContent =
        "≈ no monodromy — fewer than two sheets over the loop's start.";
    } else {
      showMonodromy(res);
    }
    redraw(false);
  };
  const finalizeLoop = (): void => {
    const loop = loopPoints;
    loopPoints = null;
    if (!loop || loop.length < 4) {
      lastLoop = null; // too short to be a loop — discard
      loopWindings = [];
      plot.setRiemannLoop(null); // clear any lifted paths on the surface
      showMonodromy(null);
      redraw(false);
      return;
    }
    applyLoop(loop);
  };

  // One-click generator loops (C1): a chip per branch point that draws the canonical CCW loop around it — a
  // generator of π₁(base ∖ branch points) — and runs it through the same monodromy pipeline. Disabled when the
  // branch point can't be isolated (a neighbour is too close); then the user draws the loop by hand.
  const subscript = (i: number): string =>
    String(i).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
  const runGenerator = (index: number): void => {
    const b = branchPts[index];
    if (!b) return;
    const r = generatorRadius(index, branchPts, plot.view.span);
    if (r === null) return;
    loopPoints = null;
    applyLoop(generatorLoopAround(b, r));
  };
  const renderGeneratorChips = (): void => {
    if (!(generatorLoopsEl instanceof HTMLElement) || !(generatorChipsEl instanceof HTMLElement)) return;
    const show = monodromyOn && plot.mode === "riemann" && branchPts.length > 0;
    generatorLoopsEl.hidden = !show;
    generatorChipsEl.replaceChildren();
    if (monodromyGroupEl instanceof HTMLElement) monodromyGroupEl.hidden = true; // stale on a branch-set change
    // The group / genus summary (C3) applies only to a FINITE cover; hide the button for ∞-sheeted surfaces.
    if (computeGroupBtn instanceof HTMLElement)
      computeGroupBtn.hidden = !(show && plot.riemannSheetCount() !== null);
    if (!show) return;
    branchPts.forEach((b, i) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "gen-chip";
      chip.textContent = `γ${subscript(i + 1)}`;
      const isolable = generatorRadius(i, branchPts, plot.view.span) !== null;
      chip.disabled = !isolable;
      chip.title = isolable
        ? `Loop around the branch point at ${fmtComplex(b)}`
        : `Branch point at ${fmtComplex(b)} — too close to a neighbour to isolate; draw the loop by hand`;
      chip.addEventListener("click", () => runGenerator(i));
      generatorChipsEl.appendChild(chip);
    });
  };

  // Monodromy group + Riemann–Hurwitz genus (C3). Compute a generator permutation for each branch point as the
  // monodromy of a LASSO from one common base point (so all permutations share a sheet labeling and compose),
  // plus a big enclosing loop for the ramification over ∞. From these: the monodromy group ⟨σᵢ⟩ ≤ Sₙ (order,
  // connectedness = transitivity), and the genus via Riemann–Hurwitz. The group + genus are `≈` (built from the
  // never-certified permutations, RISKS §3); the parity/bound check is exact and flags inconsistent estimates.
  const cycleNotation = (p: Perm): string => {
    const nontrivial = cycles(p).filter((c) => c.length > 1);
    return nontrivial.length ? nontrivial.map((c) => `(${c.map((k) => k + 1).join(" ")})`).join("") : "id";
  };

  interface MonoData {
    n: number;
    gens: { label: string; perm: Perm; branchPt: Complex }[];
    sigmaInf: Perm | null;
    group: ReturnType<typeof generatedGroup>;
    name: string | null;
    genus: ReturnType<typeof riemannHurwitzGenus>;
    skipped: number;
  }
  // Measure the whole monodromy representation (C3): a lasso generator per branch point (common base ⇒ shared
  // labeling ⇒ composable) + a big ∞ loop, then the group ⟨σᵢ⟩ ≤ Sₙ and the Riemann–Hurwitz genus. Shared by
  // the inline summary (C3) and the full report (C4). All `≈` (RISKS §3); the parity/bound check is exact.
  const gatherMonodromy = (): MonoData | null => {
    const n = plot.riemannSheetCount();
    if (n === null || n < 2 || branchPts.length === 0) return null;
    const base = commonBasePoint(branchPts, plot.view.span);
    const gens: { label: string; perm: Perm; branchPt: Complex }[] = [];
    let skipped = 0;
    branchPts.forEach((b, i) => {
      const r = generatorRadius(i, branchPts, plot.view.span);
      if (r === null) {
        skipped++;
        return;
      }
      const res = plot.computeRiemannMonodromy(lassoLoop(base, b, r));
      if (res && res.sheetCount === n && res.isPermutation)
        gens.push({ label: `γ${subscript(i + 1)}`, perm: res.permutation, branchPt: b });
      else skipped++;
    });
    const bigRes = plot.computeRiemannMonodromy(enclosingLoop(branchPts, plot.view.span));
    const sigmaInf =
      bigRes && bigRes.sheetCount === n && bigRes.isPermutation ? bigRes.permutation : null;
    const groupGens = sigmaInf ? [...gens.map((g) => g.perm), sigmaInf] : gens.map((g) => g.perm);
    const group = groupGens.length
      ? generatedGroup(groupGens, n)
      : { order: 1, capped: false, transitive: n <= 1 };
    const cycleCounts = gens.map((g) => cycleCount(g.perm));
    if (sigmaInf) cycleCounts.push(cycleCount(sigmaInf));
    return {
      n,
      gens,
      sigmaInf,
      group,
      name: namedGroup(group.order, n, group.transitive),
      genus: riemannHurwitzGenus(cycleCounts, n),
      skipped,
    };
  };

  // A permutation diagram canvas (C2), HiDPI + accessible, for `perm` over `n` sheets.
  const makeDiagram = (label: string, perm: Perm, n: number): HTMLCanvasElement => {
    const cv = document.createElement("canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = permDiagramWidth(n);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(DIAGRAM_HEIGHT * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${DIAGRAM_HEIGHT}px`;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", `${label}: permutation ${cycleNotation(perm)}`);
    const dctx = cv.getContext("2d");
    if (dctx) {
      dctx.scale(dpr, dpr);
      drawPermDiagram(dctx, perm);
    }
    return cv;
  };
  const groupLine = (d: MonoData): string =>
    `order ${d.group.order}${d.group.capped ? "+" : ""}` +
    (d.name ? ` · ${d.name}` : "") +
    ` · ${d.group.transitive ? "transitive ⇒ connected" : "intransitive ⇒ disconnected"}`;
  const genusLine = (d: MonoData): string =>
    d.genus.consistent
      ? `genus ${d.genus.genus} (Riemann–Hurwitz; = given the cycle data)`
      : "genus — ⚠ inconsistent estimates (Riemann–Hurwitz parity/bound failed)";

  // Inline summary in the side panel (C3): the generator diagrams + a compact group/genus readout, and a
  // button to open the full report (C4).
  const computeGroup = (): void => {
    if (!(monodromyGroupEl instanceof HTMLElement)) return;
    const d = gatherMonodromy();
    if (!d) {
      monodromyGroupEl.hidden = true;
      return;
    }
    monodromyGroupEl.replaceChildren();
    const entries = [...d.gens, ...(d.sigmaInf ? [{ label: "γ∞", perm: d.sigmaInf }] : [])];
    if (entries.length && d.n <= 12) {
      const row = document.createElement("div");
      row.className = "gen-diagrams";
      for (const { label, perm } of entries) {
        const wrap = document.createElement("div");
        wrap.className = "gen-diagram";
        wrap.appendChild(makeDiagram(label, perm, d.n));
        const lab = document.createElement("span");
        lab.className = "gen-diagram-label";
        lab.textContent = `${label} = ${cycleNotation(perm)}`;
        wrap.appendChild(lab);
        row.appendChild(wrap);
      }
      monodromyGroupEl.appendChild(row);
    }
    const lines = [
      `${d.n} sheets · ${branchPts.length} branch point${branchPts.length === 1 ? "" : "s"}`,
      `≈ monodromy group: ${groupLine(d)}`,
      `≈ ${genusLine(d)}`,
    ];
    if (d.skipped)
      lines.push(`⚠ ${d.skipped} branch point${d.skipped === 1 ? "" : "s"} not isolated — group may be incomplete`);
    lines.push("Uncertified estimate (RISKS §3).");
    const summary = document.createElement("p");
    summary.className = "gen-summary";
    summary.textContent = lines.join("\n");
    monodromyGroupEl.appendChild(summary);
    const reportBtn = document.createElement("button");
    reportBtn.type = "button";
    reportBtn.className = "gen-groupbtn";
    reportBtn.textContent = "Full report ▸";
    reportBtn.addEventListener("click", openReport);
    monodromyGroupEl.appendChild(reportBtn);
    monodromyGroupEl.hidden = false;
  };

  // The full-screen "Monodromy report" (C4): the covering's fingerprint, the π₁ generators with diagrams, the
  // Riemann–Hurwitz computation, and the honest ≈ framing — an educational read, layout only (no new math).
  const stat = (k: string, v: string, bad = false): HTMLElement => {
    const el = document.createElement("div");
    el.className = "report-stat";
    const kk = document.createElement("div");
    kk.className = "k";
    kk.textContent = k;
    const vv = document.createElement("div");
    vv.className = bad ? "v bad" : "v";
    vv.textContent = v;
    el.append(kk, vv);
    return el;
  };
  const openReport = (): void => {
    if (!(monodromyReportEl instanceof HTMLElement) || !(reportBodyEl instanceof HTMLElement)) return;
    const d = gatherMonodromy();
    if (!d) return;
    const inner = document.createElement("div");
    inner.className = "report-inner";

    const h2 = document.createElement("h2");
    h2.textContent = `Monodromy of ${plot.riemannDescriptor()?.label ?? "the surface"}`;
    const sub = document.createElement("p");
    sub.className = "report-sub";
    sub.textContent =
      "How the sheets permute as you loop around each branch point — the covering's topological fingerprint.";
    const caveat = document.createElement("p");
    caveat.className = "report-caveat";
    caveat.textContent =
      "≈ Uncertified estimate: the permutations are analytic continuation (RISKS §3). The Riemann–Hurwitz formula and its parity/bound check are exact.";
    inner.append(h2, sub, caveat);

    // Fingerprint stat row
    const stats = document.createElement("div");
    stats.className = "report-stats";
    stats.append(
      stat("Sheets (n)", String(d.n)),
      stat("Branch points", String(branchPts.length)),
      stat(
        "Genus",
        d.genus.consistent ? `≈ ${d.genus.genus}` : "⚠ inconsistent",
        !d.genus.consistent,
      ),
      stat("Monodromy group", `≈ order ${d.group.order}${d.group.capped ? "+" : ""}${d.name ? ` · ${d.name}` : ""}`),
      stat("Connected", d.group.transitive ? "yes (transitive)" : "no (intransitive)", !d.group.transitive),
    );
    inner.append(stats);

    // Generators
    const gh = document.createElement("h3");
    gh.textContent = "Generators of π₁ (one loop per branch point)";
    inner.append(gh);
    const prose = document.createElement("p");
    prose.className = "prose";
    prose.textContent =
      `The punctured base ℂ ∖ {branch points} has fundamental group free on ${branchPts.length} generator${branchPts.length === 1 ? "" : "s"} ` +
      `γ₁ … γ${branchPts.length === 1 ? "₁" : subscript(branchPts.length)}. Monodromy sends each γᵢ to a sheet permutation σᵢ ∈ S${d.n}; the group they generate is the monodromy group.`;
    inner.append(prose);
    const gens = document.createElement("div");
    gens.className = "report-gens";
    const entries = [
      ...d.gens.map((g) => ({ label: g.label, perm: g.perm, meta: `about ${fmtComplex(g.branchPt)}` })),
      ...(d.sigmaInf ? [{ label: "γ∞", perm: d.sigmaInf, meta: "around ∞" }] : []),
    ];
    for (const e of entries) {
      const card = document.createElement("div");
      card.className = "report-gen";
      const gl = document.createElement("span");
      gl.className = "gl";
      gl.textContent = e.label;
      card.append(gl, makeDiagram(e.label, e.perm, d.n));
      const cyc = document.createElement("span");
      cyc.className = "cyc";
      cyc.textContent = cycleNotation(e.perm);
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = e.meta;
      card.append(cyc, meta);
      gens.append(card);
    }
    inner.append(gens);
    if (d.skipped) {
      const warn = document.createElement("p");
      warn.className = "report-caveat";
      warn.textContent = `⚠ ${d.skipped} branch point${d.skipped === 1 ? "" : "s"} could not be isolated (too close / unresolved) — the generator set and group may be incomplete.`;
      inner.append(warn);
    }

    // Riemann–Hurwitz
    const rh = document.createElement("h3");
    rh.textContent = "Genus — Riemann–Hurwitz";
    inner.append(rh);
    const R = d.genus.ramification;
    const eq = document.createElement("div");
    eq.className = "report-eq";
    eq.textContent =
      `2 − 2g = 2n − R    (n = ${d.n},  R = Σ (n − #cycles) over all branch points incl. ∞)\n` +
      `R = ${R}   ⇒   2 − 2g = ${2 * d.n} − ${R} = ${2 * d.n - R}` +
      (d.genus.consistent
        ? `   ⇒   g ≈ ${d.genus.genus}`
        : "   ⇒   ⚠ not an even, non-negative result — the estimated cycles can't come from a genuine cover");
    inner.append(eq);
    const rhProse = document.createElement("p");
    rhProse.className = "prose";
    rhProse.textContent = d.group.transitive
      ? "A transitive monodromy group means the surface is a single connected piece."
      : "The monodromy group is intransitive, so the surface splits into more than one connected component.";
    inner.append(rhProse);

    reportBodyEl.replaceChildren(inner);
    monodromyReportEl.hidden = false;
    if (reportCloseBtn instanceof HTMLElement) reportCloseBtn.focus();
  };
  const closeReport = (): void => {
    if (monodromyReportEl instanceof HTMLElement) monodromyReportEl.hidden = true;
  };
  if (computeGroupBtn instanceof HTMLElement) computeGroupBtn.addEventListener("click", computeGroup);
  if (reportCloseBtn instanceof HTMLElement) reportCloseBtn.addEventListener("click", closeReport);
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      monodromyReportEl instanceof HTMLElement &&
      !monodromyReportEl.hidden
    )
      closeReport();
  });

  // Pointer / touch / keyboard navigation. 2D: pan + zoom-to-cursor (probe when idle); 3D: orbit + dolly;
  // Sphere: arcball rotate + dolly. Two fingers pinch-zoom in any mode, and the keyboard drives the same
  // operations for a mouse-free / accessible path (L7).
  let grabWorld: Complex | null = null;
  let orbitLast: { x: number; y: number } | null = null;
  let panLast: { x: number; y: number } | null = null; // 3D left-drag pan (recenter the domain)
  let sphereLast: [number, number] | null = null;
  const activePointers = new Map<number, Pt>();
  let pinchPrev: number | null = null;
  const canvasUv = (clientX: number, clientY: number): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [
      r.width > 0 ? (clientX - r.left) / r.width : 0,
      r.height > 0 ? (clientY - r.top) / r.height : 0,
    ];
  };
  const twoPointers = (): [Pt, Pt] => {
    const it = activePointers.values();
    return [it.next().value as Pt, it.next().value as Pt];
  };
  // Seed the single-pointer drag appropriate to the mode under `clientX` (pan in 2D / the linked flat
  // pane, orbit-or-pan in 3D, arcball on the sphere). Used both on pointerdown and when a pinch drops to
  // one finger, so the survivor keeps dragging. `pan3d` (left mouse button) pans the 3D landscape; the
  // default (right button / touch / pinch-survivor) orbits it.
  const seedDrag = (clientX: number, clientY: number, pan3d = false): void => {
    const m = navMode(clientX); // in the Riemann view a drag orbits the surface from either pane
    if (m === "sphere") sphereLast = canvasUv(clientX, clientY);
    else if (m === "riemann") orbitLast = { x: clientX, y: clientY }; // orbit only (no domain pan)
    else if (m === "3d") {
      if (pan3d) panLast = { x: clientX, y: clientY };
      else orbitLast = { x: clientX, y: clientY };
    } else grabWorld = plot.screenToWorld(clientX, clientY, twoDRect());
  };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.focus(); // so the keyboard path works after clicking the plot
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Capture EVERY pointer, not just the first: a second finger that later lifts off-canvas must still
    // deliver its pointerup here, or its activePointers entry leaks and the next lone touch is misread
    // as a pinch.
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic / already-released pointer can't be captured — harmless */
    }
    if (activePointers.size >= 2) {
      // A second finger begins a pinch: abandon any single-pointer drag / loop and seed the pinch span.
      grabWorld = null;
      orbitLast = null;
      panLast = null;
      sphereLast = null;
      loopPoints = null;
      const [a, b] = twoPointers();
      pinchPrev = pointerDistance(a, b);
      return;
    }
    // Monodromy explorer (M3.3): a drag on the base-plane pane traces a loop instead of orbiting.
    if (
      monodromyOn &&
      plot.mode === "riemann" &&
      plot.riemannLinked &&
      isLeftHalf(e.clientX, canvasRect())
    ) {
      const z0 = plot.screenToWorld(e.clientX, e.clientY, twoDRect());
      loopPoints = [z0];
      lastLoop = null;
      loopWindings = []; // clear the previous loop's winding annotations
      plot.beginRiemannLiveLoop(z0); // seed the live lift — the surface path grows as the loop is drawn
      redraw(true); // repaint the surface (with the seed) + the base-plane overlay
      return;
    }
    // Left mouse button pans the 3D landscape; the right button (or touch / pen) orbits it — the familiar
    // left-drag = move, right-drag = rotate. In 2D / on the sphere the button is ignored (seedDrag decides).
    const pan3d = e.pointerType === "mouse" && e.button === 0;
    seedDrag(e.clientX, e.clientY, pan3d);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (activePointers.has(e.pointerId))
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2 && pinchPrev !== null) {
      const [a, b] = twoPointers();
      const dist = pointerDistance(a, b);
      const factor = pinchFactor(pinchPrev, dist);
      pinchPrev = dist;
      const mid = pointerMidpoint(a, b);
      const m = navMode(mid.x);
      if (m === "sphere") plot.dollySphere(factor);
      else if (m === "riemann") plot.dollyRiemann(factor); // pinch dollies the surface camera
      else if (m === "3d") plot.zoomSpan(factor); // §B: pinch zooms the domain
      else plot.zoomAt(mid.x, mid.y, factor, twoDRect());
      redraw(true);
      return;
    }
    if (loopPoints) {
      // Monodromy loop drag (M3.3): accumulate base points; extend the live lift so the surface path grows in
      // real time. Throttle by a small world step (keeps the point count — and the per-move lift — bounded and
      // dedupes jitter); `redraw(true)` repaints the surface with the growing lift + the base-plane overlay.
      const z = plot.screenToWorld(e.clientX, e.clientY, twoDRect());
      const last = loopPoints[loopPoints.length - 1];
      const step = plot.view.span * 0.01; // ~1% of the pane half-height
      if (!last || Math.hypot(z[0] - last[0], z[1] - last[1]) > step) {
        loopPoints.push(z);
        plot.extendRiemannLiveLoop(z);
      }
      redraw(true);
      return;
    }
    if (sphereLast) {
      const uv = canvasUv(e.clientX, e.clientY);
      plot.rotateSphere(sphereLast, uv);
      sphereLast = uv;
      redraw(true);
    } else if (panLast) {
      // 3D left-drag pan: recenter the domain so the grabbed point tracks the cursor (explore ℂ, stay framed).
      const dx = e.clientX - panLast.x;
      const dy = e.clientY - panLast.y;
      panLast = { x: e.clientX, y: e.clientY };
      plot.panSurface(dx, dy, canvas.clientHeight);
      redraw(true);
    } else if (orbitLast) {
      const dx = e.clientX - orbitLast.x;
      const dy = e.clientY - orbitLast.y;
      orbitLast = { x: e.clientX, y: e.clientY };
      // Landscape orbit (right-drag). A grab-turntable sense, so the surface follows the cursor on both axes:
      //  • horizontal: drag right spins the surface right. Azimuth is negated because +azimuth walks the eye
      //    screen-right, which would swing the surface the opposite way to the drag.
      //  • vertical: drag up tips the surface's near edge up toward you (elevation down, more side-on); drag
      //    down looks more top-down. The keyboard up/down below share this sense.
      plot.orbit(-dx * ORBIT_SPEED, dy * ORBIT_SPEED);
      redraw(true);
    } else if (grabWorld) {
      plot.setCenterAtScreen(e.clientX, e.clientY, grabWorld, twoDRect());
      redraw(true);
    } else {
      // Idle hover (no drag): update the value inspector for the pane under the cursor. 2D reads the
      // screen→world point; 3D picks the point on the surface; the Riemann surface ray-casts its sheets
      // (M3.1); the sphere has no pick, so blank the readout there rather than leaving stale values.
      const m = effMode(e.clientX);
      if (m === "riemann") updateProbeRiemann(e.clientX, e.clientY);
      else if (plot.mode === "riemann" && plot.riemannLinked && m === "2d") {
        // The base-plane pane of the linked Riemann view: the principal readout + the hover-link crosshair.
        updateProbe(e.clientX, e.clientY);
        setBranchText("—");
        linkedZ = plot.screenToWorld(e.clientX, e.clientY, twoDRect());
        drawRiemannLink();
      } else if (m === "2d") updateProbe(e.clientX, e.clientY);
      else if (m === "3d") updateProbe3d(e.clientX, e.clientY);
      else renderProbe(null);
    }
  });
  const endDrag = (e: PointerEvent): void => {
    const wasPinching = activePointers.size >= 2 && pinchPrev !== null;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchPrev = null;
    if (wasPinching && activePointers.size === 1) {
      // Pinch → one finger: re-seed a single-pointer drag for the survivor so it keeps panning /
      // orbiting from where it is, instead of going inert until it too is lifted.
      grabWorld = null;
      orbitLast = null;
      panLast = null;
      sphereLast = null;
      const survivor = activePointers.values().next().value as Pt;
      seedDrag(survivor.x, survivor.y);
      return;
    }
    if (loopPoints) {
      finalizeLoop(); // close the monodromy loop and estimate its permutation (M3.3)
      return;
    }
    if (sphereLast) {
      sphereLast = null;
      redraw(false);
    }
    if (orbitLast) {
      orbitLast = null;
      redraw(false);
    }
    if (panLast) {
      panLast = null;
      redraw(false);
      recomputeSingsSoon(); // the domain moved — refresh the (2D) zero/pole finder
    }
    if (grabWorld) {
      grabWorld = null;
      redraw(false);
      recomputeSingsSoon();
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  // Right-drag orbits the 3D landscape, so suppress the browser context menu over the plot canvas.
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  // Wheel zoom/dolly renders a DRAFT frame during the scroll burst and commits one full-res frame once
  // scrolling settles — the same draft-then-commit discipline as the pointer-drag path, instead of a
  // full-res repaint on every tick.
  let wheelCommitTimer = 0;
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const m = navMode(e.clientX);
      if (m === "sphere") plot.dollySphere(Math.pow(1.0012, e.deltaY));
      else if (m === "riemann") plot.dollyRiemann(Math.pow(1.0015, e.deltaY));
      else if (m === "3d") plot.zoomSpan(Math.pow(1.0015, e.deltaY)); // §B: scroll zooms the domain
      else plot.zoomAt(e.clientX, e.clientY, Math.pow(1.0015, e.deltaY), twoDRect());
      redraw(true);
      window.clearTimeout(wheelCommitTimer);
      wheelCommitTimer = window.setTimeout(() => {
        redraw(false);
        if (m === "2d") recomputeSingsSoon(); // zeros/poles only track the flat portrait
      }, 140);
    },
    { passive: false },
  );

  // Keyboard navigation (L7): arrows pan / orbit / arcball-step, +/- zoom / dolly, 0 or Home reset — the
  // same operations as the pointer path, dispatched by the current View mode.
  const applyNav = (intent: NavIntent): void => {
    if (plot.mode === "sphere") {
      const STEP = 0.06;
      if (intent === "reset") plot.resetSphere();
      else if (intent === "in") plot.dollySphere(0.9);
      else if (intent === "out") plot.dollySphere(1 / 0.9);
      else {
        const to: [number, number] =
          intent === "left"
            ? [0.5 - STEP, 0.5]
            : intent === "right"
              ? [0.5 + STEP, 0.5]
              : intent === "up"
                ? [0.5, 0.5 - STEP]
                : [0.5, 0.5 + STEP];
        plot.rotateSphere([0.5, 0.5], to);
      }
    } else if (plot.mode === "3d") {
      const STEP = 0.18;
      // Reset restores the default three-quarter camera AND the framing (centre + span), since pan/zoom
      // now move those in 3D too.
      if (intent === "reset") {
        plot.resetCamera();
        plot.view = { cx: 0, cy: 0, span: framingSpan };
      } else if (intent === "in") plot.zoomSpan(0.8); // §B: +/- zoom the domain (like 2D)
      else if (intent === "out") plot.zoomSpan(1.25);
      // Same grab-turntable sense as the right-drag orbit (surface follows the key): "left" → +azimuth,
      // "right" → −azimuth; "up" tips the near edge up (elevation down), "down" looks more top-down.
      else if (intent === "left") plot.orbit(STEP, 0);
      else if (intent === "right") plot.orbit(-STEP, 0);
      else if (intent === "up") plot.orbit(0, -STEP);
      else plot.orbit(0, STEP);
    } else if (plot.mode === "riemann") {
      const STEP = 0.18;
      if (intent === "reset") {
        plot.resetCamera();
        plot.resetRiemann();
      } else if (intent === "in") plot.dollyRiemann(0.85);
      else if (intent === "out") plot.dollyRiemann(1 / 0.85);
      else if (intent === "left") plot.orbit(STEP, 0);
      else if (intent === "right") plot.orbit(-STEP, 0);
      else if (intent === "up") plot.orbit(0, -STEP);
      else plot.orbit(0, STEP);
    } else {
      // 2D or the linked flat pane: keyboard pans / zooms the shared domain (moving both linked halves).
      const r = twoDRect();
      const midX = r.left + r.width / 2;
      const midY = r.top + r.height / 2;
      const asp = r.height > 0 ? r.width / r.height : 1;
      if (intent === "reset") plot.view = { cx: 0, cy: 0, span: framingSpan };
      else if (intent === "in") plot.zoomAt(midX, midY, 0.8, r);
      else if (intent === "out") plot.zoomAt(midX, midY, 1.25, r);
      else {
        const d = 0.15 * plot.view.span;
        const v = plot.view;
        plot.view = {
          cx: v.cx + (intent === "left" ? -d * asp : intent === "right" ? d * asp : 0),
          cy: v.cy + (intent === "up" ? d : intent === "down" ? -d : 0),
          span: v.span,
        };
      }
      recomputeSingsSoon();
    }
    redraw(false);
  };
  canvas.addEventListener("keydown", (e) => {
    const intent = keyToNav(e.key);
    if (!intent) return;
    e.preventDefault();
    applyNav(intent);
  });

  const observer = new ResizeObserver(() => redraw(false));
  observer.observe(canvas);

  drawLegends();
  setActive(active); // loads the active slot into the box + toggle and renders it (via applyExpr)

  // Seed saved parameter values from the share-link (applyExpr has already created the controls with
  // defaults for this formula's parameters); then reflect them in the pads, instruments, and render.
  if (initial.params && Object.keys(initial.params).length > 0) {
    for (const [name, v] of Object.entries(initial.params)) plot.setParamValue(name, v);
    paramControls.sync();
    animator.sync(); // reflect a saved `t` value in the scrubber/readout
    rebuildInstrumentFns();
    recomputeSings();
    redraw(false);
  }

  // Restore Riemann-surface settings from the share-link (setActive seeded the form's defaults; the link's
  // saved choices override them). Safe when the active map isn't a recognized primitive (reframe no-ops).
  plot.riemannHeightSource = initial.v3d.riemannHeight === 1 ? 1 : 0;
  plot.riemannSheets = initial.v3d.riemannSheets;
  plot.riemannLinked = initial.v3d.riemannLinked;
  plot.reframeRiemann();

  // Restore the saved render mode last (now that setView + its controls exist). The camera / height were
  // applied above, so a shared 3D landscape / linked / Riemann figure reopens exactly as it was framed.
  if (initial.v3d.mode !== "2d") setView(initial.v3d.mode);

  // A shared implicit-surface link (M2c) reopens in implicit mode with its `F(w,z)` source (this pins the
  // Riemann view, overriding the mode restore above).
  if (implicitMode) setImplicitMode(true);
}

// Run inside @cas/ui's fatal-error boundary (ADR-0028, U6). The plotter already catches a WebGL2/Plot
// construction failure into #error, and its #view canvas is already fully accessible (role/tabindex/label
// + its own keyboard in the static HTML), so this adds only the general case: an uncaught init throw
// OUTSIDE that inner try (decode, control wiring, …) now surfaces in the same #error banner instead of
// white-screening.
runWithFatalBoundary(main, {
  bannerId: "error",
  onError: (e) => console.error("Failed to initialize the plotter:", e),
  genericMessage: "Something went wrong starting the plotter. See the browser console for details.",
});
