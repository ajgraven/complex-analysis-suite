// The polynomial, in two forms at once (DESIGN §2, §4.2).
//
// `lead·∏(z − rᵢ)` and `Σ aₖ zᵏ` are the same object and the app shows both, but only one of them is
// the truth at any moment: a root drag makes the ROOTS the source and derives the coefficients by
// Vieta; a coefficient drag or a typed polynomial makes the COEFFICIENTS the source and derives the
// roots by a solve. The `source` tag records which, and the constructors below are the only way to
// make a `Polynomial`, so the derived side is always derived from the source in the same call.
//
// Ring invariants (PLAN §4.1):
//   C — anything.
//   R — real coefficients; the roots are closed under conjugation, a dragged complex root drags its
//       conjugate, a real root stays on the real axis, and a coefficient moves along the real axis.
//   Q — R, and the coefficients are rational: the EXACT layer `exact` is the truth whenever it is
//       present, and a released drag snaps to it (`snapRational`), after which the roots are re-solved.
import { QiPoly, gaussOfDoubles } from "@cas/exact";
import { separate, solveAndRefine } from "./roots/solve.js";

import type { Cx, Ring } from "./types.js";
export type { Cx, Ring } from "./types.js";

/** The degree cap (PLAN §12, owner round 2 question 11). */
export const MAX_DEGREE = 24;

export interface Polynomial {
  readonly degree: number;
  readonly ring: Ring;
  /** Which float form is the truth right now. */
  readonly source: "roots" | "coeffs";
  /** aₙ. */
  readonly lead: Cx;
  /** a₀ … aₙ, ascending. */
  readonly coeffs: readonly Cx[];
  /** r₁ … rₙ, in label order: `roots[i]` carries `labels[i]`. */
  readonly roots: readonly Cx[];
  /** Root identity across drags (1 … n). */
  readonly labels: readonly number[];
  /** ℚ mode (and a typed polynomial in any ring): the exact coefficients, when they are the truth. */
  readonly exact: QiPoly | null;
  /** Whether the root solve converged (only meaningful when `source === "coeffs"`). */
  readonly converged: boolean;
}

/** The previous state a new solve continues from, so root LABELS persist across an edit. */
export interface Continuation {
  readonly roots: readonly Cx[];
  readonly labels: readonly number[];
}

const ident = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Vieta: the ascending coefficients of `lead·∏(z − rᵢ)`, recomputed in full (`O(n²)`, n ≤ 24). */
export function vieta(roots: readonly Cx[], lead: Cx): Cx[] {
  // A full recompute rather than PLAN §7's O(n) divide-out/multiply-in update: the incremental form
  // accumulates rounding over a drag of hundreds of frames, and 576 flops is not a cost.
  let c: [number, number][] = [[lead[0], lead[1]]];
  for (const [rx, ry] of roots) {
    const next: [number, number][] = Array.from({ length: c.length + 1 }, () => [0, 0]);
    for (let k = 0; k < c.length; k++) {
      // (… + c_k z^k)(z − r): c_k goes up one degree, −r·c_k stays.
      next[k + 1][0] += c[k][0];
      next[k + 1][1] += c[k][1];
      next[k][0] -= rx * c[k][0] - ry * c[k][1];
      next[k][1] -= rx * c[k][1] + ry * c[k][0];
    }
    c = next;
  }
  return c;
}

function realOnly(ring: Ring, coeffs: readonly Cx[]): string | null {
  if (ring === "C") return null;
  const k = coeffs.findIndex((c) => c[1] !== 0);
  return k < 0
    ? null
    : `coefficient a${k} is not real, and ${ring === "R" ? "ℝ" : "ℚ"} mode keeps every coefficient real`;
}

export type Built =
  | { readonly ok: true; readonly poly: Polynomial }
  | { readonly ok: false; readonly reason: string };

