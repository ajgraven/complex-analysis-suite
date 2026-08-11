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
// `≈`. A View toggle (2D / 3D / Sphere) swaps the flat portrait for the Phase-5 analytic **landscape**
// (a height surface, orbit/dolly, coloured by the same colorAt so top-down = the 2D portrait) or the
// **Riemann sphere** (a ray-cast of ℂ∪{∞}, arcball-rotated, so ∞ is the north pole) — all in render3d/.
// The ∞-inspector (plot f(1/z)) and export (Phase 6) round it out.
import "katex/dist/katex.min.css";
import katex from "katex";
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
  isLeftHalf,
  type NavIntent,
  type Pt,
} from "./ui/navigation.js";
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
  const sphereHint = byId("sphereHint");
  const surfaceControls = byId("surfaceControls");
  const heightModeSel = byId("heightMode");
  const heightScaleInput = byId("heightScale");
  const heightScaleVal = byId("heightScaleVal");
  const topDownBtn = byId("topDown");
  const resetViewBtn = byId("resetView");
  const specularInput = byId("specular");
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
  let framingSpan = initial.span;

  // Linked-view geometry (I7). In the linked mode the flat portrait fills the LEFT half of the canvas and
  // the surface the right half, so a client pixel is measured against the flat pane's rect (`twoDRect`) and
  // the effective interaction (`effMode`) depends on which half the cursor is in.
  const canvasRect = (): DOMRect => canvas.getBoundingClientRect();
  const twoDRect = (): DOMRect | ReturnType<typeof leftHalf> =>
    plot.mode === "linked" ? leftHalf(canvasRect()) : canvasRect();
  const effMode = (clientX: number): "2d" | "3d" | "sphere" => {
    const m = plot.mode;
    if (m === "linked") return isLeftHalf(clientX, canvasRect()) ? "2d" : "3d";
    return m;
  };

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
    v3d: {
      mode: plot.mode,
      azimuth: plot.camera.azimuth,
      elevation: plot.camera.elevation,
      distance: plot.camera.distance,
      ortho: plot.camera.ortho,
      heightMode: plot.heightMode,
      heightScale: plot.heightScale,
      specular: plot.specular,
    },
  });

  let hashTimer = 0;
  const scheduleHash = (): void => {
    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      history.replaceState(null, "", encodeState(currentState()));
    }, 350);
  };

  const redraw = (draft = false): void => {
    // On a committed frame in a surface mode, adapt the mesh density to the current zoom (§B) — a cheap
    // no-op when unchanged; skipped on draft frames so a zoom/drag burst never rebuilds mid-gesture.
    if (!draft && (plot.mode === "3d" || plot.mode === "linked")) plot.reconcileMeshResolution();
    plot.draw(draft);
    if (plot.mode !== "2d") {
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
      katex.render(`w = ${toLatex(parse(src))}`, previewEl, {
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
  const setView = (m: "2d" | "3d" | "sphere" | "linked"): void => {
    plot.mode = m;
    setPressed(view2d, m === "2d");
    setPressed(view3d, m === "3d");
    setPressed(viewSphere, m === "sphere");
    setPressed(viewLinked, m === "linked");
    // The surface height controls apply whenever a surface is on screen — the 3D view or the linked pane.
    if (surfaceControls instanceof HTMLElement)
      surfaceControls.hidden = m !== "3d" && m !== "linked";
    if (sphereHint instanceof HTMLElement) sphereHint.hidden = m !== "sphere";
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
    const bare = ["z", "c", "i", "e", "pi", "tau", "phi", "γ", ...plot.paramNames()];
    const names: Candidate[] = [...new Set(bare)].map((name) => ({ name, fn: false }));
    return [...fns, ...names];
  };
  if (
    (exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement) &&
    acMenu instanceof HTMLElement
  ) {
    // On accept, the value changed programmatically (no input event) — re-run the app's handling.
    createAutocomplete(exprInput, acMenu, acCandidates, () => {
      exprs[active] = exprInput.value;
      applyExpr(exprInput.value);
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
  const updateProbe = (clientX: number, clientY: number): void => {
    if (!(pz instanceof HTMLElement)) return;
    const z = plot.screenToWorld(clientX, clientY, twoDRect());
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
    const m = effMode(clientX);
    if (m === "sphere") sphereLast = canvasUv(clientX, clientY);
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
      // A second finger begins a pinch: abandon any single-pointer drag and seed the pinch span.
      grabWorld = null;
      orbitLast = null;
      panLast = null;
      sphereLast = null;
      const [a, b] = twoPointers();
      pinchPrev = pointerDistance(a, b);
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
      const m = effMode(mid.x);
      if (m === "sphere") plot.dollySphere(factor);
      else if (m === "3d") plot.zoomSpan(factor); // §B: pinch zooms the domain
      else plot.zoomAt(mid.x, mid.y, factor, twoDRect());
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
    } else if (effMode(e.clientX) === "2d") {
      updateProbe(e.clientX, e.clientY);
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
      const m = effMode(e.clientX);
      if (m === "sphere") plot.dollySphere(Math.pow(1.0012, e.deltaY));
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

  // Restore the saved render mode last (now that setView + its controls exist). The camera / height were
  // applied above, so a shared 3D landscape / linked figure reopens exactly as it was framed.
  if (initial.v3d.mode !== "2d") setView(initial.v3d.mode);
}

main();
