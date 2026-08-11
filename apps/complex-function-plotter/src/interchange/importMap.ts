/**
 * Import side of the suite hand-off (catalog K7): turn an `@cas/interchange` map Envelope — a Schwarz σ /
 * uniformizing map φ from Quadrature Domains, a saved View, or a bare map — into an `@cas/expr` source
 * string the plotter can plot. The rational / Laurent / expr forms convert to a closed form; a `schwarz`
 * σ is defined by a NUMERICAL inverse (φ⁻¹, schema.ts) and is **not** expr-compilable, so the plotter —
 * closed-form and GPU-first — plots the generating map **φ** instead, HONESTLY LABELLED (it is not σ).
 *
 * The converter is ported from the Complex-Dynamics app's `interchange/importMap.ts` (apps can't import
 * each other) — minus the `@cas/schwarz` numerical-σ engine CD wires in, which the plotter doesn't carry.
 * Coefficients render with `i`, `^`, `*`, `/`, so they parse in the same `@cas/expr` both apps share.
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

function rationalExpr(
  num: readonly Complex[],
  den: readonly Complex[],
  v: string,
): string {
  const p = polyExpr(num, v);
  if (den.length === 1 && den[0].re === 1 && den[0].im === 0) return p; // unit denominator ⇒ pure polynomial
  if (den.length === 0 || den.every(isZero)) {
    // An empty or all-zero denominator validates as a MapSpec but is 0/0 everywhere; fail loudly rather
    // than emit a degenerate NaN map (matching the schwarz / pole-bearing-Laurent refusals).
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
 * on `conj(z)`, so it is built on `conjugate(z)`. Throws for the shapes the plotter can't represent as a
 * closed form — a `schwarz` σ (numerical inverse), a pole-bearing Laurent map (finite-pole branches), and
 * a rational map with an empty / identically-zero denominator (a degenerate 0/0) — loudly, rather than
 * silently dropping terms into a subtly-wrong map.
 */
export function mapSpecToExpr(m: MapSpec): string {
  const v = m.antiholomorphic ? "conjugate(z)" : "z";
  switch (m.form) {
    case "rational":
      return rationalExpr(m.num, m.den, v);
    case "laurent":
      if (m.branches && m.branches.length > 0) {
        throw new Error(
          "This Laurent map carries finite-pole branches (a pole-bearing quadrature domain), which the plotter's import doesn't represent yet.",
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

/**
 * The renderable map inside an interchange envelope, by kind: a quadrature-domain hands off its φ; a
 * schwarz-reflection its σ; a saved view / bare map their map directly. Null for a payload with no single
 * map. (Ported from CD's `envelopeToMapSpec`.)
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

/** The result of importing an interchange text: the `@cas/expr` source to plot, an honest note about what
 *  was imported (φ-in-place-of-σ, etc.), the source app, and a viewport to restore for a `view`. */
export interface ImportedMap {
  expr: string;
  note: string;
  source: string;
  viewport?: { center: Complex; span: number };
}

/**
 * Decode an interchange payload (an `#s=` link or a JSON envelope) and turn it into a plottable
 * `@cas/expr` source. A `schwarz` σ is redirected to its generating map φ with an honest note; a `view`
 * additionally yields its viewport so the plotter can re-open it in place. Throws (InterchangeError or a
 * plain Error) on a malformed / unsupported payload — the caller surfaces the message.
 */
export function importEnvelopeText(text: string): ImportedMap {
  const t = text.trim();
  const env = t.startsWith("{") ? validateEnvelope(JSON.parse(t)) : decodeLink(t);
  const spec = envelopeToMapSpec(env);
  const source = typeof env.provenance?.app === "string" ? env.provenance.app : "unknown";
  if (!spec) throw new Error(`This “${env.kind}” payload carries no plottable map.`);

  const viewport =
    env.kind === "view"
      ? {
          center: (env.payload as View).viewport.center,
          span: (env.payload as View).viewport.zoom,
        }
      : undefined;

  if (spec.form === "schwarz") {
    // The numerical Schwarz reflection σ isn't a closed form; plot its generating map φ, clearly labelled.
    return {
      expr: mapSpecToExpr(spec.phi),
      note: "Imported φ, the generating map — the numerical Schwarz reflection σ needs the Quadrature-Domains solver, so it is not itself plotted here.",
      source,
      viewport,
    };
  }
  const note = env.kind === "quadrature-domain" ? "Imported the uniformizing map φ." : "";
  return { expr: mapSpecToExpr(spec), note, source, viewport };
}