function checkDegree(n: number): string | null {
  if (n < 1) return "a constant has no roots — the degree must be at least 1";
  if (n > MAX_DEGREE) return `degree ${n} is over this app's cap of ${MAX_DEGREE}`;
  return null;
}

/** Match each new root to a previous label: greedy nearest pairs, closest first. A PREVIEW, never a certificate. */
function continueLabels(
  prev: Continuation,
  roots: readonly Cx[],
): { roots: Cx[]; labels: number[] } {
  const n = roots.length;
  if (prev.roots.length !== n) return { roots: [...roots], labels: ident(n) };
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      pairs.push([
        Math.hypot(prev.roots[i][0] - roots[j][0], prev.roots[i][1] - roots[j][1]),
        i,
        j,
      ]);
  pairs.sort((a, b) => a[0] - b[0]);
  const takenPrev = new Array<boolean>(n).fill(false);
  const takenNew = new Array<boolean>(n).fill(false);
  const out: Cx[] = new Array<Cx>(n);
  for (const [, i, j] of pairs) {
    if (takenPrev[i] || takenNew[j]) continue;
    takenPrev[i] = takenNew[j] = true;
    out[i] = roots[j];
  }
  return { roots: out, labels: [...prev.labels] };
}

/** From coefficients (ascending, leading non-zero), solving for the roots — seeded by `prev` when given. */
export function fromCoeffs(
  coeffs: readonly Cx[],
  ring: Ring,
  prev?: Continuation,
  exact: QiPoly | null = null,
): Built {
  const n = coeffs.length - 1;
  const bad = checkDegree(n);
  if (bad) return { ok: false, reason: bad };
  const lead = coeffs[n];
  if (lead[0] === 0 && lead[1] === 0)
    return { ok: false, reason: `the leading coefficient a${n} is zero` };
  if (!coeffs.every((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))) {
    return { ok: false, reason: "a coefficient is not a finite number" };
  }
  const notReal = realOnly(ring, coeffs);
  if (notReal) return { ok: false, reason: notReal };
  if (ring === "Q" && exact === null)
    return { ok: false, reason: "ℚ mode needs exact rational coefficients" };

  const seeds = prev && prev.roots.length === n ? prev.roots : undefined;
  const exactCoeffs = exact
    ? Array.from({ length: n + 1 }, (_, k) => exact.coeff(k))
    : null;
  const solved = solveAndRefine(coeffs, exactCoeffs, seeds);
  let roots = solved.roots;
  let labels = ident(n);
  if (prev) ({ roots, labels } = continueLabels(prev, roots));
  // `separate` again after the pairing: `conjugateClose` averages pairs and flattens unpaired roots
  // onto the axis, which can land two approximations on one point.
  if (ring !== "C") roots = separate(conjugateClose(roots));
  return {
    ok: true,
    poly: {
      degree: n,
      ring,
      source: "coeffs",
      lead,
      coeffs: [...coeffs],
      roots,
      labels,
      exact,
      converged: solved.converged,
    },
  };
}

/** From EXACT coefficients (a typed polynomial, or a ℚ-mode snap): the float forms derive from them. */
export function fromExact(exact: QiPoly, ring: Ring, prev?: Continuation): Built {
  const n = exact.degree();
  const bad = checkDegree(n);
  if (bad) return { ok: false, reason: bad };
  const coeffs: Cx[] = [];
  for (let k = 0; k <= n; k++) coeffs.push(exact.coeff(k).toTuple());
  const notReal = realOnly(ring, coeffs);
  if (notReal) return { ok: false, reason: notReal };
  return fromCoeffs(coeffs, ring, prev, exact);
}

/**
 * From roots and the leading coefficient: Vieta gives the coefficients. The ROOTS are kept bit for bit
 * — root form is the truth, and it is well-conditioned even where the coefficients are not
 * (Wilkinson; research 03 §9). In ℝ the coefficients' imaginary parts, which a conjugate-closed root
 * set makes zero up to rounding, are set to exactly zero. Not available in ℚ mode, whose truth is exact.
 */
