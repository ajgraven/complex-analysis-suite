/**
 * Application entry point. Creates the two WebGL2 plots wrapped in {@link PlotView}
 * (fractal + overlay + interaction), wires the apply/preset orchestration, the
 * parameter→dynamical coupling (the dynamical plane is the Julia set of the
 * parameter-space white point), high-resolution PNG export, input validation, and
 * graceful handling of a browser without WebGL2.
 */

import "./styles/main.css";
import type { Vec2 } from "./arrays";
import { argDegrees, formatComplex, parseComplex, truncateComplex, type Complex } from "./complex";
import { PROJECTIONS, type ProjectionMode } from "./render/projection";
import { getMaxTextureSize, downloadCanvas } from "./hiResExport";
import { PlotView } from "./render/plotView";
import type { GLPlot, FractType } from "./render/glPlot";
import { initialRes } from "./render/glPlot";
import { ddCenterToString, ddCenterFromString, ddToNumber } from "./render/dd";
import {
  inspect,
  findNucleus,
  findMisiurewicz,
  fatouComponentType,
  type InspectResult,
} from "./render/inspect";
import { matingVerdict } from "./render/mating";
import { CANONICAL_MATINGS, mateBulbWithBasilica, mateBulbs, mateableLimbs } from "./render/matingEngine";
import { computeOrbit, orbitAndClassify, type Annotation, type OrbitFate } from "./render/overlay";
import { toNumber as angleToNumber, binaryItinerary } from "./combinatorics/angles";
import { coreEntropy } from "./combinatorics/coreEntropy";
import { MAX_DOUBLING_Q, portraitSummary, rotationCycleAngles } from "./combinatorics/orbitPortrait";
import {
  dynatomicDegreeInZ,
  dynatomicText,
  gleasonDegree,
  gleasonText,
  mandelbrotCenters,
  multiplierSpecializationRoots,
} from "./combinatorics/dynatomic";
import type { ComplexTuple } from "@cas/core";
import { Gauss } from "@cas/exact";
import {
  AddressError,
  formatKneading,
  formatTower,
  internalAddressFromAngle,
  parseInternalAddress,
  stripExternalAngles,
} from "./combinatorics/stripping";
import { nearestDynamicalAngles, nearestParameterAngles } from "./render/angleOfPoint";
import { dynamicalLanding, landingForAngle, parameterLanding } from "./render/angleParameter";
import { detectHermanRing } from "./render/hermanRing";
import { detectUnderIteration } from "./render/underIteration";
import { escapeIsMeaningless, precisionExhausted, precisionMetric } from "./render/viewAdvisories";
import { SuggestionEngine, type Advisor } from "./ui/suggestions";
import {
  DEFAULT_PROFILE,
  PROFILE_LABELS,
  PROFILE_ORDER,
  PROFILES,
  sameSettings,
  type ProfileName,
  type ProfileSettings,
} from "./state/profiles";
import { getComplexFn } from "@cas/expr/evaluate";
import {
  juliaConnected,
  juliaExteriorCoeffs,
  polynomialJuliaExteriorCoeffs,
  rationalExteriorCoeffs,
  mandelbrotExteriorCoeffs,
} from "./render/uniformize";
import { fToRational } from "@cas/expr/rational";
import { computeJuliaProperties, type Extent } from "./render/juliaProperties";
import { JuliaMetricsClient } from "./render/juliaMetricsClient";
import { polynomialCoeffs, polynomialConnectivity } from "./render/critical";
import { drawOrbitPreview, renderJuliaPreview } from "./render/orbitPreview";
import type { Node as ExprNode } from "@cas/expr/ast";
import { dynamicRay, parameterRay, parseAngle, rayDepthForZoom } from "./render/rays";
import { criticalPieceMask } from "./render/yoccozCritical";
import { yoccozPuzzle } from "./render/yoccozPuzzle";
import { dynamicalLamination, parameterLamination, type Leaf } from "./render/lamination";
import { dynPresets, paramPresets, type Preset, type PresetName } from "./presets";
import { byId } from "./ui/dom";
import { showToast } from "./ui/toast";
import { GLOSSARY, CONVENTIONS, type GlossaryEntry } from "./ui/glossary";
import { validateInputs, type FieldError } from "./ui/validate";
import { DEFAULT_GRADIENT, type PaletteName } from "./palettes";
import { describeLegend } from "./render/legend";
import { renderLegend } from "./ui/plotLegend";
import { parseGradientStops, setupGradientEditor } from "./ui/gradient";
import { canRecord, startRecording, downloadBlob } from "./ui/recorder";
import { coeffsToCsv, coeffsToText, inspectToText, orbitToCsv } from "./ui/dataExport";
import { interpolateView, type Keyframe } from "./render/keyframes";
import {
  readAppState,
  applyAppState,
  encodeState,
  decodeState,
  loadSavedViews,
  saveSavedViews,
  type AppState,
} from "./state/appState";
import {
  encodeSigmaState,
  parseSigmaState,
  schwarzStampParams,
  SIGMA_TONE_DEFAULTS,
  type SigmaViewState,
} from "./state/schwarzState";
import { decodeLink, validateEnvelope, type Envelope, type SchwarzMap } from "@cas/interchange";
import {
  envelopeToMapSpec,
  mapSpecToExpr,
  schwarzEngineFromMapSpec,
  schwarzPhiFromMapSpec,
} from "./interchange/importMap";
import {
  renderSchwarzField,
  schwarzBoundaryPoly,
  panSchwarzView,
  zoomSchwarzView,
  uvToPlotFrac,
  schwarzOrbitAt,
  schwarzOrbitLabel,
  parseSchwarzViewInput,
  formatSchwarzViewFields,
  SCHWARZ_ZOOM_MIN,
  SCHWARZ_ZOOM_MAX,
  type SchwarzView,
  type SchwarzOrbit,
} from "./render/schwarzView";
import { drawSchwarzOrbit } from "./render/schwarzOrbitOverlay";
import { renderSchwarzLegend } from "./render/schwarzLegend";
import { drawScaleBar } from "./render/overlay";
import { createSchwarzGLRenderer, type SchwarzGLRenderer } from "./render/schwarzGL";
import { makeBoundedSchwarz, makeUnboundedLaurentSchwarz } from "@cas/schwarz";
import { buildSchwarzPhi, SCHWARZ_PRESETS, type SchwarzPhi } from "./render/schwarzPhiForm";
import {
  SCHWARZ_COLORMAP_NAMES,
  SCHWARZ_SCALE_MODES,
  SCHWARZ_COLOR_MODES,
  SCHWARZ_TRAP_SHAPES,
  DEFAULT_SCHWARZ_COLORMAP,
  DEFAULT_SCHWARZ_SCALE,
  DEFAULT_SCHWARZ_COLOR_MODE,
  DEFAULT_SCHWARZ_TRAP_SHAPE,
} from "./render/schwarzColormaps";
import { PLACES } from "./state/places";
import { decodeNotes, encodeNotes, type Note } from "./state/notes";
import GIF from "gif.js";
import gifWorkerUrl from "gif.js/dist/gif.worker.js?url";
import katex from "katex";
import "katex/dist/katex.min.css";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  CENTER_SUB_IDS,
  INPUT_IDS,
  clearAllInvalid,
  formatZoom,
  getCInput,
  getDynCenterInput,
  getDynEscInput,
  getDynNInput,
  getDynResInput,
  getDynZoomInput,
  getFInput,
  getParamCenterInput,
  getParamEscInput,
  getParamNInput,
  getParamResInput,
  getParamZoomInput,
  markInvalid,
  populateInputs,
  setCInput,
  setDynCenterInput,
  setDynZoomInput,
  setParamCenterInput,
  setParamZoomInput,
} from "./ui/controls";

/** Coloring "mode" and "palette" dropdown values → shader uniform indices. */
const MODES: Record<string, number> = {
  escape: 0,
  smooth: 1,
  distance: 2,
  distanceAnalytic: 11,
  orbit: 3,
  domain: 4,
  histogram: 5,
  stripe: 7,
  triangle: 8,
  decomposition: 9,
  period: 10,
  multiplier: 12,
  marty: 13,
  newtonBasins: 14,
  interiorDE: 15,
};
const PALETTES: Record<string, number> = {
  classic: 0,
  viridis: 1,
  magma: 2,
  grayscale: 3,
  custom: 4,
  cividis: 5,
};
/** Orbit-trap shape dropdown values → shader uniform indices. */
const TRAPS: Record<string, number> = {
  cross: 0,
  point: 1,
  line: 2,
  circle: 3,
  lattice: 4,
};

/** Show the WebGL2-unavailable banner (or a generic init error) and stop. */
function showFatalBanner(message: string): void {
  const banner = document.getElementById("webgl-error");
  if (banner) {
    banner.textContent = message;
    banner.hidden = false;
  }
}

/** Format a plot coordinate as a complex number for the hover readout. */
function formatCoord([x, y]: Vec2): string {
  const f = (v: number): string => Number(v.toPrecision(6)).toString();
  return `${f(x)} ${y >= 0 ? "+" : "-"} ${f(Math.abs(y))}i`;
}

/** Build an `onHover` handler that writes the coordinate into a readout element. */
function hoverReadout(elementId: string): (coord: Vec2 | null) => void {
  const el = byId(elementId);
  return (coord) => {
    el.textContent = coord ? formatCoord(coord) : "";
  };
}

const FATE_TEXT: Record<OrbitFate, string> = {
  escaped: "escapes to ∞",
  converged: "settles to a fixed point",
  periodic: "settles into a cycle",
  undetermined: "no escape or cycle within the iteration limit",
};

/**
 * Is the plot's f the QUADRATIC family z²+c? The gate for every overlay whose mathematics is
 * hard-coded quadratic — external rays and ray pairs (`rays.ts` iterates z ← z²+c), Farey bulb
 * labels (`farey.ts` bulbRoot = μ/2 − μ²/4), the inverse-iteration Julia cloud and Siegel curves
 * (`inverseJulia.ts` β = (1+√(1−4c))/2), the Yoccoz puzzle and parapuzzle (`yoccozPuzzle.ts`
 * α = (1−√(1−4c))/2), the lamination/QML, and the "Mandelbrot set" legend name.
 *
 * These were gated on `plot.perturbationEligible`, which is NOT an is-quadratic flag: glPlot sets it
 * for any monic z^d+c with d ≤ 8, and for general additive-c polynomials. The shipped `cubic` and
 * `biomorph` presets are z³+c, so they passed the gate and the overlays drew z²+c objects on a
 * cubic picture as fact — including labelling the parameter plane "Mandelbrot set", and silently
 * skipping updateYoccoz's own caveat string ("The Yoccoz puzzle is defined for z²+c"), which was
 * unreachable precisely because the gate passed.
 *
 * `perturbationEligible` remains correct where PERTURBATION itself is the subject.
 */
const isQuadraticFamily = (plot: { monicDegree: number | null }): boolean => plot.monicDegree === 2;

/** Opens the glossary modal at an optional term anchor; assigned by setupGlossary(). */
let openGlossary: (termId?: string) => void = () => {};

/** Inspector row label → glossary term id, for the inline "?" links. */
const TERM_FOR_ROW: Record<string, string> = {
  Fate: "escape-time",
  Period: "period",
  "Multiplier λ": "multiplier",
  "Fatou component": "fatou-component",
  "Rotation number": "siegel-disc",
  "Internal angle": "internal-angle",
  Limb: "mating",
  "Distance to set": "distance-estimate",
};

/** Parse a rotation number θ from the Siegel input: a decimal, a fraction p/q, or the named
 *  bounded-type constants 'golden'/'silver'. Returns null on unparseable input. */
function parseRotationNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === "golden") return (Math.sqrt(5) - 1) / 2;
  if (s === "silver") return Math.SQRT2 - 1;
  const frac = /^(-?\d*\.?\d+)\s*\/\s*(-?\d*\.?\d+)$/.exec(s);
  if (frac) {
    const q = Number(frac[2]);
    return q !== 0 ? Number(frac[1]) / q : null;
  }
  const v = Number(s);
  return s !== "" && Number.isFinite(v) ? v : null;
}

/** Parse a bulb rotation number "p/q" (integers) into [p, q], or null. */
function parseFraction(raw: string): [number, number] | null {
  const m = /^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/.exec(raw);
  if (!m) return null;
  const q = Number(m[2]);
  return q !== 0 ? [Number(m[1]), q] : null; // reject p/0 — a zero denominator divides to NaN/∞ downstream
}

/** Compute + render the conjugate-limb mateability verdict for the two #mate-* bulb inputs. */
function updateMatingVerdict(): void {
  const a = parseFraction(byId<HTMLInputElement>("mate-a").value);
  const b = parseFraction(byId<HTMLInputElement>("mate-b").value);
  const out = byId("mate-verdict");
  const v = a && b ? matingVerdict(a[0], a[1], b[0], b[1]) : null;
  if (!v || !v.valid || !v.a || !v.b) {
    out.textContent = "Enter two bulbs as fractions p/q (e.g. 1/3).";
    return;
  }
  const A = `${v.a[0]}/${v.a[1]}`;
  const B = `${v.b[0]}/${v.b[1]}`;
  out.textContent = v.mateable
    ? `✓ ${A} ⊔ ${B} are mateable — their limbs are not conjugate.`
    : `✗ ${A} ⊔ ${B} are NOT mateable — they lie in complex-conjugate limbs.`;
}

/** Render a click-to-inspect orbit report into the inspector panel. */
function showInspect(info: InspectResult, point: Vec2, plane: FractType): void {
  const pt = truncateComplex([point[0], point[1]]);
  byId("inspector-title").textContent =
    plane === "param" ? `Parameter c = ${formatComplex(pt)}` : `Orbit of z₀ = ${formatComplex(pt)}`;

  const rows: [string, string][] = [["Fate", FATE_TEXT[info.fate]]];
  if (info.fate === "escaped") rows.push(["Escape time", `${info.escapeIter} iterations`]);
  if (info.period > 0) rows.push(["Period", String(info.period)]);
  if (info.multiplier && info.multiplierMag !== null) {
    const deg = argDegrees(info.multiplier);
    // Classify with a tolerance so neutral / parabolic cycles (|λ| = 1) are not rounded into
    // "attracting"/"repelling" — matches the Julia panel's neutral band (juliaProperties.ts).
    const kind =
      Math.abs(info.multiplierMag - 1) < 1e-3
        ? "indifferent (neutral)"
        : info.multiplierMag < 1
          ? "attracting"
          : "repelling";
    rows.push([
      "Multiplier λ",
      `${info.multiplierMag.toFixed(4)} ∠ ${deg.toFixed(0)}° (${kind})`,
    ]);
  }
  // Name the Fatou component from λ, and for an indifferent irrational rotation add the
  // rotation number + Brjuno verdict (Siegel disc vs near-Cremer) with an estimated radius.
  const fatou = fatouComponentType(info.multiplier, info.multiplierMag);
  if (fatou) {
    const FATOU_LABEL: Record<string, string> = {
      superattracting: "superattracting (centre)",
      attracting: "attracting basin",
      repelling: "repelling (Julia set)",
      parabolic: "parabolic",
      siegel: "Siegel disc",
      cremer: "Cremer point",
      neutral: "neutral",
    };
    rows.push(["Fatou component", FATOU_LABEL[fatou.type]]);
    if (
      fatou.theta !== null &&
      fatou.rotation &&
      (fatou.type === "siegel" || fatou.type === "cremer")
    ) {
      const r = fatou.rotation;
      rows.push([
        "Rotation number",
        fatou.type === "cremer"
          ? `θ ≈ ${fatou.theta.toFixed(6)} (near-Cremer — disc ≈ 0)`
          : `θ ≈ ${fatou.theta.toFixed(6)} (${r.kind}; disc radius ≈ ${r.conformalRadius.toExponential(1)})`,
      ]);
    }
  }
  if (info.rotation) rows.push(["Internal angle", `${info.rotation.p}/${info.rotation.q}`]);
  // On the parameter plane the rotation number p/q names the main-cardioid limb; show its
  // complex-conjugate limb and whether it self-mates (every bulb but the 1/2 limb does).
  if (plane === "param" && info.rotation) {
    const limb = matingVerdict(info.rotation.p, info.rotation.q, info.rotation.p, info.rotation.q);
    if (limb.conjugateOfA) {
      rows.push([
        "Limb",
        `conjugate ${limb.conjugateOfA[0]}/${limb.conjugateOfA[1]} · self-mateable: ${limb.mateable ? "yes" : "no"}`,
      ]);
    }
  }
  if (info.distance !== null) rows.push(["Distance to set", info.distance.toExponential(2)]);

  const body = byId("inspector-body");
  body.replaceChildren();
  for (const [key, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const term = TERM_FOR_ROW[key];
    if (term) {
      const q = document.createElement("button");
      q.type = "button";
      q.className = "gloss-link";
      q.textContent = "?";
      q.setAttribute("aria-label", `Define ${key}`);
      q.addEventListener("click", () => openGlossary(term));
      dt.append(" ", q);
    }
    const dd = document.createElement("dd");
    dd.textContent = value;
    body.append(dt, dd);
  }
  byId("inspector").hidden = false;
}

/**
 * Run the guided walkthrough (driver.js). Shared by the app-bar "tour" button and the
 * first-run onboarding card, and refreshed to cover the measurement/overlay instruments.
 */
function startTour(): void {
  // Expand the Overlays group so its tour step shows the actual toggles, not just the header.
  document.getElementById("overlays-group")?.setAttribute("open", "");
  driver({
    showProgress: true,
    steps: [
      {
        element: "#MCSCanvas",
        popover: {
          title: "Parameter space",
          description:
            "Each point is a value of c. Drag the white point to choose c — the dynamical plane updates live.",
        },
      },
      {
        element: "#JCSCanvas",
        popover: {
          title: "Dynamical plane",
          description:
            "The Julia-style set for the chosen c. Drag its white point to move the orbit start.",
        },
      },
      {
        element: "#inspector",
        popover: {
          title: "Point inspector",
          description:
            "Click any point on either plot to read its orbit — period, multiplier λ, internal angle p/q, and distance to the set.",
        },
      },
      {
        element: "#inpf",
        popover: {
          title: "Function f(z, c)",
          description: "Edit the iterated function — it is typeset live just below.",
        },
      },
      {
        element: "#fractal_presets",
        popover: {
          title: "Presets",
          description: "Jump to a built-in family — Mandelbrot, burning ship, magnet, and more.",
        },
      },
      {
        element: "#mode",
        popover: {
          title: "Colouring",
          description:
            "Pick how escape time becomes colour — including the analytic distance and relief modes — plus a palette.",
        },
      },
      {
        element: "#overlays-group",
        popover: {
          title: "Overlays",
          description:
            "Annotate the dynamics: the critical orbit, Farey bulb labels, external rays, and equipotential contours.",
        },
      },
      {
        element: "#places",
        popover: {
          title: "Places",
          description:
            "Fly to famous locations — Seahorse Valley, the Feigenbaum point, a Misiurewicz point, and more.",
        },
      },
    ],
  }).drive();
}

/** Wire the app-bar "tour" button to the guided walkthrough. */
function setupTour(): void {
  document.getElementById("tour-btn")?.addEventListener("click", startTour);
}

/** Colour-theme toggle cycling auto → dark → light, persisted in localStorage. */
function setupTheme(): void {
  const btn = document.getElementById("theme-btn");
  if (!btn) return;
  const read = (): string | null => {
    try {
      return localStorage.getItem("theme");
    } catch {
      return null;
    }
  };
  const apply = (mode: string | null): void => {
    if (mode === "light" || mode === "dark") {
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    btn.textContent = `Theme: ${mode ?? "auto"}`;
  };
  let mode = read(); // null = follow the OS
  apply(mode);
  btn.addEventListener("click", () => {
    mode = mode === null ? "dark" : mode === "dark" ? "light" : null;
    try {
      if (mode) localStorage.setItem("theme", mode);
      else localStorage.removeItem("theme");
    } catch {
      /* storage unavailable (private mode) — keep the in-memory choice */
    }
    apply(mode);
  });
}

/**
 * Mobile-only controls bottom sheet: a floating button toggles the `.controls-pane` sheet
 * (the slide is CSS-driven via an `.is-open` class). Non-modal — the plots above stay
 * interactive — so it closes via the FAB, the sheet header's ✕, or Escape. Entirely inert on
 * desktop, where the FAB/handle are `display:none` and the pane renders in normal flow / the grid.
 */
function setupMobileSheet(): void {
  const fab = byId<HTMLButtonElement>("controls-fab");
  const pane = byId<HTMLElement>("controls-pane");
  const closeBtn = byId<HTMLButtonElement>("controls-close");
  const setOpen = (open: boolean): void => {
    pane.classList.toggle("is-open", open);
    fab.setAttribute("aria-expanded", open ? "true" : "false");
  };
  fab.addEventListener("click", () => setOpen(!pane.classList.contains("is-open")));
  closeBtn.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pane.classList.contains("is-open")) setOpen(false);
  });
  // Widening past the mobile breakpoint clears the sheet state so desktop never shows it half-open.
  window.matchMedia("(max-width: 720px)").addEventListener("change", (e) => {
    if (!e.matches) setOpen(false);
  });
}

/** Show the first-run onboarding once (dismissal remembered in localStorage). */
function setupOnboarding(): void {
  const el = byId("onboarding");
  let seen = false;
  try {
    seen = localStorage.getItem("cdjs.onboarded") === "1";
  } catch {
    // localStorage may be unavailable (private mode); just show the hint.
  }
  if (seen) return;
  el.hidden = false;
  const dismiss = (): void => {
    el.hidden = true;
    try {
      localStorage.setItem("cdjs.onboarded", "1");
    } catch {
      // ignore storage failures — worst case the hint shows again next visit
    }
  };
  byId("onboarding_dismiss").addEventListener("click", dismiss);
  byId("onboarding-tour").addEventListener("click", () => {
    dismiss();
    startTour();
  });
  // First-run profile pick: set the app-bar profile select and let its change handler apply it.
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".onboarding-profiles button")) {
    btn.addEventListener("click", () => {
      const name = btn.dataset.profile;
      const sel = byId<HTMLSelectElement>("profile");
      if (name && sel.querySelector(`option[value="${name}"]`)) {
        sel.value = name;
        sel.dispatchEvent(new Event("change"));
      }
      dismiss();
    });
  }
  el.addEventListener("click", (e) => {
    if (e.target === el) dismiss(); // click the backdrop to dismiss
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.hidden) dismiss();
  });
  byId<HTMLButtonElement>("onboarding_dismiss").focus();
}

/** Desktop layout toggles (≥1200px workspace): stack the two plots and/or hide the controls
 *  sidebar so the plots fill the freed width. State persists per-device in localStorage (a viewing
 *  preference, not part of the shared view). No render change — the canvases fill via CSS at their
 *  current resolution, so a much wider plot is softer until "canvas px" is raised. */
function setupLayout(): void {
  const workspace = document.querySelector(".workspace");
  if (!(workspace instanceof HTMLElement)) return;
  const layoutBtn = byId("layout-toggle");
  const sidebarBtn = byId("sidebar-toggle");
  const expandParamBtn = byId("expand-param");
  const expandDynBtn = byId("expand-dyn");
  const KEY_STACK = "cdjs.layout.stacked";
  const KEY_COLLAPSE = "cdjs.layout.collapsed";
  const read = (k: string): boolean => {
    try {
      return localStorage.getItem(k) === "1";
    } catch {
      return false;
    }
  };
  const write = (k: string, on: boolean): void => {
    try {
      localStorage.setItem(k, on ? "1" : "0");
    } catch {
      /* storage unavailable (private mode / quota) — keep the in-memory toggle only */
    }
  };
  // Drop any manual drag-resize widths (back to fill) — called whenever the layout mode changes.
  const clearPlotSizes = (): void => {
    document.querySelectorAll<HTMLElement>(".canvas-stack").forEach((s) => {
      s.style.width = "";
    });
  };
  const sync = (): void => {
    const stacked = workspace.classList.contains("plots-stacked");
    const collapsed = workspace.classList.contains("controls-collapsed");
    layoutBtn.textContent = stacked ? "Side by side" : "Stack plots";
    layoutBtn.setAttribute("aria-pressed", String(stacked));
    sidebarBtn.textContent = collapsed ? "Show controls" : "Hide controls";
    sidebarBtn.setAttribute("aria-pressed", String(collapsed));
    const expParam = workspace.classList.contains("expand-param");
    const expDyn = workspace.classList.contains("expand-dyn");
    expandParamBtn.textContent = expParam ? "⤢ restore" : "⤢ expand";
    expandParamBtn.setAttribute("aria-pressed", String(expParam));
    expandDynBtn.textContent = expDyn ? "⤢ restore" : "⤢ expand";
    expandDynBtn.setAttribute("aria-pressed", String(expDyn));
  };
  if (read(KEY_STACK)) workspace.classList.add("plots-stacked");
  if (read(KEY_COLLAPSE)) workspace.classList.add("controls-collapsed");
  sync();
  layoutBtn.addEventListener("click", () => {
    write(KEY_STACK, workspace.classList.toggle("plots-stacked"));
    clearPlotSizes();
    sync();
  });
  sidebarBtn.addEventListener("click", () => {
    write(KEY_COLLAPSE, workspace.classList.toggle("controls-collapsed"));
    clearPlotSizes();
    sync();
  });
  // Per-plot expand (focus mode): transient, not persisted; restores to the stack/collapse state.
  const setExpand = (which: "param" | "dyn" | null): void => {
    workspace.classList.toggle("expand-param", which === "param");
    workspace.classList.toggle("expand-dyn", which === "dyn");
    clearPlotSizes();
    sync();
  };
  expandParamBtn.addEventListener("click", () =>
    setExpand(workspace.classList.contains("expand-param") ? null : "param"),
  );
  expandDynBtn.addEventListener("click", () =>
    setExpand(workspace.classList.contains("expand-dyn") ? null : "dyn"),
  );
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      (workspace.classList.contains("expand-param") || workspace.classList.contains("expand-dyn"))
    ) {
      setExpand(null);
    }
  });

  // Drag-to-resize: a corner grip on each plot sets its .canvas-stack width (the canvas fills it in
  // the enlarged modes). Clamped to [240px, the plot's content width] so it never overflows the
  // column; also arrow-key resizable for accessibility. Session-only (cleared on a layout toggle).
  const MIN_PLOT = 240;
  const wireResize = (handle: HTMLElement, stack: HTMLElement): void => {
    const maxWidth = (): number => {
      const plot = stack.closest(".plot");
      if (!(plot instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
      const cs = getComputedStyle(plot);
      return plot.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    };
    const setWidth = (w: number): void => {
      stack.style.width = `${Math.round(Math.max(MIN_PLOT, Math.min(maxWidth(), w)))}px`;
    };
    let startX = 0;
    let startW = 0;
    let dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      startX = e.clientX;
      startW = stack.getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (dragging) setWidth(startW + (e.clientX - startX));
    });
    const stop = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 100 : 40;
      const d =
        e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -step
          : e.key === "ArrowRight" || e.key === "ArrowUp"
            ? step
            : 0;
      if (d === 0) return;
      e.preventDefault();
      setWidth(stack.getBoundingClientRect().width + d);
    });
  };
  const paramStack = document.querySelector("#param-plot .canvas-stack");
  const dynStack = document.querySelector("#dyn-plot .canvas-stack");
  if (paramStack instanceof HTMLElement) wireResize(byId("resize-param"), paramStack);
  if (dynStack instanceof HTMLElement) wireResize(byId("resize-dyn"), dynStack);
}

// --- Modal focus management (cd-modal-focus-01) --------------------------------
// The Glossary and Help overlays declare role="dialog" aria-modal="true" but used to
// only toggle `hidden`, so focus stayed on the background behind the backdrop: a
// keyboard user tabbed through the ~190 page controls to reach Close, and screen
// readers announced nothing on open. `withModalFocus` moves focus into the dialog,
// traps Tab within it, and restores focus to the opener on close (WCAG 2.4.3 / 4.1.2).
// A DOM-location-agnostic Tab trap (not `inert` on a wrapper) is used because #help-ref
// lives inside `.page` while #glossary sits at the end of <body>.
const MODAL_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Wrap an overlay's raw open/close (the bare `hidden` toggles) with focus-in, a
 *  Tab-cycle trap, and focus restore. `initialFocus` is focused on open (the ✕). */
function withModalFocus(
  overlay: HTMLElement,
  initialFocus: HTMLElement,
  rawOpen: () => void,
  rawClose: () => void,
): { open: () => void; close: () => void } {
  let returnFocus: HTMLElement | null = null;
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab") return;
    const items = [...overlay.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE)].filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  };
  return {
    open() {
      returnFocus = document.activeElement as HTMLElement | null;
      rawOpen();
      overlay.addEventListener("keydown", onKeydown);
      initialFocus.focus();
    },
    close() {
      overlay.removeEventListener("keydown", onKeydown);
      rawClose();
      if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus();
      returnFocus = null;
    },
  };
}

/** Populate + wire the glossary modal, and set the module-level {@link openGlossary} opener
 *  used by the app-bar button, the inspector "?" links, and the overlay "?" links. */
function setupGlossary(): void {
  const overlay = byId("glossary");
  const body = byId("glossary-body");

  const addSection = (title: string, entries: GlossaryEntry[]): void => {
    const h = document.createElement("h3");
    h.textContent = title;
    body.append(h);
    for (const e of entries) {
      const item = document.createElement("div");
      item.className = "glossary-item";
      item.id = `gl-${e.id}`;
      const name = document.createElement("strong");
      name.textContent = e.term;
      const p = document.createElement("p");
      p.textContent = e.defn;
      item.append(name, p);
      if (e.latex) {
        const math = document.createElement("div");
        math.className = "glossary-math";
        try {
          katex.render(e.latex, math, { throwOnError: false, displayMode: true });
        } catch {
          math.textContent = e.latex;
        }
        item.append(math);
      }
      body.append(item);
    }
  };
  addSection("Terms", GLOSSARY);
  addSection("Conventions in this app", CONVENTIONS);

  const modal = withModalFocus(
    overlay,
    byId("glossary-close"),
    () => {
      overlay.hidden = false;
    },
    () => {
      overlay.hidden = true;
    },
  );
  const close = modal.close;
  openGlossary = (termId?: string): void => {
    modal.open();
    if (termId) {
      const t = document.getElementById(`gl-${termId}`);
      if (t) {
        t.scrollIntoView({ block: "center" });
        t.classList.add("glossary-flash");
        window.setTimeout(() => t.classList.remove("glossary-flash"), 1200);
      }
    }
  };
  byId("help-btn").addEventListener("click", () => openGlossary());
  byId("glossary-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close(); // backdrop click
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });
  // Static "?" links on the overlay labels (the inspector-row ones are wired in showInspect).
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".gloss-link[data-term]")) {
    btn.addEventListener("click", () => {
      const term = btn.dataset.term;
      if (term) openGlossary(term);
    });
  }
}

