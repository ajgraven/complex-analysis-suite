// Numeric roots: closed forms at degree 1 and 2, Aberth–Ehrlich above (DESIGN §4.1 step 1).
//
// **Aberth, not PLAN's Durand–Kerner + polish, by measurement.** @cas/core's DK diverged on Wilkinson's
// degree-20 polynomial from its spiral seeds and had not converged after 2000 iterations from a circle
// (backward error 8e-4); Aberth (moved into @cas/core from Polynomial Roots for this, ADR-0047)
// converges in 32 sweeps, and its stopping rule is the residual — each root is an exact root of a
// polynomial within 8ε of ours, coefficient by coefficient — so no polish is needed after it.
//
// Seeded from the previous roots during a drag, so each iterate continues its own root and a label
// stays with it (a PREVIEW of identity — the certificate is PRA-3's tracker); from the unit circle
// otherwise. Every coordinate here is `≈`; what is `=` about them is what `discs.ts` proves.
import { aberth, makeWorkspace, tupleAlgebra } from "@cas/core";
import { gaussOfDoubles, type Gauss } from "@cas/exact";
import type { Cx } from "../types.js";
import { refineExactly } from "./refine.js";

export interface Solved {
  readonly roots: Cx[];
  /** Every root's residual reached the rounding noise of evaluating p there. */
  readonly converged: boolean;
  /** The roots were refined against the EXACT coefficients (see `refine.ts`). */
  readonly refined?: boolean;
}

const div = (a: Cx, b: Cx): Cx => tupleAlgebra.div([a[0], a[1]], [b[0], b[1]]);
const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

function csqrt([x, y]: Cx): Cx {
  const r = Math.hypot(x, y);
  if (r === 0) return [0, 0];
  const re = Math.sqrt((r + Math.abs(x)) / 2);
  const im = y / (2 * re);
  return x >= 0 ? [re, im] : [Math.abs(im), y >= 0 ? re : -re];
}

/** `a z² + b z + c`, without the cancellation of the textbook formula. */
function quadratic(c: Cx, b: Cx, a: Cx): Cx[] {
  const bb = mul(b, b);
  const ac4 = mul(a, c);
  const s = csqrt([bb[0] - 4 * ac4[0], bb[1] - 4 * ac4[1]]);
  // q = −(b + sign·√Δ)/2 with the sign that makes |b + sign·√Δ| largest.
  const plus: Cx = [b[0] + s[0], b[1] + s[1]];
  const minus: Cx = [b[0] - s[0], b[1] - s[1]];
  const big = Math.hypot(...plus) >= Math.hypot(...minus) ? plus : minus;
  const q: Cx = [-big[0] / 2, -big[1] / 2];
  if (q[0] === 0 && q[1] === 0)
    return [
      [0, 0],
      [0, 0],
    ];
  return [div(q, a), div(c, q)];
}

/** Write distinct seeds into the workspace: the repulsion term divides by their differences. */
function seedInto(seeds: readonly Cx[], re: Float64Array, im: Float64Array): void {
  seeds.forEach(([x, y], i) => {
    let sx = x;
    let sy = y;
    for (let k = 1; seeds.slice(0, i).some((_, j) => re[j] === sx && im[j] === sy); k++) {
      const eps = 1e-7 * Math.max(1, Math.hypot(x, y)) * k;
      sx = x + eps * Math.cos(k);
      sy = y + eps * Math.sin(k);
    }
    re[i] = sx;
    im[i] = sy;
  });
}

/** The roots of `Σ coeffs[k] zᵏ` (ascending, leading coefficient non-zero). */
export function solveRoots(coeffs: readonly Cx[], seeds?: readonly Cx[]): Solved {
  const n = coeffs.length - 1;
  const lead = coeffs[n];
  if (n === 1)
    return { roots: [div([-coeffs[0][0], -coeffs[0][1]], lead)], converged: true };
  if (n === 2)
    return { roots: quadratic(coeffs[0], coeffs[1], coeffs[2]), converged: true };

  const cRe = Float64Array.from(coeffs, (c) => c[0]);
  const cIm = Float64Array.from(coeffs, (c) => c[1]);
  const ws = makeWorkspace(n);
  let res = null;
  if (
    seeds &&
    seeds.length === n &&
    seeds.every((z) => Number.isFinite(z[0]) && Number.isFinite(z[1]))
  ) {
    seedInto(seeds, ws.rootRe, ws.rootIm);
    res = aberth(cRe, cIm, n, ws, { seedFromWorkspace: true, maxSweeps: 200 });
  }
  // A seeded run that stalled starts again from the unit circle; it has no labels to keep, and the
  // caller re-matches them to the previous roots by distance.
  if (!res || !res.converged) res = aberth(cRe, cIm, n, ws, { maxSweeps: 200 });
  const roots: Cx[] = Array.from(
    { length: n },
    (_, k) => [ws.rootRe[k], ws.rootIm[k]] as Cx,
  );
  return { roots, converged: res.converged };
}

/**
 * Coincident approximations spread ALONG THE REAL DIRECTION, `r = 2⁻²⁶·max(1, |z|)` apart — the scale
 * at which a multiple root's approximations naturally sit. Smith's theorem needs the points DISTINCT
 * and nothing else, so this costs no certainty: the discs about the spread points are proved like any
 * others and come out as one component (a cluster). Needed because the closed form returns a
 * quadratic's double root as two identical points, where Smith refused outright.
 *
 * Along a line, not round a circle: the first version spread on a circle, and `conjugateClose` then
 * folded two copies of (z + 2)³'s root back onto one point. Any spread parallel to an axis keeps
 * conjugate copies conjugate (a mutation sweep showed the vertical one certifies the same); the
 * horizontal one is chosen so a real multiple root's approximations are DRAWN on the real axis.
 */
export function separate(roots: readonly Cx[]): Cx[] {
  const out: Cx[] = roots.map(([x, y]) => [x, y]);
  const groups = new Map<string, number[]>();
  out.forEach(([x, y], i) => {
    const key = `${x},${y}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const [x, y] = out[idx[0]];
    const r = 2 ** -26 * Math.max(1, Math.hypot(x, y));
    idx.forEach((i, k) => {
      out[i] = [x + r * (k - (idx.length - 1) / 2), y];
    });
  }
  return out;
}

/**
 * {@link solveRoots}, then Aberth with EXACT evaluation (`refine.ts`) against `exact` — the typed
 * polynomial's own coefficients, or the doubles' dyadic values when there is no exact layer — then
 * {@link separate}. At a multiple root the refinement converges linearly and leaves the cluster's
 * approximations an ulp or two apart (measured: (z − 1)²(z + 2) → 1 ± 2⁻⁵²), which Smith certifies as
 * one component; the closed form's identical points are what `separate` is for.
 */
export function solveAndRefine(
  coeffs: readonly Cx[],
  exact: readonly Gauss[] | null,
  seeds?: readonly Cx[],
): Solved {
  const solved = solveRoots(coeffs, seeds);
  const c = exact ?? coeffs.map(([re, im]) => gaussOfDoubles(re, im));
  const r = refineExactly(c, solved.roots);
  return {
    roots: separate(r.roots),
    converged: solved.converged || r.converged,
    refined: r.converged,
  };
}
