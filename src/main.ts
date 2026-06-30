/**
 * Application entry point. Creates the two WebGL2 plots wrapped in {@link PlotView}
 * (fractal + overlay + interaction), wires the apply/preset orchestration, the
 * parameter→dynamical coupling (the dynamical plane is the Julia set of the
 * parameter-space white point), high-resolution PNG export, input validation, and
 * graceful handling of a browser without WebGL2.
 */

import "./styles/main.css";
import type { Vec2 } from "./arrays";
import { formatComplex, parseComplex, truncateComplex, type Complex } from "./complex";
import { getMaxTextureSize } from "./hiResExport";
import { PlotView } from "./render/plotView";
import type { GLPlot, FractType } from "./render/glPlot";
import { initialRes } from "./render/glPlot";
import { ddCenterToString, ddCenterFromString } from "./render/dd";
import {
  inspect,
  findNucleus,
  findMisiurewicz,
  fatouComponentType,
  type InspectResult,
} from "./render/inspect";
import { matingVerdict } from "./render/mating";
import { computeOrbit, orbitAndClassify, type Annotation, type OrbitFate } from "./render/overlay";
import { toNumber as angleToNumber } from "./combinatorics/angles";
import { coreEntropy } from "./combinatorics/coreEntropy";
import { portraitSummary, rotationCycleAngles } from "./combinatorics/orbitPortrait";
import { landingForAngle } from "./render/angleParameter";
import { renderRiemannSphere } from "./render/riemannSphere";
import {
  juliaConnected,
  juliaExteriorCoeffs,
  polynomialJuliaExteriorCoeffs,
  rationalExteriorCoeffs,
  mandelbrotExteriorCoeffs,
} from "./render/uniformize";
import { fToRational } from "./expr/rational";
import { computeJuliaProperties, type Extent } from "./render/juliaProperties";
import { JuliaMetricsClient } from "./render/juliaMetricsClient";
import { polynomialCoeffs, polynomialConnectivity } from "./render/critical";
import { drawOrbitPreview, renderJuliaPreview } from "./render/orbitPreview";
import type { Node as ExprNode } from "./expr/ast";
import { parseAngle } from "./render/rays";
import { dynPresets, paramPresets, type Preset, type PresetName } from "./presets";
import { byId } from "./ui/dom";
import { showToast } from "./ui/toast";
import { GLOSSARY, CONVENTIONS, type GlossaryEntry } from "./ui/glossary";
import { validateInputs, type FieldError } from "./ui/validate";
import { DEFAULT_GRADIENT } from "./palettes";
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
import { PLACES } from "./state/places";
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
  return m ? [Number(m[1]), Number(m[2])] : null;
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
    const deg = ((Math.atan2(info.multiplier[1], info.multiplier[0]) * 180) / Math.PI + 360) % 360;
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

  const close = (): void => {
    overlay.hidden = true;
  };
  openGlossary = (termId?: string): void => {
    overlay.hidden = false;
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

/** Wire the "Help & reference" modal: opened from the app-bar "Help" button, closed via the ×,
 *  a backdrop click, or Escape — the same lightweight pattern as {@link setupGlossary}. */
function setupHelpReference(): void {
  const overlay = byId("help-ref");
  const close = (): void => {
    overlay.hidden = true;
  };
  byId("help-ref-btn").addEventListener("click", () => {
    overlay.hidden = false;
  });
  byId("help-ref-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close(); // backdrop click
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });
}

