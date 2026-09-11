import type { Level } from "./level.js";

/**
 * Type-level brand. It has no runtime representation — the constructors below cast, and the object
 * never carries this key at run time. Its only job is to make `{ level: "=" , … }` written by hand
 * fail to typecheck, so that "only these constructors may mint a certificate" is a compiler rule
 * rather than a comment someone will eventually not read.
 */
export declare const CERTIFICATE_BRAND: unique symbol;

/** One step of evidence in an audit trail. `ok: false` is allowed and useful: "tried the sharp
 *  route: ✗; fell back to the coarse one: ✓" is exactly the history worth showing. */
export interface Step {
  readonly ok: boolean;
  readonly text: string;
}

export interface CertificateOptions {
  /**
   * A scope the claim is restricted to — "over poles with Im z > 0", "for |a| < 1".
   *
   * A restricted claim that loses its restriction is not a vaguer claim, it is a **false** one.
   * {@link Verdict} therefore aggregates these, and the renderer must show them at the point of
   * display rather than behind a disclosure. (The lesson is QD's: its `sliceCaveat`/`scopeCaveat`
   * exist because a restricted count that had shed its restriction read as a general one.)
   */
  readonly restriction?: string;
  readonly provenance?: readonly Step[];
}

/** A single piece of evidence: what is claimed, how it was established, and how strongly. */
export interface Certificate {
  readonly [CERTIFICATE_BRAND]: true;
  readonly level: Level;
  /** What is asserted, in one line, renderable. */
  readonly claim: string;
  /** How it was established — "exact ℚ coefficient bound", "trapezoid N=4096", "Schur–Cohn". */
  readonly method: string;
  readonly restriction?: string;
  readonly provenance: readonly Step[];
}

function mint(level: Level, claim: string, method: string, opts?: CertificateOptions): Certificate {
  const cert = {
    level,
    claim,
    method,
    ...(opts?.restriction === undefined ? {} : { restriction: opts.restriction }),
    provenance: opts?.provenance ?? [],
  };
  return cert as unknown as Certificate;
}

/**
 * An exact claim. Reach for this only when the value *is* the value — a residue computed in ℚ(i),
 * a winding number from exact-sign predicates, a limit established symbolically. The decimal
 * rendering of an exact result is {@link estimate}, not this.
 */
export function exact(claim: string, method: string, opts?: CertificateOptions): Certificate {
  return mint("=", claim, method, opts);
}

/** A proved one-sided bound. `dir` is the direction of the inequality the claim asserts. */
export function bound(
  dir: "≤" | "≥",
  claim: string,
  method: string,
  opts?: CertificateOptions,
): Certificate {
  return mint(dir, claim, method, opts);
}

/** Numerically convincing, not proved. Quadrature lives here, and so does any rendered decimal. */
export function estimate(claim: string, method: string, opts?: CertificateOptions): Certificate {
  return mint("≈", claim, method, opts);
}

/** Nothing was established. Distinct from {@link estimate}: no number is being vouched for at all. */
export function unknown(claim: string, method = "not attempted", opts?: CertificateOptions): Certificate {
  return mint("?", claim, method, opts);
}

/**
 * The question is ill-posed or a hypothesis failed, so no value may be reported. `⚠` absorbs in the
 * meet, so one of these refuses everything downstream — which is the intent: a contour through a
 * pole should produce no number at all, not a number with a warning next to it.
 */
export function refuse(claim: string, reason: string, opts?: CertificateOptions): Certificate {
  return mint("⚠", claim, reason, opts);
}
