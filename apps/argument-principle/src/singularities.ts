// singularities.ts — locate and count the zeros, poles, and critical points of f (the Phase-2 instrument).
//
// Two strategies, picked automatically:
//  • RATIONAL f — `@cas/expr`'s `fToRational` gives numerator/denominator coefficient arrays; we root
//    each with `@cas/core`'s Durand–Kerner (the exact-in-principle path, labelled `=`). Zeros = roots
//    of the numerator, poles = roots of the denominator, with a removable-singularity cancellation for
//    any factor common to both.
//  • TRANSCENDENTAL / non-rational f — grid-sample |f| over the search region, take local minima as
//    zero candidates and maxima as pole candidates, Newton-refine with the symbolic f′, and classify
//    each by the winding of arg f around a small circle (+k = zero of order k, −k = pole). Only finds
//    what is IN the region, at the sampling resolution — an estimate, labelled `≈`. Adapted from the
//    complex-function-plotter's `analysis/singularities.ts` (the ADR-0007 first consumer; see plan §4).
//
// Requires a holomorphic f (f′ must exist). For a non-holomorphic f (e.g. `conjugate(z)`), there is no
// argument principle — `differentiable` is false and the caller disables the instrument honestly.
import { makeDurandKerner, tupleAlgebra } from "@cas/core";
import type { Node } from "@cas/expr/ast";
import * as C from "@cas/expr/complexJs";
import { differentiate } from "@cas/expr/derivative";
import { makeComplexFn } from "@cas/expr/evaluate";
import { fToRational } from "@cas/expr/rational";
import type { Complex } from "@cas/expr/complex";
import type { Vec2 } from "./render/plane.js";

/** A located zero / pole / critical point with its multiplicity (order ≥ 1). */
export interface Root {
  readonly z: Vec2;
  readonly order: number;
}

export interface Singularities {
  readonly zeros: Root[];
  readonly poles: Root[];
  /** Zeros of f′ (critical points, ◆). */
  readonly critical: Root[];
  /** False when f is not holomorphic (f′ does not exist) — no argument principle. */
  readonly differentiable: boolean;
  /** True when found by exact rational root-finding (`=`); false for the grid estimate (`≈`). */
  readonly exact: boolean;
}

/** The rectangular search region (world coordinates) — must contain the contour γ. */
export interface Region {
  readonly cx: number;
  readonly cy: number;
  readonly halfW: number;
  readonly halfH: number;
}

const C0: Complex = [0, 0];
const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);
const finite = (z: Complex): boolean => Number.isFinite(z[0]) && Number.isFinite(z[1]);
const ROOT_RESIDUAL_TOL = 1e-6;
const durandKernerKernel = makeDurandKerner(tupleAlgebra);

// ---- shared polynomial helpers (mirrors complex-dynamics/render/critical.ts) ----------------------

function evalPoly(p: readonly Complex[], z: Complex): Complex {
  let acc: Complex = [0, 0];
  for (let i = p.length - 1; i >= 0; i--) acc = C.add(C.mul(acc, z), p[i]);
  return acc;
}

function trimPoly(p: readonly Complex[]): Complex[] {
  let n = p.length;
  while (n > 1 && cabs(p[n - 1]) < 1e-12) n--;
  return p.slice(0, n);
}

/** Roots of a polynomial (ascending coeffs) via Durand–Kerner, certified by residual. */
function polyRoots(coeffs: readonly Complex[]): Complex[] {
  const p = trimPoly(coeffs);
  const m = p.length - 1;
  if (m < 1) return [];
  const lead = p[m];
  if (cabs(lead) === 0) return [];
  const pMonic = (z: Complex): Complex => C.div(evalPoly(p, z), lead);
  const seeds: Complex[] = [];
  let pw: Complex = [1, 0];
  const seed: Complex = [0.4, 0.9]; // classic off-axis geometric-spiral seed
  for (let i = 0; i < m; i++) {
    seeds.push([pw[0], pw[1]]);
    pw = C.mul(pw, seed);
  }
  const res = durandKernerKernel(pMonic, seeds, { mode: "seidel", bailOnNonFinite: true });
  if (!res) return [];
  return res.roots.filter((r) => cabs(pMonic(r)) <= ROOT_RESIDUAL_TOL);
}

