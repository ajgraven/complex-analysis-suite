/**
 * MapSpec → `@cas/expr` source-string converter (the import side of every map hand-off).
 *
 * WHY THIS LIVES IN `@cas/interchange`. Three apps — Complex Dynamics, the Complex-Function Plotter, and
 * Argument Principle — each import an interchange `MapSpec`/`Envelope` and turn its rational / Laurent /
 * expr closed form into a source string they compile through the shared `@cas/expr` pipeline. Before this
 * module the six functions below were copy-ported into all three apps (apps can't import each other,
 * ARCHITECTURE §4) and had already DIVERGED in correctness-relevant ways: the plotter and AP copies grew a
 * degenerate-denominator guard and a pole-bearing-Laurent refusal that Complex Dynamics' ancestor copy
 * never got, so the same payload produced a NaN / silently-wrong map in CD while failing loudly in the
 * other two. This is exactly the drift ADR-0007 (extract on a second consumer) exists to prevent — three
 * consumers of one identical bridge. The guards are unified here, so every consumer gets the loud-failure
 * behavior. See ADR-0027.
 *
 * The output is text in the `@cas/expr` grammar (imaginary unit `i`, powers `^`, `*`/`/`), NOT an `@cas/expr`
 * AST — so `@cas/interchange` stays independent of `@cas/expr` (no package import, no dependency cycle); the
 * two are coupled only by that documented string grammar. An anti-holomorphic closed form acts on conj(z),
 * so it is built on `conjugate(z)`; an `expr` map threads its own `conjugate` and passes through verbatim.
 */

import type { Complex, Envelope, MapSpec, QuadratureDomain, SchwarzReflection, View } from "./schema.js";

const isZero = (z: Complex): boolean => z.re === 0 && z.im === 0;

/** A complex coefficient as a parenthesised expr atom (safe to multiply / divide against). */
export function coeffExpr(z: Complex): string {
  const { re, im } = z;
  if (im === 0) return `(${re})`;
  if (re === 0) return `(${im}*i)`;
  return `(${re}${im < 0 ? "" : "+"}${im}*i)`;
}

/** Polynomial Σ coeffs[k]·v^k (ascending coefficients), in `@cas/expr` grammar. */
export function polyExpr(coeffs: readonly Complex[], v: string): string {
  const terms: string[] = [];
  coeffs.forEach((cf, k) => {
    if (isZero(cf)) return;
    const c = coeffExpr(cf);
    terms.push(k === 0 ? c : k === 1 ? `${c}*${v}` : `${c}*${v}^${k}`);
  });
  return terms.length ? terms.join(" + ") : "(0)";
}

export function rationalExpr(num: readonly Complex[], den: readonly Complex[], v: string): string {
  const p = polyExpr(num, v);
  // A unit denominator [1] is a pure polynomial — skip the division.
  if (den.length === 1 && den[0].re === 1 && den[0].im === 0) return p;
  if (den.length === 0 || den.every(isZero)) {
    // An empty or all-zero denominator validates as a MapSpec but is 0/0 everywhere; fail loudly rather
    // than emit a degenerate NaN map (matching the schwarz / pole-bearing-Laurent refusals).
    throw new Error(
      "This rational map has an empty or identically-zero denominator (division by zero) — refusing to build a degenerate map.",
    );
  }
  return `(${p}) / (${polyExpr(den, v)})`;
}

export function laurentExpr(c: Complex, F: readonly Complex[], v: string): string {
  const terms: string[] = [];
  if (!isZero(c)) terms.push(`${coeffExpr(c)}*${v}`);
  F.forEach((fl, l) => {
    if (isZero(fl)) return;
    terms.push(l === 0 ? coeffExpr(fl) : `${coeffExpr(fl)}/${v}^${l}`);
  });
  return terms.length ? terms.join(" + ") : "(0)";
}

/**
 * Convert an interchange MapSpec into an `@cas/expr` source string. Throws loudly for the shapes with no
 * expr closed form — a `schwarz` σ (its inverse is numerical), a pole-bearing Laurent map (finite-pole
 * `branches`), and a rational map with an empty / identically-zero denominator (a degenerate 0/0) — rather
 * than silently dropping terms into a subtly-wrong map. Callers should catch and surface the message.
 */
export function mapSpecToExpr(m: MapSpec): string {
  // An antiholomorphic closed form acts on conj(z), so build it on `conjugate(z)` instead of `z`.
  const v = m.antiholomorphic ? "conjugate(z)" : "z";
  switch (m.form) {
    case "rational":
      return rationalExpr(m.num, m.den, v);
    case "laurent":
      if (m.branches && m.branches.length > 0) {
        throw new Error(
          "This Laurent map carries finite-pole branches (a pole-bearing quadrature domain), which the expr import doesn't represent yet.",
        );
      }
      return laurentExpr(m.c, m.F, v);
    case "expr":
      return m.expr;
    case "schwarz":
      // σ is defined by a NUMERICAL inverse (φ⁻¹ via Newton / Durand–Kerner), not an algebraic expression
      // the `expr` pipeline can compile. A consumer rebuilds the σ evaluator from `m.phi` via @cas/schwarz
      // (Complex Dynamics does this) or imports φ directly. Reaching here means a schwarz map was routed to
      // the expr path — fail loudly rather than fall through to an implicit `undefined`.
      throw new Error(
        "A schwarz-form map is not expr-compilable — its inverse is numerical. Reconstruct σ from its generating map φ (via @cas/schwarz), or import φ directly.",
      );
  }
}

/**
 * The renderable map inside an interchange envelope, by kind: a quadrature-domain hands off its uniformizing
 * map φ; a schwarz-reflection its σ; a saved view / bare map their map directly. Returns null for a payload
 * that carries no single map to iterate.
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
