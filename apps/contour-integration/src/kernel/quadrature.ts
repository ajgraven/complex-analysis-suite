// Quadrature on a contour piece.
//
// Two rules, chosen by the geometry rather than by a flag, because the choice is a mathematical fact
// about the integrand and not a preference:
//
// - **A closed loop** makes `f(z(t))·z′(t)` *periodic* in `t`. The trapezoidal rule on a periodic
//   analytic integrand converges geometrically — the classical result restated by Trefethen &
//   Weideman (SIAM Rev. 2014), with `|I_N − I| ≤ 4πM/(e^{aN} − 1)` for analyticity half-width `a`.
//   For `∮ dz/z` on a circle about the pole it is *exact at every N*, which is not a coincidence:
//   every sample of `f(z)z′` equals `2πi`, so the rule has nothing left to approximate.
// - **An open arc** is not periodic, its endpoints matter, and the trapezoidal rule drops to second
//   order. Gauss–Legendre is used there.
//
// Research 04 prefers Clenshaw–Curtis for the open case (nested, FFT weights, and in practice it
// matches Gauss despite the nominal 2× disadvantage). Gauss–Legendre is used here because its nodes
// are computed by a short, self-checking Newton iteration rather than a DCT, and nothing in v1 reuses
// nested node sets. Revisit when adaptive refinement wants nesting.

export type Cx = readonly [re: number, im: number];

/** Nodes and weights for ∫₀¹, cached per order. */
const glCache = new Map<number, { x: Float64Array; w: Float64Array }>();

/**
 * Gauss–Legendre nodes and weights on `[0, 1]`.
 *
 * Newton on the Legendre polynomial, seeded with the standard Chebyshev-like approximation to the
 * `k`-th root. `P′` comes from the same three-term recurrence, so the iteration needs no separate
 * derivative routine — and the symmetry of the output is a free check on it.
 */
export function gaussLegendre(n: number): { x: Float64Array; w: Float64Array } {
  const cached = glCache.get(n);
  if (cached) return cached;

  const x = new Float64Array(n);
  const w = new Float64Array(n);
  const m = (n + 1) >> 1;
  for (let i = 0; i < m; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = 0;
      for (let j = 0; j < n; j++) {
        const p2 = p1;
        p1 = p0;
        p0 = ((2 * j + 1) * z * p1 - j * p2) / (j + 1);
      }
      pp = (n * (z * p0 - p1)) / (z * z - 1);
      const dz = p0 / pp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    // Map [-1,1] -> [0,1]: node (1−z)/2, weight halved.
    const weight = 1 / ((1 - z * z) * pp * pp);
    x[i] = 0.5 * (1 - z);
    x[n - 1 - i] = 0.5 * (1 + z);
    w[i] = weight;
    w[n - 1 - i] = weight;
  }
  const out = { x, w };
  glCache.set(n, out);
  return out;
}

/**
 * ∫₀¹ g(t) dt by the `n`-point **periodic** trapezoidal rule, for `g` with `g(0) = g(1)`.
 *
 * Deliberately samples `k/n` for `k = 0 … n−1` and never `t = 1`: on a closed loop that is the same
 * point as `t = 0`, and including both would weight it twice.
 */
export function periodicTrapezoid(g: (t: number) => Cx, n: number): Cx {
  let re = 0;
  let im = 0;
  for (let k = 0; k < n; k++) {
    const v = g(k / n);
    re += v[0];
    im += v[1];
  }
  return [re / n, im / n];
}

/** Sum a list of complex contributions with Neumaier compensation on each component. */
export function compensatedSum(values: readonly Cx[]): Cx {
  let sRe = 0;
  let cRe = 0;
  let sIm = 0;
  let cIm = 0;
  for (const v of values) {
    for (const [x, isRe] of [
      [v[0], true],
      [v[1], false],
    ] as const) {
      const s = isRe ? sRe : sIm;
      const t = s + x;
      const err = Math.abs(s) >= Math.abs(x) ? s - t + x : x - t + s;
      if (isRe) {
        sRe = t;
        cRe += err;
      } else {
        sIm = t;
        cIm += err;
      }
    }
  }
  return [sRe + cRe, sIm + cIm];
}

/** ∫₀¹ g(t) dt by `panels` Gauss–Legendre panels of `nodesPerPanel` points each. */
export function gaussPanels(g: (t: number) => Cx, panels: number, nodesPerPanel: number): Cx {
  const { x, w } = gaussLegendre(nodesPerPanel);
  const h = 1 / panels;
  let re = 0;
  let im = 0;
  for (let j = 0; j < panels; j++) {
    const t0 = j * h;
    for (let k = 0; k < nodesPerPanel; k++) {
      const v = g(t0 + h * x[k]);
      re += w[k] * v[0];
      im += w[k] * v[1];
    }
  }
  return [re * h, im * h];
}

export interface PanelPlan {
  readonly panels: number;
  readonly nodesPerPanel: number;
  /** True when the evaluation budget bound the plan, so the spacing rule below was NOT met. */
  readonly capped: boolean;
}

/** Gauss–Legendre points per panel. 16 puts the panel error near double precision when the panel is
 *  about as long as the distance to the nearest singularity — see {@link panelPlan}. */
