/**
 * Locate, count, and order the zeros and poles of f in the current view (catalog H2) — the tool's
 * first quantitative instrument. This is CPU work (root-finding is inherently sequential): sample |f|
 * on a grid, take local minima as zero candidates and local maxima as pole candidates, refine each
 * with Newton (using the @cas/expr symbolic derivative f'), then classify and order it by the
 * **argument principle** — the winding of f around a small circle is +k for a zero of order k and −k
 * for a pole of order k. Requires a holomorphic f (f' must exist); otherwise the finder reports it.
 *
 * Honest labelling: located positions are numerical estimates (`≈`). The winding *count* is an
 * integer we can be confident of when the field is well resolved, but is still an estimate near
 * ill-conditioned configurations, so the UI labels the whole readout `≈`.
 */
import type { Complex } from "@cas/expr/complex";

export interface Singularity {
  z: Complex;
  /** Multiplicity (winding order), ≥ 1. */
  order: number;
}

export interface Singularities {
  zeros: Singularity[];
  poles: Singularity[];
  /** False when f is not differentiable (finder skipped — needs a holomorphic f). */
  differentiable: boolean;
}

export interface ViewBox {
  cx: number;
  cy: number;
  span: number;
}

export type MapFn = (z: Complex, c: Complex) => Complex;

const C0: Complex = [0, 0];
const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);
const finite = (z: Complex): boolean => Number.isFinite(z[0]) && Number.isFinite(z[1]);
const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** Newton toward a zero (z ← z − f/f′) or a pole (z ← z + f/f′, i.e. Newton on 1/f). */
function refine(f: MapFn, fp: MapFn, z0: Complex, toPole: boolean): Complex | null {
  let z = z0;
  for (let i = 0; i < 40; i++) {
    const fz = f(z, C0);
    const d = fp(z, C0);
    if (!finite(fz) || !finite(d) || cabs(d) < 1e-30) break;
    const step = cdiv(fz, d);
    z = toPole ? [z[0] + step[0], z[1] + step[1]] : [z[0] - step[0], z[1] - step[1]];
    if (!finite(z)) return null;
    if (cabs(step) < 1e-11) break;
  }
  return finite(z) ? z : null;
}

/** Net winding of arg f around a circle of radius r about `center`: +k (zero) / −k (pole) / 0. */
function winding(f: MapFn, center: Complex, r: number): number {
  const N = 72;
  let total = 0;
  let prev = 0;
  for (let i = 0; i <= N; i++) {
    const th = (2 * Math.PI * i) / N;
    const w = f([center[0] + r * Math.cos(th), center[1] + r * Math.sin(th)], C0);
    if (!finite(w) || cabs(w) === 0) return 0; // circle passed through a singularity — unreliable
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

/** Find the zeros and poles of f inside the given view. `aspect` = viewport width / height. */
export function findSingularities(
  f: MapFn,
  fp: MapFn | null,
  view: ViewBox,
  aspect: number,
): Singularities {
  if (!fp) return { zeros: [], poles: [], differentiable: false };

  const xmin = view.cx - view.span * aspect;
  const xmax = view.cx + view.span * aspect;
  const ymin = view.cy - view.span;
  const ymax = view.cy + view.span;
  const NX = 56;
  const NY = 56;
  // Sample |f| at cell centres (offset from grid lines, so common singularities at "nice" coordinates
  // rarely land exactly on a sample and blow it up to Inf).
  const center = (i: number, j: number): Complex => [
    xmin + ((xmax - xmin) * (i + 0.5)) / NX,
    ymin + ((ymax - ymin) * (j + 0.5)) / NY,
  ];
  const mag = new Float64Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const w = f(center(i, j), C0);
      mag[j * NX + i] = finite(w) ? cabs(w) : Infinity;
    }
  }

  const stepW = Math.min((xmax - xmin) / NX, (ymax - ymin) / NY);
  const r = Math.min(Math.max(0.3 * stepW, 1e-4), 0.2 * view.span);
  const margin = 0.02 * view.span;
  const inView = (z: Complex): boolean =>
    z[0] >= xmin - margin && z[0] <= xmax + margin && z[1] >= ymin - margin && z[1] <= ymax + margin;

  const zeros: Singularity[] = [];
  const poles: Singularity[] = [];
  const near = (list: Singularity[], z: Complex): boolean =>
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
      if (isMin && m < 1.0) {
        const p = refine(f, fp, center(i, j), false);
        if (p && inView(p) && !near(zeros, p)) {
          const k = winding(f, p, r);
          if (k > 0) zeros.push({ z: p, order: k });
        }
      } else if (isMax && m > 5.0) {
        const p = refine(f, fp, center(i, j), true);
        if (p && inView(p) && !near(poles, p)) {
          const k = winding(f, p, r);
          if (k < 0) poles.push({ z: p, order: -k });
        }
      }
    }
  }
  return { zeros, poles, differentiable: true };
}