export function fromRoots(
  roots: readonly Cx[],
  lead: Cx,
  ring: Ring,
  labels?: readonly number[],
): Built {
  const n = roots.length;
  const bad = checkDegree(n);
  if (bad) return { ok: false, reason: bad };
  if (lead[0] === 0 && lead[1] === 0)
    return { ok: false, reason: "the leading coefficient is zero" };
  if (!roots.every((r) => Number.isFinite(r[0]) && Number.isFinite(r[1]))) {
    return { ok: false, reason: "a root is not a finite number" };
  }
  if (ring === "Q")
    return {
      ok: false,
      reason: "in ℚ mode the coefficients are the truth; release the drag to snap them",
    };
  let coeffs = vieta(roots, lead);
  if (ring === "R") {
    if (lead[1] !== 0)
      return { ok: false, reason: "ℝ mode needs a real leading coefficient" };
    // The imaginary parts are zeroed only because conjugate pairs make them zero up to rounding;
    // without the pairs, zeroing them would silently change the polynomial.
    const unpaired = roots.findIndex((r, i) => r[1] !== 0 && partnerOf(roots, i) === i);
    if (unpaired >= 0) {
      return {
        ok: false,
        reason: `root ${unpaired + 1} has no conjugate partner, and ℝ mode needs every complex root paired`,
      };
    }
    coeffs = coeffs.map(([re]) => [re, 0]);
  }
  return {
    ok: true,
    poly: {
      degree: n,
      ring,
      source: "roots",
      lead,
      coeffs,
      roots: [...roots],
      labels: labels ? [...labels] : ident(n),
      exact: null,
      converged: true,
    },
  };
}

/**
 * Pair every non-real root with its nearest conjugate and make the pair EXACT conjugates (averaging),
 * and put a root with no partner on the real axis. A real-coefficient solve returns such pairs only up
 * to rounding; ℝ's invariant is that they are pairs.
 */
export function conjugateClose(roots: readonly Cx[]): Cx[] {
  const out: Cx[] = roots.map((r) => [r[0], r[1]]);
  const used = new Array<boolean>(roots.length).fill(false);
  const order = roots
    .map((r, i) => [Math.abs(r[1]), i] as const)
    .sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (used[i]) continue;
    used[i] = true;
    const [x, y] = roots[i];
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < roots.length; j++) {
      if (used[j]) continue;
      const d = Math.hypot(roots[j][0] - x, roots[j][1] + y);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    // A partner is a conjugate that is closer to r̄ than r is to the real axis; otherwise r is real.
    if (best >= 0 && bestD < Math.abs(y)) {
      used[best] = true;
      const mx = (x + roots[best][0]) / 2;
      const my = (Math.abs(y) + Math.abs(roots[best][1])) / 2;
      out[i] = [mx, y >= 0 ? my : -my];
      out[best] = [mx, y >= 0 ? -my : my];
    } else {
      out[i] = [x, 0];
    }
  }
  return out;
}

/** The index of the conjugate partner of root `i` in a conjugate-closed set (itself when real). */
export function partnerOf(roots: readonly Cx[], i: number): number {
  const [x, y] = roots[i];
  if (y === 0) return i;
  for (let j = 0; j < roots.length; j++)
    if (j !== i && roots[j][0] === x && roots[j][1] === -y) return j;
  return i;
}

/** The exact coefficients of a float polynomial, as the dyadic rationals they are. */
export function dyadicExact(coeffs: readonly Cx[]): QiPoly {
  return QiPoly.fromCoeffs(coeffs.map(([re, im]) => gaussOfDoubles(re, im)));
}

/** Evaluate at `z` (Horner). */
export function evalAt(coeffs: readonly Cx[], z: Cx): Cx {
  let re = 0;
  let im = 0;
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const nr = re * z[0] - im * z[1] + coeffs[k][0];
    im = re * z[1] + im * z[0] + coeffs[k][1];
    re = nr;
  }
  return [re, im];
}