/** Show the export-progress overlay; returns progress + cancel hooks and a closer. */
function beginExport(label: string): {
  onProgress: (fraction: number) => void;
  isCancelled: () => boolean;
  done: () => void;
} {
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
  let previewPending: Vec2 | null = null;
  let previewScheduled = false;
  // Cached Julia background for the inset — the escape-time render is throttled (it's the heavy
  // part), so the orbit can track the cursor at 60 Hz over the most recent background (~10 Hz).
  let previewJulia: ImageData | null = null;
  let previewJuliaT = 0;
  let previewJuliaAst: ExprNode | null = null;
  function updateOrbitPreview(coord: Vec2 | null): void {
    if (!coord || !orbitPreviewCtx || !paramPlot) {
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
      onViewChanged: (center, zoom) => {
        setParamCenterInput(center);
        setParamZoomInput(zoom);
        updateViewChips();
        announce(`Parameter space — ${paramChip.textContent}`);
        scheduleRecord();
      },
      onHover: (coord) => {
        paramReadout(coord);
        updateOrbitPreview(coord);
      },
      onInspect: handleInspect,
    },
  );

  paramPlot = parameterView.plot;

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
      plane === "param" && info.rotation !== null && parameterView.plot.perturbationEligible;
    byId("inspector-rays").hidden = !eligible;
  }

  // Orbit-portrait toggle state: the last eligible rotation p/q and whether the rays are drawn.
  let lastPortraitRotation: { p: number; q: number } | null = null;
  let portraitShown = false;

  /** Show "Show orbit portrait" on the dynamical plane when the inspected cycle has a rotation
   *  p/q with q ≥ 2 — the α fixed point then has q external rays landing (z²+c only). */
  function updateOrbitPortraitButton(info: InspectResult, plane: FractType): void {
    const rot = info.rotation;
    const eligible =
      plane === "dyn" && rot !== null && rot.q >= 2 && dynamicalView.plot.perturbationEligible;
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

  /** Inspector callback for both planes: render the report, then gate the action buttons. */
  function handleInspect(info: InspectResult, point: Vec2, plane: FractType): void {
    showInspect(info, point, plane);
    updateNucleusButton(info, point, plane);
    updateBulbRaysButton(info, plane);
    clearOrbitPortrait(); // a fresh inspect (possibly a new c) invalidates the drawn portrait
    updateOrbitPortraitButton(info, plane);
    // Any inspected point can be copied as a report / exported as an orbit.
    lastInspect = { info, point: [point[0], point[1]], plane };
    byId("inspector-copy").hidden = false;
    byId("inspector-orbit").hidden = false;
  }

  /** User annotations (gold pins), tagged by plane; pushed to each plot's overlay. */
  let notes: { plane: FractType; x: number; y: number; text: string }[] = [];
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
  function dynExterior(
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
  let lastPixelArea: number | null = null; // Tier-2 pixel-count area (image-based)
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
    if (lastBoxDim !== null) dim.push(`≈ ${jNum(lastBoxDim, 4)} (box-count)`);
    jSet("jp-dimension", dim.length ? dim.join(" · ") : "—");

    if (p.escapes) {
      jSet("jp-area", "0 (disconnected)");
    } else {
      const area: string[] = [];
      if (lastPixelArea !== null) area.push(`≈ ${jNum(lastPixelArea, 5)} (pixel)`);
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
        lastPixelArea = m.pixelArea;
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
    lastPixelArea = null;
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
        pc === "connected"
          ? "connected (all critical orbits bounded)"
          : pc === "cantor"
            ? "totally disconnected — Cantor dust"
            : pc === "disconnected"
              ? "disconnected (mixed critical orbits)"
              : "measuring…", // non-polynomial ⇒ image estimate fills this from the Tier-2 pass
      );
    } else {
      lastConnectivityRigorous = false;
      jSet(
        "jp-connectivity",
        p.connected
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
          : `attracting · period ${p.cycle.period} · |λ| ${holo ? "=" : "≈"} ${jNum(p.cycle.multiplierMag, 3)}`;
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
            : `${holo ? "" : "≈ "}${jNum(p.lyapunov, 4)} nats/iter`,
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
      return `center ${p(cx, 4)}, ${p(cy, 4)} · zoom ${p(v.plot.zoom, 3)} · ${byId<HTMLInputElement>(nId).value} it`;
    };
    paramChip.textContent = fmt(parameterView, INPUT_IDS.paramN);
    dynChip.textContent = fmt(dynamicalView, INPUT_IDS.dynN);
    updateEffectiveIterations();
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
    updateExteriorMap(); // a new f may change the degree / coefficients
    applyLaurent();
    updateJuliaProperties();
    setDirty(false);
    updateViewChips();
    announce(`Changes applied. Dynamical plane for c = ${dynCValue.textContent}.`);
    scheduleRecord();
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
    applyFarey();
    applyRays();
    applyRayPairs();
    applyInverseJulia();
    applySiegelCurves();
    updateExteriorMap();
    applyLaurent();
    updateJuliaProperties();
    setDirty(false);
    updateViewChips();
    scheduleRecord();
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
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Rendering…";
    const progress = beginExport(`Rendering ${size}×${size}…`);
    try {
      await view.exportPng({
        size,
        overlays,
        scaleBar,
        filename,
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
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Copying…";
    const progress = beginExport(`Copying ${size}×${size}…`);
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
    for (const id of ["paramExportSize", "dynExportSize"]) {
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

  /** Apply the selected coloring mode, palette, and anti-aliasing to both plots. */
  function applyColoring(): void {
    const mode = MODES[byId<HTMLSelectElement>("mode").value] ?? 0;
    const palette = PALETTES[byId<HTMLSelectElement>("palette").value] ?? 0;
    const aa = Math.max(1, Number(byId<HTMLSelectElement>("aa").value) || 1);
    const rotation = Number(byId<HTMLInputElement>("paletteRotation").value) / 100; // 0..1
    for (const v of [parameterView, dynamicalView]) {
      v.plot.setColoring(mode, palette, aa);
      v.plot.setGradientRotation(rotation);
    }
    gradientEditor.setVisible(byId<HTMLSelectElement>("palette").value === "custom");
    applyTrap();
  }

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
    const az = Number(byId<HTMLInputElement>("lightAz").value);
    const el = Number(byId<HTMLInputElement>("lightEl").value);
    const height = Number(byId<HTMLInputElement>("lightHeight").value) / 20; // slider 0–100 → depth 0–5
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
    const vignette = Number(byId<HTMLInputElement>("postVignette").value) / 100; // 0..1
    const gamma = Math.pow(2, (Number(byId<HTMLInputElement>("postGamma").value) - 50) / 50); // 0.5..2 (1 at 50)
    parameterView.plot.setPost(on, vignette, gamma);
    dynamicalView.plot.setPost(on, vignette, gamma);
    for (const id of ["postVignette", "postGamma"]) {
      byId<HTMLInputElement>(id).disabled = !on;
    }
  }

  /** Apply the boundary-outline controls (checkbox + width) to both plots. */
  function applyOutline(): void {
    const on = byId<HTMLInputElement>("outline").checked;
    const width = Number(byId<HTMLInputElement>("outlineWidth").value) / 20; // slider 0–100 → 0–5
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
    const eligible = parameterView.plot.perturbationEligible;
    const cb = byId<HTMLInputElement>("farey");
    cb.disabled = !eligible;
    parameterView.setFarey(eligible && cb.checked);
  }

  /** Trace the entered external-ray angle on both planes; gated to z²+c. */
  function applyRays(): void {
    const eligible = parameterView.plot.perturbationEligible;
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
    const eligible = parameterView.plot.perturbationEligible;
    const cb = byId<HTMLInputElement>("ray-pairs");
    cb.disabled = !eligible;
    parameterView.setRayPairs(eligible && cb.checked);
  }

  /** Draw the inverse-iteration Julia point cloud (dynamical plane); z²+c only. */
  function applyInverseJulia(): void {
    const eligible = dynamicalView.plot.perturbationEligible;
    const cb = byId<HTMLInputElement>("inverse-julia");
    cb.disabled = !eligible;
    dynamicalView.setInverseJulia(eligible && cb.checked);
  }

  /** Draw the Siegel-disc invariant curves (dynamical plane); z²+c only. */
  function applySiegelCurves(): void {
    const eligible = dynamicalView.plot.perturbationEligible;
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
      showToast("Perturbation deep zoom applies to z²+c (Mandelbrot and its Julia sets).", "info");
    }
    updatePerturbationGating();
    updateDerivativeGating();
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
    const value = Number(byId<HTMLInputElement>("param-a").value);
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
    if (notes.length > 0) state._notes = JSON.stringify(notes); // pinned annotations
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
    if (typeof state._pcdd === "string") {
      const c = ddCenterFromString(state._pcdd);
      if (c) parameterView.plot.setCenterDD(c[0], c[1]);
    }
    if (typeof state._dcdd === "string") {
      const c = ddCenterFromString(state._dcdd);
      if (c) dynamicalView.plot.setCenterDD(c[0], c[1]);
    }
    // Restore pinned annotations (validated; ignore a malformed list from a corrupt link).
    notes = [];
    if (typeof state._notes === "string") {
      try {
        const parsed: unknown = JSON.parse(state._notes);
        if (Array.isArray(parsed))
          notes = parsed.filter(
            (n): n is { plane: FractType; x: number; y: number; text: string } =>
              !!n &&
              typeof n.x === "number" &&
              typeof n.y === "number" &&
              typeof n.text === "string" &&
              (n.plane === "param" || n.plane === "dyn"),
          );
      } catch {
        /* ignore malformed _notes */
      }
    }
    refreshNotes();
  }

  /** Serialize the current view into the URL hash and copy a shareable link. */
  async function shareLink(): Promise<void> {
    const url = `${location.origin}${location.pathname}#s=${encodeState(readFullState())}`;
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Shareable link copied to the clipboard.", "info");
    } catch {
      showToast("Shareable link is in the address bar.", "info");
    }
  }

  /** If the URL hash holds a shared view, apply it. Returns whether it did. */
  function loadFromHash(): boolean {
    const match = /^#s=(.+)$/.exec(location.hash);
    if (!match) return false;
    const state = decodeState(match[1]);
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
    views[name] = readFullState();
    saveSavedViews(views);
    populateViewSelect();
    byId<HTMLSelectElement>("saved-views").value = name;
    byId<HTMLButtonElement>("delete-view-btn").disabled = false;
    input.value = "";
    showToast(`Saved view “${name}”.`, "info");
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

  /** Delete the selected saved view. */
  function deleteSelectedView(): void {
    const name = byId<HTMLSelectElement>("saved-views").value;
    if (!name) return;
    const views = loadSavedViews();
    delete views[name];
    saveSavedViews(views);
    populateViewSelect();
    showToast(`Deleted view “${name}”.`, "info");
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
    window.clearTimeout(recordTimer); // drop any pending commit
    lastSnapshot = state;
    applyFullState(state);
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
    try {
      const rec = startRecording(canvas, 30);
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const frame = (): void => {
          const t = (performance.now() - start) / durationMs;
          if (t >= 1) {
            resolve();
            return;
          }
          apply(t);
          requestAnimationFrame(frame);
        };
        frame();
      });
      downloadBlob(await rec.stop(), filename);
      showToast(`Saved ${filename}`, "info");
    } catch (err) {
      showToast(`Recording failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
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
    // Core entropy of θ (a combinatorial invariant of the angle, independent of the current map).
    const ce = coreEntropy(Number(m[1]), Number(m[2]));
    byId("angle-entropy").textContent = ce
      ? `Core entropy h = ${ce.entropy.toFixed(4)} (λ = ${ce.lambda.toFixed(4)}); biaccessibility B = ${ce.biaccessibility.toFixed(4)}.`
      : "Core entropy: not computed for this angle (its orbit reaches the β-fixed angle).";
    if (parameterView.plot.monicDegree !== 2) {
      showToast(
        "Go-to-angle lands on the z²+c Mandelbrot set — switch to the Mandelbrot preset.",
        "warn",
      );
      return;
    }
    const land = landingForAngle(Number(m[1]), Number(m[2]));
    if (!land) {
      showToast("That angle has no usable landing.", "warn");
      return;
    }
    const fAst = parameterView.plot.fAst;
    const crit = parameterView.plot.criticalPoint;
    const pa = parameterView.plot.paramA;
    let c: [number, number] = [land.seed[0], land.seed[1]];
    let label: string;
    if (land.kind === "center") {
      // The periodic angle's doubling period IS the component period — Newton-snap to the centre.
      const nuc = findNucleus(fAst, crit, land.period, land.seed, pa);
      if (nuc) c = [nuc[0], nuc[1]];
      label = `period-${land.period} centre`;
    } else {
      // Preperiodic: the ray lands at the Misiurewicz point. (The angle's doubling preperiod isn't
      // the critical-orbit preperiod, so we land at the ray seed rather than Newton-polish here.)
      label = "Misiurewicz point (≈ ray landing)";
    }
    parameterView.plot.moveZ0(c);
    parameterView.refreshOverlay();
    dynamicalView.plot.c = formatComplex(c);
    setCInput(c);
    updateDynCaption();
    announce(`Parameter c = ${dynCValue.textContent}`);
    showToast(`External angle ${m[1]}/${m[2]} → ${label}.`, "info");
    const info = inspect(fAst, parameterView.plot.escAst, "param", crit, c, pa);
    handleInspect(info, c, "param");
    scheduleRecord();
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
  byId("sphere-render").addEventListener("click", () => {
    const plot = dynamicalView.plot;
    if (!plot.perturbationEligible) {
      showToast("Riemann-sphere render is for the z²+c family.", "warn");
      return;
    }
    const canvas = byId<HTMLCanvasElement>("sphere-canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    const buf = renderRiemannSphere(plot.fAst, plot.escAst, plot.cValue, size, 256, plot.paramA);
    const img = ctx.createImageData(size, size);
    img.data.set(buf);
    ctx.putImageData(img, 0, 0);
    byId("sphere-download").hidden = false;
    showToast("Rendered the Julia set on the Riemann sphere.", "info");
  });
  byId("sphere-download").addEventListener("click", () => {
    byId<HTMLCanvasElement>("sphere-canvas").toBlob((blob) => {
      if (blob) downloadBlob(blob, "riemann-sphere.png");
    });
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
  loadFromHash(); // apply a shared view if the URL carries one
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
}
