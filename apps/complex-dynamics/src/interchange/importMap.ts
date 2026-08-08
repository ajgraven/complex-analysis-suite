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
  makeUnboundedLaurentSchwarz,
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
 * Supports the unbounded-Laurent family QD emits today (`disk:"D*"`, real leading c), pole-free AND
 * pole-bearing: `phi.branches` (1.2.0) carry the finite-pole terms into the engine's third argument.
 * Interchange complex numbers are `{re,im}`; the engine works in `[re,im]` tuples, so φ's coefficients
 * (and each branch's z and A) are converted. Throws for a shape the engine can't reconstruct rather
 * than returning a subtly-wrong σ.
 */
/** φ's coefficients as the `[re,im]` tuples the @cas/schwarz engine (and its GPU twin's `packPhi`) take. */
export interface SchwarzPhiCoeffs {
  c: number;
  F: SchwarzTuple[];
  branches: SchwarzBranch[];
}

/**
 * Extract φ's coefficients from a `form:"schwarz"` map, converting interchange `{re,im}` to the engine's
 * `[re,im]` tuples. Shared by `schwarzEngineFromMapSpec` (CPU engine) and the GPU σ renderer (which packs
 * these same coefficients into shader uniforms), so both reconstruct from ONE conversion. Throws for a
 * shape the unbounded-Laurent family can't represent (non-Laurent φ / complex leading c).
 */
export function schwarzPhiFromMapSpec(sigma: SchwarzMap): SchwarzPhiCoeffs {
  const phi = sigma.phi;
  if (phi.form !== "laurent") {
    throw new Error("schwarz reconstruction supports a Laurent φ only (the unbounded-classical family)");
  }
  if (phi.c.im !== 0) {
    throw new Error("schwarz reconstruction supports a real leading coefficient c only");
  }
  const F: SchwarzTuple[] = phi.F.map((z) => [z.re, z.im]);
  const branches: SchwarzBranch[] = (phi.branches ?? []).map((br) => ({
    z: [br.z.re, br.z.im] as SchwarzTuple,
    A: br.A.map((a) => [a.re, a.im] as SchwarzTuple),
  }));
  return { c: phi.c.re, F, branches };
}

export function schwarzEngineFromMapSpec(sigma: SchwarzMap): UnboundedLaurentSchwarz {
  const { c, F, branches } = schwarzPhiFromMapSpec(sigma);
  return makeUnboundedLaurentSchwarz(c, F, branches);
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