export const NODES_PER_PANEL = 16;

/** Evaluation budget for one piece. Generous for a test, bounded enough to keep a drag interactive. */
export const MAX_EVALUATIONS = 262_144;

/**
 * The resolution for a piece with **no singularity anywhere** — panels for {@link panelPlan}, nodes
 * for {@link nodeCount}.
 *
 * A COUNT rather than a length, and that is the whole of the reason. With a singularity at distance
 * `d` the plan is `arcLen/d`, a ratio of two lengths the problem itself supplies; with none, nothing
 * in the data supplies a second length, so dividing the arc by "one unit" would make the plan depend
 * on the units the contour happens to be drawn in. A fixed count is the only choice that does not.
 *
 * It is not a promise of accuracy and does not pretend to be one: what says whether it was enough is
 * the successive-refinement estimate the caller already computes at `2×` this, read through
 * `integrate.ts`'s `converged`. Measured on the three entire records in the gallery (F2's rays, E3's
 * rectangle, C2's removable pole) the refinement lands at 1e-13…1e-31 here, and F2's ray — the piece
 * that needs the most, a Gaussian of unit width along a length of 6 — is bit-stable from 32 panels
 * through 8192.
 */
export const NO_SINGULARITY_RESOLUTION = 32;

/**
 * How to subdivide a piece.
 *
 * Research 04's node-density rule — `10⁻¹²` wants roughly **4.4 nodes within one pole distance** —
 * is a statement about *arclength spacing*, and a single high-order Gauss rule does not deliver it:
 * Gauss nodes cluster quadratically at the endpoints, so stretching one rule over a long piece
 * leaves the middle far too coarse. Integrating `1/(1+x²)` along `[−4000, 4000]` in one rule misses
 * by 0.1, because the peak of unit width falls between neighbouring nodes.
 *
 * Panels of length comparable to the singularity distance `d` fix that, and convert the rule into
 * something with a clean justification: on a panel of half-length `h ≈ d/2`, the Bernstein ellipse
 * through the singularity has parameter `ρ = (h + √(h² + d²))/h ≈ 3.2`, and Gauss–Legendre converges
 * like `ρ^{−2n}`, so 16 points per panel is already past double precision.
 *
 * **`d = ∞` and `d ≤ 0` are opposite cases and are answered apart.** No singularity at all is the
 * EASIEST piece there is, and lumping it in with one sitting on the contour bought the three entire
 * records the maximum plan on every recompute — 1.0M–2.1M nodes and 0.96–1.48 s, against 0.8–63 ms
 * for every other record — and, worse, a `capped: true` that made `converged` false and put
 * *"the evaluation budget bound the resolution"* in their provenance, which had not happened. A
 * non-positive distance still means "as fine as the budget allows", and so does a `NaN`, which is a
 * distance that could not be measured rather than one that is not there.
 *
 * When the budget binds, `capped` is set — and the caller must surface that rather than quietly
 * returning a value computed at the wrong resolution. Past that point refining is the wrong move
 * anyway; the fix is to subtract the principal part (research 04 §1.5), which is M2 work.
 */
export function panelPlan(
  arcLen: number,
  nearestSingularity: number,
  opts?: { maxEvaluations?: number },
): PanelPlan {
  const budget = opts?.maxEvaluations ?? MAX_EVALUATIONS;
  const maxPanels = Math.max(1, Math.floor(budget / NODES_PER_PANEL));
  if (nearestSingularity === Number.POSITIVE_INFINITY) {
    return {
      panels: Math.min(NO_SINGULARITY_RESOLUTION, maxPanels),
      nodesPerPanel: NODES_PER_PANEL,
      capped: false,
    };
  }
  if (!Number.isFinite(nearestSingularity) || nearestSingularity <= 0) {
    return { panels: maxPanels, nodesPerPanel: NODES_PER_PANEL, capped: true };
  }
  const wanted = Math.max(1, Math.ceil(arcLen / nearestSingularity));
  return {
    panels: Math.min(wanted, maxPanels),
    nodesPerPanel: NODES_PER_PANEL,
    capped: wanted > maxPanels,
  };
}

/**
 * Node count for the periodic trapezoidal rule on a closed loop.
 *
 * Here the rule really is uniform in the parameter, so the 4.4-nodes-per-pole-distance form applies
 * directly, with no panelling needed. `d = ∞` takes {@link NO_SINGULARITY_RESOLUTION} for the reason
 * {@link panelPlan} gives; `d ≤ 0` and `NaN` still take the maximum.
 */
export function nodeCount(
  arcLen: number,
  nearestSingularity: number,
  opts?: { min?: number; max?: number },
): number {
  const min = opts?.min ?? 16;
  const max = opts?.max ?? 65_536;
  if (nearestSingularity === Number.POSITIVE_INFINITY) {
    return Math.max(min, Math.min(max, NO_SINGULARITY_RESOLUTION));
  }
  if (!Number.isFinite(nearestSingularity) || nearestSingularity <= 0) return max;
  return Math.max(min, Math.min(max, Math.ceil((4.4 * arcLen) / nearestSingularity)));
}
