/**
 * underIteration.ts — detect a view that is under-iterated for its zoom.
 *
 * When the iteration cap n is too low for the current magnification, boundary pixels that *would*
 * escape never reach the bailout within n steps, so they render as (spuriously) interior — the
 * fractal boundary "fattens" and the fine filaments disappear. This is the most common quality
 * pitfall when zooming with a fixed iteration count.
 *
 * The detector samples a small CPU grid over the visible window (reusing the compiled escape
 * closures, exactly like the Julia interior mask in juliaProperties.ts) and asks a direct question:
 * how many currently-"interior" pixels would actually escape if we raised the cap to the zoom-
 * appropriate count? It iterates each cell to
 *
 *     probeIter = clamp( autoIterations(100, zoom),  2n,  PROBE_CEIL )
 *
 * — the cap the app's own auto-iteration law would pick for this magnification (from a fixed
 * reference base of 100, so the probe window tracks the *zoom*, not the current, possibly tiny, n).
 * Cells escaping only at step ≥ n (in [n, probeIter)) are the "recovered" detail; cells that escape
 * within the current cap are already drawn correctly, and genuinely interior cells never escape even
 * at probeIter and are excluded — so a legitimately black view (deep inside the set) is NOT flagged.
 * If the recovered fraction exceeds a small threshold the view is under-iterated, and
 * `suggestedIterations` (= probeIter) is the zoom-appropriate cap, so a single "raise" decisively
 * fixes the view. The grid is budget-capped (≤ COST_BUDGET cell·iterations) so an interior-heavy or
 * very deep view can't make the probe expensive.
 *
 * Pure module — no DOM / GL; it mirrors the GLSL escape semantics through the compiled closures. The
 * caller gates it to escape-time colouring modes and debounces it onto settled frames. The visible
 * window is centre ± 1/zoom on each axis, matching the shader coordinate map plot = centre + (uv·2−1)/zoom.
 */
import type { Vec2 } from "../arrays";
import type { Complex } from "../complex";
import type { Node } from "@cas/expr/ast";
import { getComplexFn, getEscapeFn } from "@cas/expr/evaluate";
import { autoIterations } from "./glPlot";

export interface UnderIterationInput {
  fAst: Node;
  escAst: Node;
  /** Which plane the view shows — decides what varies per pixel (see below). */
  plane: "param" | "dyn";
  /** Parameter c. Dynamical plane: the fixed map parameter. Parameter plane: unused (c is the pixel). */
  c: Complex;
  /** Orbit start. Parameter plane: the critical point. Dynamical plane: unused (z₀ is the pixel). */
  orbitStart: Complex;
  /** Free parameter a, bound into f / the escape test. */
  a: Complex;
  /** View centre (plot coordinates). */
  center: Vec2;
  /** Magnification (plot half-width = 1/zoom). */
  zoom: number;
  /** Current effective iteration cap (after any auto-scaling). */
  iterations: number;
}

export interface UnderIterationResult {
  /** True iff a non-trivial fraction of the view would gain detail at a higher iteration cap. */
  underIterated: boolean;
  /** Fraction of sampled cells that escape only beyond the current cap (in [n, probeIter)). */
  recoveredFraction: number;
  /**
   * Fraction of sampled cells that never escape within the (zoom-appropriate) probe cap — i.e.
   * genuinely interior. ≈1 for a view sitting inside the set (where escape-time renders a flat
   * black image and an interior/period colouring is wanted); 0 in the early-out cases.
   */
  interiorFraction: number;
  /** Iteration cap that restores the recovered detail — the value to bump to. */
  suggestedIterations: number;
  /** Cells sampled (diagnostic). */
  sampled: number;
}

/** Grid resolution per axis for the CPU probe (32² = 1024 cells) before the cost cap. */
export const PROBE_GRID = 32;
/** Largest iteration cap the probe runs to / suggests. */
export const PROBE_CEIL = 4000;
/** Cost ceiling in cell·iterations; the grid is shrunk so gridSize²·probeIter stays under this. */
export const COST_BUDGET = 1_200_000;
/** Reference base for the zoom-appropriate cap (decouples the probe window from the current n). */
const REF_BASE = 100;
/** Recovered-fraction above which the view is flagged as under-iterated. */
export const DEFAULT_THRESHOLD = 0.02;

/**
 * Probe the current view for under-iteration. `gridSize` and `threshold` are exposed for tests; the
 * defaults are tuned for an interactive, debounced call on a settled frame.
 */
export function detectUnderIteration(
  input: UnderIterationInput,
  gridSize: number = PROBE_GRID,
  threshold: number = DEFAULT_THRESHOLD,
): UnderIterationResult {
  const { fAst, escAst, plane, c, orbitStart, a, center, zoom, iterations } = input;
  const n = Math.max(1, Math.round(iterations));
  // The cap the app's auto-iteration law would pick for this zoom (from a stable reference base).
  const probeIter = Math.min(
    PROBE_CEIL,
    Math.max(2 * n, Math.round(autoIterations(REF_BASE, zoom, 1.5))),
  );
  const clear: UnderIterationResult = {
    underIterated: false,
    recoveredFraction: 0,
    interiorFraction: 0,
    suggestedIterations: probeIter,
    sampled: 0,
  };
  // Nothing to recover if the probe cap isn't above the current cap, or the view is degenerate.
  if (probeIter <= n || !Number.isFinite(zoom) || zoom <= 0) return clear;

  const f = getComplexFn(fAst, a);
  const esc = getEscapeFn(escAst, fAst, a);
  // Shrink the grid so the worst case (every cell runs the full probe) stays under the budget.
  const grid = Math.max(8, Math.min(gridSize, Math.floor(Math.sqrt(COST_BUDGET / probeIter))));
  const halfWidth = 1 / zoom;
  const step = (2 * halfWidth) / grid;

  let recovered = 0;
  let interior = 0;
  let sampled = 0;
  for (let py = 0; py < grid; py++) {
    const y = center[1] - halfWidth + (py + 0.5) * step;
    for (let px = 0; px < grid; px++) {
      const x = center[0] - halfWidth + (px + 0.5) * step;
      // Parameter plane: the pixel IS c and the orbit starts at the critical point. Dynamical plane:
      // the pixel is z₀ and c is fixed. (Matches how each plane's escape-time image is generated.)
      const cVal: Complex = plane === "param" ? [x, y] : c;
      let z: Complex = plane === "param" ? [orbitStart[0], orbitStart[1]] : [x, y];
      sampled++;
      let escapeStep = -1;
      for (let k = 0; k < probeIter; k++) {
        if (esc(z, cVal)) {
          escapeStep = k;
          break;
        }
        z = f(z, cVal);
        if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) {
          escapeStep = k; // diverged to a non-finite value ⇒ escaped here
          break;
        }
      }
      if (escapeStep < 0) interior++; // never escaped within the probe cap ⇒ genuinely interior
      else if (escapeStep >= n) recovered++; // escaped only beyond the current cap ⇒ recovered detail
    }
  }
  const recoveredFraction = sampled > 0 ? recovered / sampled : 0;
  return {
    underIterated: recoveredFraction > threshold,
    recoveredFraction,
    interiorFraction: sampled > 0 ? interior / sampled : 0,
    suggestedIterations: probeIter, // the zoom-appropriate cap — one raise resolves the view
    sampled,
  };
}