/**
 * Wire the "Component data" panel (roadmap #17): for a selected period n, render the EXACT Gleason
 * polynomial G_n(c) (period-n centres), the dynatomic Φ_n(z,c) (period-n points), and the special c where
 * a period-n cycle is parabolic — root points (multiplier 1) and period-doubling points (multiplier −1).
 * All computed in exact ℚ(i) by @cas/exact (apps/complex-dynamics/src/combinatorics/dynatomic.ts); the
 * numeric values are the roots of those exact polynomials. KaTeX renders the polynomials.
 */
function setupComponentData(): void {
  const input = byId<HTMLInputElement>("component-period");
  const mathEl = byId("component-data-math");
  const centersEl = byId("component-data-centers");
  // @cas/exact's ASCII renderers emit bare carets ("c^15"); brace multi-digit exponents for KaTeX.
  const braceExp = (s: string): string => s.replace(/\^(\d+)/g, "^{$1}");
  const fmtC = (t: ComplexTuple): string => {
    const re = Math.abs(t[0]) < 1e-9 ? 0 : t[0];
    const im = t[1];
    if (Math.abs(im) < 1e-6) return re.toFixed(3);
    return `${re.toFixed(3)} ${im < 0 ? "−" : "+"} ${Math.abs(im).toFixed(3)}i`;
  };
  const addLine = (label: string, latex: string): void => {
    const wrap = document.createElement("div");
    wrap.style.margin = "0.5rem 0";
    const lab = document.createElement("div");
    lab.className = "exterior-status";
    lab.style.marginBottom = "0.15rem";
    lab.textContent = label;
    const math = document.createElement("div");
    math.style.overflowX = "auto";
    try {
      katex.render(braceExp(latex), math, { throwOnError: false, displayMode: true });
    } catch {
      math.textContent = latex;
    }
    wrap.append(lab, math);
    mathEl.append(wrap);
  };
  const list = (rs: ComplexTuple[]): string => (rs.length <= 6 ? rs.map(fmtC).join(", ") : `${rs.length} values`);
  const render = (): void => {
    const n = Math.max(1, Math.min(6, Math.round(Number(input.value) || 1)));
    mathEl.replaceChildren();
    if (n <= 4) {
      addLine(`Gleason G_${n}(c) — roots are the period-${n} centres:`, `G_{${n}}(c) = ${gleasonText(n)}`);
      addLine(`Dynatomic Φ_${n}(z,c) — roots in z are the period-${n} points:`, `\\Phi_{${n}}(z,c) = ${dynatomicText(n)}`);
    } else {
      const p = document.createElement("p");
      p.className = "exterior-status";
      p.textContent = `G_${n}: degree ${gleasonDegree(n)} · Φ_${n}: degree ${dynatomicDegreeInZ(n)} in z (polynomials omitted — large).`;
      mathEl.append(p);
    }
    const centers = mandelbrotCenters(n);
    // The multiplier polynomials eliminate z by a resultant whose Sylvester matrix is ~2^{n+1} wide, so the
    // exact fraction-free determinant grows fast — restrict the parabolic-point read-out to small n. The
    // Gleason centres stay cheap (a Durand–Kerner solve of G_n) for the whole range.
    const MAX_MULT_N = 3;
    const bif =
      n <= MAX_MULT_N
        ? ` Root points (multiplier 1): c = ${list(multiplierSpecializationRoots(n, Gauss.ONE))}. ` +
          `Period-doubling (multiplier −1): c = ${list(multiplierSpecializationRoots(n, Gauss.int(-1)))}.`
        : ` Root / period-doubling points: computed for n ≤ ${MAX_MULT_N} (the exact z-elimination grows fast).`;
    centersEl.textContent = `${centers.length} centre${centers.length === 1 ? "" : "s"} (= exact).${bif}`;
  };
  input.addEventListener("input", render);
  render();
}

/** Wire the "Help & reference" modal: opened from the app-bar "Help" button, closed via the ×,
 *  a backdrop click, or Escape — the same lightweight pattern as {@link setupGlossary}. */
function setupHelpReference(): void {
  const overlay = byId("help-ref");
  const modal = withModalFocus(
    overlay,
    byId("help-ref-close"),
    () => {
      overlay.hidden = false;
    },
    () => {
      overlay.hidden = true;
    },
  );
  const close = modal.close;
  byId("help-ref-btn").addEventListener("click", modal.open);
  byId("help-ref-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close(); // backdrop click
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });
}

/** One export at a time — see {@link beginExport}. Mirrors the `recording` flag on the video path. */
let exporting = false;

/**
 * Claim the export-progress overlay; returns progress + cancel hooks and a closer, or **null** when
 * an export is already running.
 *
 * The overlay, its progress bar and its cancel button are one shared instance, so two exports could
 * not share them: the label and bar flipped between the two jobs, the cancel button carried both
 * jobs' listeners so one press aborted both, and whichever finished first hid the dialog out from
 * under the other — leaving that job with no progress display, no way to cancel, and its button
 * stuck on "Rendering…". The guard lives here rather than in the callers so a future one inherits
 * it. Serialising is also the right behaviour on its own: two full-resolution tile renders share a
 * single GL context. (cd-shell-12)
 */
function beginExport(label: string): {
  onProgress: (fraction: number) => void;
  isCancelled: () => boolean;
  done: () => void;
} | null {
  if (exporting) {
    showToast("An export is already running.", "warn");
    return null;
  }
  exporting = true;
  const overlay = byId("export-progress");
  const bar = byId<HTMLProgressElement>("export-progress-bar");
  const text = byId("export-progress-label");
  const cancelBtn = byId<HTMLButtonElement>("export-cancel");
  let cancelled = false;
  const onCancel = (): void => {
    cancelled = true;
    cancelBtn.disabled = true;
    text.textContent = "Cancelling…";
  };
  text.textContent = label;
  bar.value = 0;
  cancelBtn.disabled = false;
  cancelBtn.addEventListener("click", onCancel);
  overlay.hidden = false;
  return {
    onProgress: (fraction) => {
      bar.value = fraction;
    },
    isCancelled: () => cancelled,
    done: () => {
      exporting = false;
      overlay.hidden = true;
      cancelBtn.removeEventListener("click", onCancel);
    },
  };
}