/** Cluster coincident roots into distinct points with multiplicity. */
function cluster(roots: readonly Complex[]): Root[] {
  let scale = 1;
  for (const r of roots) scale = Math.max(scale, cabs(r));
  const tol = 1e-3 * scale;
  const out: { re: number; im: number; order: number }[] = [];
  for (const r of roots) {
    const hit = out.find((o) => Math.hypot(o.re - r[0], o.im - r[1]) < tol);
    if (hit) hit.order++;
    else out.push({ re: r[0], im: r[1], order: 1 });
  }
  return out.map((o) => ({ z: [o.re, o.im] as Vec2, order: o.order }));
}

/** Cancel a zero and pole coincident within tolerance (a removable singularity). */
function cancelRemovable(zeros: Root[], poles: Root[]): void {
  for (const z of zeros) {
    const p = poles.find((q) => Math.hypot(q.z[0] - z.z[0], q.z[1] - z.z[1]) < 1e-4);
    if (p) {
      const k = Math.min(z.order, p.order);
      (z as { order: number }).order -= k;
      (p as { order: number }).order -= k;
    }
  }
  filterOrder(zeros);
  filterOrder(poles);
}
function filterOrder(list: Root[]): void {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].order <= 0) list.splice(i, 1);
}

// ---- transcendental grid finder (mirrors the plotter's analysis/singularities.ts) -----------------

type MapFn = (z: Complex, c: Complex) => Complex;
const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** Newton toward a zero (z ← z − g/g′) or a pole (z ← z + g/g′, i.e. Newton on 1/g). */
function refine(g: MapFn, gp: MapFn, z0: Complex, toPole: boolean): Complex | null {
  let z = z0;
  for (let i = 0; i < 40; i++) {
    const gz = g(z, C0);
    const d = gp(z, C0);
    if (!finite(gz) || !finite(d) || cabs(d) < 1e-30) break;
    const step = cdiv(gz, d);
    z = toPole ? [z[0] + step[0], z[1] + step[1]] : [z[0] - step[0], z[1] - step[1]];
    if (!finite(z)) return null;
    if (cabs(step) < 1e-11) break;
  }
  return finite(z) ? z : null;
}

/** Net winding of arg g around a small circle of radius r about `center`: +k / −k / 0. */
function windingAround(g: MapFn, center: Complex, r: number): number {
  const N = 72;
  let total = 0;
  let prev = 0;
  for (let i = 0; i <= N; i++) {
    const th = (2 * Math.PI * i) / N;
    const w = g([center[0] + r * Math.cos(th), center[1] + r * Math.sin(th)], C0);
    if (!finite(w) || cabs(w) === 0) return 0;
    const a = Math.atan2(w[1], w[0]);
    if (i > 0) {
      let d = a - prev;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      total += d;
    }
    prev = a;
  }
  return Math.round(total / (2 * Math.PI));
}

interface GridOut {
  zeros: Root[];
  poles: Root[];
}

