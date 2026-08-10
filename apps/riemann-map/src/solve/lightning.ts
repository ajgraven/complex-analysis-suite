// lightning.ts — the Riemann map of a Jordan domain by least squares (Gopal & Trefethen 2019, the
// "lightning" method). Writes the map to the unit disk as
//     f(z) = z · e^{g(z)},   with  Re g(z) = −log|z|  on ∂Ω,
// so that |f| = 1 on ∂Ω and f(0) = 0 (0 must lie inside Ω). g is analytic in Ω; we least-squares-fit it
// in a basis of
//     • Vandermonde–Arnoldi polynomials p_k (the smooth part), plus
//     • rational terms 1/(z − β_l) with the poles β_l clustered exponentially toward the corners of ∂Ω.
// A smooth boundary needs only the polynomials (P3a); CORNERS make g algebraically singular, and the
// clustered poles resolve that singularity with root-exponential accuracy — the defining idea of the
// lightning method (P3c).
//
// Honesty: the map is numerical (≈). Its `boundaryResidual` = maxⱼ ‖f(zⱼ)| − 1‖ is reported as the
// accuracy indicator, so a figure never claims more than the fit earns. Pure; node-tested.
import { arnoldiBasis, evalExpansion, type C } from "./vandermondeArnoldi.js";
import { lstsqHouseholder } from "./lstsq.js";

const expC = (g: C): C => {
  const r = Math.exp(g[0]);
  return [r * Math.cos(g[1]), r * Math.sin(g[1])];
};
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

export interface ConformalMap {
  /** Polynomial degree actually fitted. */
  readonly degree: number;
  /** g's polynomial coefficients in the Arnoldi basis. */
  readonly coeffs: C[];
  /** Pole locations β_l used for the rational (corner) terms (empty for a smooth fit). */
  readonly poles: C[];
  /** The rational coefficients c_l on 1/(z − β_l). */
  readonly poleCoeffs: C[];
  /** maxⱼ ‖f(zⱼ)| − 1‖ over the boundary samples — the honest ≈ accuracy tag. */
  readonly boundaryResidual: number;
  /** f: Ω → 𝔻 at a single point (f(0)=0, |f|=1 on ∂Ω). */
  eval(z: C): C;
  /** f at many points at once (one Arnoldi recurrence for the whole batch — for rendering). */
  evalMany(pts: readonly C[]): C[];
}

/**
 * Fit f: Ω → 𝔻 for a boundary sampled (in order) by `boundary`; 0 must be inside Ω. The basis is the
 * degree-`degree` Vandermonde–Arnoldi polynomials plus a rational term 1/(z − β) for each pole in `poles`
 * (place them clustered toward corners; leave empty for a smooth domain). Requires
 * boundary.length ≥ 2·(degree+1+poles.length). Returns the evaluator + boundary residual.
 */
export function fitConformalMap(boundary: readonly C[], degree: number, poles: readonly C[] = []): ConformalMap {
  const m = boundary.length;
  const basis = arnoldiBasis(boundary, degree);
  const { Q, n } = basis;
  const nPoly = n + 1;
  const np = poles.length;
  const nC = nPoly + np; // total complex unknowns (poly coeffs then pole coeffs)

  // Real least-squares for Re(g(z_j)) = −log|z_j|, with g = Σ a_k·p_k + Σ c_l/(z − β_l). Unknowns are the
  // real and imaginary parts of every coefficient: columns [0,nC) carry the real parts (Re of each basis
  // value), columns [nC,2nC) the imaginary parts (−Im of each basis value), since Re(c·b)=Re(c)Re(b)−Im(c)Im(b).
  const cols = 2 * nC;
  const A: number[][] = new Array(m);
  const rhs: number[] = new Array(m);
  for (let j = 0; j < m; j++) {
    const row = new Array<number>(cols).fill(0);
    for (let k = 0; k < nPoly; k++) {
      row[k] = Q[j][k][0];
      row[nC + k] = -Q[j][k][1];
    }
    for (let l = 0; l < np; l++) {
      const dx = boundary[j][0] - poles[l][0];
      const dy = boundary[j][1] - poles[l][1];
      const den = dx * dx + dy * dy; // 1/(z−β) = (dx − i·dy)/|·|²
      const re = dx / den;
      const im = -dy / den;
      row[nPoly + l] = re;
      row[nC + nPoly + l] = -im;
    }
    A[j] = row;
    rhs[j] = -Math.log(Math.hypot(boundary[j][0], boundary[j][1]));
  }
  const x = lstsqHouseholder(A, rhs);
  const coeffs: C[] = [];
  for (let k = 0; k < nPoly; k++) coeffs.push([x[k], x[nC + k]]);
  const poleCoeffs: C[] = [];
  for (let l = 0; l < np; l++) poleCoeffs.push([x[nPoly + l], x[nC + nPoly + l]]);
  const poleList = poles.map((p): C => [p[0], p[1]]);

  const evalMany = (pts: readonly C[]): C[] => {
    const gPoly = evalExpansion(basis, coeffs, pts);
    return pts.map((z, i): C => {
      let g: C = gPoly[i];
      for (let l = 0; l < np; l++) {
        const dx = z[0] - poleList[l][0];
        const dy = z[1] - poleList[l][1];
        const den = dx * dx + dy * dy;
        const invRe = dx / den;
        const invIm = -dy / den;
        const c = poleCoeffs[l];
        g = [g[0] + c[0] * invRe - c[1] * invIm, g[1] + c[0] * invIm + c[1] * invRe];
      }
      return cmul(z, expC(g));
    });
  };
  const evalOne = (z: C): C => evalMany([z])[0];

  let res = 0;
  const fB = evalMany(boundary);
  for (let j = 0; j < m; j++) res = Math.max(res, Math.abs(Math.hypot(fB[j][0], fB[j][1]) - 1));

  return { degree: n, coeffs, poles: poleList, poleCoeffs, boundaryResidual: res, eval: evalOne, evalMany };
}

/** Fit f: Ω → 𝔻 for a SMOOTH boundary (no corner poles) — the P3a special case. */
export function fitSmoothConformalMap(boundary: readonly C[], degree: number): ConformalMap {
  return fitConformalMap(boundary, degree, []);
}
