// The pseudozero set and Mosier's count, certified (PLAN §7 PRA-2; DESIGN §3 Analysis card).
//
// Λ_ε(p) = { z : |p(z)| ≤ ε·w(z) }, w(z) = Σ|aₖ||z|ᵏ, is where some polynomial whose coefficients
// differ from p's by at most ε RELATIVELY (|Δaₖ| ≤ ε|aₖ|) has a root. Mosier (1986): each connected
// component holds the same number of roots of every such polynomial — the number p has there.
//
// What this module can PROVE is the Rouché form of that statement. If on a closed curve Γ
//
//     |p(z)| > ε·w(z) ≥ |Δp(z)|,
//
// then p + Δp and p have the same number of roots inside Γ. So a region is certified by checking its
// BOUNDARY, and the count inside is p's own, read exactly off Smith's discs. The GPU picture is `≈`;
// the certified region is a union of grid cells that CONTAINS the drawn component, and the claim is
// made about that union — "every polynomial within ε has exactly k roots here".
//
// The boundary check, per cell edge [A, B] with midpoint c and half-length δ: the Taylor expansion
// p(c + t) = Σ Tₘ tᵐ gives, for |t| ≤ δ,
//
//     |p| ≥ |T₀| − Σ_{m≥1} |Tₘ| δᵐ,   w ≤ W := Σ|aₖ|(|c| + δ)ᵏ,
//
// and the floating-point error in the Tₘ is bounded a priori by a multiple of n·u·W (the Taylor shift
// of the absolute-value polynomial dominates every rounding), so "lower bound > ε·W" is a theorem about
// the exact values. The regions are grown one layer at a time from the cells whose centre looks
// inside (and every root's own cell), until each boundary passes or three layers have been spent.
import type { Polynomial } from "../polynomial.js";
import type { Cx } from "../types.js";
import type { RootDisc } from "../roots/discs.js";

const U = 2 ** -53;

export interface PseudozeroRegion {
  /** Cell indices (row-major) of the certified union. */
  readonly cells: readonly number[];
  /** Indices of p's plotted roots accounted inside, when the count is certified. */
  readonly roots: readonly number[];
  /** Roots of p (with multiplicity) inside — certified for every polynomial within ε when `certified`. */
  readonly count: number;
  readonly certified: boolean;
  /** Why not, when not. */
  readonly reason: string | null;
}

export interface PseudozeroReport {
  readonly eps: number;
  readonly grid: {
    readonly nx: number;
    readonly ny: number;
    readonly x0: number;
    readonly y0: number;
    readonly h: number;
  };
  readonly regions: readonly PseudozeroRegion[];
}

interface Evaluator {
  readonly n: number;
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly abs: Float64Array;
}

function evaluator(p: Polynomial): Evaluator {
  const n = p.degree;
  return {
    n,
    re: Float64Array.from(p.coeffs, (c) => c[0]),
    im: Float64Array.from(p.coeffs, (c) => c[1]),
    abs: Float64Array.from(p.coeffs, (c) => Math.hypot(c[0], c[1])),
  };
}

/** log(|p(z)| / w(z)) in floats — only used to decide where to LOOK, never to certify. */
function ratio(e: Evaluator, x: number, y: number): number {
  let pr = 0;
  let pi = 0;
  let w = 0;
  const r = Math.hypot(x, y);
  for (let k = e.n; k >= 0; k--) {
    const nr = pr * x - pi * y + e.re[k];
    pi = pr * y + pi * x + e.im[k];
    pr = nr;
    w = w * r + e.abs[k];
  }
  return Math.hypot(pr, pi) / w;
}

/** Is |p| > ε·w on the whole segment [a, b]? A proof, per the header; `false` means "not shown". */
export function segmentClear(
  e: Evaluator,
  eps: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2;
  const delta = Math.hypot(bx - ax, by - ay) / 2;
  // Taylor coefficients at c by repeated synthetic division (the Horner shift).
  const tr = Float64Array.from(e.re);
  const ti = Float64Array.from(e.im);
  const n = e.n;
  for (let m = 0; m < n; m++) {
    for (let k = n - 1; k >= m; k--) {
      const nr = tr[k] + (tr[k + 1] * cx - ti[k + 1] * cy);
      const ni = ti[k] + (tr[k + 1] * cy + ti[k + 1] * cx);
      tr[k] = nr;
      ti[k] = ni;
    }
  }
  let tail = 0;
  let dm = 1;
  for (let m = 1; m <= n; m++) {
    dm *= delta;
    tail += Math.hypot(tr[m], ti[m]) * dm;
  }
  let W = 0;
  const R = Math.hypot(cx, cy) + delta;
  for (let k = n; k >= 0; k--) W = W * R + e.abs[k];
  // A priori rounding: every Tₘ δᵐ is within ~(2n + 4)·u of its value relative to the absolute Taylor
  // shift, whose total is ≤ W; a factor of 4 above that covers hypot, the products and the sums.
  const err = 4 * (2 * n + 4) * U * W;
  const lower = Math.hypot(tr[0], ti[0]) - tail - err;
  return lower > eps * W * (1 + 8 * n * U);
}

const MAX_LAYERS = 3;

/**
 * Certify the pseudozero regions of `p` at `eps` over the world rectangle `range`, with the roots' own
 * Smith discs. `cells` is the grid's resolution along the longer side.
 */
