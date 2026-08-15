/**
 * Import side of the suite hand-off: turn an `@cas/interchange` map Envelope — an f(z) handed off from
 * the Complex-Function Plotter or Complex Dynamics (an `expr` / `view` map), a uniformizing map φ from
 * Quadrature Domains, or a bare rational / Laurent map — into an `@cas/expr` source string this tool can
 * study for its zeros, poles, and winding. A `schwarz` σ is a NUMERICAL inverse and not expr-compilable,
 * so its generating map φ is imported instead, honestly labelled.
 *
 * Ported from the Complex-Function-Plotter's `interchange/importMap.ts` (apps can't import each other —
 * ARCHITECTURE §4; the wire types are the shared contract). Coefficients render with `i`, `^`, `*`, `/`
 * so they parse in the same `@cas/expr` every app shares.
 */
import {
  decodeLink,
  validateEnvelope,
  type Complex,
  type Envelope,
  type MapSpec,
  type QuadratureDomain,
  type SchwarzReflection,
  type View,
} from "@cas/interchange";

const isZero = (z: Complex): boolean => z.re === 0 && z.im === 0;

/** A complex coefficient as a parenthesised expr atom (safe to multiply / divide against). */
function coeffExpr(z: Complex): string {
  const { re, im } = z;
  if (im === 0) return `(${re})`;
  if (re === 0) return `(${im}*i)`;
  return `(${re}${im < 0 ? "" : "+"}${im}*i)`;
}

/** Polynomial Σ coeffs[k]·v^k (ascending coefficients). */
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
  if (den.length === 1 && den[0].re === 1 && den[0].im === 0) return p; // unit denominator ⇒ pure polynomial
  if (den.length === 0 || den.every(isZero)) {
    throw new Error(
      "This rational map has an empty or identically-zero denominator (division by zero) — refusing to build a degenerate map.",
    );
  }
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

/**
 * Convert an interchange MapSpec into an `@cas/expr` source string. An anti-holomorphic closed form acts
 * on `conj(z)`, so it is built on `conjugate(z)`. Throws for shapes with no closed form (a numerical
 * `schwarz` σ, a pole-bearing Laurent map, a degenerate 0/0 rational).
 */
export function mapSpecToExpr(m: MapSpec): string {
  const v = m.antiholomorphic ? "conjugate(z)" : "z";
  switch (m.form) {
    case "rational":
      return rationalExpr(m.num, m.den, v);
    case "laurent":
      if (m.branches && m.branches.length > 0) {
        throw new Error(
          "This Laurent map carries finite-pole branches (a pole-bearing quadrature domain), which this tool's import doesn't represent yet.",
        );
      }
      return laurentExpr(m.c, m.F, v);
    case "expr":
      return m.expr;
    case "schwarz":
      throw new Error(
        "A schwarz-form map isn't expr-compilable — its inverse is numerical. Import its generating map φ instead.",
      );
  }
}

/** The renderable map inside an interchange envelope, by kind (ported from CD's `envelopeToMapSpec`). */
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

/** The result of importing an interchange text: the `@cas/expr` source, an honest note about what was
 *  imported, the source app, and a viewport center to restore for a `view`. */
export interface ImportedMap {
  expr: string;
  note: string;
  source: string;
  center?: Complex;
}

/**
 * Decode an interchange payload (an `#s=` link or a JSON envelope) into an `@cas/expr` source. A `schwarz`
 * σ is redirected to its generating map φ with a note. Throws (InterchangeError or a plain Error) on a
 * malformed / unsupported payload — the caller surfaces the message.
 */
export function importEnvelopeText(text: string): ImportedMap {
  const t = text.trim();
  const env = t.startsWith("{") ? validateEnvelope(JSON.parse(t)) : decodeLink(t);
  const spec = envelopeToMapSpec(env);
  const source = typeof env.provenance?.app === "string" ? env.provenance.app : "unknown";
  if (!spec) throw new Error(`This “${env.kind}” payload carries no map to study.`);

  const center = env.kind === "view" ? (env.payload as View).viewport.center : undefined;

  if (spec.form === "schwarz") {
    const phi = spec.phi;
    if (phi.form === "bounded") {
      throw new Error(
        "This Schwarz reflection's generating map φ is a bounded map (φ: 𝔻 → Ω), which this tool's import doesn't represent yet.",
      );
    }
    return {
      expr: mapSpecToExpr(phi),
      note: "Imported φ, the generating map — the numerical Schwarz reflection σ is not itself studied here.",
      source,
      center,
    };
  }
  const note = env.kind === "quadrature-domain" ? "Imported the uniformizing map φ." : "";
  return { expr: mapSpecToExpr(spec), note, source, center };
}
