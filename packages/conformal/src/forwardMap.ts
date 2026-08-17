// forwardMap.ts — the FORWARD Riemann map g: 𝔻 → Ω (roadmap 2.1).
//
// The lightning solver fits f: Ω → 𝔻. To watch the IMAGE OF THE DISK land on a region we need the other
// direction, g = f⁻¹. Rather than invert f pointwise (fragile near corners), we fit g DIRECTLY: f gives
// the boundary correspondence uⱼ = f(pⱼ)/|f(pⱼ)| ∈ ∂𝔻 for each boundary sample pⱼ ∈ ∂Ω, and then g is a
// (complex) least-squares fit g(uⱼ) ≈ pⱼ in the same Vandermonde–Arnoldi basis — plus, for a polygon,
// rational terms clustered just OUTSIDE ∂𝔻 at the corner preimages γ̂, where g is algebraically singular.
//
// Honesty: numerical (≈). boundaryResidual = maxⱼ |g(uⱼ) − pⱼ| is the accuracy tag. Pure; node-tested.
import { lstsqHouseholder } from "@cas/core";
import { type ConformalMap } from "./lightning.js";
import { arnoldiBasis, evalExpansion, type C } from "./vandermondeArnoldi.js";
import { clusteredRadii } from "./cornerClustering.js";

const nrm = (v: C): C => {
  const r = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / r, v[1] / r];
};

export interface ForwardMap {
  /** Polynomial degree actually fitted. */
  readonly degree: number;
  /** Pole locations (just outside ∂𝔻) used for corner terms; empty for a smooth region. */
  readonly poles: C[];
  /** maxⱼ |g(uⱼ) − pⱼ| over the boundary samples — the honest ≈ accuracy tag. */
  readonly boundaryResidual: number;
  /** g(0), the image of the disk centre (≈ the domain's conformal centre). */
  readonly center: C;
  /** g: 𝔻 → Ω at one point. */
  eval(w: C): C;
  /** g at many points (one Arnoldi recurrence for the batch). */
  evalMany(ws: readonly C[]): C[];
}

/** Poles for g clustered root-exponentially just OUTSIDE ∂𝔻, toward each corner preimage γ̂ (|γ̂|=1). */
function forwardPoles(gammas: readonly C[], nPer = 12, sigma = 4, L = 1): C[] {
  const out: C[] = [];
  const radii = clusteredRadii(nPer, L, sigma); // ρ → 0⁺ (closest to ∂𝔻) at k=1
  for (const g of gammas) {
    const gh = nrm(g);
    for (const rho of radii) out.push([gh[0] * (1 + rho), gh[1] * (1 + rho)]);
  }
  return out;
}

/**
 * Fit g: 𝔻 → Ω from a fitted f: Ω → 𝔻 and the SAME ordered boundary samples that produced f. `degree`
 * is the forward polynomial degree; pass the region's `corners` (Ω-plane vertices) for a polygon so g's
 * corner singularities get resolved by clustered poles. Requires boundary.length ≥ 2·(degree+1+poles).
 */
export function fitForwardMap(
  f: ConformalMap,
  boundary: readonly C[],
  degree: number,
  corners?: readonly C[],
): ForwardMap {
  const u = f.evalMany(boundary).map(nrm); // boundary preimages on ∂𝔻
  const poles = corners && corners.length ? forwardPoles(corners.map((v) => nrm(f.eval(v)))) : [];
  const basis = arnoldiBasis(u, degree);
  const nPoly = basis.n + 1;
  const np = poles.length;
  const nC = nPoly + np;
  const m = u.length;
  const Q = basis.Q;

  // Complex LSQ  Σ x_c·B_{jc} = pⱼ  stacked as reals: row 2j is the Re equation, row 2j+1 the Im.
  // Unknowns: [Re x₀…Re x_{nC−1}, Im x₀…Im x_{nC−1}].  Re(x·B)=Re x·Re B−Im x·Im B; Im(x·B)=Re x·Im B+Im x·Re B.
  const A: number[][] = new Array(2 * m);
  const rhs: number[] = new Array(2 * m);
  for (let j = 0; j < m; j++) {
    const reRow = new Array<number>(2 * nC).fill(0);
    const imRow = new Array<number>(2 * nC).fill(0);
    for (let k = 0; k < nPoly; k++) {
      const b = Q[j][k];
      reRow[k] = b[0];
      reRow[nC + k] = -b[1];
      imRow[k] = b[1];
      imRow[nC + k] = b[0];
    }
    for (let l = 0; l < np; l++) {
      const dx = u[j][0] - poles[l][0];
      const dy = u[j][1] - poles[l][1];
      const den = dx * dx + dy * dy; // 1/(u−β) = (dx − i·dy)/|·|²
      const re = dx / den;
      const im = -dy / den;
      reRow[nPoly + l] = re;
      reRow[nC + nPoly + l] = -im;
      imRow[nPoly + l] = im;
      imRow[nC + nPoly + l] = re;
    }
    A[2 * j] = reRow;
    rhs[2 * j] = boundary[j][0];
    A[2 * j + 1] = imRow;
    rhs[2 * j + 1] = boundary[j][1];
  }
  const x = lstsqHouseholder(A, rhs);
  const aCoeffs: C[] = [];
  for (let k = 0; k < nPoly; k++) aCoeffs.push([x[k], x[nC + k]]);
  const cCoeffs: C[] = [];
  for (let l = 0; l < np; l++) cCoeffs.push([x[nPoly + l], x[nC + nPoly + l]]);

  const evalMany = (ws: readonly C[]): C[] => {
    const gPoly = evalExpansion(basis, aCoeffs, ws);
    return ws.map((w, i): C => {
      let g: C = gPoly[i];
      for (let l = 0; l < np; l++) {
        const dx = w[0] - poles[l][0];
        const dy = w[1] - poles[l][1];
        const den = dx * dx + dy * dy;
        const invRe = dx / den;
        const invIm = -dy / den;
        const c = cCoeffs[l];
        g = [g[0] + c[0] * invRe - c[1] * invIm, g[1] + c[0] * invIm + c[1] * invRe];
      }
      return g;
    });
  };
  const evalOne = (w: C): C => evalMany([w])[0];

  const gU = evalMany(u);
  let res = 0;
  for (let j = 0; j < m; j++) res = Math.max(res, Math.hypot(gU[j][0] - boundary[j][0], gU[j][1] - boundary[j][1]));

  return { degree: basis.n, poles, boundaryResidual: res, center: evalOne([0, 0]), eval: evalOne, evalMany };
}
