// What a record says about itself, typeset.
//
// M8 step 0.4b. `describe.ts` renders the same four things as text — the target, the contour
// integrand, the relation between them, the closed form — and this is its LaTeX sibling, built by
// parsing each expression and printing it through `@cas/expr`'s `toLatex` rather than by writing
// LaTeX into the records. A hand-written form drifts the first time a record changes, which is the
// lesson M6.4 recorded about generated alternative text and is exactly as true here.
//
// The Greek-letter convention and the printing itself live in `kernel/exprLatex.ts`, whose second
// consumer is the ledger's own exact claims.
import type { Family, FamilyTarget, Golden } from "./schema.js";
import { closedFormClaim, contourIntegrandExpr } from "./describe.js";
import { latexOf, printLatex } from "../kernel/exprLatex.js";

export { latexOf };

/** A bound of an integral or a sum: `0`, `\infty`, `-\infty`, or whatever the record wrote. */
function boundLatex(x: string): string {
  if (x === "inf") return "\\infty";
  if (x === "-inf") return "-\\infty";
  return latexOf(x) ?? x;
}

/** Substitute a fixture's bindings into an expression before printing it. */
function withParams(src: string, params: Golden["params"] | undefined): string {
  if (params === undefined) return src;
  let out = src;
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "boolean") continue;
    out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, "g"), `(${value})`);
  }
  return out;
}

export interface TargetLatexOptions {
  /** Show the fixture's numbers in place of the symbols. */
  readonly at?: Golden["params"];
}

/**
 * One of the record's unknowns: `\int_{0}^{\infty}\frac{x^{\alpha-1}}{1+x}\,dx`, `\sum...`.
 *
 * The `\,` before the differential is the standard thin space; a sum carries its index under the
 * sigma. A target whose integrand the record omits prints the `?` the text form prints, rather than
 * inventing one.
 */
export function targetLatex(t: FamilyTarget, opts: TargetLatexOptions = {}): string {
  const lower = boundLatex(t.lower);
  const upper = boundLatex(t.upper);
  const body = t.kind === "sum" ? t.summand : t.integrand;
  const inner = body === undefined ? "?" : (latexOf(withParams(body, opts.at)) ?? "?");
  const v = printLatex({ kind: "var", name: t.variable });
  return t.kind === "sum"
    ? `\\sum_{${v} = ${lower}}^{${upper}} ${inner}`
    : `\\int_{${lower}}^{${upper}} ${inner} \\,d${v}`;
}

/** The integrand `∮ f(z)\,dz` is taken over — the auxiliary where there is one, times its Jacobian. */
export function contourIntegrandLatex(family: Family, opts: TargetLatexOptions = {}): string {
  return latexOf(withParams(contourIntegrandExpr(family), opts.at)) ?? "?";
}

/** The closed form the record claims, at a fixture and in general. */
export interface ClosedFormLatex {
  /** The value at this fixture — always present, since every fixture carries one. */
  readonly atFixture: string | null;
  /** The family's general form, when it holds here and is an expression. */
  readonly general: string | null;
}

/**
 * {@link closedFormClaim}'s two lines, typeset.
 *
 * `null` where the record's own string is not an expression: two records' general form is a SENTENCE
 * about several unknowns at once (`T1 = -pi/4 and T0 = pi/4 for R = 1/(1+x^2)^2`), which is true and
 * is not a closed form, and printing it as mathematics would be a claim the record does not make.
 */
export function closedFormLatex(family: Family, golden: Golden): ClosedFormLatex {
  const claim = closedFormClaim(family, golden);
  return {
    atFixture: latexOf(claim.atFixture),
    general: claim.general === null ? null : latexOf(claim.general),
  };
}
