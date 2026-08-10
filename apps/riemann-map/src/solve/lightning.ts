// lightning.ts — the Riemann map of a SMOOTH Jordan domain by least squares (P3a; the smooth core of the
// lightning method, Gopal & Trefethen 2019). Writes the map to the unit disk as
//     f(z) = z · e^{g(z)},   with  Re g(z) = −log|z|  on ∂Ω,
// so that |f| = 1 on ∂Ω and f(0) = 0 (0 must lie inside Ω). g is analytic; we least-squares-fit it in the
// Vandermonde–Arnoldi polynomial basis. A smooth boundary makes g analytic across ∂Ω, so a polynomial
// converges fast; CORNERS make g singular and need poles clustered toward them — that is P3b, not here.
//
// Honesty: the map is a numerical solution (≈). Its `boundaryResidual` = maxⱼ ‖f(zⱼ)| − 1‖ is reported as
// the accuracy indicator, so a figure never claims more than the fit earns. Pure; node-tested against the
// closed-form disk map (a centred circle of radius R ↦ z/R) and boundary residuals for smooth domains.
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
  /** g's coefficients in the Arnoldi basis (g = Σ coeffs[k]·p_k). */
  readonly coeffs: C[];
  /** maxⱼ ‖f(zⱼ)| − 1‖ over the boundary samples — the honest ≈ accuracy tag. */
  readonly boundaryResidual: number;
  /** f: Ω → 𝔻 at a single point (f(0)=0, |f|=1 on ∂Ω). */
  eval(z: C): C;
  /** f at many points at once (one Arnoldi recurrence for the whole batch — for rendering). */
  evalMany(pts: readonly C[]): C[];
}

/**
 * Fit f: Ω → 𝔻 for a smooth boundary sampled (in order) by `boundary`; 0 must be inside Ω. `degree` is the
 * polynomial degree of g (needs degree+1 ≤ boundary.length). Returns the evaluator + boundary residual.
 */
export function fitSmoothConformalMap(boundary: readonly C[], degree: number): ConformalMap {
  const m = boundary.length;
  const basis = arnoldiBasis(boundary, degree);
  const { Q, n } = basis;

  // Real least-squares for Re(Σ c_k·p_k(z_j)) = −log|z_j|. Unknowns: [Re c₀…Re c_n, Im c₀…Im c_n].
  // Re(c·p) = Re(c)·Re(p) − Im(c)·Im(p), so column k carries Re(Q), column n+1+k carries −Im(Q).
  // (The Im c₀ column is structurally zero — p₀ is real — which fixes the harmonic-conjugate/rotation gauge.)
  const cols = 2 * (n + 1);
  const A: number[][] = new Array(m);
  const rhs: number[] = new Array(m);
  for (let j = 0; j < m; j++) {
    const row = new Array<number>(cols).fill(0);
    for (let k = 0; k <= n; k++) {
      row[k] = Q[j][k][0];
      row[n + 1 + k] = -Q[j][k][1];
    }
    A[j] = row;
    rhs[j] = -Math.log(Math.hypot(boundary[j][0], boundary[j][1]));
  }
  const x = lstsqHouseholder(A, rhs);
  const coeffs: C[] = [];
  for (let k = 0; k <= n; k++) coeffs.push([x[k], x[n + 1 + k]]);

  const evalMany = (pts: readonly C[]): C[] => {
    const g = evalExpansion(basis, coeffs, pts);
    return pts.map((z, i) => cmul(z, expC(g[i])));
  };
  const evalOne = (z: C): C => evalMany([z])[0];

  let res = 0;
  const fB = evalMany(boundary);
  for (let j = 0; j < m; j++) res = Math.max(res, Math.abs(Math.hypot(fB[j][0], fB[j][1]) - 1));

  return { degree: n, coeffs, boundaryResidual: res, eval: evalOne, evalMany };
}