export function pseudozeroRegions(
  p: Polynomial,
  discs: readonly RootDisc[],
  eps: number,
  range: readonly [number, number, number, number],
  cells = 128,
): PseudozeroReport {
  const [x0, x1, y0, y1] = range;
  const h = Math.max(x1 - x0, y1 - y0) / cells;
  const nx = Math.max(1, Math.ceil((x1 - x0) / h));
  const ny = Math.max(1, Math.ceil((y1 - y0) / h));
  const e = evaluator(p);
  const idx = (i: number, j: number): number => j * nx + i;
  const centre = (i: number, j: number): Cx => [x0 + (i + 0.5) * h, y0 + (j + 0.5) * h];
  const cellOf = ([x, y]: Cx): [number, number] | null => {
    const i = Math.floor((x - x0) / h);
    const j = Math.floor((y - y0) / h);
    return i >= 0 && j >= 0 && i < nx && j < ny ? [i, j] : null;
  };

  // Seed: centres that look inside, and every root's own cell (a root is always inside: g = −εw < 0).
  const mask = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [x, y] = centre(i, j);
      if (ratio(e, x, y) <= eps) mask[idx(i, j)] = 1;
    }
  }
  for (const r of p.roots) {
    const c = cellOf(r);
    if (c) mask[idx(c[0], c[1])] = 1;
  }

  const dilate = (m: Uint8Array, only: Set<number> | null): Uint8Array => {
    const out = Uint8Array.from(m);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!m[idx(i, j)] || (only && !only.has(idx(i, j)))) continue;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const a = i + di;
            const b = j + dj;
            if (a >= 0 && b >= 0 && a < nx && b < ny) out[idx(a, b)] = 1;
          }
      }
    }
    return out;
  };

  const components = (m: Uint8Array): number[][] => {
    const seen = new Uint8Array(nx * ny);
    const out: number[][] = [];
    for (let s = 0; s < nx * ny; s++) {
      if (!m[s] || seen[s]) continue;
      const comp: number[] = [];
      const stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const c = stack.pop() as number;
        comp.push(c);
        const i = c % nx;
        const j = (c - i) / nx;
        for (const [a, b] of [
          [i + 1, j],
          [i - 1, j],
          [i, j + 1],
          [i, j - 1],
        ]) {
          if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
          const t = idx(a, b);
          if (m[t] && !seen[t]) {
            seen[t] = 1;
            stack.push(t);
          }
        }
      }
      out.push(comp);
    }
    return out;
  };

  /** Every boundary edge of the component clear; `null` when so, else the reason. */
  const boundaryFails = (comp: number[], m: Uint8Array): string | null => {
    for (const c of comp) {
      const i = c % nx;
      const j = (c - i) / nx;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1)
        return "it reaches the edge of the view";
      const X0 = x0 + i * h;
      const Y0 = y0 + j * h;
      const edges: [boolean, number, number, number, number][] = [
        [!m[idx(i + 1, j)], X0 + h, Y0, X0 + h, Y0 + h],
        [!m[idx(i - 1, j)], X0, Y0, X0, Y0 + h],
        [!m[idx(i, j + 1)], X0, Y0 + h, X0 + h, Y0 + h],
        [!m[idx(i, j - 1)], X0, Y0, X0 + h, Y0],
      ];
      for (const [open, ax, ay, bx, by] of edges) {
        if (open && !segmentClear(e, eps, ax, ay, bx, by))
          return "its boundary could not be shown clear of the set";
      }
    }
    return null;
  };

  let m = dilate(mask, null);
  let comps = components(m);
  let failing = new Map<number, string>();
  for (let layer = 0; ; layer++) {
    failing = new Map();
    comps.forEach((comp, k) => {
      const why = boundaryFails(comp, m);
      if (why) failing.set(k, why);
    });
    if (failing.size === 0 || layer >= MAX_LAYERS) break;
    const grow = new Set<number>();
    for (const k of failing.keys()) for (const c of comps[k]) grow.add(c);
    m = dilate(m, grow);
    comps = components(m);
  }

  // Roots by Smith component: a component of discs counts only if every disc lies in one region.
  const regionOf = new Int32Array(nx * ny).fill(-1);
  comps.forEach((comp, k) => {
    for (const c of comp) regionOf[c] = k;
  });
  const discRegion = discs.map((d) => {
    const r = Math.max(d.radius, 0);
    const lo = cellOf([d.centre[0] - r, d.centre[1] - r]);
    const hi = cellOf([d.centre[0] + r, d.centre[1] + r]);
    if (!lo || !hi) return -2; // off the grid
    let k = -1;
    for (let j = lo[1]; j <= hi[1]; j++)
      for (let i = lo[0]; i <= hi[0]; i++) {
        const t = regionOf[idx(i, j)];
        if (t < 0 || (k >= 0 && t !== k)) return -3; // crosses a boundary
        k = t;
      }
    return k;
  });
  const bySmith = new Map<number, number[]>();
  discs.forEach((d, i) =>
    bySmith.set(d.component, [...(bySmith.get(d.component) ?? []), i]),
  );
  const roots: number[][] = comps.map(() => []);
  const straddles = new Set<number>();
  for (const members of bySmith.values()) {
    const where = new Set(members.map((i) => discRegion[i]));
    if (where.size === 1) {
      const k = [...where][0];
      if (k >= 0) roots[k].push(...members);
    } else {
      for (const i of members) if (discRegion[i] >= 0) straddles.add(discRegion[i]);
    }
  }

  const regions: PseudozeroRegion[] = comps.map((comp, k) => {
    const why =
      failing.get(k) ?? (straddles.has(k) ? "a root's disc crosses its boundary" : null);
    return {
      cells: comp,
      roots: roots[k],
      count: roots[k].length,
      certified: why === null,
      reason: why,
    };
  });
  return { eps, grid: { nx, ny, x0, y0, h }, regions };
}

export { evaluator as pseudozeroEvaluator };
