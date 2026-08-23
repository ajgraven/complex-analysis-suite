/**
 * Import side of the QD -> CD hand-off. The MapSpec -> `@cas/expr` source-string converter
 * (`mapSpecToExpr` / `envelopeToMapSpec`) now lives in `@cas/interchange` (ADR-0027) and is re-exported
 * here so existing CD imports resolve unchanged; an imported φ compiles through the normal `expr` pipeline
 * (parser -> evaluate / glsl) and renders like any other map. This module keeps only the CD-specific
 * `@cas/schwarz` reconstruction of a `form:"schwarz"` σ, which is numerical (φ⁻¹ via Newton /
 * Durand–Kerner) and so is NOT expr-compilable — `mapSpecToExpr` throws on a schwarz map; CD routes it to
 * `schwarzEngineFromMapSpec` instead.
 */

export { mapSpecToExpr, envelopeToMapSpec } from "@cas/interchange";

import type { SchwarzMap } from "@cas/interchange";
import {
  makeBoundedSchwarz,
  makeUnboundedLaurentSchwarz,
  type BoundedSchwarz,
  type Complex as SchwarzTuple,
  type SchwarzBranch,
  type UnboundedLaurentSchwarz,
} from "@cas/schwarz";

/**
 * φ's coefficients as the `[re,im]` tuples the @cas/schwarz engines (and the GPU twin's `packPhi`) take.
 * `family` selects the reconstruction engine: "unbounded" reads `c` + `F` (+ `branches`); "bounded" reads
 * `w0` (+ `branches`). The unused slots are filled with zeros ([0,0] / []) so the shape is a single object
 * both the CPU builder and the GPU packer consume without a discriminated-union narrow at every read.
 */
export interface SchwarzPhiCoeffs {
  /** Which family φ belongs to — selects the σ engine (and, in the GPU render, the shader branch). */
  family: "unbounded" | "bounded";
  /** Leading coefficient `[re,im]` (unbounded-Laurent; complex since S5-C1). [0,0] for a bounded φ. */
  c: SchwarzTuple;
  /** Laurent tail (unbounded-Laurent). [] for a bounded φ. */
  F: SchwarzTuple[];
  /** Domain centre w₀ = φ(0) (bounded). [0,0] for an unbounded φ. */
  w0: SchwarzTuple;
  branches: SchwarzBranch[];
}

/**
 * Extract φ's coefficients from a `form:"schwarz"` map, converting interchange `{re,im}` to the engine's
 * `[re,im]` tuples. Shared by `schwarzEngineFromMapSpec` (CPU engine) and the GPU σ renderer (which packs
 * these same coefficients into shader uniforms), so both reconstruct from ONE conversion. The leading c may
 * be complex (S5-C1) — the unbounded engine reflects it to conj(c)/z; QD's family emits a real c, but a
 * hand-authored or future map may carry a complex one. Throws only for a φ neither engine reconstructs.
 */
export function schwarzPhiFromMapSpec(sigma: SchwarzMap): SchwarzPhiCoeffs {
  const phi = sigma.phi;
  const toBranches = (bs: readonly { z: { re: number; im: number }; A: { re: number; im: number }[] }[] | undefined): SchwarzBranch[] =>
    (bs ?? []).map((br) => ({
      z: [br.z.re, br.z.im] as SchwarzTuple,
      A: br.A.map((a) => [a.re, a.im] as SchwarzTuple),
    }));
  if (phi.form === "laurent") {
    return { family: "unbounded", c: [phi.c.re, phi.c.im], F: phi.F.map((z) => [z.re, z.im]), w0: [0, 0], branches: toBranches(phi.branches) };
  }
  if (phi.form === "bounded") {
    return { family: "bounded", c: [0, 0], F: [], w0: [phi.w0.re, phi.w0.im], branches: toBranches(phi.branches) };
  }
  throw new Error("schwarz reconstruction supports a Laurent or bounded φ only (the classical QD families)");
}

/**
 * Rebuild the σ evaluator from a `form:"schwarz"` map. Dispatches on the family: a bounded φ uses
 * makeBoundedSchwarz (interior branch, F = conj(w₀) + Σ A/(z−z_j)); a Laurent φ uses the exterior-branch
 * makeUnboundedLaurentSchwarz. Both engines expose the SAME evaluator surface (evalPhi/…/sigma), so the
 * union return type is consumed uniformly by the render/orbit helpers.
 */
export function schwarzEngineFromMapSpec(sigma: SchwarzMap): UnboundedLaurentSchwarz | BoundedSchwarz {
  const phi = schwarzPhiFromMapSpec(sigma);
  return phi.family === "bounded"
    ? makeBoundedSchwarz(phi.w0, phi.branches)
    : makeUnboundedLaurentSchwarz(phi.c, phi.F, phi.branches);
}
