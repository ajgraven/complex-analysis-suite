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
import { findSingularities, type Singularities } from "./analysis/singularities.js";
import {
  decodeState,
  encodeState,
  shareUrl,
  type PlotterState,
} from "./state/viewState.js";

const DEFAULTS: PlotterState = {
  expr: "z^2",
  exprF: "z^2",
  exprG: "1/z",
  active: "f",
  cx: 0,
  cy: 0,
  span: 2,
  colormap: 0,
  modulus: 2,
  enhance: 0,
  sectors: 12,
  crisp: 1,
  hueShift: 0,
  hueSign: 1,
  params: {},
  anim: { ...DEFAULT_ANIM },
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
  const inspectInfInput = byId("inspectInf");
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
    plot = new Plot(canvas, "z^2");
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
  let framingSpan = initial.span;

  // Two function slots (catalog A7). One expression box edits the ACTIVE slot; a toggle switches which
  // slot is active (and therefore plotted). Both persist in the share-link.
  const exprs: Record<"f" | "g", string> = { f: initial.exprF, g: initial.exprG };
  let active: "f" | "g" = initial.active;

  let probeFn: ((z: Complex, c: Complex) => Complex) | null = null;
  let fpFn: ((z: Complex, c: Complex) => Complex) | null = null;
  let sings: Singularities | null = null;
  let markSings = false;
  let inspectInfinity = false; // ∞-inspector (F8): plot f(1/z). Transient (not persisted).
  // Keep the parsed f (and its z-derivative, when holomorphic) so the CPU instruments can be rebuilt
  // with the current parameter values baked in — without re-parsing — whenever a parameter moves.
  let fAst: Node | null = null;
  let fpAst: Node | null = null;
  const rebuildInstrumentFns = (): void => {
    if (!fAst) {
      probeFn = null;
      fpFn = null;
      return;
    }
    const params = plot.paramsRecord(); // GLSL and JS read the same parameter values (dual-backend)
    probeFn = makeComplexFn(fAst, params);
    fpFn = fpAst ? makeComplexFn(fpAst, params) : null;
  };
  const updateFns = (src: string): void => {
    try {
      let ast = parse(src);
      if (inspectInfinity) ast = substitute(ast, "z", parse("1/z")); // instruments track f(1/z) too
      fAst = ast;
      try {
        fpAst = differentiate(fAst, "z");
      } catch {
        fpAst = null; // non-holomorphic — the singularity finder needs f'
      }
    } catch {
      fAst = null;
      fpAst = null;
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
  });

  let hashTimer = 0;
  const scheduleHash = (): void => {
    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      history.replaceState(null, "", encodeState(currentState()));
    }, 350);
  };

  const redraw = (draft = false): void => {
    plot.draw(draft);
    if (plot.mode !== "2d") {
      // The axes / grid / markers are 2D-projection overlays; in the 3D landscape or on the sphere they'd
      // be wrong, so clear the overlay canvas and let the surface / sphere stand alone.
      const ax = axesCanvas.getContext("2d");
      if (ax) ax.clearRect(0, 0, axesCanvas.width, axesCanvas.height);
    } else {
      drawAxes(axesCanvas, plot.view, canvas.clientWidth, canvas.clientHeight);
      if (markSings && sings)
        drawMarkers(
          axesCanvas,
          plot.view,
          canvas.clientWidth,
          canvas.clientHeight,
          sings,
        );
    }
    // Only committed frames update the share-link — a draft (drag / animation frame) settles with a
    // full redraw, so this keeps the hash off the per-frame path (no history churn while `t` plays).
    if (!draft) scheduleHash();
  };

  const showCounts = (): void => {
    if (!(singCount instanceof HTMLElement)) return;
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
  };
  const recomputeSings = (): void => {
    if (markSings && probeFn) {
      const aspect =
        canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
      sings = findSingularities(probeFn, fpFn, plot.view, aspect);
    } else {
      sings = null;
    }
    showCounts();
  };
  let singTimer = 0;
  const recomputeSingsSoon = (): void => {
    if (!markSings) return;
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
    if (!(precisionBadge instanceof HTMLElement)) return;
    const note = fAst ? precisionNote(calledFunctions(fAst)) : null;
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

  const applyExpr = (src: string): void => {
    try {
      plot.setFunction(src);
      setError("");
      renderPreview(src);
      updateFns(src);
      updatePrecisionBadge();
      syncParamsUI();
      recomputeSings();
      redraw(false);
    } catch (err) {
      if (err instanceof ExprError) {
        setError(err.pos >= 0 ? `${err.message} (position ${err.pos})` : err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const setExprBox = (src: string): void => {
    if (exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement)
      exprInput.value = src;
  };

  // The active-function toggle (A7): switch which slot is edited + plotted, loading its source.
  const setActive = (which: "f" | "g"): void => {
    active = which;
    if (fnF instanceof HTMLElement) fnF.classList.toggle("active", which === "f");
    if (fnG instanceof HTMLElement) fnG.classList.toggle("active", which === "g");
    if (exprLabel instanceof HTMLElement) exprLabel.textContent = `Function  ${which}(z)`;
    setExprBox(exprs[which]);
    applyExpr(exprs[which]);
  };
  if (fnF instanceof HTMLElement) fnF.addEventListener("click", () => setActive("f"));
  if (fnG instanceof HTMLElement) fnG.addEventListener("click", () => setActive("g"));

  // View toggle 2D / 3D landscape / Sphere (Phase 5). Each mode swaps the pointer interaction (pan+zoom /
  // orbit+dolly / arcball+dolly — handled in the pointer code) and shows its own controls.
  const ORBIT_SPEED = 0.01; // radians of orbit per pixel of drag
  const setView = (m: "2d" | "3d" | "sphere"): void => {
    plot.mode = m;
    if (view2d instanceof HTMLElement) view2d.classList.toggle("active", m === "2d");
    if (view3d instanceof HTMLElement) view3d.classList.toggle("active", m === "3d");
    if (viewSphere instanceof HTMLElement)
      viewSphere.classList.toggle("active", m === "sphere");
    if (surfaceControls instanceof HTMLElement) surfaceControls.hidden = m !== "3d";
    if (sphereHint instanceof HTMLElement) sphereHint.hidden = m !== "sphere";
    redraw(false);
  };
  if (view2d instanceof HTMLElement)
    view2d.addEventListener("click", () => setView("2d"));
  if (view3d instanceof HTMLElement)
    view3d.addEventListener("click", () => setView("3d"));
  if (viewSphere instanceof HTMLElement)
    viewSphere.addEventListener("click", () => setView("sphere"));
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
    exprInput.addEventListener("input", () => {
      exprs[active] = exprInput.value; // keep the active slot in sync with the box
      applyExpr(exprInput.value);
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
  const exportMeta = (): Record<string, string> => ({
    Software: "Complex Function Plotting Tool",
    "cfp:url": shareUrl(currentState()),
  });
  if (savePngBtn instanceof HTMLElement) {
    savePngBtn.addEventListener("click", () => {
      void plot.exportBlob(exportEdge(), exportMeta()).then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "complex-function-plot.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
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
    const z = plot.screenToWorld(clientX, clientY);
    pz.textContent = fmtComplex(z);
    if (!probeFn) return;
    let w: Complex;
    try {
      w = probeFn(z, [0, 0]);
    } catch {
      w = [NaN, NaN];
    }
    if (pfz instanceof HTMLElement) pfz.textContent = fmtComplex(w);
    if (pabs instanceof HTMLElement) pabs.textContent = fmtNum(Math.hypot(w[0], w[1]));
    if (parg instanceof HTMLElement) parg.textContent = fmtNum(Math.atan2(w[1], w[0]));
  };

  // 2D: pan + zoom-to-cursor, probe when idle. 3D: orbit + dolly. Sphere: arcball rotate + dolly.
  let grabWorld: Complex | null = null;
  let orbitLast: { x: number; y: number } | null = null;
  let sphereLast: [number, number] | null = null;
  const canvasUv = (clientX: number, clientY: number): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [
      r.width > 0 ? (clientX - r.left) / r.width : 0,
      r.height > 0 ? (clientY - r.top) / r.height : 0,
    ];
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (plot.mode === "sphere") sphereLast = canvasUv(e.clientX, e.clientY);
    else if (plot.mode === "3d") orbitLast = { x: e.clientX, y: e.clientY };
    else grabWorld = plot.screenToWorld(e.clientX, e.clientY);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic / already-released pointer can't be captured — harmless */
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (sphereLast) {
      const uv = canvasUv(e.clientX, e.clientY);
      plot.rotateSphere(sphereLast, uv);
      sphereLast = uv;
      redraw(true);
    } else if (orbitLast) {
      const dx = e.clientX - orbitLast.x;
      const dy = e.clientY - orbitLast.y;
      orbitLast = { x: e.clientX, y: e.clientY };
      plot.orbit(dx * ORBIT_SPEED, -dy * ORBIT_SPEED); // drag right → spin; drag up → tilt toward top-down
      redraw(true);
    } else if (grabWorld) {
      plot.setCenterAtScreen(e.clientX, e.clientY, grabWorld);
      redraw(true);
    } else if (plot.mode === "2d") {
      updateProbe(e.clientX, e.clientY);
    }
  });
  const endDrag = (): void => {
    if (sphereLast) {
      sphereLast = null;
      redraw(false);
    }
    if (orbitLast) {
      orbitLast = null;
      redraw(false);
    }
    if (grabWorld) {
      grabWorld = null;
      redraw(false);
      recomputeSingsSoon();
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (plot.mode === "sphere") {
        plot.dollySphere(Math.pow(1.0012, e.deltaY));
        redraw(false);
      } else if (plot.mode === "3d") {
        plot.dolly(Math.pow(1.0012, e.deltaY));
        redraw(false);
      } else {
        plot.zoomAt(e.clientX, e.clientY, Math.pow(1.0015, e.deltaY));
        redraw(false);
        recomputeSingsSoon();
      }
    },
    { passive: false },
  );

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
}

main();