/** Grid-sample |g| over the region; classify local extrema as zeros / poles by winding. */
function gridFind(g: MapFn, gp: MapFn, region: Region, wantPoles: boolean): GridOut {
  const NX = 64;
  const NY = 64;
  const xmin = region.cx - region.halfW;
  const xmax = region.cx + region.halfW;
  const ymin = region.cy - region.halfH;
  const ymax = region.cy + region.halfH;
  const at = (i: number, j: number): Complex => [
    xmin + ((xmax - xmin) * (i + 0.5)) / NX,
    ymin + ((ymax - ymin) * (j + 0.5)) / NY,
  ];
  const mag = new Float64Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const w = g(at(i, j), C0);
      mag[j * NX + i] = finite(w) ? cabs(w) : Infinity;
    }
  }
  const positive = Array.from(mag)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const scale = positive.length ? positive[positive.length >> 1] : 1;
  const ZERO_GATE = 0.5 * scale;
  const POLE_GATE = 2.0 * scale;
  const stepW = Math.min((xmax - xmin) / NX, (ymax - ymin) / NY);
  const r = Math.min(Math.max(0.3 * stepW, 1e-4), 0.2 * Math.min(region.halfW, region.halfH));

  const zeros: Root[] = [];
  const poles: Root[] = [];
  const near = (list: Root[], z: Complex): boolean =>
    list.some((s) => Math.hypot(s.z[0] - z[0], s.z[1] - z[1]) < stepW * 0.6);

  for (let j = 1; j < NY - 1; j++) {
    for (let i = 1; i < NX - 1; i++) {
      const m = mag[j * NX + i];
      let isMin = true;
      let isMax = true;
      for (let dj = -1; dj <= 1 && (isMin || isMax); dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const mm = mag[(j + dj) * NX + (i + di)];
          if (mm < m) isMin = false;
          if (mm > m) isMax = false;
        }
      }
      if (isMin && m < ZERO_GATE) {
        const p = refine(g, gp, at(i, j), false);
        if (p && !near(zeros, p)) {
          const k = windingAround(g, p, r);
          if (k > 0) zeros.push({ z: [p[0], p[1]], order: k });
        }
      } else if (wantPoles && isMax && m > POLE_GATE) {
        const p = refine(g, gp, at(i, j), true);
        if (p && !near(poles, p)) {
          const k = windingAround(g, p, r);
          if (k < 0) poles.push({ z: [p[0], p[1]], order: -k });
        }
      }
    }
  }
  return { zeros, poles };
}

// ---- the public finder ----------------------------------------------------------------------------

/** Locate the zeros, poles, and critical points of f (given as an AST) within the search region. */
export function findSingularities(ast: Node, region: Region): Singularities {
  // Need f′ either way (Newton refinement / the rational-critical numerator). Its absence means f is
  // not holomorphic, so the argument principle does not apply.
  let dAst: Node;
  try {
    dAst = differentiate(ast, "z");
  } catch {
    return { zeros: [], poles: [], critical: [], differentiable: false, exact: false };
  }

  const rat = fToRational(ast, C0, C0);
  if (rat) {
    const zeros = cluster(polyRoots(rat.num));
    const poles = cluster(polyRoots(rat.den));
    cancelRemovable(zeros, poles);
    const critical = rationalCritical(dAst);
    return { zeros, poles, critical, differentiable: true, exact: true };
  }

  // Transcendental: grid finder over the region using the symbolic f′.
  const f = makeComplexFn(ast) as MapFn;
  const fp = makeComplexFn(dAst) as MapFn;
  const { zeros, poles } = gridFind(f, fp, region, true);
  let critical: Root[] = [];
  try {
    const fpp = makeComplexFn(differentiate(dAst, "z")) as MapFn;
    critical = gridFind(fp, fpp, region, false).zeros;
  } catch {
    critical = [];
  }
  return { zeros, poles, critical, differentiable: true, exact: false };
}

/** Finite critical points of a rational f from the numerator of f′ (dAst = differentiated AST). */
function rationalCritical(dAst: Node): Root[] {
  const rat = fToRational(dAst, C0, C0);
  if (!rat) return [];
  const roots = polyRoots(rat.num);
  if (roots.length === 0) return [];
  // Keep only genuine critical points: f′(r) ≈ 0 (drops removable cancellations and poles).
  const fp = makeComplexFn(dAst) as MapFn;
  const good = roots.filter((r) => {
    const d = fp(r, C0);
    return finite(d) && cabs(d) < 1e-5;
  });
  return cluster(good);
}

// ---- counting inside a contour --------------------------------------------------------------------

/** Sum of the orders of the roots strictly inside the contour test. */
export function countInside(roots: readonly Root[], inside: (p: Vec2) => boolean): number {
  let total = 0;
  for (const r of roots) if (inside(r.z)) total += r.order;
  return total;
}
