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
  SchwarzReflection,
  View,
} from "@cas/interchange";

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
  }
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
