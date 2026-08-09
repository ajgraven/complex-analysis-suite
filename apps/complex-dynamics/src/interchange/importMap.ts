/**
 * Import side of the QD -> CD hand-off (Phase 4). Converts an @cas/interchange MapSpec into a source
 * string in CD's expression language, which then compiles through the normal `expr` pipeline
 * (parser -> evaluate / glsl) and renders like any other map — so an imported φ becomes a live
 * dynamical plane with no special-casing downstream.
 *
 * Handles the rational and Laurent forms QD's plumbing-first hand-off emits, plus a raw `expr`
 * passthrough. The imaginary unit is `i`, powers use `^`, so coefficients render as `(re+im*i)`.
 * The φ hand-off is holomorphic, but the `antiholomorphic` MapSpec flag is honored: a rational or
 * laurent map so tagged is built on `conjugate(z)`; an `expr` map threads its own `conjugate`.
 */

import type {
  Complex,
  Envelope,
  MapSpec,
  QuadratureDomain,
  SchwarzMap,
  SchwarzReflection,
  View,
} from "@cas/interchange";
import {
  makeBoundedSchwarz,
  makeUnboundedLaurentSchwarz,
  type BoundedSchwarz,
  type Complex as SchwarzTuple,
  type SchwarzBranch,
  type UnboundedLaurentSchwarz,
} from "@cas/schwarz";

const isZero = (z: Complex): boolean => z.re === 0 && z.im === 0;

/** A complex coefficient as a parenthesised expr atom (safe to multiply / divide against). */
function coeffExpr(z: Complex): string {
  const { re, im } = z;
  if (im === 0) return `(${re})`;
  if (re === 0) return `(${im}*i)`;
  return `(${re}${im < 0 ? "" : "+"}${im}*i)`;
}

/** Polynomial Σ coeffs[k]·v^k (ascending coefficients), in CD's expr language. */
function polyExpr(coeffs: readonly Complex[], v: string): string {
  const terms: string[] = [];
  coeffs.forEach((cf, k) => {
    if (isZero(cf)) return;
    const c = coeffExpr(cf);
    terms.push(k === 0 ? c : k === 1 ? `${c}*${v}` : `${c}*${v}^${k}`);
  });
  return terms.length ? terms.join(" + ") : "(0)";
}

function rationalExpr(num: readonly Complex[], den: readonly Complex[], v: string): string {
  const p = polyExpr(num, v);
  // A unit denominator [1] is a pure polynomial — skip the division.
  if (den.length === 1 && den[0].re === 1 && den[0].im === 0) return p;
  return `(${p}) / (${polyExpr(den, v)})`;
}

function laurentExpr(c: Complex, F: readonly Complex[], v: string): string {
  const terms: string[] = [];
  if (!isZero(c)) terms.push(`${coeffExpr(c)}*${v}`);
  F.forEach((fl, l) => {
    if (isZero(fl)) return;
    terms.push(l === 0 ? coeffExpr(fl) : `${coeffExpr(fl)}/${v}^${l}`);
  });
  return terms.length ? terms.join(" + ") : "(0)";
}

/** Convert an interchange MapSpec into a CD expression-language source string. */
export function mapSpecToExpr(m: MapSpec): string {
  // An antiholomorphic closed form acts on conj(z), so build it on `conjugate(z)` instead of `z`.
  // (An `expr` map threads its own `conjugate` and passes through verbatim.)
  const v = m.antiholomorphic ? "conjugate(z)" : "z";
  switch (m.form) {
    case "rational":
      return rationalExpr(m.num, m.den, v);
    case "laurent":
      return laurentExpr(m.c, m.F, v);
    case "expr":
      return m.expr;
    case "schwarz":
      // σ is defined by a NUMERICAL inverse (φ⁻¹ via Newton / Durand–Kerner), so it is not an algebraic
      // expression the `expr` pipeline can compile. A consumer rebuilds the σ evaluator from `m.phi`
      // via @cas/schwarz instead (CD does this in S4a). Reaching here means a schwarz map was handed to
      // the expr path by mistake — fail loudly rather than fall through to an implicit `undefined`
      // return that would surface as a cryptic crash downstream (main.ts would set inpf = undefined).
      throw new Error(
        "mapSpecToExpr: a schwarz-form map is not expr-compilable — reconstruct σ from its φ via @cas/schwarz",
      );
  }
}

/**
 * Reconstruct the σ evaluator for a `form:"schwarz"` map. σ(w)=conj(F(φ⁻¹(w))) has a NUMERICAL inverse
 * (Newton + Durand–Kerner), so — unlike the rational/laurent/expr forms — it is NOT compiled through the
 * expr pipeline (`mapSpecToExpr` throws on it); it is rebuilt from φ's coefficients by @cas/schwarz's
 * exterior-branch engine. This is the CD half of the σ hand-off (S4a): the S3a golden's `sigma.phi`
 * feeds `makeUnboundedLaurentSchwarz`, and the resulting `.sigma(w)` reproduces the frozen σ(w₀).
 *
 * Supports the two families @cas/schwarz reconstructs: the unbounded-Laurent family QD emits (`disk:"D*"`,
 * real-or-complex leading c), pole-free AND pole-bearing (`phi.branches`, 1.2.0), and the bounded-classical
 * family (`form:"bounded"`, `disk:"D"`, 1.3.0 — φ: 𝔻 → Ω, centre w₀, interior branch). Interchange complex
 * numbers are `{re,im}`; the engines work in `[re,im]` tuples, so φ's coefficients (and each branch's z and
 * A) are converted. Throws for a shape neither engine can reconstruct rather than returning a wrong σ.
 */
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

/**
 * The renderable map inside an interchange envelope, by kind: a quadrature-domain hands off its
 * uniformizing map φ; a schwarz-reflection its σ; a saved view / bare map their map directly.
 * Returns null for a payload that carries no single map to iterate.
 */
export function envelopeToMapSpec(env: Envelope): MapSpec | null {
  switch (env.kind) {
    case "quadrature-domain":
      return (env.payload as QuadratureDomain).phi;
    case "schwarz-reflection":
      return (env.payload as SchwarzReflection).sigma;
    case "view":
      return (env.payload as View).map;
    case "map":
      return env.payload as MapSpec;
    default:
      return null;
  }
}