/** Build both plots and wire all controls. Throws if WebGL2 is unavailable. */
function init(): void {
  // Smaller default render resolution on a phone (500 on desktop/tablet) — see initialRes(). Seed
  // the canvas-size inputs to match so the serialized state agrees; a shared view still overrides.
  const res0 = initialRes(window.innerWidth);
  // Auto-suggestion engine: re-evaluated (debounced) on every view / setting change. Assigned a real
  // implementation once both plots and the engine exist; the view hooks below call it via this ref.
  let scheduleSuggestions: () => void = () => {};
  // Use-case profile picker: refreshes the "Custom…" label when the live controls diverge from the
  // applied profile. Assigned by setupProfiles(); called from the control-change handlers.
  let refreshProfileLabel: () => void = () => {};
  // Adopt a profile NAME carried by a shared view / saved state, so the picker shows it (the settings
  // themselves are reproduced by the rest of the state). Assigned by setupProfiles().
  let adoptProfile: (name: string | undefined) => void = () => {};
  byId<HTMLInputElement>("inpParamRes").value = String(res0);
  byId<HTMLInputElement>("inpDynRes").value = String(res0);
  const dynamicalView = new PlotView(
    byId<HTMLCanvasElement>("JCSCanvas"),
    byId<HTMLCanvasElement>("JCSOverlay"),
    dynPresets.mandelbrot,
    "dyn",
    res0,
    {
      onViewChanged: (center, zoom) => {
        setDynCenterInput(center);
        setDynZoomInput(zoom);
        updateViewChips();
        announce(`Dynamical plane — ${dynChip.textContent}`);
        scheduleRecord();
        scheduleSuggestions();
      },
      onHover: hoverReadout("JCSReadout"),
      onInspect: handleInspect,
    },
  );

  // Critical-orbit hover preview (parameter plane): a cheap CPU draw of the critical orbit
  // at the hovered c — green if it stays bounded (connected Julia set), orange if it
  // escapes (Cantor dust). No extra GL context; rAF-coalesced so a 60 Hz hover is cheap.
  const orbitPreviewCanvas = byId<HTMLCanvasElement>("orbit-preview");
  const orbitPreviewCtx = orbitPreviewCanvas.getContext("2d");
  const paramReadout = hoverReadout("MCSReadout");
  let paramPlot: GLPlot | null = null; // set just after the parameter view is built
  // On a touch device there is no hover, so the inset is fed from the white-point set/drag instead.
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  // Master enable for the inset — persisted, default OFF (the preview is opt-in). Read once here;
  // the checkbox is wired just below updateOrbitPreview. When off, updateOrbitPreview is a no-op
  // that keeps the canvas hidden.
  const ORBIT_PREVIEW_KEY = "cdjs.orbitPreview";
  let orbitPreviewEnabled = false;
  try {
    orbitPreviewEnabled = localStorage.getItem(ORBIT_PREVIEW_KEY) === "1";
  } catch {
    /* localStorage unavailable (private mode) — non-fatal, stays off */
  }
  let previewPending: Vec2 | null = null;
  let previewScheduled = false;
  // Cached Julia background for the inset — the escape-time render is throttled (it's the heavy
  // part), so the orbit can track the cursor at 60 Hz over the most recent background (~10 Hz).
  let previewJulia: ImageData | null = null;
  let previewJuliaT = 0;
  let previewJuliaAst: ExprNode | null = null;
  function updateOrbitPreview(coord: Vec2 | null): void {
    if (!orbitPreviewEnabled || !coord || !orbitPreviewCtx || !paramPlot) {
      orbitPreviewCanvas.hidden = true;
      return;
    }
    previewPending = coord;
    if (previewScheduled) return;
    previewScheduled = true;
    requestAnimationFrame(() => {
      previewScheduled = false;
      const c = previewPending;
      if (!c || !orbitPreviewCtx || !paramPlot) return;
      const { fAst, escAst, criticalPoint, paramA } = paramPlot;
      const { orbit, info } = orbitAndClassify(fAst, escAst, criticalPoint, c, 48, paramA);
      const size = orbitPreviewCanvas.width;
      // Recompute the Julia background when f changed or after a throttle interval; the cheap
      // orbit redraws every frame on top of the most recent background.
      const now = performance.now();
      if (!previewJulia || fAst !== previewJuliaAst || now - previewJuliaT > 90) {
        // Rendered small (64²) and scaled to the inset — keeps the CPU escape-time cheap.
        previewJulia = renderJuliaPreview(fAst, escAst, c, paramA, 64, 40);
        previewJuliaT = now;
        previewJuliaAst = fAst;
      }
      drawOrbitPreview(orbitPreviewCtx, orbit, info.fate !== "escaped", size, previewJulia);
      orbitPreviewCanvas.hidden = false;
    });
  }

  // The "orbit preview" master toggle — persisted (default off). Reflect the stored state, and
  // when turned off hide the inset immediately (it would otherwise linger until the next hover).
  const orbitPreviewToggle = byId<HTMLInputElement>("orbit-preview-toggle");
  orbitPreviewToggle.checked = orbitPreviewEnabled;
  orbitPreviewToggle.addEventListener("change", () => {
    orbitPreviewEnabled = orbitPreviewToggle.checked;
    try {
      localStorage.setItem(ORBIT_PREVIEW_KEY, orbitPreviewEnabled ? "1" : "0");
    } catch {
      /* localStorage unavailable (private mode) — non-fatal */
    }
    if (!orbitPreviewEnabled) orbitPreviewCanvas.hidden = true;
  });

  // --- Fast deep zoom (BLA): master toggle for the GPU BLA skip-table that accelerates the
  //     perturbation kernel (~20× at deep minibrots, pixel-identical). Persisted, default on; the
  //     toggle lets a user turn it off to compare against the exact single-step kernel. The BLA
  //     applies only under perturbation, so its status note shows only while perturbation renders.
  const BLA_KEY = "cdjs.bla";
  let blaUiEnabled = true;
  try {
    blaUiEnabled = localStorage.getItem(BLA_KEY) !== "0"; // on by default
  } catch {
    /* localStorage unavailable (private mode) — default on */
  }
  const blaNoteEl = byId("bla-note");

  // Coupled-drag state for deferring the c-dependent dyn-panel readouts (see updateDynCaption).
  let coupledDrafting = false;
  let dynPanelsTimer = 0;

  const parameterView = new PlotView(
    byId<HTMLCanvasElement>("MCSCanvas"),
    byId<HTMLCanvasElement>("MCSOverlay"),
    paramPresets.mandelbrot,
    "param",
    res0,
    {
      coupling: {
        setC: (z0) => {
          dynamicalView.plot.setCValue(z0);
          setCInput(z0);
          updateDynCaption();
          announce(`Parameter c = ${dynCValue.textContent}`);
          if (isCoarsePointer) updateOrbitPreview(z0); // touch has no hover → drive the inset here
        },
        setDraft: (on) => {
          dynamicalView.plot.setDraft(on);
          coupledDrafting = on;
          if (!on) refreshDynPanels(); // drag ended → recompute the dyn panels once for the final c
        },
      },
      onViewChanged: (center, zoom) => syncParamViewInputs(center, zoom),
      onHover: (coord) => {
        paramReadout(coord);
        updateOrbitPreview(coord);
      },
      onInspect: handleInspect,
    },
  );

  paramPlot = parameterView.plot;

  // --- Auto-suggestions: watch the live view and offer one-click fixes when it degrades --------
  const suggestionEngine = new SuggestionEngine("param-suggestion", "dyn-suggestion");
  // Colouring modes whose picture is escape-time based — an under-iterated cap visibly degrades the
  // boundary in these. Interior / derivative modes (period, multiplier, marty, Newton basins,
  // interior-DE, domain) colour differently and are excluded.
  const ESCAPE_MODES = new Set([
    "escape",
    "smooth",
    "distance",
    "distanceAnalytic",
    "orbit",
    "histogram",
    "stripe",
    "triangle",
    "decomposition",
  ]);
  // Depth thresholds (precision-pressure metric = zoom·max(1,|c|), matching glPlot.desiredPrecision).
  const UNDER_ITER_MAX_ZOOM = 1e11; // above this the f64 CPU grid probe loses reliability
  const PERTURB_NUDGE_METRIC = 1e11; // df64 precision getting thin → suggest perturbation (z²+c)
  // The precision-exhaustion walls (df64 ~1e13, perturbation dd ~1e28) live in viewAdvisories.ts
  // (precisionExhausted) so the thresholds have a single source; see precisionAdvisor below.
  const INTERIOR_DOMINATED = 0.96; // ≥ this fraction genuinely interior ⇒ escape-time is flat black
  /**
   * Advisor for the escape-time view: one CPU probe drives two suggestions — raise the iteration cap
   * when the view is under-iterated, or switch to an interior-revealing colouring when the view sits
   * almost entirely inside the set (where escape-time renders flat black). Under-iteration wins when
   * both could apply (the genuinely-interior reading is only trusted once the cap is adequate).
   */
  function escapeViewAdvisor(view: PlotView, scope: "param" | "dyn"): Advisor {
    return () => {
      // Gate: only escape-time colouring, a linear (un-projected) view, Newton off, and only at zooms
      // where the f64 CPU probe is still reliable (deeper views are the precision advisor's job).
      if (view.plot.projection !== 0) return null;
      if (view.plot.zoom > UNDER_ITER_MAX_ZOOM) return null;
      if (byId<HTMLInputElement>("newton").checked) return null;
      if (!ESCAPE_MODES.has(byId<HTMLSelectElement>("mode").value)) return null;
      const plot = view.plot;
      const res = detectUnderIteration({
        fAst: plot.fAst,
        escAst: plot.escAst,
        plane: scope,
        c: plot.cValue,
        orbitStart: plot.criticalPoint,
        a: plot.paramA,
        center: plot.center,
        zoom: plot.zoom,
        iterations: plot.currentIterations,
      });
      // Under-iterated → offer to raise the cap (skipped when auto-scaling already handles it).
      if (res.underIterated && !byId<HTMLInputElement>("autoiter").checked) {
        const pct = Math.round(res.recoveredFraction * 100);
        const planeWord = scope === "param" ? "parameter" : "dynamical";
        const inputId = scope === "param" ? INPUT_IDS.paramN : INPUT_IDS.dynN;
        return {
          id: "under-iteration",
          scope,
          severity: "warn",
          message: `Detail is degrading — ~${pct}% of this view needs more iterations.`,
          actions: [
            {
              label: `Raise to ${res.suggestedIterations}`,
              primary: true,
              run: () => {
                plot.n = String(res.suggestedIterations);
                byId<HTMLInputElement>(inputId).value = String(res.suggestedIterations);
                updateEffectiveIterations();
                showToast(
                  `Iterations raised to ${res.suggestedIterations} (${planeWord} plane).`,
                  "info",
                );
              },
            },
            {
              label: "Auto-scale",
              run: () => {
                byId<HTMLInputElement>("autoiter").checked = true;
                applyAutoIter();
                showToast("Auto-iterations enabled — the cap now grows with zoom.", "info");
              },
            },
          ],
        };
      }
      // Genuinely interior (not under-iterated) → escape-time is flat black here; the multiplier map
      // reveals the internal structure. Only offered when that mode is actually selectable.
      if (
        !res.underIterated &&
        res.interiorFraction >= INTERIOR_DOMINATED &&
        !byId<HTMLOptionElement>("mode-multiplier").disabled
      ) {
        return {
          id: "interior-dominated",
          scope,
          severity: "info",
          message: "Inside the set — escape-time is flat here. The multiplier map reveals the internal structure.",
          actions: [
            {
              label: "Multiplier map",
              primary: true,
              run: () => {
                byId<HTMLSelectElement>("mode").value = "multiplier";
                applyColoring();
                showToast("Switched to the multiplier-map colouring.", "info");
              },
            },
          ],
        };
      }
      return null;
    };
  }
  /** Advisor: deep zoom is straining df64 precision — offer perturbation (z²+c) or warn (otherwise). */
  function precisionAdvisor(view: PlotView, scope: "param" | "dyn"): Advisor {
    return () => {
      const plot = view.plot;
      if (plot.projection !== 0) return null; // a projection forces its own single-precision regime
      // Perturbation deep zoom is glitch-free, but its double-double reference centre has its own
      // ceiling (~1e28); past it the deepest detail degrades silently, so warn (dismissible) rather
      // than leave the user trusting unreliable structure.
      if (plot.perturbationActive) {
        return precisionExhausted(plot.zoom, plot.center, true)
          ? {
              id: "precision-exhausted",
              scope,
              severity: "warn",
              message: "Beyond perturbation's precision limit — the deepest detail may be unreliable.",
              actions: [],
            }
          : null;
      }
      const metric = precisionMetric(plot.zoom, plot.center);
      if (metric < PERTURB_NUDGE_METRIC) return null; // df64 is still comfortably accurate
      // Perturbation deep zoom is the z²+c parameter-plane fix; offer it when eligible.
      if (scope === "param" && plot.perturbationEligible) {
        return {
          id: "enable-perturbation",
          scope,
          severity: "warn",
          message: "Deep zoom is straining df64 precision — perturbation renders it reliably (and faster).",
          actions: [
            {
              label: "Enable perturbation",
              primary: true,
              run: () => {
                byId<HTMLInputElement>("perturbation").checked = true;
                applyPerturbation();
                showToast("Perturbation deep zoom enabled.", "info");
              },
            },
          ],
        };
      }
      // No deeper-precision option for this map/plane: warn (dismissible) once past the df64 wall.
      return precisionExhausted(plot.zoom, plot.center, false)
        ? {
            id: "precision-exhausted",
            scope,
            severity: "warn",
            message: "Beyond df64's precision limit — fine detail at this depth may be unreliable.",
            actions: [],
          }
        : null;
    };
  }
  /** Advisor: a rational map whose escape-time image is flat — offer period colouring (param plane). */
  function modeMismatchAdvisor(view: PlotView, scope: "param" | "dyn"): Advisor {
    return () => {
      if (byId<HTMLInputElement>("newton").checked) return null; // Newton transforms the dynamics
      if (!ESCAPE_MODES.has(byId<HTMLSelectElement>("mode").value)) return null; // already non-escape
      const plot = view.plot;
      // Evaluate the map's degree structure at a generic, non-degenerate c (the property is a feature
      // of the family, not of the selected parameter — and on the param plane the white-point c can be
      // 0, where a rational family degenerates to a polynomial).
      if (!escapeIsMeaningless(plot.fAst, [0.5, 0.3], plot.paramA)) return null;
      return {
        id: "escape-meaningless",
        scope,
        severity: "warn",
        message: "This rational map's orbits stay bounded — escape-time colouring is flat here. Period colouring shows the dynamics.",
        actions: [
          {
            label: "Switch to period",
            primary: true,
            run: () => {
              byId<HTMLSelectElement>("mode").value = "period";
              applyColoring();
              showToast("Switched to period colouring.", "info");
            },
          },
        ],
      };
    };
  }
  // Registration order = per-plot priority: precision (deep-zoom blocker) → mode mismatch (flat
  // image) → under-iteration. The first non-dismissed advisor for a plot wins its badge.
  suggestionEngine.register(precisionAdvisor(parameterView, "param"));
  suggestionEngine.register(precisionAdvisor(dynamicalView, "dyn"));
  suggestionEngine.register(modeMismatchAdvisor(parameterView, "param")); // one badge for a global map issue
  suggestionEngine.register(escapeViewAdvisor(parameterView, "param"));
  suggestionEngine.register(escapeViewAdvisor(dynamicalView, "dyn"));
  scheduleSuggestions = () => suggestionEngine.schedule();
  // The "suggestions" master toggle — persisted (default on); off hides every badge.
  const SUGGEST_KEY = "cdjs.suggestions";
  const suggestToggle = byId<HTMLInputElement>("suggestions");
  const applySuggestEnabled = (on: boolean, persist: boolean): void => {
    suggestToggle.checked = on;
    suggestionEngine.setEnabled(on);
    if (persist) {
      try {
        localStorage.setItem(SUGGEST_KEY, on ? "1" : "0");
      } catch {
        /* localStorage unavailable (private mode) — non-fatal */
      }
    }
  };
  let suggestPref = true;
  try {
    suggestPref = localStorage.getItem(SUGGEST_KEY) !== "0";
  } catch {
    /* ignore */
  }
  applySuggestEnabled(suggestPref, false);
  suggestToggle.addEventListener("change", () => applySuggestEnabled(suggestToggle.checked, true));

  // --- Click-to-inspect → nucleus finder (parameter plane) ----------------
  let lastNucleusSeed: { point: Vec2; period: number } | null = null;
  let lastInspect: { info: InspectResult; point: Vec2; plane: FractType } | null = null;

  /** Show the "Find nucleus" button only when a finite cycle was found on a holomorphic
   *  parameter plane, and remember the seed (clicked c + detected period) for Newton. */
  function updateNucleusButton(info: InspectResult, point: Vec2, plane: FractType): void {
    const eligible = plane === "param" && info.period >= 1 && parameterView.plot.holomorphic;
    byId("inspector-nucleus").hidden = !eligible;
    lastNucleusSeed = eligible ? { point: [point[0], point[1]], period: info.period } : null;
  }

  /** Show "Show bulb rays" only on the parameter plane when the clicked c sits in a bulb
   *  (a rotation p/q was found) and f is z²+c (where external rays are defined). */
  function updateBulbRaysButton(info: InspectResult, plane: FractType): void {
    const eligible =
      plane === "param" && info.rotation !== null && isQuadraticFamily(parameterView.plot);
    byId("inspector-rays").hidden = !eligible;
  }

  // Orbit-portrait toggle state: the last eligible rotation p/q and whether the rays are drawn.
  let lastPortraitRotation: { p: number; q: number } | null = null;
  let portraitShown = false;

  /** Show "Show orbit portrait" on the dynamical plane when the inspected cycle has a rotation
   *  p/q with 2 ≤ q ≤ MAX_DOUBLING_Q — the α fixed point then has q external rays landing (z²+c
   *  only). The upper bound keeps the O(2^q) ray-angle search from freezing the tab on a very
   *  high-period bulb. */
  function updateOrbitPortraitButton(info: InspectResult, plane: FractType): void {
    const rot = info.rotation;
    const eligible =
      plane === "dyn" &&
      rot !== null &&
      rot.q >= 2 &&
      rot.q <= MAX_DOUBLING_Q &&
      isQuadraticFamily(dynamicalView.plot);
    byId("inspector-portrait").hidden = !eligible;
    lastPortraitRotation = eligible && rot ? { p: rot.p, q: rot.q } : null;
  }

  /** Clear any drawn orbit portrait and reset its toggle button to "Show". */
  function clearOrbitPortrait(): void {
    if (!portraitShown) return;
    dynamicalView.setOrbitPortrait(null);
    portraitShown = false;
    byId("inspector-portrait").textContent = "Show orbit portrait";
  }

  /** Show "Self-similar zoom" on the parameter plane at a Misiurewicz-type point — where the
   *  critical orbit lands on a repelling cycle (|λ| > 1); Tan Lei's asymptotic self-similarity
   *  scale is then ρ = the cycle multiplier λ. */
  function updateRhoZoomButton(info: InspectResult, plane: FractType): void {
    const eligible =
      plane === "param" &&
      info.multiplierMag !== null &&
      info.multiplierMag > 1.0001 &&
      parameterView.plot.holomorphic;
    byId("inspector-rho-zoom").hidden = !eligible;
  }

  /** Inspector callback for both planes: render the report, then gate the action buttons. */
  function handleInspect(info: InspectResult, point: Vec2, plane: FractType): void {
    showInspect(info, point, plane);
    updateNucleusButton(info, point, plane);
    updateBulbRaysButton(info, plane);
    clearOrbitPortrait(); // a fresh inspect (possibly a new c) invalidates the drawn portrait
    updateOrbitPortraitButton(info, plane);
    updateRhoZoomButton(info, plane);
    // Any inspected point can be copied as a report / exported as an orbit.
    lastInspect = { info, point: [point[0], point[1]], plane };
    byId("inspector-copy").hidden = false;
    byId("inspector-orbit").hidden = false;
  }

  /** User annotations (gold pins), tagged by plane; pushed to each plot's overlay. */
  let notes: Note[] = [];
  function refreshNotes(): void {
    const pick = (pl: FractType): Annotation[] =>
      notes.filter((n) => n.plane === pl).map(({ x, y, text }) => ({ x, y, text }));
    parameterView.setAnnotations(pick("param"));
    dynamicalView.setAnnotations(pick("dyn"));
  }

  const errorBox = byId<HTMLDivElement>("input-errors");

  const dirtyIndicator = byId("dirty-indicator");
  const applyBtn = byId("apply_all");
  // The sidebar Apply plus the two contextual Apply buttons below each plot — all highlight together.
  const applyButtons = [applyBtn, ...document.querySelectorAll<HTMLButtonElement>(".plot-apply")];
  /**
   * Toggle the "unapplied edits" hint and emphasise every Apply button. Only the
   * deferred text fields ({@link INPUT_IDS}) feed this; the live controls
   * (dropdowns, sliders, checkboxes) apply on change and never go "dirty".
   */
  function setDirty(on: boolean): void {
    dirtyIndicator.hidden = !on;
    for (const b of applyButtons) b.classList.toggle("attention", on);
    // Clearing the dirty state also clears the per-field highlights (Apply / Enter / reset).
    if (!on) {
      for (const id of Object.values(INPUT_IDS)) byId(id).classList.remove("dirty");
      for (const id of Object.values(CENTER_SUB_IDS)) byId(id).classList.remove("dirty");
    }
  }

  const gradientEditor = setupGradientEditor(byId("gradient-editor"), DEFAULT_GRADIENT, (stops) => {
    parameterView.plot.setGradient(stops);
    dynamicalView.plot.setGradient(stops);
    updateLegends(); // the custom-gradient legend bar tracks the editor live
  });

  /** Show the given field errors (red-border the fields, list the reasons). */
  function showInputErrors(errors: FieldError[]): void {
    clearAllInvalid();
    errorBox.replaceChildren();
    const list = document.createElement("ul");
    for (const e of errors) {
      markInvalid(e.field);
      const item = document.createElement("li");
      item.textContent = e.message; // textContent: messages can echo user input
      list.appendChild(item);
    }
    errorBox.appendChild(list);
    errorBox.hidden = false;
  }

  function clearInputErrors(): void {
    clearAllInvalid();
    errorBox.replaceChildren();
    errorBox.hidden = true;
  }

  /** After applying, surface any shader-compile error the renderer kept. */
  function reportCompileErrors(): void {
    const errors: FieldError[] = [];
    if (parameterView.plot.lastError) {
      errors.push({
        field: INPUT_IDS.f,
        message: `Parameter space: ${parameterView.plot.lastError}`,
      });
    }
    if (dynamicalView.plot.lastError) {
      errors.push({
        field: INPUT_IDS.f,
        message: `Dynamical plane: ${dynamicalView.plot.lastError}`,
      });
    }
    if (errors.length > 0) showInputErrors(errors);
  }

  const dynCValue = byId("dyn-c-value");
  const paramCValue = byId("param-c-value");
  /** Format a complex literal (`-0.7-i*0.4`) as a clean `a + bi` for display. */
  function prettyComplex(s: string): string {
    const f = (x: number): string => Number.parseFloat(x.toPrecision(4)).toString();
    const [re, im] = parseComplex(s);
    const r = f(re);
    if (im === 0) return r;
    const sign = im < 0 ? "-" : "+";
    const imStr = Math.abs(im) === 1 ? "i" : `${f(Math.abs(im))}i`;
    if (re === 0) return `${im < 0 ? "-" : ""}${imStr}`;
    return `${r} ${sign} ${imStr}`;
  }
  /** Update the dynamical-plane caption to the current parameter c. */
  function refreshDynPanels(): void {
    window.clearTimeout(dynPanelsTimer);
    updateExteriorMap(); // dyn coefficients depend on c (a no-op while the panel is collapsed)
    applyLaurent(); // …and so does the dynamical boundary (a no-op while the toggle is off)
    updateJuliaProperties(); // …and the Julia-set properties readout (also gated on its panel)
    updateYoccoz(); // …and the Yoccoz puzzle / parapuzzle overlays (a no-op while their toggles are off)
    updateLamination(); // …and the pinched-disk lamination widget (a no-op while its toggle is off)
  }
  // During a coupled white-point drag the c-dependent panels are debounced (the cheap caption text
  // still updates live); they recompute once on release via coupling.setDraft(false).
  function scheduleDynPanels(): void {
    window.clearTimeout(dynPanelsTimer);
    dynPanelsTimer = window.setTimeout(refreshDynPanels, 110);
  }
  function updateDynCaption(): void {
    const txt = prettyComplex(dynamicalView.plot.c);
    dynCValue.textContent = txt;
    // The parameter white point IS this c, so both captions show the same value — making
    // the parameter↔dynamical link explicit.
    paramCValue.textContent = txt;
    if (coupledDrafting) scheduleDynPanels();
    else refreshDynPanels();
  }

  // --- Yoccoz puzzle + parapuzzle overlays ----------------------------------
  /**
   * Draw the depth-n Yoccoz graph — the rays landing at the α-preimages — on the dynamical plane (the
   * puzzle, dynamic rays) and/or the parameter plane (the parapuzzle, parameter rays at the same
   * angles), with an optional gold flood-fill of the critical piece / parapuzzle piece. Both share
   * the depth slider and the α-angles A of the current c, and recompute for the committed c through
   * refreshDynPanels (debounced during a coupled drag). Gated to z²+c with a repelling α.
   */
  function updateYoccoz(): void {
    const dynToggle = byId<HTMLInputElement>("yoccoz-toggle");
    const paraToggle = byId<HTMLInputElement>("parapuzzle-toggle");
    const depthInput = byId<HTMLInputElement>("yoccoz-depth");
    const critToggle = byId<HTMLInputElement>("yoccoz-critical");
    const note = byId("yoccoz-note");
    byId("yoccoz-depth-value").textContent = depthInput.value; // keep the slider label in sync
    const eligible = isQuadraticFamily(dynamicalView.plot); // z²+c (both planes share f)
    dynToggle.disabled = !eligible;
    paraToggle.disabled = !eligible;
    const anyOn = eligible && (dynToggle.checked || paraToggle.checked);
    depthInput.disabled = !anyOn;
    critToggle.disabled = !anyOn;
    // Clear both planes up front, then recompute whichever is on.
    dynamicalView.setPuzzleRays(null);
    dynamicalView.setCriticalPiece(null);
    parameterView.setPuzzleRays(null);
    parameterView.setCriticalPiece(null);
    if (!anyOn) {
      note.textContent =
        !eligible && (dynToggle.checked || paraToggle.checked)
          ? "The Yoccoz puzzle is defined for z²+c."
          : "";
      return;
    }
    const depth = Number(depthInput.value);
    const c: Vec2 = [parameterView.plot.z0[0], parameterView.plot.z0[1]]; // the current parameter
    const puz = yoccozPuzzle(c, depth);
    if (!puz) {
      note.textContent =
        "No puzzle at this c — α is attracting (c is in the main cardioid). Pick a c outside it (e.g. −1).";
      return;
    }
    const showCrit = critToggle.checked;
    if (dynToggle.checked) {
      const rd = rayDepthForZoom(dynamicalView.plot.zoom);
      const polys = puz.rayAngles.map((t) => dynamicRay(t, c, { depth: rd }));
      dynamicalView.setPuzzleRays(polys);
      if (showCrit) {
        const box: [number, number, number, number] = [-2.2, -2.2, 2.2, 2.2];
        const mask = criticalPieceMask(c, 0.5 / 2 ** depth, polys, [0, 0], box, 340);
        dynamicalView.setCriticalPiece(mask ? criticalMaskCanvas(mask) : null, box);
      }
    }
    if (paraToggle.checked) {
      // The parapuzzle graph: the same Θ_n angles as parameter rays on ∂M. When the critical piece is
      // shown, each ray is sealed to its exact landing (parameterLanding) so the flood barrier reaches
      // the root pinch — parameter rays land at wake roots only parabolically-slowly and stop short.
      const rd = rayDepthForZoom(parameterView.plot.zoom);
      const q = puz.alphaAngles[0].q * 2 ** depth; // common denominator of the Θ_n angles
      const polys = puz.rayAngles.map((t) => {
        const ray = parameterRay(t, { depth: rd });
        if (showCrit) {
          const land = parameterLanding(Math.round(t * q), q);
          if (land) ray.push([land.point[0], land.point[1]]);
        }
        return ray;
      });
      parameterView.setPuzzleRays(polys);
      if (showCrit) {
        // The parapuzzle piece containing the current parameter c (Mandelbrot-escape flood).
        const box: [number, number, number, number] = [-2.2, -1.4, 0.7, 1.4];
        const mask = criticalPieceMask(c, 0.5 / 2 ** depth, polys, c, box, 340, true);
        parameterView.setCriticalPiece(mask ? criticalMaskCanvas(mask) : null, box);
      }
    }
    const list = puz.alphaAngles.map((a) => `${a.p}/${a.q}`).join(", ");
    const on = [dynToggle.checked ? "Julia" : "", paraToggle.checked ? "parameter" : ""].filter(Boolean);
    const goldNote =
      showCrit && (dynToggle.checked || paraToggle.checked) ? " Gold = the critical piece." : "";
    note.textContent =
      `Depth ${depth}: ${puz.rayAngles.length} rays around α (valence ${puz.valence}; α-angles ` +
      `{${list}}) on the ${on.join(" + ")} plane${on.length > 1 ? "s" : ""}.${goldNote}`;
  }
  for (const id of ["yoccoz-toggle", "parapuzzle-toggle", "yoccoz-critical"]) {
    byId(id).addEventListener("change", updateYoccoz);
  }
  byId("yoccoz-depth").addEventListener("input", updateYoccoz);

  // --- Pinched-disk lamination overlays --------------------------------------
  // The QML of ∂M is parameter-space and c-INDEPENDENT, so it is cached by detail and reused across the
  // c-commit recomputes that refreshDynPanels triggers (parameter-ray landing is the costly part).
  let qmlCache: { detail: number; leaves: Leaf[] } | null = null;
  /**
   * Draw Thurston's pinched-disk laminations as corner disk widgets: the dynamical lamination of ∂K_c
   * on the Julia plane (a chord per co-landing pair of dynamic rays) and/or the QML of ∂M on the
   * parameter plane (the minor leaves — co-landing parameter rays at each component root). Measured by
   * the shipped landing machinery, gated to z²+c; the dynamical lamination also needs a repelling α and
   * recomputes for the committed c through refreshDynPanels, while the QML is cached by detail. A hoisted
   * declaration, so refreshDynPanels can call it during the initial syncDynamicalC.
   */
  function updateLamination(): void {
    const dynToggle = byId<HTMLInputElement>("lamination-toggle");
    const qmlToggle = byId<HTMLInputElement>("qml-toggle");
    const detailInput = byId<HTMLInputElement>("lamination-detail");
    const note = byId("lamination-note");
    byId("lamination-detail-value").textContent = detailInput.value; // keep the slider label in sync
    const eligible = isQuadraticFamily(dynamicalView.plot); // z²+c (both planes share f)
    dynToggle.disabled = !eligible;
    qmlToggle.disabled = !eligible;
    const anyOn = eligible && (dynToggle.checked || qmlToggle.checked);
    detailInput.disabled = !anyOn;
    dynamicalView.setLamination(null);
    parameterView.setLamination(null);
    if (!anyOn) {
      note.textContent =
        !eligible && (dynToggle.checked || qmlToggle.checked)
          ? "The lamination is defined for z²+c."
          : "";
      return;
    }
    const maxPeriod = Number(detailInput.value);
    const parts: string[] = [];
    if (dynToggle.checked) {
      const c: Vec2 = [parameterView.plot.z0[0], parameterView.plot.z0[1]]; // the current parameter
      const lam = dynamicalLamination(c, { maxPeriod, maxPreperiod: 1 });
      if (lam.leaves.length === 0) {
        parts.push("Julia: no lamination (Jordan curve at this c — α attracting; try −1)");
      } else {
        dynamicalView.setLamination(lam.leaves);
        parts.push(`Julia: ${lam.leaves.length} leaves from ${lam.gaps.length} pinches on ∂K_c`);
      }
    }
    if (qmlToggle.checked) {
      // QML minor leaves = co-landing PARAMETER rays at component roots (maxPreperiod 0); c-independent.
      if (!qmlCache || qmlCache.detail !== maxPeriod) {
        qmlCache = { detail: maxPeriod, leaves: parameterLamination({ maxPeriod, maxPreperiod: 0 }).leaves };
      }
      parameterView.setLamination(qmlCache.leaves);
      parts.push(`QML: ${qmlCache.leaves.length} minor leaves on ∂M (period ≤ ${maxPeriod})`);
    }
    note.textContent = parts.join(" · ") + ".";
  }
  for (const id of ["lamination-toggle", "qml-toggle"]) {
    byId(id).addEventListener("change", updateLamination);
  }
  byId("lamination-detail").addEventListener("input", updateLamination);

  /** Build a translucent gold mask canvas from a critical-piece mask (flipped to image row order). */
  function criticalMaskCanvas(mask: { data: Uint8Array; n: number }): HTMLCanvasElement {
    const { data, n } = mask;
    const cv = document.createElement("canvas");
    cv.width = n;
    cv.height = n;
    const ctx = cv.getContext("2d");
    if (!ctx) return cv;
    const img = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      const src = j * n;
      const dst = (n - 1 - j) * n; // plane row j (bottom-up) → image row n−1−j (top-down)
      for (let i = 0; i < n; i++) {
        if (data[src + i]) {
          const p = (dst + i) * 4;
          img.data[p] = 255;
          img.data[p + 1] = 224;
          img.data[p + 2] = 120;
          img.data[p + 3] = 92;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // --- Exterior-map (uniformization) readout -------------------------------
  let lastParamCoeffs: Complex[] | null = null;
  let lastDynCoeffs: Complex[] | null = null;
  let lastDynLead: Complex = [1, 0]; // capacity γ₁ of the dynamical exterior map (1 for monic z^d+c)

  /** Snap machine-epsilon components to 0 for a clean *display* only (copy / CSV keep full precision).
   *  The DFT coefficient extraction for a general polynomial leaves ~1e-16 noise where a value is
   *  truly 0 (or where a real coefficient has a spurious tiny imaginary part). */
  const snapNearZero = (z: Complex): Complex => [
    Math.abs(z[0]) < 1e-12 ? 0 : z[0],
    Math.abs(z[1]) < 1e-12 ? 0 : z[1],
  ];

  /** Truncated display of a coefficient list (full precision is kept for copy / export). */
  function coeffsPreview(coeffs: Complex[], symbol = "b"): string {
    return coeffs
      .map((b, k) => `${symbol}${k} = ${formatComplex(truncateComplex(snapNearZero(b)))}`)
      .join("\n");
  }

  function setExteriorButtons(paramOn: boolean, dynOn: boolean): void {
    byId<HTMLButtonElement>("exterior-param-copy").disabled = !paramOn;
    byId<HTMLButtonElement>("exterior-param-csv").disabled = !paramOn;
    byId<HTMLButtonElement>("exterior-dyn-copy").disabled = !dynOn;
    byId<HTMLButtonElement>("exterior-dyn-csv").disabled = !dynOn;
  }

  /**
   * The filled-Julia inverse-Böttcher coefficients for the current dynamical-plane f at order n. Picks
   * the path: the exact monic z^d + c recurrence (capacity 1) → the general-polynomial recurrence
   * ({@link polynomialJuliaExteriorCoeffs} on {@link polynomialCoeffs}) → the rational-map recurrence
   * ({@link rationalExteriorCoeffs} on {@link fToRational}, for f with a superattracting ∞, deg p−deg q ≥ 2).
   * `source` distinguishes polynomial (boundary overlay valid when connected) from rational (germ at ∞
   * only — its boundary needs the ∞-basin connectivity, deferred). "disconnected" ⇒ a polynomial whose
   * K is disconnected; "unavailable" ⇒ not such a map (incl. Newton mode, where ∞ isn't superattracting).
   */
  type DynExterior =
    | { kind: "ok"; coeffs: Complex[]; lead: Complex; source: "polynomial" | "rational" }
    | { kind: "disconnected" }
    | { kind: "unavailable" };

  // Memo for dynExterior. It depends only on the dynamical map (f, the live parameter a, c), the
  // order n, and Newton mode — NOT on the Laurent boundary radius r, which is the one thing the
  // radius slider changes. `laurent-r` is wired to `input` (main.ts, "laurent-r" listener), so a
  // drag fired a full re-derivation per event: measured 0.3 ms for monic z²+c, 0.8–1.2 ms for a
  // general polynomial, and 4.1–7.9 ms for a rational map — the last being half a frame budget, at
  // 60 Hz, on top of the render. Worse on that path: applyLaurent only uses the result when
  // `source === "polynomial"`, so for a rational map those 4–8 ms were computed and then discarded.
  // The memo also absorbs the second call per Apply (updateExteriorMap and applyLaurent each ask for
  // the same n) — it does not remove that duplication, which is cd-shell-08's business, only its cost.
  // (cd-shell-09)
  let dynExtKey = "";
  let dynExtVal: DynExterior = { kind: "unavailable" };

  function dynExterior(n: number): DynExterior {
    const plot = dynamicalView.plot;
    const [cx, cy] = plot.cValue;
    const [ax, ay] = plot.paramA;
    // Every input the uncached form reads, and nothing else. `esc` is in here because the
    // general-polynomial branch runs polynomialConnectivity(fAst, escAst, …) — the escape test is
    // editable independently of f, so leaving it out would serve a stale connectivity verdict.
    const key = [
      byId<HTMLInputElement>("newton").checked ? 1 : 0,
      plot.f,
      plot.esc,
      `${ax},${ay}`,
      `${cx},${cy}`,
      plot.monicDegree ?? "-",
      n,
    ].join("|");
    if (key === dynExtKey) return dynExtVal;
    dynExtVal = dynExteriorUncached(n);
    dynExtKey = key;
    return dynExtVal;
  }

  function dynExteriorUncached(
    n: number,
  ):
    | { kind: "ok"; coeffs: Complex[]; lead: Complex; source: "polynomial" | "rational" }
    | { kind: "disconnected" }
    | { kind: "unavailable" } {
    // In Newton mode the iterated map is the Newton map (∞ not superattracting) — no exterior map at ∞.
    if (byId<HTMLInputElement>("newton").checked) return { kind: "unavailable" };
    const plot = dynamicalView.plot;
    const c = plot.cValue;
    const dMonic = plot.monicDegree;
    if (dMonic !== null) {
      return juliaConnected(dMonic, c)
        ? { kind: "ok", coeffs: juliaExteriorCoeffs(dMonic, c, n), lead: [1, 0], source: "polynomial" }
        : { kind: "disconnected" };
    }
    const cf = polynomialCoeffs(plot.fAst, plot.paramA, c);
    if (cf && cf.length - 1 >= 2) {
      // Polynomial: the boundary needs every critical orbit bounded (Fatou–Julia connectedness).
      if (polynomialConnectivity(plot.fAst, plot.escAst, plot.paramA, c) !== "connected") {
        return { kind: "disconnected" };
      }
      const res = polynomialJuliaExteriorCoeffs(cf, n);
      if (res) return { kind: "ok", coeffs: res.b, lead: res.lead, source: "polynomial" };
    }
    // Rational map with a superattracting fixed point at ∞ (deg num − deg den ≥ 2) — germ at ∞.
    const rat = fToRational(plot.fAst, c, plot.paramA);
    if (rat) {
      const res = rationalExteriorCoeffs(rat.num, rat.den, n);
      if (res) return { kind: "ok", coeffs: res.b, lead: res.lead, source: "rational" };
    }
    return { kind: "unavailable" };
  }

  /**
   * Recompute the exterior-map readouts — the multibrot Ψ_{M_d} on the parameter plane (z^d + c
   * only) and the inverse Böttcher map ψ on the dynamical plane (any polynomial f, via
   * {@link dynExterior}). View-level, not click-driven; skipped while the panel is collapsed.
   */
  function updateExteriorMap(): void {
    if (!byId<HTMLDetailsElement>("exterior-group").open) return; // collapsed → no work
    const raw = Number(byId<HTMLInputElement>("exterior-n").value);
    const n = Math.max(1, Math.min(64, Math.round(Number.isFinite(raw) ? raw : 12)));
    byId("exterior-status").textContent =
      "Exterior map ψ(w) = γ₁·w + Σ·w⁻ᵏ — parameter plane: multibrot of zᵈ+c (aₘ); dynamical plane: filled Julia of any polynomial or rational map (bₖ).";
    const paramList = byId("exterior-param-list");
    const dynList = byId("exterior-dyn-list");

    const dMonic = parameterView.plot.monicDegree; // multibrot Ψ — z^d + c only
    if (dMonic !== null) {
      lastParamCoeffs = mandelbrotExteriorCoeffs(dMonic, n);
      paramList.textContent = coeffsPreview(lastParamCoeffs, "a"); // Douady–Hubbard aₘ
    } else {
      lastParamCoeffs = null;
      paramList.textContent = "Defined for zᵈ + c families only (e.g. z²+c, z³+c).";
    }

    const dyn = dynExterior(n); // inverse Böttcher ψ — any polynomial or rational f
    if (dyn.kind === "ok") {
      lastDynCoeffs = dyn.coeffs;
      lastDynLead = dyn.lead;
      const note = dyn.source === "rational" ? "  (germ at ∞; boundary overlay n/a for rational maps)" : "";
      dynList.textContent = `capacity γ₁ = ${formatComplex(truncateComplex(snapNearZero(dyn.lead)))}${note}\n${coeffsPreview(dyn.coeffs)}`;
    } else {
      lastDynCoeffs = null;
      lastDynLead = [1, 0];
      dynList.textContent =
        dyn.kind === "disconnected"
          ? "Julia set disconnected — the exterior map doesn't reach the boundary here."
          : "Available for a polynomial f, or a rational map with a superattracting ∞ (deg p − deg q ≥ 2).";
    }
    setExteriorButtons(dMonic !== null, dyn.kind === "ok");
  }

  // Reconstructed-boundary overlay — the visual form of the same coefficients.
  let lastBoundaryKey = ""; // memo: rebuild the (c-independent) param coeffs only when d/order change
  let lastBoundaryParam: Complex[] = [];
  /**
   * Push the reconstructed exterior-map boundary to both plots when the toggle is on: the multibrot
   * ∂M_d on the parameter plane (z^d + c only) and ∂K on the dynamical plane (any connected
   * polynomial f, via {@link dynExterior} — carrying the capacity γ₁ as the boundary's leading
   * coefficient). Gated like the readout; recomputed on toggle / order / radius / c / f.
   */
  function applyLaurent(): void {
    const dMonic = parameterView.plot.monicDegree;
    const cb = byId<HTMLInputElement>("laurent");
    // Eligible if either plane has a boundary: the multibrot (z^d+c) or any polynomial's Julia map.
    // The polynomial probe is cheap (a far-field degree check + a small DFT).
    const fIsPoly =
      dMonic !== null ||
      polynomialCoeffs(
        dynamicalView.plot.fAst,
        dynamicalView.plot.paramA,
        dynamicalView.plot.cValue,
      ) !== null;
    cb.disabled = !fIsPoly;
    byId<HTMLInputElement>("laurent-n").disabled = !fIsPoly;
    byId<HTMLInputElement>("laurent-r").disabled = !fIsPoly;
    if (!fIsPoly || !cb.checked) {
      parameterView.setLaurentBoundary(null, 1);
      dynamicalView.setLaurentBoundary(null, 1);
      return;
    }
    const rawN = Number(byId<HTMLInputElement>("laurent-n").value);
    const n = Math.max(2, Math.min(128, Math.round(Number.isFinite(rawN) ? rawN : 48)));
    const r = Math.max(1, Math.min(1.5, Number(byId<HTMLInputElement>("laurent-r").value) / 100));
    // Parameter plane (multibrot) — z^d + c only, c-independent ⇒ memoised across c-drags.
    if (dMonic !== null) {
      const key = `${dMonic}:${n}`;
      if (key !== lastBoundaryKey) {
        lastBoundaryParam = mandelbrotExteriorCoeffs(dMonic, n);
        lastBoundaryKey = key;
      }
      parameterView.setLaurentBoundary(lastBoundaryParam, r);
    } else {
      parameterView.setLaurentBoundary(null, 1);
    }
    // Dynamical plane (filled Julia) — any connected polynomial; lead = capacity γ₁. (The rational-map
    // boundary is deferred — the germ coefficients exist, but ∂K needs the ∞-basin connectivity.)
    const dyn = dynExterior(n);
    if (dyn.kind === "ok" && dyn.source === "polynomial") {
      dynamicalView.setLaurentBoundary(dyn.coeffs, r, dyn.lead);
    } else {
      dynamicalView.setLaurentBoundary(null, 1);
    }
  }

  // --- Julia-set properties readout ----------------------------------------
  let lastJuliaProps: ReturnType<typeof computeJuliaProperties> | null = null;
  let lastBoxDim: number | null = null; // Tier-2 box-counting dimension (image-based)
  let lastBoxDimStderr: number | null = null; // its fit standard error (the honest ± band)
  let lastPixelArea: number | null = null; // Tier-2 pixel-count area (image-based)
  let lastPixelAreaStderr: number | null = null; // resolution-limited area uncertainty (boundary layer)
  let lastExtent: Extent | null = null; // Tier-2 bounding extent (general f)
  let lastSymmetry: string | null = null; // Tier-2 measured symmetry string (general f)
  let lastConnectivity: string | null = null; // Tier-2 image connectivity string (general f)
  let lastConnectivityRigorous = false; // Tier-1 polynomial verdict set ⇒ skip the image estimate
  let juliaMeasureTimer = 0;
  const juliaMetricsClient = new JuliaMetricsClient(); // Tier-2 masks off the main thread (sync fallback)
  const jSet = (id: string, text: string): void => {
    byId(id).textContent = text;
  };
  const jNum = (x: number, n = 4): string =>
    Number.isFinite(x) ? Number.parseFloat(x.toPrecision(n)).toString() : x < 0 ? "−∞" : "∞";

  /** Paint the dimension + area rows from the Tier-1 props plus any Tier-2 image measurements. */
  function paintJuliaDimArea(): void {
    const p = lastJuliaProps;
    if (!p) return;
    const dim: string[] = [];
    // The small-c value is the quadratic-family asymptotic (exact only at c = 0); box-counting is a
    // rough estimate that over-reads smooth boundaries at coarse scales. Both are marked "≈".
    if (p.smallCDimension !== null) dim.push(`≈ ${jNum(p.smallCDimension, 5)} (small-c)`);
    if (lastBoxDim !== null) {
      const se = lastBoxDimStderr ? ` ± ${jNum(lastBoxDimStderr, 2)}` : "";
      dim.push(`≈ ${jNum(lastBoxDim, 4)}${se} (box-count)`);
    }
    jSet("jp-dimension", dim.length ? dim.join(" · ") : "—");

    if (p.escapes) {
      jSet("jp-area", "0 (disconnected)");
    } else {
      const area: string[] = [];
      if (lastPixelArea !== null) {
        const se = lastPixelAreaStderr ? ` ± ${jNum(lastPixelAreaStderr, 2)}` : "";
        area.push(`≈ ${jNum(lastPixelArea, 5)}${se} (pixel)`);
      }
      if (p.analyticArea !== null) area.push(`≤ ${jNum(p.analyticArea, 5)} (bound)`);
      jSet("jp-area", area.length ? area.join(" · ") : "—");
    }
  }

  /** Paint the bounding-region + symmetry rows for a general (non-monic) f from the Tier-2 measure.
   *  The monic family keeps the instant analytic rows set in `updateJuliaProperties`. */
  function paintJuliaExtentSymmetry(): void {
    const p = lastJuliaProps;
    if (!p || p.boundingRadius !== null) return; // monic ⇒ analytic rows stand
    if (lastExtent) {
      const b = lastExtent.bbox;
      jSet(
        "jp-bounding",
        `≈ re ∈ [${jNum(b.xMin, 3)}, ${jNum(b.xMax, 3)}] · im ∈ [${jNum(b.yMin, 3)}, ${jNum(b.yMax, 3)}]` +
          (lastExtent.clipped ? " (clipped)" : ""),
      );
    } else {
      jSet("jp-bounding", "—");
    }
    jSet("jp-symmetry", lastSymmetry ?? "—");
    if (lastConnectivity) jSet("jp-connectivity", lastConnectivity);
  }

  /**
   * Tier-2 image metrics (pixel area, box-counting dimension, bounding extent, symmetry), computed
   * from a CPU interior mask — heavier, so debounced and run only while the panel is open. The mask
   * window is the exact bounding disk for monic z^d + c; for a general f it is a snug window located
   * numerically (`estimateExtent`) around the whole set, so the area/symmetry cover the set rather
   * than just the visible view. Symmetry is measured for a general f (monic keeps the analytic row).
   */
  function measureJuliaImage(): void {
    const p = lastJuliaProps;
    if (!p || !byId<HTMLDetailsElement>("julia-props-group").open) return;
    const dyn = dynamicalView.plot;
    // Hand the heavy interior-mask metrics to the worker (synchronous fallback when Web Workers are
    // unavailable); the client drops stale responses, so only the latest request paints.
    juliaMetricsClient.request(
      {
        fSource: parameterView.plot.f,
        escSource: parameterView.plot.esc,
        a: parameterView.plot.paramA,
        c: dyn.cValue,
        centerX: dyn.center[0],
        centerY: dyn.center[1],
        zoom: dyn.zoom,
        boundingRadius: p.boundingRadius,
        escapes: p.escapes,
        rigorousConnectivity: lastConnectivityRigorous,
        size: 128, // grid resolution — finer over-reads the boundary and is slower
      },
      (m) => {
        lastBoxDim = m.boxDim;
        lastBoxDimStderr = m.boxDimStderr;
        lastPixelArea = m.pixelArea;
        lastPixelAreaStderr = m.pixelAreaStderr;
        // Present keys are applied; absent ones (monic's analytic rows, or a rigorous Tier-1
        // connectivity verdict) are deliberately left untouched.
        if ("extent" in m) lastExtent = m.extent ?? null;
        if ("symmetry" in m) lastSymmetry = m.symmetry ?? null;
        if ("connectivity" in m) lastConnectivity = m.connectivity ?? null;
        paintJuliaDimArea();
        paintJuliaExtentSymmetry();
      },
    );
  }

  function scheduleJuliaMeasure(): void {
    window.clearTimeout(juliaMeasureTimer);
    juliaMeasureTimer = window.setTimeout(measureJuliaImage, 350);
  }

  /**
   * Recompute the "Julia set properties" readout for the current c. The Tier-1 (cheap, analytic /
   * orbit-based) rows update immediately; the Tier-2 image rows (box-counting dimension, pixel
   * area) are scheduled debounced. Skipped while the panel is collapsed. The capacity-based rows
   * need a z^d + c map and show "—" for an arbitrary f; the orbit-based rows still apply.
   */
  function updateJuliaProperties(): void {
    if (!byId<HTMLDetailsElement>("julia-props-group").open) return; // collapsed → no work
    const d = parameterView.plot.monicDegree;
    const c = dynamicalView.plot.cValue;
    const holo = parameterView.plot.holomorphic; // non-holomorphic ⇒ |λ| / Lyapunov are ≈ (finite-diff)
    const p = computeJuliaProperties({
      degree: d,
      c,
      fAst: parameterView.plot.fAst,
      escAst: parameterView.plot.escAst,
      criticalPoint: parameterView.plot.criticalPoint,
      a: parameterView.plot.paramA,
    });
    lastJuliaProps = p;
    lastBoxDim = null; // stale on a c / f change — the debounced measure refills them
    lastBoxDimStderr = null;
    lastPixelArea = null;
    lastPixelAreaStderr = null;
    lastExtent = null;
    lastSymmetry = null;
    lastConnectivity = null;

    if (d === null) {
      // Rigorous (Fatou–Julia) connectivity from all critical orbits when f is a polynomial;
      // otherwise fall back to the debounced image estimate.
      const pc = polynomialConnectivity(
        parameterView.plot.fAst,
        parameterView.plot.escAst,
        parameterView.plot.paramA,
        c,
      );
      lastConnectivityRigorous = pc !== null;
      jSet(
        "jp-connectivity",
        // Fatou–Julia is a theorem, but "critical orbit bounded" is decided by surviving CONN_ITERS
        // iterations, so only the all-escaped verdict is a determination — escape is the decisive
        // half. "connected" rests entirely on the cap, and separating "disconnected" from "cantor"
        // does too, so both are hedged (critical.ts documents the split).
        pc === "connected"
          ? "≈ connected (all critical orbits bounded to the iteration cap)"
          : pc === "cantor"
            ? "totally disconnected — Cantor dust"
            : pc === "disconnected"
              ? "≈ disconnected (mixed critical orbits)"
              : "measuring…", // non-polynomial ⇒ image estimate fills this from the Tier-2 pass
      );
    } else {
      lastConnectivityRigorous = false;
      jSet(
        "jp-connectivity",
        // `p.connected` is only "the critical orbit did not escape", which is also true when the
        // orbit was iteration-limited. Reporting THAT as "c ∈ Mandelbrot set" would state a
        // membership the computation never established, so hedge it — matching the honest
        // "no attracting cycle found (iteration-limited)" wording used for jp-paramtype below.
        p.connectivityUndetermined
          ? "≈ undetermined (iteration-limited — orbit neither escaped nor closed)"
          : p.connected
            ? `connected (c ∈ ${d === 2 ? "Mandelbrot set" : `multibrot M${d}`})`
            : "totally disconnected — Cantor dust",
      );
    }

    let ptype: string;
    if (p.paramClass === "outside") ptype = "outside the set (orbit escapes)";
    else if (p.paramClass === "hyperbolic" && p.cycle)
      ptype =
        p.cycle.multiplierMag < 1e-6
          ? `superattracting · period ${p.cycle.period}`
          : // Always ≈. `holo` says an analytic f′ exists, NOT that the value is exact: the cycle is
            // located numerically and Newton-refined to ~1e-13, then |λ| = |exp(Σ log f′(z_k))| in
            // float64. The holomorphic path is a BETTER estimate than the finite-difference one, not
            // an exact one, so the distinction belongs in the provenance note, not in the relation.
            `attracting · period ${p.cycle.period} · |λ| ≈ ${jNum(p.cycle.multiplierMag, 3)}` +
            (holo ? "" : " (finite-diff)");
    else if (p.paramClass === "neutral") ptype = "neutral (|λ| ≈ 1, on the boundary)";
    else ptype = "no attracting cycle found (iteration-limited)";
    if (p.cycle?.rotation) ptype += ` · ${p.cycle.rotation.p}/${p.cycle.rotation.q}`;
    jSet("jp-paramtype", ptype);

    jSet(
      "jp-lyapunov",
      p.escapes
        ? "→ +∞ (escaping)"
        : p.lyapunov === null
          ? "—"
          : p.lyapunov === -Infinity
            ? "−∞ (superattracting)"
            : // Derived from the same numerically located cycle (log|λ|/period) or accumulated along
              // the critical orbit, so it is an estimate on both paths — the holomorphic branch used
              // to print a bare number with no marker at all.
              `≈ ${jNum(p.lyapunov, 4)} nats/iter` + (holo ? "" : " (finite-diff)"),
    );

    jSet(
      "jp-bounding",
      p.boundingRadius !== null ? `|z| ≤ ${jNum(p.boundingRadius, 4)} (disk)` : "measuring…",
    );

    if (d === null) {
      jSet("jp-symmetry", "measuring…"); // measured from the image by the debounced Tier-2 pass
    } else {
      const base = d === 2 ? "central (z → −z)" : `${d}-fold rotational`;
      jSet("jp-symmetry", c[1] === 0 ? `${base} · real axis` : base);
    }

    jSet(
      "jp-capacity",
      p.capacity === null ? "—" : d === null ? `≈ ${jNum(p.capacity, 4)}` : `${p.capacity} (exact)`,
    );
    jSet(
      "julia-props-note",
      d === null
        ? "For a general f these are numerical estimates; capacity applies to any polynomial f; the exact area bound needs a zᵈ+c map."
        : "",
    );

    paintJuliaDimArea(); // Tier-1 dimension/area now; the debounced measure enriches them
    scheduleJuliaMeasure();
  }

  /** Copy the Julia-set properties (exactly as displayed) to the clipboard, computing the image
   *  metrics first so the report is complete. */
  function copyJuliaProperties(): void {
    if (byId<HTMLDetailsElement>("julia-props-group").open) measureJuliaImage();
    const lines = [`Julia set properties — c = ${formatComplex(dynamicalView.plot.cValue)}`];
    for (const row of document.querySelectorAll<HTMLElement>("#julia-props-group .julia-prop")) {
      const dt = row.querySelector("dt");
      const dd = row.querySelector("dd");
      if (!dt || !dd) continue;
      const label = (dt.textContent ?? "").replace(/\s*\?\s*$/, "").trim();
      lines.push(`${label}: ${dd.textContent ?? ""}`);
    }
    void navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => showToast("Julia properties copied to the clipboard.", "info"))
      .catch(() => showToast("Couldn't access the clipboard.", "warn"));
  }

  const paramChip = byId("param-view-chip");
  const dynChip = byId("dyn-view-chip");
  /** Refresh the per-plot "view chip" summaries (centre · zoom · iterations). */
  function updateViewChips(): void {
    const fmt = (v: PlotView, nId: string): string => {
      const p = (x: number, n: number): string => Number.parseFloat(x.toPrecision(n)).toString();
      const [cx, cy] = v.plot.center;
      return `center ${p(cx, 4)}, ${p(cy, 4)} · zoom ${formatZoom(v.plot.zoom, 3)} · ${byId<HTMLInputElement>(nId).value} it`;
    };
    paramChip.textContent = fmt(parameterView, INPUT_IDS.paramN);
    dynChip.textContent = fmt(dynamicalView, INPUT_IDS.dynN);
    updateEffectiveIterations();
  }

  /**
   * Everything that has to follow a parameter-plane view move: the sidebar centre/zoom boxes, the
   * view chip, a history snapshot, and the advisory re-run.
   *
   * This is the body of `parameterView`'s `onViewChanged` hook, which PlotView fires only from its
   * pointer/keyboard handlers — a PROGRAMMATIC `plot.center = …` renders the new view and tells
   * nothing else. Any code that moves the parameter plane without a user gesture must call this, or
   * it leaves the readouts describing a view that is no longer on screen (cd-shell-06).
   */
  function syncParamViewInputs(center: Vec2, zoom: number): void {
    setParamCenterInput(center);
    setParamZoomInput(zoom);
    updateViewChips();
    announce(`Parameter space — ${paramChip.textContent}`);
    scheduleRecord();
    scheduleSuggestions();
  }

  /** With auto-iterations on, show each plot's live effective cap next to its iterations box
   *  (each plane scales by its own zoom) so the base count isn't read as the count in use. */
  function updateEffectiveIterations(): void {
    const on = byId<HTMLInputElement>("autoiter").checked;
    const show = (spanId: string, eff: number): void => {
      const span = byId(spanId);
      if (on) {
        span.textContent = `(${eff})`;
        span.title = `Auto iterations: ${eff} in use at this zoom`;
        span.hidden = false;
      } else {
        span.hidden = true;
      }
    };
    show("param-iter-effective", parameterView.plot.currentIterations);
    show("dyn-iter-effective", dynamicalView.plot.currentIterations);
    updateBlaNote();
  }

  /** Live status for the BLA deep-zoom accelerator, shown only while perturbation is rendering.
   *  Reports the skip-table depth (levels k ⇒ up to 2^(k−1) iterations skipped per step) when on,
   *  or that the exact single-step kernel is in use when the user has turned BLA off. */
  function updateBlaNote(): void {
    const active =
      parameterView.plot.perturbationActive || dynamicalView.plot.perturbationActive;
    if (!active) {
      blaNoteEl.hidden = true; // BLA only applies under perturbation
      return;
    }
    if (!blaUiEnabled) {
      blaNoteEl.textContent = "Off — using the exact single-step kernel (slower deep zoom).";
      blaNoteEl.hidden = false;
      return;
    }
    // The deeper plot's table (both planes may perturb; the user is usually zoomed into one). The
    // count is only known after a perturbation draw builds the table — until then show a generic
    // message (the precise depth arrives on the next render/settle via requestAnimationFrame).
    const levels = Math.max(parameterView.plot.blaLevelCount, dynamicalView.plot.blaLevelCount);
    if (levels > 1) {
      const maxSkip = 1 << (levels - 1); // level k skips 2ᵏ; deepest level is k = levels − 1
      blaNoteEl.textContent = `Active — BLA skip-table (${levels} levels, up to ${maxSkip.toLocaleString()} iterations/step), pixel-identical.`;
    } else {
      blaNoteEl.textContent = "Active — perturbation deep zoom (pixel-identical to the exact kernel).";
    }
    blaNoteEl.hidden = false;
  }

  const srStatus = byId("sr-status");
  let announceTimer = 0;
  /** Debounced screen-reader announcement via the aria-live status region. */
  function announce(text: string): void {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      srStatus.textContent = text;
    }, 500);
  }

  /** Keep the dynamical plane's `c` tied to the parameter-space white point. */
  function syncDynamicalC(): void {
    dynamicalView.plot.c = formatComplex(parameterView.plot.z0);
    updateDynCaption();
    dynamicalView.plot.scheduleRender();
  }
  syncDynamicalC();
  updateViewChips();
  // The zoom inputs carry HTML defaults on first load; run them through the scientific-notation
  // formatter so they match the format used after any pan/zoom, preset, or shared view.
  setParamZoomInput(parameterView.plot.zoom);
  setDynZoomInput(dynamicalView.plot.zoom);

  /** Current control-input values as `[parameterPreset, dynamicalPreset]`. */
  function readPresetsFromInputs(): [Preset, Preset] {
    const f = getFInput();
    return [
      {
        f,
        c: getCInput(),
        n: getParamNInput(),
        nplot: parameterView.plot.nplot,
        escape: getParamEscInput(),
        zoom: getParamZoomInput(),
        center: getParamCenterInput(),
      },
      {
        f,
        c: dynamicalView.plot.c,
        z0: dynamicalView.plot.z0,
        n: getDynNInput(),
        nplot: dynamicalView.plot.nplot,
        escape: getDynEscInput(),
        zoom: getDynZoomInput(),
        center: getDynCenterInput(),
      },
    ];
  }

  /** Validate, then apply the current input values to both plots. */
  function applyChanges(): void {
    const { ok, errors } = validateInputs();
    if (!ok) {
      showInputErrors(errors);
      return;
    }
    clearInputErrors();
    const [paramPreset, dynPreset] = readPresetsFromInputs();
    dynamicalView.applyPreset(dynPreset);
    parameterView.applyPreset(paramPreset);
    parameterView.setRes(getParamResInput());
    dynamicalView.setRes(getDynResInput());
    syncDynamicalC();
    reportCompileErrors();
    updateParamAVisibility();
    updatePerturbationGating(); // a new f may change z²+c eligibility
    updateDerivativeGating(); // a new f may change holomorphicity
    applyFarey(); // a new f may change z²+c eligibility for bulb labels
    applyRays(); // …and for external rays
    applyRayPairs(); // …and for bulb ray pairs
    applyInverseJulia(); // …and the inverse-iteration Julia cloud
    applySiegelCurves(); // …and the Siegel invariant curves
    parameterView.setAddressRays(null); // …and a stripped internal address's rays (z²+c-specific)
    parameterView.setPointRays(null); // …and any angles-of-a-point rays
    dynamicalView.setPointRays(null);
    dynamicalView.setHermanCurves(null); // …and any detected Herman-ring curves
    updateExteriorMap(); // a new f may change the degree / coefficients
    applyLaurent();
    updateJuliaProperties();
    setDirty(false);
    updateViewChips();
    announce(`Changes applied. Dynamical plane for c = ${dynCValue.textContent}.`);
    scheduleRecord();
    scheduleSuggestions(); // new f / c / iterations may change the under-iteration verdict
    refreshProfileLabel(); // iterations / resolution edits may diverge from the active profile
  }

  /** Load a named preset into the inputs and both plots. */
  function applyPreset(name: PresetName): void {
    populateInputs(name);
    clearInputErrors();
    dynamicalView.applyPreset(dynPresets[name]);
    parameterView.applyPreset(paramPresets[name]);
    syncDynamicalC();
    reportCompileErrors();
    updateParamAVisibility();
    updatePerturbationGating(); // a new preset may change z²+c eligibility (re-enables light/outline/equipotential)
    updateDerivativeGating();
    // Rational families (∞ not superattracting) carry a default colouring mode — escape-time is
    // meaningless there (orbits converge to finite cycles), so honour it instead of opening flat black.
    // A normal escape-time preset (no mode field) resets to "smooth", so a special mode a previous
    // preset forced (e.g. "period" from a Herman / rational family) doesn't linger onto it.
    byId<HTMLSelectElement>("mode").value = paramPresets[name].mode ?? "smooth";
    applyColoring();
    applyFarey();
    applyRays();
    applyRayPairs();
    applyInverseJulia();
    applySiegelCurves();
    parameterView.setAddressRays(null); // a new preset invalidates a stripped internal address's rays
    parameterView.setPointRays(null); // …and any angles-of-a-point rays
    dynamicalView.setPointRays(null);
    dynamicalView.setHermanCurves(null); // …and any detected Herman-ring curves
    updateExteriorMap();
    applyLaurent();
    updateJuliaProperties();
    setDirty(false);
    updateViewChips();
    scheduleRecord();
    scheduleSuggestions(); // a new preset resets f / c / iterations / mode
    refreshProfileLabel(); // a preset may change iterations / mode → diverge from the active profile
  }

  /** Reproducibility metadata embedded (invisibly) in an exported PNG: a human-readable parameter
   *  summary, the full shareable-state URL (paste to reproduce this exact view), and the software
   *  name. The image pixels are unchanged. */
  function buildStampMetadata(view: PlotView): Record<string, string> {
    const plot = view.plot;
    const round = (x: number): string => Number.parseFloat(x.toPrecision(6)).toString();
    // ASCII signs only — PNG tEXt is Latin-1, so a Unicode minus (U+2212) would be mangled to '?'.
    const cplx = (re: number, im: number): string =>
      `${round(re)} ${im >= 0 ? "+" : "-"} ${round(Math.abs(im))}i`;
    const [cx, cy] = plot.cValue;
    const [ox, oy] = plot.center;
    const plane = view === parameterView ? "parameter (Mandelbrot)" : "dynamical (Julia)";
    const params =
      `plane=${plane}; f(z,c)=${plot.f}; c=${cplx(cx, cy)}; center=${cplx(ox, oy)}; ` +
      `zoom=${plot.zoom.toExponential(3)}; iterations=${plot.nplot}; mode=${byId<HTMLSelectElement>("mode").value}`;
    return {
      Software: "ComplexDynamicsJS",
      "cdjs:params": params,
      "cdjs:state": `${location.origin}${location.pathname}${encodeState(readFullState())}`,
    };
  }

  /** Render a plot at the chosen size and download it, with button feedback. */
  async function runExport(
    view: PlotView,
    sizeId: string,
    overlayId: string,
    scaleBarId: string,
    filenameId: string,
    buttonId: string,
  ): Promise<void> {
    const button = byId<HTMLButtonElement>(buttonId);
    const size = Number(byId<HTMLSelectElement>(sizeId).value);
    const overlays = byId<HTMLInputElement>(overlayId).checked;
    const scaleBar = byId<HTMLInputElement>(scaleBarId).checked;
    const filename = byId<HTMLInputElement>(filenameId).value;
    // Claim the shared overlay BEFORE touching the button, so a refused export leaves it untouched.
    const progress = beginExport(`Rendering ${size}×${size}…`);
    if (!progress) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Rendering…";
    try {
      await view.exportPng({
        size,
        overlays,
        scaleBar,
        filename,
        metadata: buildStampMetadata(view),
        onProgress: progress.onProgress,
        isCancelled: progress.isCancelled,
      });
    } catch (err) {
      console.error("Export failed:", err);
      showToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      progress.done();
      button.disabled = false;
      button.textContent = label;
    }
  }

  /** Render a plot at the chosen size and copy it to the clipboard, with button feedback. */
  async function runCopy(
    view: PlotView,
    sizeId: string,
    overlayId: string,
    scaleBarId: string,
    buttonId: string,
  ): Promise<void> {
    const button = byId<HTMLButtonElement>(buttonId);
    const size = Number(byId<HTMLSelectElement>(sizeId).value);
    const overlays = byId<HTMLInputElement>(overlayId).checked;
    const scaleBar = byId<HTMLInputElement>(scaleBarId).checked;
    const progress = beginExport(`Copying ${size}×${size}…`);
    if (!progress) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Copying…";
    try {
      await view.copyPng({
        size,
        overlays,
        scaleBar,
        onProgress: progress.onProgress,
        isCancelled: progress.isCancelled,
      });
    } catch (err) {
      console.error("Copy failed:", err);
      showToast(`Copy failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      progress.done();
      button.disabled = false;
      button.textContent = label;
    }
  }

  /** Disable export-size options the current GPU can't handle. */
  function disableUnsupportedSizes(): void {
    const max = getMaxTextureSize();
    for (const id of ["paramExportSize", "dynExportSize", "schwarz-export-size"]) {
      const select = byId<HTMLSelectElement>(id);
      for (const option of Array.from(select.options)) {
        if (Number(option.value) > max) option.disabled = true;
      }
      if (select.selectedOptions[0]?.disabled) {
        const enabled = Array.from(select.options).filter((o) => !o.disabled);
        if (enabled.length > 0) select.value = enabled[enabled.length - 1].value;
      }
    }
  }

  /** Read a range/number input as a finite number, falling back to `fallback` when the field is
   *  missing or non-numeric — a NaN would otherwise flow straight into a GLSL `uniform1f` and blank
   *  the render (SHELL-6). Fallbacks mirror each slider's HTML default value. */
  function numInput(id: string, fallback: number): number {
    const v = Number(byId<HTMLInputElement>(id).value);
    return Number.isFinite(v) ? v : fallback;
  }

  /** Apply the selected coloring mode, palette, and anti-aliasing to both plots. */
  function applyColoring(): void {
    const mode = MODES[byId<HTMLSelectElement>("mode").value] ?? 0;
    const palette = PALETTES[byId<HTMLSelectElement>("palette").value] ?? 0;
    const aa = Math.max(1, Number(byId<HTMLSelectElement>("aa").value) || 1);
    const rotation = numInput("paletteRotation", 0) / 100; // 0..1
    for (const v of [parameterView, dynamicalView]) {
      v.plot.setColoring(mode, palette, aa);
      v.plot.setGradientRotation(rotation);
    }
    gradientEditor.setVisible(byId<HTMLSelectElement>("palette").value === "custom");
    applyTrap();
    scheduleSuggestions(); // the under-iteration nudge only applies to escape-time modes
    updateLegends(); // the corner colour key follows the mode / palette
  }

  // --- Fast deep zoom (BLA) toggle wiring: push the persisted state to both plots and keep it in
  //     sync. setBLA is a no-op away from the perturbation path, so this is safe for any f / view.
  const blaToggle = byId<HTMLInputElement>("bla-toggle");
  blaToggle.checked = blaUiEnabled;
  function applyBla(): void {
    parameterView.plot.setBLA(blaUiEnabled);
    dynamicalView.plot.setBLA(blaUiEnabled);
    updateBlaNote(); // reflect on/off immediately…
    requestAnimationFrame(() => updateBlaNote()); // …then upgrade to the precise depth after the draw
  }
  blaToggle.addEventListener("change", () => {
    blaUiEnabled = blaToggle.checked;
    try {
      localStorage.setItem(BLA_KEY, blaUiEnabled ? "1" : "0");
    } catch {
      /* localStorage unavailable (private mode) — non-fatal */
    }
    applyBla();
  });
  applyBla(); // push the persisted state to both plots on load

  // --- Per-plot colour legend: a small corner chip keyed to the current colouring mode + palette,
  //     on by default (persisted). Floats over the image, so it costs no layout space. ----------
  const LEGEND_KEY = "cdjs.legend";
  const paramLegendEl = byId("param-legend");
  const dynLegendEl = byId("dyn-legend");
  const legendToggle = byId<HTMLInputElement>("legend-toggle");
  let legendEnabled = true;
  try {
    legendEnabled = localStorage.getItem(LEGEND_KEY) !== "0"; // on by default
  } catch {
    /* localStorage unavailable (private mode) — default on */
  }

  /** The interior's name on a plane: the Mandelbrot set (z²+c parameter plane), the filled Julia set
   *  (dynamical plane), or a generic "set" for other parameter families. */
  function legendSetName(view: PlotView, plane: "param" | "dyn"): string {
    if (plane === "dyn") return "filled Julia set";
    return isQuadraticFamily(view.plot) ? "Mandelbrot set" : "the set";
  }

  /** Redraw both plot legends for the current colouring (or clear them when the toggle is off; an
   *  empty chip is hidden by CSS `.plot-legend:empty`). */
  function updateLegends(): void {
    const modeStr = byId<HTMLSelectElement>("mode").value;
    const palette = byId<HTMLSelectElement>("palette").value as PaletteName;
    const rotation = Number(byId<HTMLInputElement>("paletteRotation").value) / 100;
    const custom = gradientEditor.getStops();
    for (const [view, el, plane] of [
      [parameterView, paramLegendEl, "param"],
      [dynamicalView, dynLegendEl, "dyn"],
    ] as const) {
      if (!legendEnabled) {
        el.replaceChildren();
        continue;
      }
      const model = describeLegend(modeStr, legendSetName(view, plane));
      renderLegend(el, model, palette, custom, rotation);
    }
  }

  legendToggle.checked = legendEnabled;
  legendToggle.addEventListener("change", () => {
    legendEnabled = legendToggle.checked;
    try {
      localStorage.setItem(LEGEND_KEY, legendEnabled ? "1" : "0");
    } catch {
      /* ignore */
    }
    updateLegends();
  });

  /** Apply the orbit-trap shape to both plots; its control shows only in orbit-trap mode. */
  function applyTrap(): void {
    const trap = TRAPS[byId<HTMLSelectElement>("trap").value] ?? 0;
    parameterView.plot.setTrap(trap);
    dynamicalView.plot.setTrap(trap);
    byId("trap-field").hidden = byId<HTMLSelectElement>("mode").value !== "orbit";
  }

  /** Apply the relief-lighting controls (checkbox + azimuth/elevation/depth) to both plots. */
  function applyLighting(): void {
    const on = byId<HTMLInputElement>("light").checked;
    const az = numInput("lightAz", 135);
    const el = numInput("lightEl", 45);
    const height = numInput("lightHeight", 40) / 20; // slider 0–100 → depth 0–5
    parameterView.plot.setLighting(on, az, el, height);
    dynamicalView.plot.setLighting(on, az, el, height);
    // The sliders only matter when lighting is on — disable them otherwise.
    for (const id of ["lightAz", "lightEl", "lightHeight"]) {
      byId<HTMLInputElement>(id).disabled = !on;
    }
  }

  /** Apply the post-processing controls (checkbox + vignette/gamma) to both plots. */
  function applyPost(): void {
    const on = byId<HTMLInputElement>("post").checked;
    const vignette = numInput("postVignette", 30) / 100; // 0..1
    const gamma = Math.pow(2, (numInput("postGamma", 50) - 50) / 50); // 0.5..2 (1 at 50)
    parameterView.plot.setPost(on, vignette, gamma);
    dynamicalView.plot.setPost(on, vignette, gamma);
    for (const id of ["postVignette", "postGamma"]) {
      byId<HTMLInputElement>(id).disabled = !on;
    }
  }

  /** Apply the boundary-outline controls (checkbox + width) to both plots. */
  function applyOutline(): void {
    const on = byId<HTMLInputElement>("outline").checked;
    const width = numInput("outlineWidth", 30) / 20; // slider 0–100 → 0–5
    parameterView.plot.setOutline(on, width);
    dynamicalView.plot.setOutline(on, width);
    byId<HTMLInputElement>("outlineWidth").disabled = !on;
  }

  /** Toggle the critical-orbit overlay on both plots. */
  function applyCriticalOrbit(): void {
    const on = byId<HTMLInputElement>("critorbit").checked;
    parameterView.setCriticalOrbit(on);
    dynamicalView.setCriticalOrbit(on);
  }

  /** Toggle Farey bulb labels on the parameter plane; disabled unless f is z²+c. */
  function applyFarey(): void {
    const eligible = isQuadraticFamily(parameterView.plot);
    const cb = byId<HTMLInputElement>("farey");
    cb.disabled = !eligible;
    parameterView.setFarey(eligible && cb.checked);
  }

  /** Trace the entered external-ray angle on both planes; gated to z²+c. */
  function applyRays(): void {
    const eligible = isQuadraticFamily(parameterView.plot);
    const on = byId<HTMLInputElement>("rays").checked;
    const angle = parseAngle(byId<HTMLInputElement>("ray-angle").value);
    byId<HTMLInputElement>("rays").disabled = !eligible;
    // Angle stays editable whenever f is z²+c, so the angle can be entered before ticking.
    byId<HTMLInputElement>("ray-angle").disabled = !eligible;
    const active = eligible && on && angle !== null;
    parameterView.setRays(active ? angle : null);
    dynamicalView.setRays(active ? angle : null);
    byId("rays-note").hidden = !active;
  }

  /** Draw the landing-ray pair for each visible Farey bulb (parameter plane); z²+c only. */
  function applyRayPairs(): void {
    const eligible = isQuadraticFamily(parameterView.plot);
    const cb = byId<HTMLInputElement>("ray-pairs");
    cb.disabled = !eligible;
    parameterView.setRayPairs(eligible && cb.checked);
  }

  /** Draw the inverse-iteration Julia point cloud (dynamical plane); z²+c only. */
  function applyInverseJulia(): void {
    const eligible = isQuadraticFamily(dynamicalView.plot);
    const cb = byId<HTMLInputElement>("inverse-julia");
    cb.disabled = !eligible;
    dynamicalView.setInverseJulia(eligible && cb.checked);
  }

  /** Draw the Siegel-disc invariant curves (dynamical plane); z²+c only. */
  function applySiegelCurves(): void {
    const eligible = isQuadraticFamily(dynamicalView.plot);
    const cb = byId<HTMLInputElement>("siegel-curves");
    cb.disabled = !eligible;
    dynamicalView.setSiegelCurves(eligible && cb.checked);
  }

  /** Apply the equipotential-overlay controls (checkbox + density) to both plots. */
  function applyEquipotential(): void {
    const on = byId<HTMLInputElement>("equipotential").checked;
    const density = Number(byId<HTMLInputElement>("equiDensity").value) / 100; // slider 5–100 → 0.05–1
    parameterView.plot.setEquipotential(on, density);
    dynamicalView.plot.setEquipotential(on, density);
    byId<HTMLInputElement>("equiDensity").disabled = !on;
  }

  /** Toggle Newton's-method iteration on both plots, surfacing any non-differentiable f. */
  function applyNewton(): void {
    const on = byId<HTMLInputElement>("newton").checked;
    parameterView.plot.setNewton(on);
    dynamicalView.plot.setNewton(on);
    reportCompileErrors();
    updateDerivativeGating(); // Newton iterates the Newton map, not f — analytic DE n/a
  }

  /** Toggle auto-scaling of the iteration cap with zoom on both plots, and push the
   *  strength (extra ×base iterations per decade of zoom) from its slider. */
  function applyAutoIter(): void {
    const on = byId<HTMLInputElement>("autoiter").checked;
    const strength = Number(byId<HTMLInputElement>("autoiter-strength").value);
    for (const v of [parameterView, dynamicalView]) {
      v.plot.setAutoIterations(on);
      v.plot.setAutoIterStrength(strength);
    }
    byId<HTMLInputElement>("autoiter-strength").disabled = !on; // only adjustable when active
    updateEffectiveIterations();
    scheduleSuggestions(); // auto-scaling changes whether the under-iteration nudge applies
  }

  /** Toggle temporal anti-aliasing (idle accumulation) on both plots. */
  function applyAccumulate(): void {
    const on = byId<HTMLInputElement>("accumulate").checked;
    parameterView.plot.setAccumulate(on);
    dynamicalView.plot.setAccumulate(on);
  }

  /** Toggle perturbation deep zoom (z²+c parameter plane) on both plots. */
  function applyPerturbation(): void {
    const on = byId<HTMLInputElement>("perturbation").checked;
    parameterView.plot.setPerturbation(on);
    dynamicalView.plot.setPerturbation(on);
    if (on && !parameterView.plot.perturbationEligible) {
      showToast(
        "Perturbation deep zoom applies to z^d+c (Mandelbrot, multibrots, and their Julia sets).",
        "info",
      );
    }
    updatePerturbationGating();
    updateDerivativeGating();
    scheduleSuggestions(); // perturbation on/off changes the deep-zoom precision nudge
    updateBlaNote(); // show/hide the BLA status for the new perturbation state…
    requestAnimationFrame(() => updateBlaNote()); // …then upgrade to the precise depth after the draw
  }

  /**
   * The perturbation kernel honours only escape/smooth colouring. When it's actually
   * active, disable the controls it ignores (lighting, outline, equipotential) and show
   * a note, so toggling them isn't a silent no-op.
   */
  function updatePerturbationGating(): void {
    const active = parameterView.plot.perturbationActive || dynamicalView.plot.perturbationActive;
    for (const id of ["light", "outline", "equipotential"] as const) {
      byId<HTMLInputElement>(id).disabled = active;
    }
    byId("perturbation-note").hidden = !active;
    updateLegends(); // a new f may flip z²+c eligibility → the interior's name ("Mandelbrot set")
  }

  /**
   * The analytic distance mode (11) and the multiplier map (12) both need ∂f/∂z (and ∂f/∂c)
   * — available only for holomorphic f, not under Newton (the shader iterates the Newton map,
   * not f), and not under perturbation (its kernel ignores the mode). Disable both options
   * when unavailable, falling the selection back to a safe mode if one was active.
   */
  function updateDerivativeGating(): void {
    const available =
      parameterView.plot.holomorphic &&
      !byId<HTMLInputElement>("newton").checked &&
      !parameterView.plot.perturbationActive &&
      !dynamicalView.plot.perturbationActive;
    byId<HTMLOptionElement>("mode-distance-analytic").disabled = !available;
    byId<HTMLOptionElement>("mode-multiplier").disabled = !available;
    byId<HTMLOptionElement>("mode-marty").disabled = !available;
    // Interior DE is the z²+c Mandelbrot-interior formula specifically (parameter plane); gate it
    // on a quadratic map (its recurrence hard-codes f′ = 2z) and off under Newton / perturbation.
    const interiorDEAvailable =
      parameterView.plot.monicDegree === 2 &&
      !byId<HTMLInputElement>("newton").checked &&
      !parameterView.plot.perturbationActive &&
      !dynamicalView.plot.perturbationActive;
    byId<HTMLOptionElement>("mode-interior-de").disabled = !interiorDEAvailable;
    const sel = byId<HTMLSelectElement>("mode");
    if (!available && sel.value === "distanceAnalytic") {
      sel.value = "distance";
      applyColoring();
    } else if (!available && (sel.value === "multiplier" || sel.value === "marty")) {
      sel.value = "smooth";
      applyColoring();
    } else if (!interiorDEAvailable && sel.value === "interiorDE") {
      sel.value = "smooth";
      applyColoring();
    }
  }

  /** Apply the live parameter `a` slider value to both plots and update its readout. */
  function applyParamA(): void {
    const value = numInput("param-a", 1);
    byId("param-a-value").textContent = value.toFixed(2);
    parameterView.plot.setParamA(value);
    dynamicalView.plot.setParamA(value);
  }

  /** Show the `a` slider only when the current f or escape references `a`. */
  function updateParamAVisibility(): void {
    const uses = parameterView.plot.usesParamA || dynamicalView.plot.usesParamA;
    byId("param-a-field").hidden = !uses;
  }

  /** Re-apply every control to the plots (used after loading a shared permalink). */
  function applyAllControls(): void {
    // σ is a persistent peer VIEW now (ADR-0009), not an overlay dismissed on any control change: a control
    // apply re-renders the standard plots underneath and leaves σ mode intact. Leaving σ is explicit (its ↩
    // button / Esc) or happens when a NON-schwarz map is imported (importInterchange calls exitSchwarzView).
    applyChanges();
    applyColoring();
    applyLighting();
    applyPost();
    applyOutline();
    applyCriticalOrbit();
    applyEquipotential();
    applyNewton();
    applyAutoIter();
    applyAccumulate();
    applyPerturbation();
    applyParamA();
  }

  /**
   * Full serializable state: the DOM controls ({@link readAppState}) plus the two
   * view-defining bits the control allow-list can't reach — the custom-gradient
   * stops and the dynamical orbit-start z₀ (read from the live plot, since
   * `readPresetsFromInputs` only ever reflects the *current* z₀, not a saved one).
   */
  function readFullState(): AppState {
    const state = readAppState();
    state._grad = JSON.stringify(gradientEditor.getStops());
    state._z0 = formatComplex(dynamicalView.plot.z0);
    // Deep-zoom reproducibility: the centre inputs are rounded for readability and lose precision
    // past ~1e6× (and a plain f64 runs out past ~1e13×). Layer the exact double-double centre so a
    // permalink / saved view reproduces a deep zoom. Only for non-shallow views, so shallow links
    // stay compact and unchanged; on an old link without it, applyFullState falls back to the input.
    const pc = parameterView.plot.centerDD;
    if (parameterView.plot.zoom > 1e3 || pc[0][1] !== 0 || pc[1][1] !== 0)
      state._pcdd = ddCenterToString(pc[0], pc[1]);
    const dc = dynamicalView.plot.centerDD;
    if (dynamicalView.plot.zoom > 1e3 || dc[0][1] !== 0 || dc[1][1] !== 0)
      state._dcdd = ddCenterToString(dc[0], dc[1]);
    // Pinned annotations. Always emitted, even empty: applyFullState treats a MISSING `_notes` as
    // "this state says nothing about notes, leave them alone", so an undo step or a saved view that
    // genuinely has none still has to say so explicitly to restore an empty board. (cd-shell-05)
    state._notes = encodeNotes(notes);
    const proj = readProjectionState(); // anchor + saved linear view behind an active projection
    if (proj) state._proj = proj;
    const pv = byId<HTMLSelectElement>("profile").value; // the active use-case profile (label hint)
    if (pv && pv !== "custom") state._profile = pv;
    // σ peer view (ADR-0009 item 2): when σ is showing, layer its view state (φ recipe + window + coloring)
    // so a permalink / saved view / PNG reproduces it. Present-only — a state without `_sigma` is a normal
    // fractal view, and applyFullState leaves σ for it.
    const sig = currentSigmaState();
    if (sig) state._sigma = encodeSigmaState(sig);
    return state;
  }

  /** Populate the "Places" dropdown and fly to a selection (undoable via applyFullState). */
  function setupPlaces(): void {
    const sel = byId<HTMLSelectElement>("places");
    for (const place of PLACES) {
      const opt = document.createElement("option");
      opt.value = place.name;
      opt.textContent = place.name;
      sel.append(opt);
    }
    sel.addEventListener("change", () => {
      const place = PLACES.find((p) => p.name === sel.value);
      sel.value = ""; // snap back to the "Places…" label so the same entry can be re-picked
      if (place) applyFullState(place.state);
    });
  }

  /** Apply a full state: the DOM controls, the custom gradient, and the dynamical z₀. */
  function applyFullState(state: AppState): void {
    applyAppState(state);
    // applyAppState wrote the hidden "x,y" centre fields by id; re-fill the visible
    // real/imaginary boxes from them (the setters write both the hidden field and the boxes).
    setParamCenterInput(getParamCenterInput());
    setDynCenterInput(getDynCenterInput());
    // Re-format the just-loaded zoom fields into scientific notation (normalises an old link that
    // stored a plain decimal; a value round-trips through parseFloat so nothing is lost).
    setParamZoomInput(getParamZoomInput());
    setDynZoomInput(getDynZoomInput());
    if (typeof state._grad === "string") {
      // Validate the untrusted gradient the same way the manual loader does; ignore if bad.
      const stops = parseGradientStops(state._grad);
      if (stops) {
        gradientEditor.setStops(stops); // setStops doesn't emit onChange — push to the plots too
        parameterView.plot.setGradient(stops);
        dynamicalView.plot.setGradient(stops);
      }
    }
    // Set z₀ before applyAllControls so readPresetsFromInputs picks it up and re-applies it.
    // Ignore a non-finite z₀ from a corrupt link rather than feeding NaN into the GL uniform.
    if (typeof state._z0 === "string") {
      const z = parseComplex(state._z0);
      if (Number.isFinite(z[0]) && Number.isFinite(z[1])) dynamicalView.plot.z0 = z;
    }
    applyAllControls();
    // applyAllControls reset each centre from the rounded f64 input; if the state carries an exact
    // double-double centre (a deep zoom), restore it now so the view reproduces to full precision.
    //
    // ⚠ PRECEDENCE: `_pcdd`/`_dcdd` therefore WIN over `inpparamcenter`/`inpdyncenter`. Any caller
    // that hands us a readFullState() result with an overridden centre input must delete the matching
    // `_*dd` key first, or the override is silently discarded — see the "Self-similar zoom" handler,
    // which is the one caller that does this and where exactly that bug lived.
    if (typeof state._pcdd === "string") {
      const c = ddCenterFromString(state._pcdd);
      // Reject a non-finite centre from a corrupt link before it reaches the GL uniform (→ a blank plot).
      if (c && Number.isFinite(ddToNumber(c[0])) && Number.isFinite(ddToNumber(c[1]))) {
        parameterView.plot.setCenterDD(c[0], c[1]);
      }
    }
    if (typeof state._dcdd === "string") {
      const c = ddCenterFromString(state._dcdd);
      if (c && Number.isFinite(ddToNumber(c[0])) && Number.isFinite(ddToNumber(c[1]))) {
        dynamicalView.plot.setCenterDD(c[0], c[1]);
      }
    }
    // The coordinate remap, once both centres are final — its anchor is relative to them.
    setProjectionState(state._proj);
    // Restore pinned annotations. Present-only, like `_grad` / `_z0` / `_profile`: a state that does
    // not MENTION notes leaves them alone (decodeNotes returns null), and the validation + hostile-link
    // caps live with the codec in state/notes.ts. This used to clear them unconditionally — invisible
    // for the callers that pass a readFullState-derived state, but it silently wiped every pin the
    // moment a "Places" entry was picked, since those are curated partial states built from six control
    // ids (state/places.ts), so "no `_notes` key" read as "delete them all". Recovery was Ctrl+Z, with
    // nothing hinting anything had been lost. A pre-fix saved view or link carries no `_notes` and so
    // now preserves the current pins — the same rule, applied to states written before it existed.
    const restoredNotes = decodeNotes(state._notes);
    if (restoredNotes) {
      notes = restoredNotes;
      refreshNotes();
    }
    if (typeof state._profile === "string") adoptProfile(state._profile); // show the carried profile label
    // σ peer view (ADR-0009 item 2), LAST — after the standard plots are set, so exiting σ later reveals
    // the correct fractal underneath. A state carrying `_sigma` re-enters σ; one without it leaves σ (so a
    // non-σ saved view / link switches back to the plots). A corrupt `_sigma` is ignored (stay on the plots).
    if (typeof state._sigma === "string") {
      const sig = parseSigmaState(state._sigma);
      if (sig) restoreSchwarzFromState(sig);
      else if (schwarzSession) exitSchwarzView();
    } else if (schwarzSession) {
      exitSchwarzView();
    }
  }

  /** Serialize the current view into the URL hash and copy a shareable link. */
  async function shareLink(): Promise<void> {
    const url = `${location.origin}${location.pathname}${encodeState(readFullState())}`;
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Shareable link copied to the clipboard.", "info");
    } catch {
      showToast("Shareable link is in the address bar.", "info");
    }
  }

  // --- σ (Schwarz reflection) reconstruction view (S4a; interactive GPU render S4b-ii/iii) -------
  // σ(w)=conj(F(φ⁻¹(w))) has a NUMERICAL inverse, so an imported schwarz recipe is not expr/GPU-
  // compilable through CD's usual pipeline: it is rebuilt with @cas/schwarz and its escape-time field is
  // painted onto a dedicated 2D canvas layered over the dynamical plot — on the GPU (render/schwarzGL),
  // CPU fallback. The image is `≈` — the principal exterior branch of a numerically-inverted reflection,
  // not a certified render. Drag to pan, scroll to zoom (about the cursor); Esc — or any control change —
  // exits and restores the normal plot underneath.
  const SCHWARZ_DEFAULT_VIEW: SchwarzView = { center: [0, 0], zoom: 0.4 }; // half-width 1/zoom = 2.5
  // ONE escape budget for both the σ field and the orbit inspector, so a clicked point's reported fate
  // matches the pixel under it (the GPU/CPU field renders and the CPU orbit tracer must agree). Mutable so
  // the Render-group iterations / escape-radius fields (B2) retune it live; defaults hold at 48 / 1e4.
  const SCHWARZ_ESCAPE_DEFAULTS = { maxIter: 48, escapeR: 1e4 } as const;
  const schwarzEscape: { maxIter: number; escapeR: number } = { ...SCHWARZ_ESCAPE_DEFAULTS };
  // The GPU σ renderer is built once, lazily: `undefined` = not yet tried, `null` = WebGL2 unavailable
  // (permanently CPU). It owns a private offscreen canvas whose result we drawImage onto #JCSSchwarz.
  let schwarzGL: SchwarzGLRenderer | null | undefined;
  // The active σ session — the reconstruction inputs a redraw needs at the current view. null ⇔ not shown.
  let schwarzSession:
    | {
        engine: ReturnType<typeof schwarzEngineFromMapSpec>;
        poly: ReturnType<typeof schwarzBoundaryPoly>;
        phi: SchwarzPhi; // the φ recipe (family, c, F, w0, branches) — serialized into the σ permalink (_sigma, item 2)
        boundedOmega: boolean; // S5-C2: Ω is INSIDE ∂Ω (bounded φ) — the CPU field + orbit tracer need it
        mode: "GPU" | "CPU";
      }
    | null = null;
  let schwarzView: SchwarzView = { ...SCHWARZ_DEFAULT_VIEW };
  let schwarzRaf = 0;
  // σ coloring (ADR-0009 item 3) — remembered for this page session so it survives σ enter/exit and a
  // regenerate. Also serialized into the σ-view permalink / saved view / PNG via the `_sigma` state layer
  // (ADR-0009 item 2 — encodeSigmaState carries colormap + scale + colorMode + trapShape + tone).
  let schwarzColormapName = DEFAULT_SCHWARZ_COLORMAP;
  let schwarzScaleMode = DEFAULT_SCHWARZ_SCALE;
  // σ-field color mode (S5-B1): what the ramp encodes — escape time (default), orbit trap, or stripe average.
  let schwarzColorMode: string = DEFAULT_SCHWARZ_COLOR_MODE;
  let schwarzTrapShape: string = DEFAULT_SCHWARZ_TRAP_SHAPE;
  // σ image-space tone (S5-A3): palette rotation + gamma + vignette, part of the coloring the σ view serializes.
  let schwarzRotation: number = SIGMA_TONE_DEFAULTS.rotation;
  let schwarzGamma: number = SIGMA_TONE_DEFAULTS.gamma;
  let schwarzVignette: number = SIGMA_TONE_DEFAULTS.vignette;
  // σ orbit inspection (ADR-0009 item 3): the currently-inspected orbit (w₀ = points[0]) or null. Its
  // polyline is redrawn over the field on every paint, so it stays pinned to w₀ as the view pans/zooms.
  let schwarzInspect: SchwarzOrbit | null = null;
  // σ hover orbit-preview (S5-A2): a transient orbit under the cursor, drawn faint beneath the pinned one.
  let schwarzHover: SchwarzOrbit | null = null;

  // σ progressive render (B1) + resolution (B2). The field is re-rendered only when schwarzFieldDirty (a
  // view / coloring / map / escape change); an overlay-only repaint (hover, inspect) re-blits the cached GL
  // frame. During pan/zoom a small DRAFT is drawn for fluidity, then an idle timer refines to full res.
  const SCHWARZ_CPU_SIZE = 256; // the CPU fallback stays coarse (per-Ω-pixel Newton is heavy)
  let schwarzAA = 1; // supersample factor for the GPU field (1 = native device pixels; B2 wires the UI)
  let schwarzDraft = false; // true ⇒ render a low-res draft this paint (mid pan/zoom)
  let schwarzFieldDirty = true; // true ⇒ the field changed and must be re-rendered (else re-blit the cache)
  let schwarzLastRenderSize = 0; // the GL canvas's current dimension, for the draw-image source rect
  let schwarzRefineTimer = 0; // the idle-refine debounce handle
  let schwarzCpuImage: ImageData | null = null; // cached CPU field, for overlay-only repaints

  /** The σ canvas backing resolution (device pixels): the displayed CSS size × devicePixelRatio, floored at
   *  256 and capped at the GPU's max render size — so the field is crisp on hi-DPI displays instead of a
   *  fixed 512² upscaled (B2). */
  function schwarzBackingSize(): number {
    const canvas = byId<HTMLCanvasElement>("JCSSchwarz");
    const r = canvas.getBoundingClientRect();
    const cssMax = Math.max(r.width, r.height) || 512;
    const dpr = window.devicePixelRatio || 1;
    const cap = Math.min(schwarzGL?.maxSize ?? 4096, 4096); // the GPU limit, and a perf ceiling
    return Math.max(256, Math.min(Math.round(cssMax * dpr), cap));
  }

  /** Paint the σ field at the current `schwarzView`. GPU → render (draft or full res) then drawImage; CPU →
   *  putImageData. The field is re-rendered only when dirty; the orbit overlays + scale bar are drawn every
   *  paint over the (possibly cached) field. */
  function paintSchwarz(): void {
    if (!schwarzSession) return;
    const { engine, poly, mode, boundedOmega } = schwarzSession;
    const canvas = byId<HTMLCanvasElement>("JCSSchwarz");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const backing = mode === "GPU" ? schwarzBackingSize() : SCHWARZ_CPU_SIZE;
    if (canvas.width !== backing || canvas.height !== backing) {
      canvas.width = backing;
      canvas.height = backing;
      schwarzFieldDirty = true; // a backing resize invalidates the cached frame
    }
    if (mode === "GPU" && schwarzGL) {
      // Draft mid-interaction (a quarter res, fast); full res = the backing × the AA supersample, GPU-capped.
      const full = Math.min(schwarzGL.maxSize, Math.round(backing * schwarzAA));
      const renderSize = schwarzDraft ? Math.max(160, Math.round(backing / 4)) : full;
      if (schwarzFieldDirty) {
        schwarzGL.render(schwarzView, renderSize, {
          ...schwarzEscape,
          scaleMode: schwarzScaleMode,
          colorMode: schwarzColorMode,
          trapShape: schwarzTrapShape,
          rotation: schwarzRotation,
          gamma: schwarzGamma,
          vignette: schwarzVignette,
        });
        schwarzLastRenderSize = renderSize;
      }
      // Downscale a supersampled (or upscale a draft) GL frame into the backing; a 1:1 native frame is crisp.
      ctx.imageSmoothingEnabled = schwarzLastRenderSize !== backing;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(schwarzGL.canvas, 0, 0, schwarzLastRenderSize, schwarzLastRenderSize, 0, 0, backing, backing);
    } else {
      if (schwarzFieldDirty || !schwarzCpuImage || schwarzCpuImage.width !== backing) {
        const rgba = renderSchwarzField(engine, poly, schwarzView, backing, { ...schwarzEscape, boundedOmega });
        schwarzCpuImage = new ImageData(backing, backing); // construct-then-set — avoids the
        schwarzCpuImage.data.set(rgba); // Uint8ClampedArray<ArrayBuffer> constructor-overload variance
      }
      ctx.putImageData(schwarzCpuImage, 0, 0);
    }
    // Orbit overlays on top of the field: the transient hover preview (faint, S5-A2) under the pinned
    // click-inspect orbit (bold, ADR-0009 item 3) — both redrawn for the current view + backing scale.
    if (schwarzHover) drawSchwarzOrbit(ctx, schwarzHover, schwarzView, backing, { preview: true });
    if (schwarzInspect) drawSchwarzOrbit(ctx, schwarzInspect, schwarzView, backing);
    // Scale bar (ADR-0009 item 3) — CD's own overlay helper; the σ view shares its center/zoom convention
    // (span = 2/zoom), so it reads correctly. Last, so an orbit line never hides it (it has its own backing).
    drawScaleBar(ctx, backing, schwarzView.zoom);
    schwarzFieldDirty = false;
    syncSchwarzViewFields(); // keep the precise-nav fields + view chip mirroring the live view
  }

  /** Mirror the live view into the precise-nav fields — unless the user is editing one (don't clobber a
   *  half-typed value; a paint only fires on a view change, so this is just belt-and-suspenders). */
  function syncSchwarzViewFields(): void {
    // The persistent view chip (A2) mirrors the window regardless of focus — update it first, before the
    // guard below that leaves the input fields alone while the user is typing into one.
    updateSchwarzViewChip();
    const re = document.getElementById("schwarz-center-re") as HTMLInputElement | null;
    const im = document.getElementById("schwarz-center-im") as HTMLInputElement | null;
    const zoom = document.getElementById("schwarz-zoom") as HTMLInputElement | null;
    if (!re || !im || !zoom) return;
    const active = document.activeElement;
    if (active === re || active === im || active === zoom) return;
    const f = formatSchwarzViewFields(schwarzView);
    re.value = f.re;
    im.value = f.im;
    zoom.value = f.zoom;
  }

  /** Reflect the live σ view in the persistent view chip (A2 — parity with the standard plots' `.view-summary`):
   *  `centre · zoom · family`, or a prompt when no σ is loaded yet. */
  function updateSchwarzViewChip(): void {
    const chip = document.getElementById("schwarz-view-chip");
    if (!chip) return;
    if (!schwarzSession) {
      chip.textContent = "generate a σ to begin";
      return;
    }
    const f = formatSchwarzViewFields(schwarzView);
    const centre = `${f.re}${f.im.startsWith("-") ? "" : "+"}${f.im}i`;
    const family = schwarzSession.boundedOmega ? "bounded" : "unbounded";
    chip.textContent = `${centre} · zoom ${f.zoom} · ${family}`;
  }

  /** (Re)render the σ legend chip — title + end labels describe WHAT the ramp maps in the active color mode
   *  (S5-B1): escape time (with the scale mode), orbit-trap closeness (with the trap shape), or the stripe
   *  average. Keeps the legend honest when the ramp no longer encodes escape count. */
  function renderSchwarzLegendChip(): void {
    const el = document.getElementById("schwarz-legend");
    if (!el) return;
    let title: string, loLabel: string, hiLabel: string;
    if (schwarzColorMode === "trap") {
      const shape = SCHWARZ_TRAP_SHAPES.find((m) => m.key === schwarzTrapShape)?.label ?? "Cross (axes)";
      title = `Orbit trap · ${shape}`;
      loLabel = "far";
      hiLabel = "near trap";
    } else if (schwarzColorMode === "stripe") {
      title = "Stripe average";
      loLabel = "low";
      hiLabel = "high";
    } else if (schwarzColorMode === "smooth") {
      // S5-B2: the ramp colours the ESCAPING set by the continuous escape count (≈; the tiling is discrete).
      title = "Smooth escape (≈)";
      loLabel = "fast escape";
      hiLabel = "slow escape";
    } else if (schwarzColorMode === "distance") {
      title = "Distance estimate (≈)";
      loLabel = "fast escape";
      hiLabel = "near σ-Julia";
    } else {
      const scaleLabel = SCHWARZ_SCALE_MODES.find((m) => m.key === schwarzScaleMode)?.label ?? "Linear";
      title = `Escape time · ${scaleLabel}`;
      loLabel = "in K fast";
      hiLabel = "near ∂Ω";
    }
    renderSchwarzLegend(el, { colormapName: schwarzColormapName, title, loLabel, hiLabel });
  }
  /** rAF coalescer shared by the schedulers — at most one paint per animation frame. */
  function schwarzScheduleFrame(): void {
    if (schwarzRaf) return;
    schwarzRaf = requestAnimationFrame(() => {
      schwarzRaf = 0;
      paintSchwarz();
    });
  }
  /** Schedule a σ repaint that RE-RENDERS the field at full res (view / coloring / map / escape changed). */
  function scheduleSchwarzPaint(): void {
    schwarzFieldDirty = true;
    schwarzDraft = false;
    schwarzScheduleFrame();
  }
  /** Schedule an OVERLAY-only repaint (hover / inspect orbit changed) — the cached field is re-blitted, not
   *  re-rendered, so tracing an orbit never pays for a full field render. */
  function scheduleSchwarzOverlayPaint(): void {
    schwarzScheduleFrame();
  }
  /** Schedule a DRAFT field repaint (mid pan/zoom): render low-res now for fluidity, then refine to full res
   *  once the interaction goes idle (~150 ms). */
  function scheduleSchwarzDraftPaint(): void {
    schwarzFieldDirty = true;
    schwarzDraft = true;
    schwarzScheduleFrame();
    if (schwarzRefineTimer) clearTimeout(schwarzRefineTimer);
    schwarzRefineTimer = window.setTimeout(() => {
      schwarzRefineTimer = 0;
      schwarzDraft = false;
      schwarzFieldDirty = true; // refine ⇒ re-render at full res
      schwarzScheduleFrame();
    }, 150);
  }

  // σ orbit inspection (ADR-0009 item 3): clicking the σ canvas traces that point's orbit and draws it
  // over the field, with a readout of its fate. The readout lives in the σ pane (the sidebar #inspector is
  // hidden in σ mode). Honest labeling: σ is `≈`, so a fate reads as "of the reconstruction", not certified.
  function renderSchwarzInspectReadout(): void {
    const box = document.getElementById("schwarz-inspect");
    if (!box) return;
    if (!schwarzInspect) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    const w0 = schwarzInspect.points[0];
    const steps = schwarzInspect.points.length - 1;
    const mk = (cls: string, text: string): HTMLElement => {
      const el = document.createElement("span");
      el.className = cls;
      el.textContent = text;
      return el;
    };
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "schwarz-inspect-clear";
    clearBtn.textContent = "clear";
    clearBtn.title = "Remove the traced orbit";
    clearBtn.addEventListener("click", clearSchwarzInspect);
    box.hidden = false;
    box.replaceChildren(
      mk("schwarz-inspect-title", `orbit of ${formatComplex(truncateComplex(w0))}`),
      mk("schwarz-inspect-fate", schwarzOrbitLabel(schwarzInspect.kind, schwarzInspect.n)),
      mk("schwarz-inspect-steps", `${steps} iterate${steps === 1 ? "" : "s"} drawn`),
      clearBtn,
    );
  }
  /** Inspect the σ-orbit of w₀ (a plot point): trace it, show the readout, redraw with the overlay. */
  function setSchwarzInspect(w0: Complex): void {
    if (!schwarzSession) return;
    schwarzInspect = schwarzOrbitAt(schwarzSession.engine, schwarzSession.poly, w0, {
      ...schwarzEscape,
      boundedOmega: schwarzSession.boundedOmega,
    });
    renderSchwarzInspectReadout();
    scheduleSchwarzOverlayPaint(); // the orbit is an overlay — re-blit the cached field, don't re-render it
  }
  /** Drop the inspected orbit (readout hides, overlay disappears on the next paint). */
  function clearSchwarzInspect(): void {
    if (!schwarzInspect) return;
    schwarzInspect = null;
    renderSchwarzInspectReadout();
    scheduleSchwarzOverlayPaint();
  }

  /**
   * Enter the σ session for an already-built engine + its φ coefficients — the shared core of the import
   * and native-φ paths. Decides the render mode (GPU when WebGL2 is available, else the coarse CPU fallback
   * — per-Ω-pixel Newton is heavy), resets the view, and shows the canvas + label. The GPU render resolution
   * is chosen per-paint from the display size (B2), not fixed here.
   */
  function enterSchwarz(engine: ReturnType<typeof schwarzEngineFromMapSpec>, phi: SchwarzPhi): void {
    const poly = schwarzBoundaryPoly(engine);
    // S5-C2: a bounded φ uniformizes 𝔻 → Ω, so Ω is the INTERIOR of ∂Ω — the CPU field/orbit tracer flip
    // their in-Ω test (the GPU reads phi.family itself in setPhi). Absent family ⇒ the exterior orientation.
    const boundedOmega = phi.family === "bounded";
    if (schwarzGL === undefined) schwarzGL = createSchwarzGLRenderer();
    let mode: "GPU" | "CPU" = "CPU";
    if (schwarzGL) {
      try {
        schwarzGL.setPhi(phi, poly);
        schwarzGL.setColormap(schwarzColormapName); // apply the current σ palette to this session
        mode = "GPU";
      } catch (err) {
        console.warn("schwarzGL setPhi failed; falling back to the CPU field:", err);
      }
    }
    schwarzSession = { engine, poly, phi, boundedOmega, mode };
    schwarzView = { ...SCHWARZ_DEFAULT_VIEW };
    schwarzInspect = null; // a new φ ⇒ any previous orbit is stale
    schwarzHover = null;
    schwarzFieldDirty = true; // a new map ⇒ (re)render the field
    schwarzCpuImage = null; // drop any cached CPU frame from a previous session
    renderSchwarzInspectReadout();
    renderSchwarzLegendChip(); // reflect the current colormap + scale in the legend
    document.querySelector(".workspace")?.classList.add("schwarz-active"); // enter σ mode → show the pane
    try {
      paintSchwarz();
    } catch (err) {
      // A GPU render that throws at paint time degrades the whole session to CPU, in THIS call.
      if (schwarzSession.mode === "GPU") {
        console.warn("schwarzGL render failed; falling back to the CPU field:", err);
        schwarzSession = { engine, poly, phi, boundedOmega, mode: "CPU" };
        schwarzFieldDirty = true;
        paintSchwarz();
      }
    }
    const label = byId<HTMLElement>("dyn-schwarz-label");
    label.textContent = `Schwarz reflection σ (≈, ${schwarzSession.mode}) · drag · scroll · ↩/Esc to exit`;
  }
  /** Import path: reconstruct from an interchange schwarz map. Throws (to the caller's toast) for an
   *  unsupported φ — reconstruct BEFORE entering so a bad map never half-shows a wrong field. */
  function renderSchwarzView(spec: SchwarzMap): void {
    enterSchwarz(schwarzEngineFromMapSpec(spec), schwarzPhiFromMapSpec(spec));
  }
  /** Native + restore path: build the σ engine from φ coefficients (a preset, the custom form, or a
   *  serialized σ view) and enter. Dispatches on the family — a bounded φ (S5-C2) uses the interior-branch
   *  engine, everything else the unbounded-Laurent engine. */
  function renderSchwarzFromPhi(phi: SchwarzPhi): void {
    const engine =
      phi.family === "bounded"
        ? makeBoundedSchwarz(phi.w0 ?? [0, 0], phi.branches)
        : makeUnboundedLaurentSchwarz(phi.c, phi.F, phi.branches);
    enterSchwarz(engine, phi);
  }
  /**
   * Restore a σ view from a serialized `_sigma` state (permalink / saved view / PNG — ADR-0009 item 2):
   * the φ recipe, the exact window, and the coloring. Sets the coloring BEFORE entering so `enterSchwarz`
   * applies it, then overrides the reset-to-default view and syncs the σ controls + legend.
   */
  function restoreSchwarzFromState(s: SigmaViewState): void {
    schwarzColormapName = s.colormap;
    schwarzScaleMode = s.scale;
    schwarzColorMode = s.colorMode;
    schwarzTrapShape = s.trapShape;
    schwarzRotation = s.rotation;
    schwarzGamma = s.gamma;
    schwarzVignette = s.vignette;
    schwarzAA = s.aa; // B2 render knobs travel with the σ view
    schwarzEscape.maxIter = s.maxIter;
    schwarzEscape.escapeR = s.escapeR;
    renderSchwarzFromPhi(s.phi); // build engine + enter σ (resets the view to default, applies the colormap)
    schwarzView = { center: [s.center[0], s.center[1]], zoom: s.zoom }; // ...then restore the exact window
    const cm = document.getElementById("schwarz-colormap") as HTMLSelectElement | null;
    if (cm) cm.value = schwarzColormapName;
    const sc = document.getElementById("schwarz-scale") as HTMLSelectElement | null;
    if (sc) sc.value = schwarzScaleMode;
    const aaEl = document.getElementById("schwarz-aa") as HTMLSelectElement | null;
    if (aaEl) aaEl.value = String(schwarzAA);
    const itEl = document.getElementById("schwarz-iters") as HTMLInputElement | null;
    if (itEl) itEl.value = String(schwarzEscape.maxIter);
    const erEl = document.getElementById("schwarz-escaper") as HTMLInputElement | null;
    if (erEl) erEl.value = String(schwarzEscape.escapeR);
    syncSchwarzColorModeControls();
    syncSchwarzToneControls();
    renderSchwarzLegendChip();
    scheduleSchwarzPaint(); // paint at the restored window (also mirrors it into the nav fields)
  }

  /** Mirror the σ tone state (rotation / gamma / vignette) into their sliders. */
  function syncSchwarzToneControls(): void {
    const set = (id: string, v: number): void => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = String(v);
    };
    set("schwarz-rotation", schwarzRotation);
    set("schwarz-gamma", schwarzGamma);
    set("schwarz-vignette", schwarzVignette);
  }
  /** Mirror the σ color-mode + trap-shape state into their selects, and reveal the trap-shape row only in
   *  "trap" mode (it is irrelevant to escape-time / stripe). */
  function syncSchwarzColorModeControls(): void {
    const md = document.getElementById("schwarz-colormode") as HTMLSelectElement | null;
    if (md) md.value = schwarzColorMode;
    const tp = document.getElementById("schwarz-trapshape") as HTMLSelectElement | null;
    if (tp) tp.value = schwarzTrapShape;
    const row = document.getElementById("schwarz-trapshape-row");
    if (row) row.hidden = schwarzColorMode !== "trap";
  }
  /** The σ view as a serializable state (for `_sigma` + the PNG stamp). Requires an active session. */
  function currentSigmaState(): SigmaViewState | null {
    if (!schwarzSession) return null;
    return {
      phi: schwarzSession.phi,
      center: schwarzView.center,
      zoom: schwarzView.zoom,
      colormap: schwarzColormapName,
      scale: schwarzScaleMode,
      colorMode: schwarzColorMode,
      trapShape: schwarzTrapShape,
      rotation: schwarzRotation,
      gamma: schwarzGamma,
      vignette: schwarzVignette,
      aa: schwarzAA,
      maxIter: schwarzEscape.maxIter,
      escapeR: schwarzEscape.escapeR,
    };
  }

  /**
   * Save the σ view as a PNG with the reproducible state embedded (ADR-0009 item 2, PNG surface). Re-renders
   * the field clean (no orbit overlay) at `size` on the GPU when available — a crisper export than the
   * on-screen 512² — else falls back to the current canvas. The `cdjs:state` tEXt is the same permalink
   * `readFullState` builds, so it now carries `_sigma`; `cdjs:sigma` is a human-readable summary.
   */
  async function saveSchwarzPng(): Promise<void> {
    const sig = currentSigmaState();
    if (!schwarzSession || !sig) return;
    // Export options (S5-A1): size + which overlays to bake in. The GPU path re-renders clean at `size`;
    // the CPU fallback can only give the on-screen field (per-pixel Newton at hi-res is too slow).
    const sizeSel = document.getElementById("schwarz-export-size") as HTMLSelectElement | null;
    const wantScaleBar = (document.getElementById("schwarz-export-scalebar") as HTMLInputElement | null)?.checked ?? true;
    const wantOrbit = (document.getElementById("schwarz-export-orbit") as HTMLInputElement | null)?.checked ?? false;
    const size = Math.min(Number(sizeSel?.value) || 1024, getMaxTextureSize()); // single-pass ⇒ cap at the GPU max
    let canvas: HTMLCanvasElement;
    if (schwarzSession.mode === "GPU" && schwarzGL) {
      schwarzGL.render(schwarzView, size, {
        ...schwarzEscape,
        scaleMode: schwarzScaleMode,
        colorMode: schwarzColorMode,
        trapShape: schwarzTrapShape,
        rotation: schwarzRotation,
        gamma: schwarzGamma,
        vignette: schwarzVignette,
      });
      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const octx = out.getContext("2d");
      if (!octx) return;
      octx.drawImage(schwarzGL.canvas, 0, 0);
      if (wantOrbit && schwarzInspect) drawSchwarzOrbit(octx, schwarzInspect, schwarzView, size);
      if (wantScaleBar) drawScaleBar(octx, size, schwarzView.zoom);
      canvas = out;
      scheduleSchwarzPaint(); // the render above resized the offscreen GL canvas — repaint the on-screen 512²
    } else {
      canvas = byId<HTMLCanvasElement>("JCSSchwarz"); // CPU fallback: the current field as shown (size ignored)
    }
    const metadata: Record<string, string> = {
      Software: "ComplexDynamicsJS",
      "cdjs:sigma": schwarzStampParams(sig),
      "cdjs:state": `${location.origin}${location.pathname}${encodeState(readFullState())}`,
    };
    try {
      await downloadCanvas(canvas, "schwarz-sigma.png", metadata);
      showToast("Saved the σ image (state embedded in the PNG).", "info");
    } catch {
      showToast("Could not save the σ image.", "warn");
    }
  }

  /** Leave the σ peer view — back to the Parameter & Dynamical plots. Idempotent (safe if not in σ mode). */
  function exitSchwarzView(): void {
    schwarzSession = null;
    if (schwarzRaf) {
      cancelAnimationFrame(schwarzRaf);
      schwarzRaf = 0;
    }
    document.querySelector(".workspace")?.classList.remove("schwarz-active");
  }

  // σ interaction: drag to pan, wheel to zoom (about the cursor), Esc to exit. Handlers are installed
  // once and are no-ops unless a σ session is active — so they never interfere with the normal plot.
  {
    const canvas = byId<HTMLCanvasElement>("JCSSchwarz");
    const clientToUv = (e: PointerEvent | WheelEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [
        Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))),
        Math.min(1, Math.max(0, (e.clientY - r.top) / Math.max(1, r.height))),
      ];
    };
    let lastUv: [number, number] | null = null;
    let downClient: [number, number] | null = null;
    let movedSinceDown = false;
    const CLICK_TOL_PX = 4; // total travel under this ⇒ a click (inspect the orbit), not a drag (pan)
    // Hover orbit-preview (S5-A2): trace the orbit under the cursor and repaint (rAF-coalesced). Clears when
    // the pointer leaves. Off during a drag (a pan already repaints) and on touch (no hover).
    const setSchwarzHover = (e: PointerEvent): void => {
      if (!schwarzSession) return;
      const uv = clientToUv(e);
      schwarzHover = schwarzOrbitAt(
        schwarzSession.engine,
        schwarzSession.poly,
        uvToPlotFrac(schwarzView, uv[0], uv[1]),
        { ...schwarzEscape, boundedOmega: schwarzSession.boundedOmega },
      );
      scheduleSchwarzOverlayPaint(); // hover only moves the preview orbit — re-blit the cached field
    };
    const clearSchwarzHover = (): void => {
      if (!schwarzHover) return;
      schwarzHover = null;
      scheduleSchwarzOverlayPaint();
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (!schwarzSession) return;
      lastUv = clientToUv(e);
      downClient = [e.clientX, e.clientY];
      movedSinceDown = false;
      schwarzHover = null; // a drag/click supersedes the hover preview
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!schwarzSession) return;
      if (!lastUv) {
        setSchwarzHover(e); // not dragging ⇒ preview the orbit under the cursor
        return;
      }
      if (downClient && Math.hypot(e.clientX - downClient[0], e.clientY - downClient[1]) > CLICK_TOL_PX) {
        movedSinceDown = true; // it's a drag now — a trailing click won't inspect
      }
      const cur = clientToUv(e);
      schwarzView = panSchwarzView(schwarzView, lastUv, cur); // move the grabbed point under the cursor
      lastUv = cur;
      scheduleSchwarzDraftPaint(); // draft while dragging; refine to full res once the pan goes idle
    });
    canvas.addEventListener("pointerleave", clearSchwarzHover);
    const endDrag = (e: PointerEvent): void => {
      if (!lastUv) return;
      lastUv = null;
      downClient = null;
      canvas.style.cursor = "grab";
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer was not captured — fine */
      }
    };
    canvas.addEventListener("pointerup", (e) => {
      const wasClick = lastUv !== null && !movedSinceDown;
      endDrag(e);
      // A click (no meaningful drag) inspects the σ-orbit of the point under the cursor.
      if (wasClick && schwarzSession) {
        const uv = clientToUv(e);
        setSchwarzInspect(uvToPlotFrac(schwarzView, uv[0], uv[1]));
      }
    });
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!schwarzSession) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12; // scroll up ⇒ zoom in
        const next = zoomSchwarzView(schwarzView, factor, clientToUv(e));
        next.zoom = Math.min(SCHWARZ_ZOOM_MAX, Math.max(SCHWARZ_ZOOM_MIN, next.zoom)); // keep the window sane
        schwarzView = next;
        scheduleSchwarzDraftPaint(); // draft while zooming; refine to full res once the wheel goes idle
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if (schwarzSession && e.key === "Escape") {
        e.preventDefault();
        exitSchwarzView();
      }
    });
    // Re-fit the backing resolution when the display size / devicePixelRatio changes (window resize, or the
    // A3 side-panel reflowing the canvas cell). Draft first, then the idle refine renders crisp at the new size.
    window.addEventListener("resize", () => {
      if (schwarzSession) scheduleSchwarzDraftPaint();
    });
  }

  // Native σ builder: generate a σ fractal from a Riemann map φ — a preset or a custom map (leading c,
  // Laurent F, finite-pole branches) — with no interchange link (S4b-iv). The φ-form parsing + validation
  // is pure (render/schwarzPhiForm.ts); this only wires the fields to `renderSchwarzFromPhi`.
  {
    const openBtn = document.getElementById("schwarz-open"); // sidebar → open the σ peer view
    const exitBtn = document.getElementById("schwarz-exit"); // σ pane header → back to the plots
    const presetSel = document.getElementById("schwarz-preset") as HTMLSelectElement | null;
    const familySel = document.getElementById("schwarz-family") as HTMLSelectElement | null; // unbounded | bounded
    const cIn = document.getElementById("schwarz-c") as HTMLInputElement | null;
    const fIn = document.getElementById("schwarz-F") as HTMLInputElement | null;
    const w0In = document.getElementById("schwarz-w0") as HTMLInputElement | null; // bounded centre φ(0) (S5-C2)
    const polesIn = document.getElementById("schwarz-poles") as HTMLTextAreaElement | null;
    const unbFields = document.getElementById("schwarz-fields-unbounded");
    const bndFields = document.getElementById("schwarz-fields-bounded");
    const genBtn = document.getElementById("schwarz-generate"); // in-pane → re-render the edited φ
    const errBox = document.getElementById("schwarz-error");
    if (openBtn && exitBtn && presetSel && familySel && cIn && fIn && w0In && polesIn && unbFields && bndFields && genBtn && errBox) {
      // Populate the preset dropdown (the leading "Custom…" option is already in the HTML).
      for (const p of SCHWARZ_PRESETS) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        presetSel.appendChild(opt);
      }
      const setError = (msg: string | null): void => {
        errBox.textContent = msg ?? "";
        errBox.hidden = msg === null;
      };
      // Show only the active family's fields (unbounded: c + F; bounded: w₀). Poles are shared. The σ engine
      // is chosen from this selector, so the visible fields always match what "Generate σ" will build.
      const syncFamily = (): void => {
        const bounded = familySel.value === "bounded";
        unbFields.hidden = bounded;
        bndFields.hidden = !bounded;
      };
      const fill = (id: string): void => {
        const p = SCHWARZ_PRESETS.find((x) => x.id === id);
        if (!p) return;
        familySel.value = p.family ?? "unbounded";
        cIn.value = p.c;
        fIn.value = p.F;
        w0In.value = p.w0 ?? "0";
        polesIn.value = p.poles;
        syncFamily();
      };
      // Start on the deltoid so the pane opens showing a working example (single source: SCHWARZ_PRESETS).
      presetSel.value = "deltoid";
      fill("deltoid");
      // Build φ from the fields and render — entering σ mode (renderSchwarzFromPhi → enterSchwarz shows the
      // pane). Show the pane first regardless, so a validation error lands on the now-visible error line.
      const generate = (): void => {
        document.querySelector(".workspace")?.classList.add("schwarz-active");
        try {
          const family = familySel.value === "bounded" ? "bounded" : "unbounded";
          renderSchwarzFromPhi(buildSchwarzPhi({ family, c: cIn.value, F: fIn.value, w0: w0In.value, poles: polesIn.value }));
          setError(null);
        } catch (err) {
          setError((err as Error).message); // buildSchwarzPhi's messages are written for this line
        }
      };
      openBtn.addEventListener("click", generate); // sidebar entry → open σ + render the current φ (deltoid)
      genBtn.addEventListener("click", generate); // in-pane "Generate σ" → re-render the edited φ (stays in σ)
      exitBtn.addEventListener("click", () => {
        exitSchwarzView();
        setError(null);
      });
      presetSel.addEventListener("change", () => {
        if (presetSel.value) {
          fill(presetSel.value);
          setError(null);
        }
      });
      // Switching family is a deliberate mode change ⇒ a "Custom…" φ; swap the visible fields to match.
      familySel.addEventListener("change", () => {
        presetSel.value = "";
        syncFamily();
      });
      // Hand-editing any field makes it a "Custom…" map (programmatic fill() does not fire 'input').
      for (const el of [cIn, fIn, w0In, polesIn]) {
        el.addEventListener("input", () => {
          presetSel.value = "";
        });
      }
    }
  }

  // σ coloring controls (ADR-0009 item 3 — colormap + scale-mode parity with the standard fractals). Live
  // in the σ pane, so a change only fires in σ mode; it updates the in-session preference, applies to the
  // renderer, and repaints (rAF-coalesced).
  {
    const cmSel = document.getElementById("schwarz-colormap") as HTMLSelectElement | null;
    const scSel = document.getElementById("schwarz-scale") as HTMLSelectElement | null;
    if (cmSel) {
      for (const name of SCHWARZ_COLORMAP_NAMES) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        cmSel.appendChild(opt);
      }
      cmSel.value = schwarzColormapName;
      cmSel.addEventListener("change", () => {
        schwarzColormapName = cmSel.value;
        schwarzGL?.setColormap(schwarzColormapName);
        renderSchwarzLegendChip(); // legend ramp follows the colormap
        scheduleSchwarzPaint();
      });
    }
    if (scSel) {
      for (const m of SCHWARZ_SCALE_MODES) {
        const opt = document.createElement("option");
        opt.value = m.key;
        opt.textContent = m.label;
        scSel.appendChild(opt);
      }
      scSel.value = schwarzScaleMode;
      scSel.addEventListener("change", () => {
        schwarzScaleMode = scSel.value;
        renderSchwarzLegendChip(); // legend title shows the scale mode
        scheduleSchwarzPaint();
      });
    }
    // σ-field color mode + orbit-trap shape (S5-B1). The mode picks WHAT the ramp encodes; the trap-shape
    // row is revealed only in "trap" mode. Both travel in the σ view (`_sigma`), like the colormap + scale.
    const mdSel = document.getElementById("schwarz-colormode") as HTMLSelectElement | null;
    const tpSel = document.getElementById("schwarz-trapshape") as HTMLSelectElement | null;
    if (mdSel) {
      for (const m of SCHWARZ_COLOR_MODES) {
        const opt = document.createElement("option");
        opt.value = m.key;
        opt.textContent = m.label;
        mdSel.appendChild(opt);
      }
      mdSel.value = schwarzColorMode;
      mdSel.addEventListener("change", () => {
        schwarzColorMode = mdSel.value;
        syncSchwarzColorModeControls(); // reveal / hide the trap-shape row
        renderSchwarzLegendChip(); // legend now describes the active mode
        scheduleSchwarzPaint();
      });
    }
    if (tpSel) {
      for (const m of SCHWARZ_TRAP_SHAPES) {
        const opt = document.createElement("option");
        opt.value = m.key;
        opt.textContent = m.label;
        tpSel.appendChild(opt);
      }
      tpSel.value = schwarzTrapShape;
      tpSel.addEventListener("change", () => {
        schwarzTrapShape = tpSel.value;
        renderSchwarzLegendChip(); // legend title shows the trap shape
        scheduleSchwarzPaint();
      });
    }
    syncSchwarzColorModeControls(); // set the initial trap-shape row visibility
  }

  // σ image-space tone (S5-A3): palette rotation + gamma + vignette sliders. Each live-updates the state
  // and repaints (rAF-coalesced); the values travel in the σ view (`_sigma`), like the colormap + scale.
  {
    const wire = (id: string, apply: (v: number) => void): void => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      el.addEventListener("input", () => {
        const v = Number.parseFloat(el.value);
        if (Number.isFinite(v)) {
          apply(v);
          scheduleSchwarzPaint();
        }
      });
    };
    wire("schwarz-rotation", (v) => (schwarzRotation = v));
    wire("schwarz-gamma", (v) => (schwarzGamma = v));
    wire("schwarz-vignette", (v) => (schwarzVignette = v));
  }

  // σ render controls (Phase B): AA supersample + the escape budget (iterations + escape radius). Each
  // re-renders the field at full res; the escape budget also re-traces the pinned inspect orbit so its fate
  // readout matches the field (they share ONE budget). The values travel in the σ view (`_sigma`).
  {
    const aaSel = document.getElementById("schwarz-aa") as HTMLSelectElement | null;
    const itIn = document.getElementById("schwarz-iters") as HTMLInputElement | null;
    const erIn = document.getElementById("schwarz-escaper") as HTMLInputElement | null;
    if (aaSel) {
      aaSel.value = String(schwarzAA);
      aaSel.addEventListener("change", () => {
        schwarzAA = Math.max(1, Math.min(4, Math.round(Number(aaSel.value) || 1)));
        scheduleSchwarzPaint(); // full re-render at the new supersample factor
      });
    }
    // The escape budget changes the FIELD (different escape counts) — full re-render, not an overlay blit;
    // and re-trace any pinned orbit so its readout fate matches the new budget.
    const applyEscape = (): void => {
      if (schwarzSession && schwarzInspect) {
        schwarzInspect = schwarzOrbitAt(schwarzSession.engine, schwarzSession.poly, schwarzInspect.points[0], {
          ...schwarzEscape,
          boundedOmega: schwarzSession.boundedOmega,
        });
        renderSchwarzInspectReadout();
      }
      scheduleSchwarzPaint();
    };
    if (itIn) {
      itIn.value = String(schwarzEscape.maxIter);
      itIn.addEventListener("change", () => {
        const v = Math.round(Number(itIn.value));
        if (Number.isFinite(v) && v >= 1) schwarzEscape.maxIter = Math.min(4096, v);
        itIn.value = String(schwarzEscape.maxIter); // normalise / restore on a bad value
        applyEscape();
      });
    }
    if (erIn) {
      erIn.value = String(schwarzEscape.escapeR);
      erIn.addEventListener("change", () => {
        const v = Number(erIn.value);
        if (Number.isFinite(v) && v > 1) schwarzEscape.escapeR = v;
        erIn.value = String(schwarzEscape.escapeR);
        applyEscape();
      });
    }
  }

  // σ precise navigation (ADR-0009 item 3 — type an exact centre + zoom; parity with the standard plots).
  // The fields mirror the live view (paintSchwarz → syncSchwarzViewFields); apply parses them into the
  // view, reset returns to the default window. Both repaint (which re-normalizes the fields).
  {
    const reIn = document.getElementById("schwarz-center-re") as HTMLInputElement | null;
    const imIn = document.getElementById("schwarz-center-im") as HTMLInputElement | null;
    const zoomIn = document.getElementById("schwarz-zoom") as HTMLInputElement | null;
    const applyBtn = document.getElementById("schwarz-view-apply");
    const resetBtn = document.getElementById("schwarz-view-reset");
    if (reIn && imIn && zoomIn && applyBtn && resetBtn) {
      const apply = (): void => {
        schwarzView = parseSchwarzViewInput(reIn.value, imIn.value, zoomIn.value, schwarzView);
        scheduleSchwarzPaint();
      };
      applyBtn.addEventListener("click", apply);
      // Enter in any field applies (matches the standard plots' center/zoom fields).
      for (const el of [reIn, imIn, zoomIn]) {
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        });
      }
      resetBtn.addEventListener("click", () => {
        schwarzView = { ...SCHWARZ_DEFAULT_VIEW };
        scheduleSchwarzPaint();
      });
    }
    const savePngBtn = document.getElementById("schwarz-save-png");
    if (savePngBtn) savePngBtn.addEventListener("click", () => void saveSchwarzPng()); // PNG w/ embedded state
  }

  /**
   * Import a map handed off via @cas/interchange (a deep link OR pasted JSON, from e.g. the
   * Quadrature Domains app's "Export map"). Returns whether the input WAS an interchange payload —
   * so callers can fall through to another format when it is not. On success, sets f to the
   * imported map and re-renders (an imported φ becomes a live dynamical plane like any other map).
   */
  function importInterchange(input: string): boolean {
    let env: Envelope;
    try {
      const t = input.trim();
      env = t.startsWith("{") ? validateEnvelope(JSON.parse(t)) : decodeLink(t);
    } catch {
      return false; // not an interchange payload — let the caller try its own format
    }
    const spec = envelopeToMapSpec(env);
    if (!spec) {
      showToast("Imported interchange payload has no map to render.", "info");
      return true;
    }
    if (spec.form === "schwarz") {
      // σ is reconstructed NUMERICALLY (φ⁻¹ is iterative), not expr/GPU-compiled: rebuild the evaluator
      // from sigma.phi via @cas/schwarz and paint its escape-time field (S4a; bounded QDs since S5-C2d, on
      // the interior branch + interior-Ω orientation). The reconstruct can throw for a family the engine
      // doesn't support (a non-Laurent/non-bounded φ) — decline honestly, don't crash.
      try {
        renderSchwarzView(spec);
      } catch (err) {
        showToast(`Imported a ${env.kind}, but σ reconstruction isn't supported for this map: ${(err as Error).message}`, "info");
        return true;
      }
      showToast(`Reconstructed the Schwarz reflection σ from ${env.provenance.app} — opened the σ view (≈).`, "info");
      return true;
    }
    exitSchwarzView(); // importing a standard (non-σ) map returns from the σ peer view to the plots
    const st = readFullState();
    st.inpf = mapSpecToExpr(spec);
    applyFullState(st);
    showToast(`Imported a ${env.kind} map from ${env.provenance.app}.`, "info");
    return true;
  }

  /** Prompt the user to paste an interchange link / JSON, then import it. */
  function promptImportInterchange(): void {
    const input = window.prompt(
      "Paste an interchange deep link or JSON (e.g. from the Quadrature Domains app's Export map):",
    );
    if (input && !importInterchange(input)) {
      showToast("That is not a valid @cas/interchange link or JSON.", "info");
    }
  }

  /** If the URL hash holds a shared view, apply it. Returns whether it did. */
  function loadFromHash(): boolean {
    // A map deep-link (interchange) rides #s=; CD's own view-state permalink rides #vs= (its own key,
    // so the two never collide and neither has to sniff the other's payload). Try the map import
    // first, then CD's view-state.
    if (/^#s=/.test(location.hash) && importInterchange(location.hash)) return true;
    const state = decodeState(location.hash);
    if (!state) return false;
    applyFullState(state);
    return true;
  }

  /** Refresh the saved-views dropdown from localStorage. */
  function populateViewSelect(): void {
    const select = byId<HTMLSelectElement>("saved-views");
    const names = Object.keys(loadSavedViews()).sort();
    select.innerHTML = '<option value="">Saved views…</option>';
    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }
    byId<HTMLButtonElement>("delete-view-btn").disabled = true;
  }

  /** Save the current view under the name typed in the view-name input. */
  function saveCurrentView(): void {
    const input = byId<HTMLInputElement>("view-name");
    const name = input.value.trim();
    if (!name) {
      showToast("Type a name for the view first.", "warn");
      return;
    }
    const views = loadSavedViews();
    // Saving over an existing name destroys the old view. Report that rather than toasting plain
    // success, and offer the way back — the previous state is right here (cd-views-destructive-01).
    const replaced = Object.prototype.hasOwnProperty.call(views, name) ? views[name] : null;
    views[name] = readFullState();
    saveSavedViews(views);
    populateViewSelect();
    byId<HTMLSelectElement>("saved-views").value = name;
    byId<HTMLButtonElement>("delete-view-btn").disabled = false;
    input.value = "";
    if (replaced) {
      showToast(`Replaced the saved view “${name}”.`, "warn", 10000, {
        label: "Undo",
        onClick: () => restoreView(name, replaced, `Restored the previous “${name}”.`),
      });
    } else {
      showToast(`Saved view “${name}”.`, "info");
    }
  }

  /** Put a captured view back under its name (the Undo behind a delete / overwrite). */
  function restoreView(name: string, state: AppState, message: string): void {
    const views = loadSavedViews();
    views[name] = state;
    saveSavedViews(views);
    populateViewSelect();
    byId<HTMLSelectElement>("saved-views").value = name;
    byId<HTMLButtonElement>("delete-view-btn").disabled = false;
    showToast(message, "info");
  }

  /** Load the view selected in the dropdown. */
  function loadSelectedView(): void {
    const name = byId<HTMLSelectElement>("saved-views").value;
    byId<HTMLButtonElement>("delete-view-btn").disabled = !name;
    if (!name) return;
    const state = loadSavedViews()[name];
    if (!state) return;
    applyFullState(state);
    scheduleRecord();
    showToast(`Loaded view “${name}”.`, "info");
  }

  /** Delete the selected saved view, keeping a copy so the toast can put it back. */
  function deleteSelectedView(): void {
    const name = byId<HTMLSelectElement>("saved-views").value;
    if (!name) return;
    const views = loadSavedViews();
    // The deletion is committed straight to localStorage with no confirmation, so the recovery
    // affordance has to be visible right after the act rather than left to Ctrl+Z, which does not
    // reach localStorage at all. Capture before deleting (cd-views-destructive-01).
    const removed = Object.prototype.hasOwnProperty.call(views, name) ? views[name] : null;
    delete views[name];
    saveSavedViews(views);
    populateViewSelect();
    showToast(`Deleted view “${name}”.`, "info", 10000, {
      label: "Undo",
      onClick: () => {
        if (removed) restoreView(name, removed, `Restored view “${name}”.`);
      },
    });
  }

  // --- undo / redo (a debounced history stack over the AppState) ---------
  const undoStack: AppState[] = [];
  const redoStack: AppState[] = [];
  let lastSnapshot: AppState = {};
  let recordTimer = 0;
  const MAX_HISTORY = 50;

  function updateHistoryButtons(): void {
    byId<HTMLButtonElement>("undo-btn").disabled = undoStack.length === 0;
    byId<HTMLButtonElement>("redo-btn").disabled = redoStack.length === 0;
  }

  /** Commit a history entry if the state changed since the last snapshot. */
  function recordHistory(): void {
    const cur = readFullState();
    if (JSON.stringify(cur) === JSON.stringify(lastSnapshot)) return;
    undoStack.push(lastSnapshot);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = cur;
    updateHistoryButtons();
  }

  /** Debounced commit — collapses rapid edits / slider drags into one entry. */
  function scheduleRecord(): void {
    window.clearTimeout(recordTimer);
    recordTimer = window.setTimeout(recordHistory, 350);
  }

  /** Apply a snapshot to the controls + plots (event-free, so it doesn't self-record). */
  function restoreSnapshot(state: AppState): void {
    lastSnapshot = state;
    applyFullState(state);
    // Repopulating the controls fires input/change events, which scheduleRecord() turns into a pending
    // history commit — drop it AFTER applying (mirrors the init baseline near the end of setup). Clearing
    // only BEFORE applyFullState leaves that commit armed to fire in 350 ms and, if the state reads back
    // even slightly changed, push a spurious undo entry and zero the redo stack on the next undo/redo.
    window.clearTimeout(recordTimer);
    updateHistoryButtons();
  }

  function undo(): void {
    if (undoStack.length === 0) return;
    redoStack.push(lastSnapshot);
    restoreSnapshot(undoStack.pop() as AppState);
  }

  function redo(): void {
    if (redoStack.length === 0) return;
    undoStack.push(lastSnapshot);
    restoreSnapshot(redoStack.pop() as AppState);
  }

  /**
   * Phase 17 — animation recording. Drive `apply(t)` (t: 0→1) for `durationMs` via
   * requestAnimationFrame while capturing `plot`'s canvas to a WebM clip, then download it
   * and `restore()` the view. Full-resolution frames are forced during the capture. Keep
   * the tab focused (rAF pacing). One recording at a time.
   */
  let recording = false;
  async function recordAnimation(
    plot: GLPlot,
    btn: HTMLButtonElement,
    filename: string,
    durationMs: number,
    apply: (t: number) => void,
    restore: () => void,
  ): Promise<void> {
    if (recording) return;
    if (!canRecord()) {
      showToast("Video recording isn't supported in this browser.", "warn");
      return;
    }
    recording = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "recording…";
    const canvas = plot.glContext.canvas as HTMLCanvasElement;
    plot.setForceFullRender(true);
    let rec: ReturnType<typeof startRecording> | null = null;
    try {
      rec = startRecording(canvas, 30);
      const start = performance.now();
      await new Promise<void>((resolve, reject) => {
        const frame = (): void => {
          try {
            const t = (performance.now() - start) / durationMs;
            if (t >= 1) {
              resolve();
              return;
            }
            apply(t);
            requestAnimationFrame(frame);
          } catch (e) {
            // A throw inside a bare rAF callback would NOT reject the awaited promise, so `await` would
            // hang forever (recording stuck true, the button disabled, the capture tracks live). Reject
            // so the finally can tear everything down.
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        };
        frame();
      });
      downloadBlob(await rec.stop(), filename);
      rec = null; // stopped cleanly ⇒ don't double-stop in finally
      showToast(`Saved ${filename}`, "info");
    } catch (err) {
      showToast(`Recording failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      // Stop the capture (releasing the MediaStream tracks) even on a failed / aborted run — the track
      // teardown lives inside rec.stop(), which the success path may never have reached (frame-0 throw).
      if (rec) {
        try {
          await rec.stop();
        } catch {
          /* ignore */
        }
      }
      plot.setForceFullRender(false);
      restore();
      btn.disabled = false;
      btn.textContent = label;
      recording = false;
    }
  }

  /** Record a looping "Julia morph": sweep c around a small circle (dynamical plane). */
  function recordJuliaMorph(): void {
    const plot = dynamicalView.plot;
    const [cx, cy] = parameterView.plot.z0; // sweep centre = current parameter point
    const radius = 0.03;
    void recordAnimation(
      plot,
      byId<HTMLButtonElement>("record_morph"),
      "julia-morph.webm",
      4000,
      (t) => {
        const ang = t * 2 * Math.PI;
        plot.c = formatComplex([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)]);
        plot.render();
      },
      () => syncDynamicalC(), // restore c to the parameter point
    );
  }

  /** Record a zoom-in into the parameter plane (log-interpolated zoom over the clip). */
  function recordZoomMovie(): void {
    const plot = parameterView.plot;
    const z0 = plot.zoom;
    const factor = 1000; // total zoom-in across the clip
    void recordAnimation(
      plot,
      byId<HTMLButtonElement>("record_zoom"),
      "zoom.webm",
      6000,
      (t) => {
        plot.zoom = z0 * Math.pow(factor, t);
        plot.render();
      },
      () => {
        plot.zoom = z0;
        plot.scheduleRender();
      },
    );
  }

  // Phase 17 — keyframe timeline: a path of parameter-plane views to scrub / record.
  const keyframes: Keyframe[] = [];

  function updateKeyframeUI(): void {
    byId("kf-count").textContent = `(${keyframes.length})`;
    const ready = keyframes.length >= 2;
    byId<HTMLInputElement>("kf-scrub").disabled = !ready;
    byId<HTMLButtonElement>("kf-record").disabled = !ready;
    byId<HTMLButtonElement>("kf-gif").disabled = !ready;
  }

  /** Capture the current parameter-plane view as a keyframe. */
  function addKeyframe(): void {
    const [cx, cy] = parameterView.plot.center;
    keyframes.push({ center: [cx, cy], zoom: parameterView.plot.zoom });
    updateKeyframeUI();
    showToast(`Keyframe ${keyframes.length} added`, "info");
  }

  function clearKeyframes(): void {
    keyframes.length = 0;
    byId<HTMLInputElement>("kf-scrub").value = "0";
    updateKeyframeUI();
  }

  /** Seek the parameter plane to the scrub position along the keyframe path. */
  function applyScrub(): void {
    if (keyframes.length < 2) return;
    const v = interpolateView(keyframes, Number(byId<HTMLInputElement>("kf-scrub").value));
    parameterView.plot.center = v.center;
    parameterView.plot.zoom = v.zoom;
    // The plot's setters only schedule a render, so without this the scrub was invisible to
    // everything BUT the picture: the sidebar and view chip kept the pre-scrub centre/zoom, the
    // debounced history snapshot was built from those stale fields (so the scrubbed view never
    // entered the undo stack), "Share link" produced a permalink to the pre-scrub view, and the
    // next Apply — or Enter anywhere — re-read the stale inputs and snapped the plot back.
    syncParamViewInputs(parameterView.plot.center, parameterView.plot.zoom);
  }

  /** Play the keyframe path and record it to a WebM clip. */
  function recordKeyframePath(): void {
    if (keyframes.length < 2) {
      showToast("Add at least two keyframes first.", "warn");
      return;
    }
    const plot = parameterView.plot;
    const [sx, sy] = plot.center;
    const startZoom = plot.zoom;
    void recordAnimation(
      plot,
      byId<HTMLButtonElement>("kf-record"),
      "keyframe-path.webm",
      Math.max(2000, (keyframes.length - 1) * 2500),
      (t) => {
        const v = interpolateView(keyframes, t);
        plot.center = v.center;
        plot.zoom = v.zoom;
        plot.render();
      },
      () => {
        plot.center = [sx, sy];
        plot.zoom = startZoom;
        plot.scheduleRender();
      },
    );
  }

  /**
   * Encode an animation to an animated GIF (gif.js, in web workers) at a downscaled size.
   * Renders `frames` frames via `apply(t)`, snapshots each to a scratch canvas, then
   * encodes. Unlike the WebM path this isn't real-time, so it works frame-by-frame.
   */
  async function recordGif(
    plot: GLPlot,
    btn: HTMLButtonElement,
    filename: string,
    frames: number,
    apply: (t: number) => void,
    restore: () => void,
  ): Promise<void> {
    if (recording) return;
    recording = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "encoding…";
    const src = plot.glContext.canvas as HTMLCanvasElement;
    const w = Math.min(360, src.width);
    const h = Math.min(360, src.height);
    const scratch = document.createElement("canvas");
    scratch.width = w;
    scratch.height = h;
    const sctx = scratch.getContext("2d");
    plot.setForceFullRender(true);
    try {
      if (!sctx) throw new Error("2D context unavailable");
      const gif = new GIF({
        workers: 2,
        quality: 10,
        workerScript: gifWorkerUrl,
        width: w,
        height: h,
      });
      for (let i = 0; i < frames; i++) {
        apply(i / Math.max(1, frames - 1));
        sctx.drawImage(src, 0, 0, w, h);
        gif.addFrame(sctx, { copy: true, delay: 60 });
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        gif.on("finished", resolve);
        gif.on("abort", () => reject(new Error("GIF encoding aborted")));
        gif.render();
      });
      downloadBlob(blob, filename);
      showToast(`Saved ${filename}`, "info");
    } catch (err) {
      showToast(`GIF export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      plot.setForceFullRender(false);
      restore();
      btn.disabled = false;
      btn.textContent = label;
      recording = false;
    }
  }

  /** Export the Julia morph as an animated GIF. */
  function recordJuliaMorphGif(): void {
    const plot = dynamicalView.plot;
    const [cx, cy] = parameterView.plot.z0;
    const radius = 0.03;
    void recordGif(
      plot,
      byId<HTMLButtonElement>("gif-morph"),
      "julia-morph.gif",
      36,
      (t) => {
        const ang = t * 2 * Math.PI;
        plot.c = formatComplex([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)]);
        plot.render();
      },
      () => syncDynamicalC(),
    );
  }

  /** Export the keyframe path as an animated GIF. */
  function recordKeyframeGif(): void {
    if (keyframes.length < 2) {
      showToast("Add at least two keyframes first.", "warn");
      return;
    }
    const plot = parameterView.plot;
    const [sx, sy] = plot.center;
    const startZoom = plot.zoom;
    void recordGif(
      plot,
      byId<HTMLButtonElement>("kf-gif"),
      "keyframe-path.gif",
      Math.min(72, Math.max(24, (keyframes.length - 1) * 24)),
      (t) => {
        const v = interpolateView(keyframes, t);
        plot.center = v.center;
        plot.zoom = v.zoom;
        plot.render();
      },
      () => {
        plot.center = [sx, sy];
        plot.zoom = startZoom;
        plot.scheduleRender();
      },
    );
  }

  // --- wire up the UI controls ------------------------------------------

  document.addEventListener("keyup", (event) => {
    if (event.key === "Enter") applyChanges();
  });

  // Deferred text fields: a user edit marks the view "dirty" until applied.
  // (Programmatic updates via setValue, e.g. pan/zoom writing back the centre,
  // don't fire "input", so dragging the plot never shows the hint.)
  for (const id of Object.values(INPUT_IDS)) {
    const el = byId(id);
    el.addEventListener("input", () => {
      el.classList.add("dirty"); // highlight the specific changed field
      setDirty(true);
    });
  }

  // The visible centre boxes (real / imaginary) write their pair back into the hidden
  // canonical "x,y" field, then mark the view dirty — mirroring the deferred fields above.
  for (const [reId, imId, hiddenId] of [
    [CENTER_SUB_IDS.paramRe, CENTER_SUB_IDS.paramIm, INPUT_IDS.paramCenter],
    [CENTER_SUB_IDS.dynRe, CENTER_SUB_IDS.dynIm, INPUT_IDS.dynCenter],
  ] as const) {
    const re = byId<HTMLInputElement>(reId);
    const im = byId<HTMLInputElement>(imId);
    const hidden = byId<HTMLInputElement>(hiddenId);
    const onEdit = (ev: Event): void => {
      hidden.value = `${re.value.trim()},${im.value.trim()}`;
      (ev.currentTarget as HTMLElement).classList.add("dirty");
      setDirty(true);
    };
    re.addEventListener("input", onEdit);
    im.addEventListener("input", onEdit);
  }

  for (const id of ["mode", "palette", "aa"]) {
    byId(id).addEventListener("change", applyColoring);
  }
  byId("trap").addEventListener("change", applyTrap);
  byId("paletteRotation").addEventListener("input", applyColoring);
  applyColoring();
  updateDerivativeGating();
  byId("inspector-close").addEventListener("click", () => {
    byId("inspector").hidden = true;
  });
  byId("inspector-nucleus").addEventListener("click", () => {
    if (!lastNucleusSeed) return;
    const { point, period } = lastNucleusSeed;
    const nucleus = findNucleus(
      parameterView.plot.fAst,
      parameterView.plot.criticalPoint,
      period,
      point,
      parameterView.plot.paramA,
    );
    if (!nucleus) {
      showToast("No nucleus found near this point.", "warn");
      return;
    }
    // Snap the parameter white point (c) to the exact component centre; keep the view.
    parameterView.plot.moveZ0(nucleus);
    parameterView.refreshOverlay();
    // Mirror the parameter→dynamical coupling a normal point move performs.
    dynamicalView.plot.c = formatComplex(nucleus);
    setCInput(nucleus);
    updateDynCaption();
    announce(`Parameter c = ${dynCValue.textContent}`);
    // Re-inspect at the centre so the panel updates (period unchanged, |λ| → 0).
    const info = inspect(
      parameterView.plot.fAst,
      parameterView.plot.escAst,
      "param",
      parameterView.plot.criticalPoint,
      nucleus,
      parameterView.plot.paramA,
    );
    handleInspect(info, nucleus, "param");
    scheduleRecord();
  });
  byId("spider-go").addEventListener("click", () => {
    const m = byId<HTMLInputElement>("spider-angle")
      .value.trim()
      .match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) {
      showToast("Enter an external angle as a fraction p/q (e.g. 1/7).", "warn");
      return;
    }
    const pn = Number(m[1]);
    const qn = Number(m[2]);
    // Core entropy of θ (a combinatorial invariant of the angle, independent of the current map).
    const ce = coreEntropy(pn, qn);
    byId("angle-entropy").textContent = ce
      ? `Core entropy h ≈ ${ce.entropy.toFixed(4)} (λ ≈ ${ce.lambda.toFixed(4)}); biaccessibility B ≈ ${ce.biaccessibility.toFixed(4)}.`
      : "Core entropy: not computed for this angle (its orbit reaches the β-fixed angle).";
    if (parameterView.plot.monicDegree !== 2) {
      showToast(
        "Go-to-angle lands on the z²+c Mandelbrot set — switch to the Mandelbrot preset.",
        "warn",
      );
      return;
    }
    const landing = parameterLanding(pn, qn);
    if (!landing) {
      showToast("That angle has no usable landing.", "warn");
      return;
    }
    const fAst = parameterView.plot.fAst;
    const crit = parameterView.plot.criticalPoint;
    const pa = parameterView.plot.paramA;
    const clean = (x: number): number => (Math.abs(x) < 1e-10 ? 0 : +x.toPrecision(5));
    const fmtPt = (z: [number, number]): string => {
      const re = clean(z[0]);
      const im = clean(z[1]);
      return `${re} ${im >= 0 ? "+" : "−"} ${Math.abs(im)}i`;
    };

    // The ray's true landing is the component root (periodic) / Misiurewicz point / cusp. Navigation
    // snaps a periodic angle to the component *centre* (a nicer target than a boundary parabolic
    // point); the cusp / a Misiurewicz point is its own target.
    let target: [number, number] = [landing.point[0], landing.point[1]];
    let landDesc: string;
    if (landing.kind === "root") {
      const nuc = findNucleus(fAst, crit, landing.period, landing.point, pa);
      if (nuc) target = [nuc[0], nuc[1]];
      landDesc = `the period-${landing.period} root c = ${fmtPt(landing.point)} (→ its centre)`;
    } else if (landing.kind === "cusp") {
      landDesc = "the cardioid cusp c = 1/4";
    } else {
      landDesc = `the Misiurewicz point c = ${fmtPt(landing.point)}`;
    }

    parameterView.plot.moveZ0(target);
    parameterView.refreshOverlay();
    dynamicalView.plot.c = formatComplex(target);
    setCInput(target);
    updateDynCaption();

    // Where does the same angle's ray land on the Julia set we've navigated to?
    const dynLand = dynamicalLanding(pn, qn, target);
    const dynText = dynLand
      ? ` On this Julia set, the dynamical ray θ lands at ζ = ${fmtPt(dynLand.point)}${dynLand.refined ? "" : " (approx)"}.`
      : "";
    byId("angle-landing").textContent =
      `Parameter ray θ = ${pn}/${qn} lands at ${landDesc}.${dynText}`;

    announce(`Parameter c = ${dynCValue.textContent}`);
    showToast(
      `External angle ${pn}/${qn} → ${landing.kind === "root" ? "component root" : landDesc}.`,
      "info",
    );
    const info = inspect(fAst, parameterView.plot.escAst, "param", crit, target, pa);
    handleInspect(info, target, "param");
    scheduleRecord();
  });

  // Angles of a point (the inverse of ray landing): snap the last-clicked point to the nearest
  // low-period landing, draw the co-landing rays in cyan, and report valence + biaccessibility.
  byId("angles-find").addEventListener("click", () => {
    if (!isQuadraticFamily(parameterView.plot)) {
      showToast("External rays (and their angles) are defined for z²+c only.", "warn");
      return;
    }
    if (!lastInspect) {
      showToast("Click a point on either plane first, then press Find angles.", "warn");
      return;
    }
    const { point, plane } = lastInspect;
    const readout = byId("angles-of-point");
    const clean = (x: number): number => (Math.abs(x) < 1e-10 ? 0 : +x.toPrecision(5));
    const fmtPt = (z: Vec2): string =>
      `${clean(z[0])} ${z[1] >= 0 ? "+" : "−"} ${Math.abs(clean(z[1]))}i`;

    // Parameter rays on ∂M; dynamical rays on ∂K_c at the current c. Bounded so a click stays snappy.
    const res =
      plane === "dyn"
        ? nearestDynamicalAngles(point, parseComplex(dynamicalView.plot.c), { maxPeriod: 8 })
        : nearestParameterAngles(point, { maxPeriod: 6 });

    parameterView.setPointRays(null); // clear any previous find on both planes first
    dynamicalView.setPointRays(null);

    if (res.angles.length === 0 || !res.point) {
      readout.textContent =
        "No external ray lands near that point — it may be interior or exterior, or its rays have period above the search bound.";
      showToast("No external ray found near that point.", "info");
      return;
    }
    const turns = res.angles.map((a) => a.p / a.q);
    if (plane === "dyn") dynamicalView.setPointRays(turns);
    else parameterView.setPointRays(turns);

    const list = res.angles.map((a) => `${a.p}/${a.q}`).join(", ");
    const where = plane === "dyn" ? "ζ" : "c";
    const bicc = res.biaccessible
      ? `Biaccessible (valence ${res.valence}).`
      : `Not biaccessible (valence ${res.valence}).`;
    readout.textContent =
      `${res.valence} ray${res.valence === 1 ? "" : "s"} land at ${where} = ${fmtPt(res.point)}: ` +
      `θ ∈ {${list}}. ${bicc}`;
    // On ∂M a component root's rays name a hyperbolic component — append its internal address (the
    // combinatorial GPS: rabbit 1-3 vs airplane 1-2-3). Both co-landing angles share it, so read the
    // first; a Misiurewicz point's rays are pre-periodic ⇒ no address (said honestly, not guessed).
    if (plane === "param") {
      const addr = internalAddressFromAngle(res.angles[0]);
      readout.textContent += addr
        ? ` Internal address ${addr.address.join("-")} (period ${addr.period}, ν = ${formatKneading(addr.kneading)}). Tuning tower: ${formatTower(addr.address)}.`
        : " These rays are pre-periodic (a Misiurewicz point) — no internal address.";
    }
    showToast(`${where} = ${fmtPt(res.point)} ← {${list}} (valence ${res.valence}).`, "info");
  });
  // Symbolic console: strip an internal address to its kneading sequence + characteristic angles.
  const fmtAngleBits = (ang: { p: number; q: number }, period: number): string =>
    `${ang.p}/${ang.q} = 0.[${binaryItinerary(ang, period).join("")}]`;
  const runStrip = (draw: boolean): ReturnType<typeof stripExternalAngles> | null => {
    if (parameterView.plot.monicDegree !== 2) {
      showToast(
        "The symbolic console describes the z²+c Mandelbrot set — switch to the Mandelbrot preset.",
        "warn",
      );
      return null;
    }
    let address: number[];
    try {
      address = parseInternalAddress(byId<HTMLInputElement>("strip-address").value);
    } catch (e) {
      showToast(e instanceof AddressError ? e.message : "Invalid internal address.", "warn");
      return null;
    }
    const res = stripExternalAngles(address);
    const readout = byId("strip-readout");
    const gotoBtn = byId<HTMLButtonElement>("strip-goto");
    if (!res.realized || !res.lower || !res.upper) {
      // A non-admissible internal address is realised by no component (Bruin–Schleicher) — say so.
      readout.textContent = `Address ${address.join("-")} → kneading ν = ${formatKneading(res.kneading)} is not admissible: no hyperbolic component realises it.`;
      parameterView.setAddressRays(null);
      gotoBtn.hidden = true;
      return res;
    }
    readout.textContent =
      `Address ${address.join("-")} → period ${res.period}, kneading ν = ${formatKneading(res.kneading)}. ` +
      `Characteristic angles θ⁻ = ${fmtAngleBits(res.lower, res.period)}, θ⁺ = ${fmtAngleBits(res.upper, res.period)}. ` +
      `Tuning tower: ${formatTower(address)}.`;
    if (draw) parameterView.setAddressRays([angleToNumber(res.lower), angleToNumber(res.upper)]);
    gotoBtn.hidden = false;
    return res;
  };
  byId("strip-go").addEventListener("click", () => runStrip(true));

  // The inverse direction: an external angle θ = p/q → the internal address of the component whose root
  // ray it is (pure combinatorics via internalAddressFromAngle). Fills the address box so the user can
  // then "Strip & draw rays" to round-trip. A pre-periodic (Misiurewicz) angle has no address — said so.
  byId("addr-of-angle").addEventListener("click", () => {
    const readout = byId("strip-readout");
    const frac = parseFraction(byId<HTMLInputElement>("addr-angle").value);
    if (!frac) {
      readout.textContent = "Enter an external angle θ = p/q in turns (e.g. 1/7 or 3/7).";
      return;
    }
    const [p, q] = frac;
    const r = internalAddressFromAngle({ p, q });
    if (!r) {
      readout.textContent = `θ = ${p}/${q} is pre-periodic (a Misiurewicz angle): it lands at a Misiurewicz point, not a hyperbolic-component root, so it has no internal address.`;
      return;
    }
    byId<HTMLInputElement>("strip-address").value = r.address.join("-");
    readout.textContent = `θ = ${r.angle.p}/${r.angle.q} → internal address ${r.address.join("-")} (period ${r.period}), kneading ν = ${formatKneading(r.kneading)}. Tuning tower: ${formatTower(r.address)}.`;
  });

  byId("strip-goto").addEventListener("click", () => {
    const res = runStrip(false);
    if (!res || !res.realized || !res.lower) return;
    // The two characteristic rays co-land at the component's root; land θ⁻ (periodic of the
    // component period) and Newton-snap to the centre — reusing the go-to-angle machinery.
    const land = landingForAngle(res.lower.p, res.lower.q);
    if (!land) {
      showToast("Could not land the characteristic ray.", "warn");
      return;
    }
    const fAst = parameterView.plot.fAst;
    const crit = parameterView.plot.criticalPoint;
    const pa = parameterView.plot.paramA;
    let c: [number, number] = [land.seed[0], land.seed[1]];
    if (land.kind === "center") {
      const nuc = findNucleus(fAst, crit, land.period, land.seed, pa);
      if (nuc) c = [nuc[0], nuc[1]];
    }
    parameterView.plot.moveZ0(c);
    parameterView.refreshOverlay();
    dynamicalView.plot.c = formatComplex(c);
    setCInput(c);
    updateDynCaption();
    announce(`Parameter c = ${dynCValue.textContent}`);
    showToast(`Internal address ${res.address.join("-")} → period-${res.period} centre.`, "info");
    const info = inspect(fAst, parameterView.plot.escAst, "param", crit, c, pa);
    handleInspect(info, c, "param");
    scheduleRecord();
  });
  // Projection view modes: remap both planes (single precision). Save each plot's linear view on
  // entry and restore it on exit; anchor the projection at the plot's current centre, then show the
  // canonical projected frame (full unit disk for Poincaré, one angular period for log-polar).
  const savedProjViews = new Map<PlotView, { center: Vec2; zoom: number }>();
  /** The caption under the projection picker (empty when the view is linear). */
  function updateProjectionNote(val: string): void {
    byId("projection-note").textContent =
      (PROJECTIONS[val as ProjectionMode] ?? 0) === 0
        ? ""
        : `${val === "poincare" ? "Poincaré disk" : "Log-polar"} view active — overlays are hidden; choose Linear to restore the view.`;
  }
  /**
   * Enter / leave the projection the picker now names. This is the INTERACTIVE transition: it moves
   * the view (to the canonical projected frame on entry, back to the saved linear view on exit), so
   * it is wrong for restoring a serialized state — that path has its own centre/zoom to honour and
   * uses {@link setProjectionState} instead.
   */
  function applyProjection(): void {
    const val = byId<HTMLSelectElement>("projection-mode").value;
    const mode = PROJECTIONS[val as ProjectionMode] ?? 0; // string→uProjection int (shared with GLSL)
    for (const view of [parameterView, dynamicalView]) {
      const plot = view.plot;
      if (mode !== 0) {
        if (plot.projection === 0) savedProjViews.set(view, { center: plot.center, zoom: plot.zoom });
        plot.setProjection(mode, plot.projection === 0 ? plot.center : plot.projCentre);
        plot.center = [0, 0];
        plot.zoom = 1;
      } else {
        plot.setProjection(0, [0, 0]);
        const s = savedProjViews.get(view);
        if (s) {
          plot.center = s.center;
          plot.zoom = s.zoom;
          savedProjViews.delete(view);
        }
      }
      view.refreshOverlay();
    }
    updateProjectionNote(val);
  }
  byId("projection-mode").addEventListener("change", applyProjection);
  // --- serializing an active projection ------------------------------------------------------
  // The picker's value rides in SHARE_IDS, but two pieces of plot state behind it cannot be reached
  // by a control id: the projection ANCHOR (projCentre) and the LINEAR view saved for the trip back.
  // Without them a restored projection would re-anchor at whatever the centre input happens to hold
  // — which, after a pan inside the projected frame, is a projected-space coordinate, so the
  // recipient would see a different picture. They travel as `_proj`, like `_z0` / `_grad`.
  type ProjPlane = { a: Vec2; c: Vec2; z: number };
  const projPlanes = (): [string, PlotView][] => [
    ["p", parameterView],
    ["d", dynamicalView],
  ];
  /** `_proj` for the current projection, or undefined when both planes are linear. */
  function readProjectionState(): string | undefined {
    const out: Record<string, ProjPlane> = {};
    for (const [key, view] of projPlanes()) {
      if (view.plot.projection === 0) continue;
      const saved = savedProjViews.get(view) ?? { center: view.plot.center, zoom: view.plot.zoom };
      out[key] = { a: view.plot.projCentre, c: saved.center, z: saved.zoom };
    }
    return Object.keys(out).length > 0 ? JSON.stringify(out) : undefined;
  }
  /**
   * Restore the projection as STATE rather than as a transition: set each plane's mode + anchor and
   * re-seed the saved linear view, leaving centre/zoom alone (the caller has just set those from the
   * restored inputs, and under a projection they are already in projected space). Called for every
   * full-state apply — with `_proj` absent it still carries the picker's value onto the plots, so an
   * old link that predates `_proj`, or one that drops it, cannot leave the picker disagreeing with
   * the picture; the anchor then falls back to the restored centre, which is exact unless the sender
   * had panned inside the projected frame.
   */
  function setProjectionState(raw: unknown): void {
    const val = byId<HTMLSelectElement>("projection-mode").value;
    const mode = PROJECTIONS[val as ProjectionMode] ?? 0;
    let planes: Record<string, Partial<ProjPlane>> = {};
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          planes = parsed as Record<string, Partial<ProjPlane>>;
      } catch {
        /* ignore a malformed _proj from a corrupt link — fall back to the current view */
      }
    }
    // A hostile / corrupt link must not feed NaN into the projection uniform (→ a blank plot).
    const vec = (v: unknown, fallback: Vec2): Vec2 =>
      Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])
        ? [Number(v[0]), Number(v[1])]
        : fallback;
    for (const [key, view] of projPlanes()) {
      const plot = view.plot;
      if (mode === 0) {
        plot.setProjection(0, [0, 0]);
        savedProjViews.delete(view);
      } else {
        const p = planes[key] ?? {};
        plot.setProjection(mode, vec(p.a, plot.center));
        const z = typeof p.z === "number" && Number.isFinite(p.z) && p.z > 0 ? p.z : plot.zoom;
        savedProjViews.set(view, { center: vec(p.c, plot.center), zoom: z });
      }
      view.refreshOverlay();
    }
    updateProjectionNote(val);
  }
  byId("herman-detect").addEventListener("click", () => {
    // Detect a Herman ring on the dynamical plane around z = 0 (the hole of the standard preset),
    // using the pure detector. Reports rotation number + modulus and draws the invariant circles.
    const dv = dynamicalView;
    let f: (z: Complex, c: Complex) => Complex;
    try {
      f = getComplexFn(dv.plot.fAst, dv.plot.paramA);
    } catch {
      showToast("Could not compile f for Herman-ring detection.", "warn");
      return;
    }
    const c = dv.plot.cValue;
    const res = detectHermanRing((z) => f(z, c), [0, 0]);
    // Fill the report table (same two-column format as the Julia-properties card); the note line
    // below carries the "load the preset" hint on a miss.
    const set = (id: string, text: string): void => {
      byId(id).textContent = text;
    };
    if (res.isRing && res.rotationNumber !== null && res.modulus !== null) {
      set("herman-status", "Ring confirmed");
      set("herman-rotation", `≈ ${res.rotationNumber.toFixed(6)}`); // numerically estimated, not exact
      set("herman-modulus", `≈ ${res.modulus.toFixed(4)}`);
      set(
        "herman-annulus",
        `${(res.rInner as number).toFixed(3)} – ${(res.rOuter as number).toFixed(3)}`,
      );
      byId("herman-note").textContent = "";
      dv.setHermanCurves(res.curves);
      showToast(
        `Herman ring: rotation ${res.rotationNumber.toFixed(4)}, modulus ${res.modulus.toFixed(3)}.`,
        "info",
      );
    } else {
      set("herman-status", "No ring detected");
      set("herman-rotation", "—");
      set("herman-modulus", "—");
      set("herman-annulus", "—");
      byId("herman-note").textContent =
        "Herman rings need a degree ≥ 3 rational map — try the Herman-ring preset.";
      dv.setHermanCurves(null);
    }
  });
  byId("siegel-go").addEventListener("click", () => {
    const theta = parseRotationNumber(byId<HTMLInputElement>("siegel-theta").value);
    if (theta === null) {
      showToast("Enter a rotation number — a decimal, a fraction p/q, or 'golden'.", "warn");
      return;
    }
    if (parameterView.plot.monicDegree !== 2) {
      showToast(
        "Siegel parameters use the z²+c cardioid — switch to the Mandelbrot preset.",
        "warn",
      );
      return;
    }
    // The indifferent fixed point of z²+c with multiplier λ = e^(2πiθ) sits on the main cardioid
    // at c = λ/2 − λ²/4. Snap c there (keeping the view) so the dynamical plane shows the Siegel
    // Julia set; mirror the parameter→dynamical coupling and re-inspect, exactly like the nucleus.
    const ang = 2 * Math.PI * theta;
    const lx = Math.cos(ang);
    const ly = Math.sin(ang);
    const c: [number, number] = [lx / 2 - (lx * lx - ly * ly) / 4, ly / 2 - (2 * lx * ly) / 4];
    parameterView.plot.moveZ0(c);
    parameterView.refreshOverlay();
    dynamicalView.plot.c = formatComplex(c);
    setCInput(c);
    updateDynCaption();
    announce(`Parameter c = ${dynCValue.textContent}`);
    const info = inspect(
      parameterView.plot.fAst,
      parameterView.plot.escAst,
      "param",
      parameterView.plot.criticalPoint,
      c,
      parameterView.plot.paramA,
    );
    handleInspect(info, c, "param");
    scheduleRecord();
  });
  byId("mate-check").addEventListener("click", updateMatingVerdict);
  updateMatingVerdict(); // seed the verdict for the default bulbs

  // Render a verified mating: apply its mated rational map (computed by the Thurston pullback) to the
  // dynamical plane in period mode and enable the sphere — the natural home of a rational map, with the
  // two parent Julia sets on the two hemispheres. The parameter plane is left as the Mandelbrot for
  // context. A curated ⊔ basilica set; arbitrary pairs need the slow-mating initialisation (Stage 3).
  const mateRenderSelect = byId<HTMLSelectElement>("mate-render");
  CANONICAL_MATINGS.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = m.name;
    mateRenderSelect.appendChild(opt);
  });
  /** Apply a mated rational map to the dynamical plane in Marty mode on the sphere (shared render). */
  function renderMatedMap(fString: string, label: string): void {
    dynamicalView.applyPreset({
      f: fString,
      c: "0",
      z0: "0",
      n: "120",
      nplot: "6",
      escape: "abs(z)>10000",
      mode: "marty",
      zoom: 0.6,
      center: [0, 0],
    });
    updatePerturbationGating();
    updateDerivativeGating(); // rational maps are holomorphic → derivative modes stay enabled
    // The Marty (spherical-derivative) mode reveals the Julia set of a rational map on Ĉ — the natural
    // picture for a mating. Period mode would flatten a single-attractor mating to one basin colour.
    byId<HTMLSelectElement>("mode").value = "marty";
    applyColoring();
    byId<HTMLInputElement>("sphere-dyn").checked = true;
    dynamicalView.setSphere(true);
    byId("mate-render-note").textContent = label;
  }
  function renderMating(): void {
    const m = CANONICAL_MATINGS[Number(mateRenderSelect.value)];
    if (m) renderMatedMap(m.fString, `${m.parentA} ⊔ ${m.parentB} = ${m.fString} — on the dynamical sphere.`);
  }
  byId("mate-render-btn").addEventListener("click", renderMating);

  // General path: mate any p/q satellite bulb with the basilica (Stage 3). The engine is symmetry-gated
  // (x₁(c̄)=conj(x₁(c))), so a bulb that can't be trustworthily computed (e.g. 3/7, or a real ½-limb
  // bulb) is refused rather than rendered wrong.
  byId("mate-render-pq-btn").addEventListener("click", () => {
    const note = byId("mate-render-note");
    const frac = parseFraction(byId<HTMLInputElement>("mate-render-pq").value);
    if (!frac) {
      note.textContent = "Enter a bulb as a fraction p/q (e.g. 1/5, 2/7).";
      return;
    }
    const [p, q] = frac;
    const m = mateBulbWithBasilica(p, q);
    if (!m) {
      note.textContent = `${p}/${q} ⊔ basilica — couldn't compute a trustworthy mating (obstructed, or not a clean satellite mating). Try 1/4, 1/5, 2/5, 1/6, 1/7, 2/7 …`;
      return;
    }
    renderMatedMap(m.fString, `${p}/${q} ⊔ basilica = ${m.fString} (period ${m.critPeriod}) — on the dynamical sphere.`);
  });

  // General second parent: mate two satellite bulbs p₁/q₁ ⊔ p₂/q₂ via the Boyd–Henriksen F_{u,v}
  // pullback. Obstruction (conjugate limbs, Tan Lei) is refused up front with an honest message; a
  // mateable pair that still can't be pinned down trustworthily is refused too, never drawn wrong.
  byId("mate-gen-btn").addEventListener("click", () => {
    const note = byId("mate-render-note");
    const fa = parseFraction(byId<HTMLInputElement>("mate-gen-a").value);
    const fb = parseFraction(byId<HTMLInputElement>("mate-gen-b").value);
    if (!fa || !fb) {
      note.textContent = "Enter two bulbs as fractions p/q (e.g. 1/3 ⊔ 1/4).";
      return;
    }
    const [p1, q1] = fa;
    const [p2, q2] = fb;
    if (!mateableLimbs(p1, q1, p2, q2)) {
      note.textContent = `${p1}/${q1} ⊔ ${p2}/${q2} is obstructed — the bulbs are in conjugate limbs (p₁/q₁ + p₂/q₂ = 1), so no rational mating exists (Tan Lei).`;
      return;
    }
    const m = mateBulbs(p1, q1, p2, q2);
    if (!m) {
      note.textContent = `${p1}/${q1} ⊔ ${p2}/${q2} — couldn't compute a trustworthy mating. Try 1/3 ⊔ 1/4, 1/4 ⊔ 1/5, 1/5 ⊔ 2/5, or a diagonal like 1/4 ⊔ 1/4.`;
      return;
    }
    renderMatedMap(
      m.fString,
      `${p1}/${q1} ⊔ ${p2}/${q2} = ${m.fString} (periods ${m.periodA}, ${m.periodB}) — on the dynamical sphere.`,
    );
  });
  byId("misiur-go").addEventListener("click", () => {
    const m = Number(byId<HTMLInputElement>("misiur-pre").value);
    const k = Number(byId<HTMLInputElement>("misiur-per").value);
    if (!Number.isInteger(m) || !Number.isInteger(k) || m < 1 || k < 1) {
      showToast("Enter a preperiod and period ≥ 1.", "warn");
      return;
    }
    // Newton-find the Misiurewicz point fᵐ⁺ᵏ(0)=fᵐ(0) nearest the parameter-plane view centre,
    // then snap c there (keeping the view) — the same coupling mirror as the nucleus / Siegel jumps.
    const seed = parameterView.plot.center;
    const mis = findMisiurewicz(
      parameterView.plot.fAst,
      parameterView.plot.criticalPoint,
      m,
      k,
      seed,
      parameterView.plot.paramA,
    );
    if (!mis) {
      showToast("No Misiurewicz point found near the view centre for those m, k.", "warn");
      return;
    }
    parameterView.plot.moveZ0(mis);
    parameterView.refreshOverlay();
    dynamicalView.plot.c = formatComplex(mis);
    setCInput(mis);
    updateDynCaption();
    announce(`Parameter c = ${dynCValue.textContent}`);
    const info = inspect(
      parameterView.plot.fAst,
      parameterView.plot.escAst,
      "param",
      parameterView.plot.criticalPoint,
      mis,
      parameterView.plot.paramA,
    );
    handleInspect(info, mis, "param");
    scheduleRecord();
  });
  byId("inspector-rays").addEventListener("click", () => {
    // Turn on the bulb ray-pairs overlay (draws this bulb's landing rays among the visible
    // ones) and open the Overlays group so the result is visible.
    const cb = byId<HTMLInputElement>("ray-pairs");
    if (cb.disabled) return;
    cb.checked = true;
    applyRayPairs();
    byId("overlays-group").setAttribute("open", "");
  });
  byId("inspector-portrait").addEventListener("click", () => {
    if (portraitShown) {
      clearOrbitPortrait();
      return;
    }
    if (!lastPortraitRotation) return;
    const { p, q } = lastPortraitRotation;
    const rays = rotationCycleAngles(p, q);
    if (!rays) {
      showToast("No orbit portrait for this rotation number.", "warn");
      return;
    }
    dynamicalView.setOrbitPortrait(rays.map(angleToNumber));
    portraitShown = true;
    byId("inspector-portrait").textContent = "Hide orbit portrait";
    const sum = portraitSummary(rays, 1); // α is a fixed point (period 1)
    const arc = sum.characteristic;
    const arcTxt = arc ? `, char. arc ${arc.lo.p}/${arc.lo.q}–${arc.hi.p}/${arc.hi.q}` : "";
    showToast(`Orbit portrait at α: valence ${sum.valence}, rotation ${p}/${q}${arcTxt}.`, "info");
  });
  byId("inspector-rho-zoom").addEventListener("click", () => {
    if (!lastInspect || lastInspect.plane !== "param") return;
    const mag = lastInspect.info.multiplierMag;
    if (mag === null || !(mag > 1.0001)) return;
    const c0 = lastInspect.point;
    // Tan Lei: the parameter plane is asymptotically self-similar about a Misiurewicz point with
    // scale ρ = the repelling-cycle multiplier — magnify by |ρ| to reveal the next-scale copy.
    const state = readFullState();
    state.inpparamcenter = `${c0[0]},${c0[1]}`;
    state.inpparamzoom = String(parameterView.plot.zoom * mag);
    // Drop the exact double-double centre readFullState captured: it is the centre we are zooming
    // AWAY from. applyFullState restores `_pcdd` AFTER applyAllControls (deliberately, so a deep-zoom
    // permalink beats its own rounded input), so leaving it here silently overwrote the recentre and
    // the view magnified about the OLD point while the toast claimed otherwise. Reachable on every
    // normal use: `_pcdd` is emitted once zoom > 1e3 OR either low limb is non-zero, and GLPlot.shift
    // folds pan deltas through ddAddNumber/twoSum, so any drag leaves a non-zero limb.
    //
    // Deleting it loses no precision — c0 is an f64 point from the inspector, and the template string
    // above round-trips f64 exactly, so applyAllControls reconstructs the same centre from the input.
    delete state._pcdd;
    applyFullState(state);
    showToast(
      `Self-similar zoom ×${mag.toFixed(2)} about the Misiurewicz-type point (ρ = λ).`,
      "info",
    );
  });
  byId("inspector-copy").addEventListener("click", () => {
    if (!lastInspect) return;
    const text = inspectToText(lastInspect.info, lastInspect.point, lastInspect.plane);
    void navigator.clipboard
      .writeText(text)
      .then(() => showToast("Inspector report copied to the clipboard.", "info"))
      .catch(() => showToast("Couldn't access the clipboard.", "warn"));
  });
  byId("inspector-orbit").addEventListener("click", () => {
    if (!lastInspect) return;
    const onParam = lastInspect.plane === "param";
    const view = onParam ? parameterView : dynamicalView;
    // Match inspect's plane semantics: param = critical orbit at the clicked c; dyn = the
    // clicked z₀ at the fixed c.
    const z0: Vec2 = onParam ? parameterView.plot.criticalPoint : lastInspect.point;
    const cc: Vec2 = onParam ? lastInspect.point : dynamicalView.plot.cValue;
    const pts = computeOrbit(view.plot.fAst, view.plot.escAst, z0, cc, 512, view.plot.paramA);
    downloadBlob(new Blob([orbitToCsv(pts)], { type: "text/csv" }), "orbit.csv");
    showToast(`Exported ${pts.length} orbit points to orbit.csv.`, "info");
  });
  byId("note-pin").addEventListener("click", () => {
    if (!lastInspect) {
      showToast("Inspect a point first, then pin a note there.", "warn");
      return;
    }
    const text = byId<HTMLInputElement>("note-text").value.trim();
    notes.push({
      plane: lastInspect.plane,
      x: lastInspect.point[0],
      y: lastInspect.point[1],
      text,
    });
    byId<HTMLInputElement>("note-text").value = "";
    refreshNotes();
    scheduleRecord();
  });
  byId("note-clear").addEventListener("click", () => {
    if (notes.length === 0) return;
    notes = [];
    refreshNotes();
    scheduleRecord();
  });

  /** Copy the full-precision c / centre / zoom of a plot to the clipboard. */
  function copyCoords(view: PlotView, cValue: Vec2): void {
    const p = view.plot;
    const text = `c = ${formatComplex(cValue)}\ncenter = ${p.center[0]},${p.center[1]}\nzoom = ${p.zoom}`;
    void navigator.clipboard
      .writeText(text)
      .then(() => showToast("Coordinates copied to the clipboard.", "info"))
      .catch(() => showToast("Couldn't access the clipboard.", "warn"));
  }
  byId("param-copy-coords").addEventListener("click", () =>
    copyCoords(parameterView, parameterView.plot.z0),
  );
  byId("dyn-copy-coords").addEventListener("click", () =>
    copyCoords(dynamicalView, dynamicalView.plot.cValue),
  );

  for (const id of ["light", "lightAz", "lightEl", "lightHeight"]) {
    byId(id).addEventListener("input", applyLighting);
  }
  applyLighting();

  for (const id of ["post", "postVignette", "postGamma"]) {
    byId(id).addEventListener("input", applyPost);
  }
  applyPost();

  for (const id of ["outline", "outlineWidth"]) {
    byId(id).addEventListener("input", applyOutline);
  }
  applyOutline();

  byId("critorbit").addEventListener("change", applyCriticalOrbit);
  applyCriticalOrbit();
  byId("farey").addEventListener("change", applyFarey);
  applyFarey();
  byId("rays").addEventListener("change", applyRays);
  byId("ray-angle").addEventListener("input", applyRays);
  applyRays();
  byId("ray-pairs").addEventListener("change", applyRayPairs);
  applyRayPairs();
  byId("inverse-julia").addEventListener("change", applyInverseJulia);
  applyInverseJulia();
  byId("siegel-curves").addEventListener("change", applySiegelCurves);
  applySiegelCurves();
  // Riemann sphere (3D): toggle either plane into the live sphere render mode. Each plot keeps its own
  // flat centre/zoom untouched, so unchecking restores the exact view; drag/wheel are handled in
  // PlotView. Works for any f (single precision). Not part of the serialized state for the MVP.
  byId("sphere-param").addEventListener("change", () => {
    parameterView.setSphere(byId<HTMLInputElement>("sphere-param").checked);
  });
  byId("sphere-dyn").addEventListener("change", () => {
    dynamicalView.setSphere(byId<HTMLInputElement>("sphere-dyn").checked);
  });
  byId("sphere-light").addEventListener("change", () => {
    const on = byId<HTMLInputElement>("sphere-light").checked;
    parameterView.setSphereLight(on);
    dynamicalView.setSphereLight(on);
  });
  byId("sphere-reset").addEventListener("click", () => {
    parameterView.resetSphereView();
    dynamicalView.resetSphereView();
  });
  // Copy the BibTeX citation (Help modal footer) to the clipboard for academic reuse.
  byId("cite-copy").addEventListener("click", async () => {
    const bib = byId("cite-bibtex").textContent ?? "";
    try {
      await navigator.clipboard.writeText(bib);
      showToast("Citation (BibTeX) copied to the clipboard.", "info");
    } catch {
      showToast("Couldn't copy — select the text to copy it manually.", "warn");
    }
  });

  for (const id of ["equipotential", "equiDensity"]) {
    byId(id).addEventListener("input", applyEquipotential);
  }
  applyEquipotential();

  // Exterior-map readout: recompute on open / coefficient-count change (c & f changes route
  // through updateDynCaption / applyChanges). Copy + CSV export at full precision.
  byId("exterior-group").addEventListener("toggle", updateExteriorMap);
  byId("exterior-n").addEventListener("input", updateExteriorMap);
  byId("julia-props-group").addEventListener("toggle", updateJuliaProperties);
  byId("julia-props-copy").addEventListener("click", copyJuliaProperties);
  const copyCoeffs = (coeffs: Complex[] | null, title: string, symbol = "b"): void => {
    if (!coeffs) return;
    void navigator.clipboard
      .writeText(coeffsToText(coeffs, title, symbol))
      .then(() => showToast("Coefficients copied to the clipboard.", "info"))
      .catch(() => showToast("Couldn't access the clipboard.", "warn"));
  };
  const exportCoeffs = (coeffs: Complex[] | null, file: string): void => {
    if (!coeffs) return;
    downloadBlob(new Blob([coeffsToCsv(coeffs)], { type: "text/csv" }), file);
    showToast(`Exported ${coeffs.length} coefficients to ${file}.`, "info");
  };
  byId("import-map").addEventListener("click", promptImportInterchange);
  byId("exterior-param-copy").addEventListener("click", () =>
    copyCoeffs(lastParamCoeffs, "Multibrot/Mandelbrot exterior map", "a"),
  );
  byId("exterior-param-csv").addEventListener("click", () =>
    exportCoeffs(lastParamCoeffs, "multibrot-exterior-map.csv"),
  );
  byId("exterior-dyn-copy").addEventListener("click", () =>
    copyCoeffs(
      lastDynCoeffs,
      `Filled Julia exterior map (capacity γ₁ = ${formatComplex(truncateComplex(lastDynLead))})`,
    ),
  );
  byId("exterior-dyn-csv").addEventListener("click", () =>
    exportCoeffs(lastDynCoeffs, "julia-exterior-map.csv"),
  );
  updateExteriorMap();

  // Boundary-overlay controls (in the same group as the readout).
  const laurentRValue = byId("laurent-r-value");
  const updateLaurentR = (): void => {
    laurentRValue.textContent = (Number(byId<HTMLInputElement>("laurent-r").value) / 100).toFixed(
      2,
    );
  };
  byId("laurent").addEventListener("change", applyLaurent);
  byId("laurent-n").addEventListener("input", applyLaurent);
  byId("laurent-r").addEventListener("input", () => {
    updateLaurentR();
    applyLaurent();
  });
  updateLaurentR();
  applyLaurent();

  byId("newton").addEventListener("change", applyNewton);
  byId("autoiter").addEventListener("change", applyAutoIter);
  byId("autoiter-strength").addEventListener("input", applyAutoIter);
  byId("accumulate").addEventListener("change", applyAccumulate);
  byId("perturbation").addEventListener("change", applyPerturbation);
  byId("param-a").addEventListener("input", applyParamA);
  byId("share-btn").addEventListener("click", () => {
    void shareLink();
  });
  const viewsMenu = byId<HTMLDetailsElement>("views-menu");
  const closeViewsMenu = (): void => {
    viewsMenu.open = false;
  };
  byId("save-view-btn").addEventListener("click", () => {
    saveCurrentView();
    closeViewsMenu();
  });
  byId("saved-views").addEventListener("change", () => {
    loadSelectedView();
    closeViewsMenu();
  });
  byId("delete-view-btn").addEventListener("click", () => {
    deleteSelectedView();
    closeViewsMenu();
  });
  // Close the Views popover when clicking anywhere outside it.
  document.addEventListener("click", (e) => {
    if (viewsMenu.open && !viewsMenu.contains(e.target as Node)) closeViewsMenu();
  });
  // Keep the Views popover on-screen. It is right-anchored to its small summary, so when the app bar
  // wraps and the Views button lands near the left edge, the ~12rem panel would spill off the left of
  // the page. Below 720px the CSS already makes it full-width; above that, clamp it to a small margin
  // from the viewport's left edge on open and on resize (otherwise the pure-CSS right:0 is kept).
  const viewsPanel = viewsMenu.querySelector<HTMLElement>(".views-panel");
  const clampViewsPanel = (): void => {
    if (!viewsPanel) return;
    viewsPanel.style.left = ""; // reset to the CSS default (right:0) before measuring
    viewsPanel.style.right = "";
    if (!viewsMenu.open || window.innerWidth <= 720) return;
    const margin = 8;
    const menuLeft = viewsMenu.getBoundingClientRect().left;
    if (viewsPanel.getBoundingClientRect().left < margin) {
      // The right-anchored panel is clipping the left edge → left-anchor it to a safe margin instead.
      viewsPanel.style.right = "auto";
      viewsPanel.style.left = `${Math.round(margin - menuLeft)}px`;
    }
  };
  viewsMenu.addEventListener("toggle", clampViewsPanel);
  window.addEventListener("resize", clampViewsPanel);
  byId("undo-btn").addEventListener("click", undo);
  byId("redo-btn").addEventListener("click", redo);
  document.addEventListener("change", scheduleRecord);
  document.addEventListener("input", scheduleRecord);
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return; // leave native text undo alone
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });

  byId("apply_all").addEventListener("click", applyChanges);
  // Contextual Apply buttons in each plot's params bar — same commit as the sidebar Apply.
  byId("param-apply").addEventListener("click", applyChanges);
  byId("dyn-apply").addEventListener("click", applyChanges);
  byId("apply_preset").addEventListener("click", () => {
    applyPreset(byId<HTMLSelectElement>("fractal_presets").value as PresetName);
  });
  byId("reset_all").addEventListener("click", () => {
    // Reset every option, including coloring + lighting (which presets don't carry).
    byId<HTMLSelectElement>("mode").value = "smooth";
    byId<HTMLSelectElement>("palette").value = "classic";
    byId<HTMLSelectElement>("trap").value = "cross";
    byId<HTMLSelectElement>("aa").value = "1";
    byId<HTMLInputElement>("paletteRotation").value = "0";
    gradientEditor.setStops(DEFAULT_GRADIENT);
    parameterView.plot.setGradient(DEFAULT_GRADIENT);
    dynamicalView.plot.setGradient(DEFAULT_GRADIENT);
    applyColoring();
    byId<HTMLInputElement>("light").checked = false;
    byId<HTMLInputElement>("lightAz").value = "135";
    byId<HTMLInputElement>("lightEl").value = "45";
    byId<HTMLInputElement>("lightHeight").value = "40";
    applyLighting();
    byId<HTMLInputElement>("post").checked = false;
    byId<HTMLInputElement>("postVignette").value = "30";
    byId<HTMLInputElement>("postGamma").value = "50";
    applyPost();
    byId<HTMLInputElement>("outline").checked = false;
    byId<HTMLInputElement>("outlineWidth").value = "30";
    applyOutline();
    byId<HTMLInputElement>("critorbit").checked = false;
    applyCriticalOrbit();
    byId<HTMLInputElement>("farey").checked = false;
    applyFarey();
    byId<HTMLInputElement>("rays").checked = false;
    byId<HTMLInputElement>("ray-angle").value = "1/3";
    applyRays();
    byId<HTMLInputElement>("ray-pairs").checked = false;
    applyRayPairs();
    byId<HTMLInputElement>("inverse-julia").checked = false;
    applyInverseJulia();
    byId<HTMLInputElement>("siegel-curves").checked = false;
    applySiegelCurves();
    byId<HTMLInputElement>("equipotential").checked = false;
    byId<HTMLInputElement>("equiDensity").value = "20";
    applyEquipotential();
    byId<HTMLInputElement>("laurent").checked = false;
    byId<HTMLInputElement>("laurent-n").value = "48";
    byId<HTMLInputElement>("laurent-r").value = "102";
    updateLaurentR();
    applyLaurent();
    byId<HTMLInputElement>("newton").checked = false;
    applyNewton();
    byId<HTMLInputElement>("autoiter").checked = false;
    byId<HTMLInputElement>("autoiter-strength").value = "1.5";
    applyAutoIter();
    byId<HTMLInputElement>("accumulate").checked = false;
    applyAccumulate();
    byId<HTMLInputElement>("perturbation").checked = false;
    applyPerturbation();
    byId<HTMLInputElement>("param-a").value = "1";
    applyParamA();
    // Yoccoz puzzle + pinched-disk laminations — instruments drawn ON TOP of the plots, so leaving
    // them on would keep puzzle rays and a lamination disk over the freshly reset default view.
    for (const id of ["yoccoz-toggle", "parapuzzle-toggle", "yoccoz-critical"] as const) {
      byId<HTMLInputElement>(id).checked = false;
    }
    byId<HTMLInputElement>("yoccoz-depth").value = "2"; // the markup defaults
    updateYoccoz();
    for (const id of ["lamination-toggle", "qml-toggle"] as const) {
      byId<HTMLInputElement>(id).checked = false;
    }
    byId<HTMLInputElement>("lamination-detail").value = "6";
    updateLamination();
    // Projection & Riemann-sphere view — restore the flat/linear defaults so a reset also clears an
    // active projection or 3D sphere, not just coloring. The projection uses its interactive
    // transition, which puts each plot back at the linear view it saved on entry.
    byId<HTMLSelectElement>("projection-mode").value = "linear";
    applyProjection();
    for (const id of ["sphere-param", "sphere-dyn"]) {
      const cb = byId<HTMLInputElement>(id);
      cb.checked = false;
      cb.dispatchEvent(new Event("change"));
    }
    const sphereLight = byId<HTMLInputElement>("sphere-light");
    sphereLight.checked = true; // HTML default
    sphereLight.dispatchEvent(new Event("change"));
    clearKeyframes();
    applyPreset(byId<HTMLSelectElement>("fractal_presets").value as PresetName);
  });
  byId("print_param_space").addEventListener("click", () => {
    void runExport(
      parameterView,
      "paramExportSize",
      "paramExportOverlay",
      "paramExportScaleBar",
      "mImageName",
      "print_param_space",
    );
  });
  byId("print_dyn_plane").addEventListener("click", () => {
    void runExport(
      dynamicalView,
      "dynExportSize",
      "dynExportOverlay",
      "dynExportScaleBar",
      "jImageName",
      "print_dyn_plane",
    );
  });
  byId("copy_param_space").addEventListener("click", () => {
    void runCopy(
      parameterView,
      "paramExportSize",
      "paramExportOverlay",
      "paramExportScaleBar",
      "copy_param_space",
    );
  });
  byId("copy_dyn_plane").addEventListener("click", () => {
    void runCopy(
      dynamicalView,
      "dynExportSize",
      "dynExportOverlay",
      "dynExportScaleBar",
      "copy_dyn_plane",
    );
  });
  byId("record_morph").addEventListener("click", () => {
    void recordJuliaMorph();
  });
  byId("record_zoom").addEventListener("click", () => {
    void recordZoomMovie();
  });
  byId("kf-add").addEventListener("click", addKeyframe);
  byId("kf-clear").addEventListener("click", clearKeyframes);
  byId("kf-scrub").addEventListener("input", applyScrub);
  byId("kf-record").addEventListener("click", () => {
    void recordKeyframePath();
  });
  byId("gif-morph").addEventListener("click", () => {
    void recordJuliaMorphGif();
  });
  byId("kf-gif").addEventListener("click", () => {
    void recordKeyframeGif();
  });

  disableUnsupportedSizes();
  setupOnboarding();
  setupGlossary();
  setupComponentData();
  setupHelpReference();
  setupTour();
  setupTheme();
  setupMobileSheet();
  setupLayout();
  setupPlaces();
  applyParamA();
  updateParamAVisibility();
  updateKeyframeUI();
  populateViewSelect();

  // ---- Use-case profiles (app-bar picker): one-click bundles of display / quality / instrument
  // settings, persisted across sessions. A profile re-skins the current view — it never touches
  // f / c / the centre+zoom. Reuses the existing apply* functions (NOT applyChanges, which would
  // re-apply the view). Suggestions and theme are independent prefs and are deliberately not governed.
  function setupProfiles(): void {
    const PROFILE_KEY = "cdjs.profile";
    const profileSelect = byId<HTMLSelectElement>("profile");
    const customOption = byId<HTMLOptionElement>("profile-custom");
    let activeProfile: ProfileName | null = null;
    let appliedSnapshot: ProfileSettings | null = null;

    // Don't oversize a phone canvas — cap a profile's resolution to the viewport default there.
    const cappedRes = (r: number): number =>
      window.innerWidth < 700 ? Math.min(r, initialRes(window.innerWidth)) : r;

    const readControls = (): ProfileSettings => ({
      mode: byId<HTMLSelectElement>("mode").value,
      palette: byId<HTMLSelectElement>("palette").value,
      aa: byId<HTMLSelectElement>("aa").value,
      light: byId<HTMLInputElement>("light").checked,
      post: byId<HTMLInputElement>("post").checked,
      accumulate: byId<HTMLInputElement>("accumulate").checked,
      autoiter: byId<HTMLInputElement>("autoiter").checked,
      autoiterStrength: byId<HTMLInputElement>("autoiter-strength").value,
      perturbation: byId<HTMLInputElement>("perturbation").checked,
      critorbit: byId<HTMLInputElement>("critorbit").checked,
      farey: byId<HTMLInputElement>("farey").checked,
      rays: byId<HTMLInputElement>("rays").checked,
      iterations: Math.round(Number(byId<HTMLInputElement>(INPUT_IDS.paramN).value)) || 0,
      resolution: Math.round(Number(byId<HTMLInputElement>("inpParamRes").value)) || 0,
      juliaPanel: byId<HTMLDetailsElement>("julia-props-group").open,
    });

    const applyProfile = (name: ProfileName, persist: boolean): void => {
      const p = PROFILES[name];
      byId<HTMLSelectElement>("mode").value = p.mode;
      byId<HTMLSelectElement>("palette").value = p.palette;
      byId<HTMLSelectElement>("aa").value = p.aa;
      applyColoring();
      byId<HTMLInputElement>("light").checked = p.light;
      applyLighting();
      byId<HTMLInputElement>("post").checked = p.post;
      applyPost();
      byId<HTMLInputElement>("outline").checked = false;
      applyOutline();
      byId<HTMLInputElement>("critorbit").checked = p.critorbit;
      applyCriticalOrbit();
      byId<HTMLInputElement>("farey").checked = p.farey;
      applyFarey();
      byId<HTMLInputElement>("rays").checked = p.rays;
      applyRays();
      // The remaining overlays / Newton are forced off so a profile is a known baseline.
      for (const id of [
        "ray-pairs",
        "inverse-julia",
        "siegel-curves",
        "equipotential",
        "laurent",
      ] as const) {
        byId<HTMLInputElement>(id).checked = false;
      }
      applyRayPairs();
      applyInverseJulia();
      applySiegelCurves();
      applyEquipotential();
      applyLaurent();
      byId<HTMLInputElement>("newton").checked = false;
      applyNewton();
      byId<HTMLInputElement>("autoiter").checked = p.autoiter;
      byId<HTMLInputElement>("autoiter-strength").value = p.autoiterStrength;
      applyAutoIter();
      byId<HTMLInputElement>("accumulate").checked = p.accumulate;
      applyAccumulate();
      byId<HTMLInputElement>("perturbation").checked = p.perturbation;
      applyPerturbation();
      // Iterations + resolution set directly (NOT via applyChanges) so f / c / view are untouched.
      const res = cappedRes(p.resolution);
      parameterView.plot.n = String(p.iterations);
      dynamicalView.plot.n = String(p.iterations);
      parameterView.setRes(res);
      dynamicalView.setRes(res);
      byId<HTMLInputElement>(INPUT_IDS.paramN).value = String(p.iterations);
      byId<HTMLInputElement>(INPUT_IDS.dynN).value = String(p.iterations);
      byId<HTMLInputElement>("inpParamRes").value = String(res);
      byId<HTMLInputElement>("inpDynRes").value = String(res);
      updateEffectiveIterations();
      const panel = byId<HTMLDetailsElement>("julia-props-group");
      if (panel.open !== p.juliaPanel) {
        panel.open = p.juliaPanel;
        updateJuliaProperties();
      }
      activeProfile = name;
      appliedSnapshot = readControls();
      profileSelect.value = name;
      customOption.hidden = true;
      if (persist) {
        try {
          localStorage.setItem(PROFILE_KEY, name);
        } catch {
          /* localStorage unavailable — non-fatal */
        }
        showToast(`${PROFILE_LABELS[name]} profile applied.`, "info");
      }
    };

    // Show "Custom…" once the live controls diverge from the applied profile (self-correcting:
    // editing the settings back to the profile re-selects it).
    refreshProfileLabel = (): void => {
      if (!activeProfile || !appliedSnapshot) return;
      if (sameSettings(readControls(), appliedSnapshot)) {
        profileSelect.value = activeProfile;
        customOption.hidden = true;
      } else {
        customOption.hidden = false;
        profileSelect.value = "custom";
      }
    };

    // A shared view / saved state carried a profile name → show it (its settings are already applied).
    adoptProfile = (name: string | undefined): void => {
      if (!name || !(PROFILE_ORDER as string[]).includes(name)) return;
      activeProfile = name as ProfileName;
      appliedSnapshot = readControls();
      profileSelect.value = name;
      customOption.hidden = true;
    };

    profileSelect.addEventListener("change", () => {
      if (profileSelect.value !== "custom") applyProfile(profileSelect.value as ProfileName, true);
    });
    // A control edit anywhere in the sidebar (or opening the metrics panel) may diverge from the
    // profile — recompute the label. Programmatic bulk changes (preset / share-link / reset) call
    // refreshProfileLabel() via applyChanges / applyPreset.
    const pane = document.querySelector(".controls-pane");
    pane?.addEventListener("change", () => refreshProfileLabel());
    pane?.addEventListener("input", () => refreshProfileLabel());
    byId("julia-props-group").addEventListener("toggle", () => refreshProfileLabel());

    // Phase-2: a one-time first-run pick wires into the onboarding card (setupOnboarding); apply the
    // persisted profile now (a shared view in the URL hash overrides it just below).
    let pref: ProfileName = DEFAULT_PROFILE;
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      if (stored && (PROFILE_ORDER as string[]).includes(stored)) pref = stored as ProfileName;
    } catch {
      /* ignore */
    }
    applyProfile(pref, false);
  }
  setupProfiles(); // apply the persisted profile (default skin) before any shared view

  loadFromHash(); // apply a shared view if the URL carries one (overrides the profile)
  refreshProfileLabel(); // a shared view usually diverges from a named profile → "Custom…"
  lastSnapshot = readFullState(); // history baseline (after any shared view is applied)
  window.clearTimeout(recordTimer);
  updateHistoryButtons();

  // Dev-only: expose the two views so the renderer can be driven/inspected from the
  // console (e.g. the synchronous `renderToImageData` path, which works even when a
  // backgrounded tab has paused requestAnimationFrame). Stripped from prod builds.
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    (window as unknown as { __views: unknown }).__views = {
      param: parameterView,
      dyn: dynamicalView,
    };
  }
}

try {
  init();
} catch (err) {
  console.error("Failed to initialize the visualizer:", err);
  const webglMissing = err instanceof Error && /WebGL2/i.test(err.message);
  showFatalBanner(
    webglMissing
      ? "This visualizer needs WebGL2, which isn't available in your browser. " +
          "Try a recent version of Chrome, Firefox, Edge, or Safari 15+, and make sure " +
          "hardware acceleration is enabled."
      : "Something went wrong starting the visualizer. See the browser console for details.",
  );
} finally {
  // Remove the boot overlay whether init succeeded or threw (on failure the fatal banner shows).
  document.getElementById("boot-loading")?.remove();
}
