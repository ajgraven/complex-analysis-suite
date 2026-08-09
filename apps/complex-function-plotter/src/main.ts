// Complex Function Plotting Tool — Phase 1 (Milestones 1A + 1B): a live 2D domain-coloring plotter.
//
// Type f(z) (or pick a preset); it is parsed and compiled by @cas/expr (to GLSL for the render and to
// a JS evaluator for the cursor probe), typeset live with KaTeX, and drawn by the layered coloring
// engine. Pan / zoom / reset, a coordinate grid + scale bar, phase-wheel and modulus legends, a cursor
// readout, share-links (#vs= via @cas/interchange), and PNG export. Enhanced portraits, instruments,
// and the 3D views come in later phases.
import "katex/dist/katex.min.css";
import katex from "katex";
import { parse } from "@cas/expr/parser";
import { toLatex } from "@cas/expr/latex";
import { ExprError } from "@cas/expr/ast";
import { makeComplexFn } from "@cas/expr/evaluate";
import { differentiate } from "@cas/expr/derivative";
import type { Complex } from "@cas/expr/complex";
import { Plot } from "./render/plot.js";
import { COLORMAPS } from "./render/colormaps.js";
import { PRESETS } from "./presets.js";
import { drawModulusBar, drawPhaseWheel } from "./ui/legends.js";
import { drawAxes } from "./ui/axes.js";
import { drawMarkers } from "./ui/markers.js";
import { findSingularities, type Singularities } from "./analysis/singularities.js";
import { decodeState, encodeState, shareUrl, type PlotterState } from "./state/viewState.js";

const DEFAULTS: PlotterState = {
  expr: "z^2",
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
  const previewEl = byId("preview");
  const errorEl = byId("error");
  const colormapSel = byId("colormap");
  const modulusSel = byId("modulus");
  const presetSel = byId("preset");
  const enhanceSel = byId("enhance");
  const sectorsInput = byId("sectors");
  const sectorsVal = byId("sectorsVal");
  const crispInput = byId("crisp");
  const hueShiftInput = byId("hueShift");
  const hueSignInput = byId("hueSign");
  const cvdSel = byId("cvd");
  const markSingsInput = byId("markSings");
  const singCount = byId("singCount");
  const uncInput = byId("uncertainty");
  const levelAbsInput = byId("levelAbs");
  const levelArgInput = byId("levelArg");
  const levelArgOnInput = byId("levelArgOn");
  const homeBtn = byId("home");
  const savePngBtn = byId("savePng");
  const copyLinkBtn = byId("copyLink");
  const wheelCanvas = byId("wheel");
  const modbarCanvas = byId("modbar");
  const pz = byId("pz");
  const pfz = byId("pfz");
  const pabs = byId("pabs");
  const parg = byId("parg");
  if (!(canvas instanceof HTMLCanvasElement) || !(axesCanvas instanceof HTMLCanvasElement)) return;

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

  let probeFn: ((z: Complex, c: Complex) => Complex) | null = null;
  let fpFn: ((z: Complex, c: Complex) => Complex) | null = null;
  let sings: Singularities | null = null;
  let markSings = false;
  const updateFns = (src: string): void => {
    try {
      const ast = parse(src);
      probeFn = makeComplexFn(ast);
      try {
        fpFn = makeComplexFn(differentiate(ast, "z"));
      } catch {
        fpFn = null; // non-holomorphic — the singularity finder needs f'
      }
    } catch {
      probeFn = null;
      fpFn = null;
    }
  };

  const exprValue = (): string =>
    exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement
      ? exprInput.value
      : "z^2";

  const currentState = (): PlotterState => ({
    expr: exprValue(),
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
    drawAxes(axesCanvas, plot.view, canvas.clientWidth, canvas.clientHeight);
    if (markSings && sings)
      drawMarkers(axesCanvas, plot.view, canvas.clientWidth, canvas.clientHeight, sings);
    scheduleHash();
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
      const aspect = canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
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

  const applyExpr = (src: string): void => {
    try {
      plot.setFunction(src);
      setError("");
      renderPreview(src);
      updateFns(src);
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

  const drawLegends = (): void => {
    if (wheelCanvas instanceof HTMLCanvasElement)
      drawPhaseWheel(wheelCanvas, plot.color.colormap, plot.color.hueShift, plot.color.hueSign);
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
      if (sectorsVal instanceof HTMLElement) sectorsVal.textContent = String(plot.color.sectors);
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
      if (exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement)
        exprInput.value = preset.expr;
      plot.view = { cx: 0, cy: 0, span: preset.span };
      framingSpan = preset.span;
      applyExpr(preset.expr);
      presetSel.value = "";
    });
  }

  if (exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement) {
    exprInput.value = initial.expr;
    exprInput.addEventListener("input", () => applyExpr(exprInput.value));
  }

  if (homeBtn instanceof HTMLElement) {
    homeBtn.addEventListener("click", () => {
      plot.view = { cx: 0, cy: 0, span: framingSpan };
      recomputeSings();
      redraw(false);
    });
  }
  if (savePngBtn instanceof HTMLElement) {
    savePngBtn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = plot.toDataURL();
      a.download = "complex-function-plot.png";
      a.click();
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

  // Pan (grab-and-drag) + zoom-to-cursor; probe when not dragging.
  let grabWorld: Complex | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    grabWorld = plot.screenToWorld(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (grabWorld) {
      plot.setCenterAtScreen(e.clientX, e.clientY, grabWorld);
      redraw(true);
    } else {
      updateProbe(e.clientX, e.clientY);
    }
  });
  const endPan = (): void => {
    if (grabWorld) {
      grabWorld = null;
      redraw(false);
      recomputeSingsSoon();
    }
  };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      plot.zoomAt(e.clientX, e.clientY, Math.pow(1.0015, e.deltaY));
      redraw(false);
      recomputeSingsSoon();
    },
    { passive: false },
  );

  const observer = new ResizeObserver(() => redraw(false));
  observer.observe(canvas);

  drawLegends();
  applyExpr(initial.expr);
}

main();
