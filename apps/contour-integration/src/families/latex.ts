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
import { closedFormClaim, contourIntegrandExpr, targetText, withParams } from "./describe.js";
import { latexOf, printLatex } from "../kernel/exprLatex.js";

export { latexOf };

/** A bound of an integral or a sum: `0`, `\infty`, `-\infty`, or whatever the record wrote. */
function boundLatex(x: string): string {
  if (x === "inf") return "\\infty";
  if (x === "-inf") return "-\\infty";
  return latexOf(x) ?? x;
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

/**
 * The identity a card leads with: the target at a fixture, and what it comes to.
 *
 * The right-hand side is dropped where the record's own claim is not an expression — `closedFormLatex`
 * returns `null` for the two families whose general form is a sentence about several unknowns — and
 * the caller then prints the integral alone rather than an `=` with nothing after it.
 *
 * **Both sides are read at the same fixture, which step 2.2 found they were not.** The left-hand
 * side has substituted the bindings since step 1.4 and the right-hand side is `golden.value`, which
 * is the record's own text and may carry the symbols still: D1 printed `\int_0^{\infty}
 * x^{0.3-1}/(1+x)\,dx = \pi/\sin(\pi\alpha)`, an identity half in numbers and half in letters, on
 * this card and on the front door's cards since they were built. The general form, in symbols, is
 * the Result card's business.
 *
 * **The caller decides WHICH fixture, and step 2.2 found that it matters too.** `golden.value` belongs to
 * the record's first target, so at a VARIANT fixture — the half-range corollary, the companion
 * integral — it is the value of a different quantity: A5's variant is `pi/4` against a target written
 * `\int_{-\infty}^{\infty}`, and printing that identity would be false. The front door only ever
 * shows the primary fixture; the Target card asks `isVariant` first.
 */
export function identityLatex(family: Family, golden: Golden): string {
  const lhs = targetLatex(family.targets[0], { at: golden.params });
  const rhs = closedFormLatex(family, golden).atFixture;
  return rhs === null ? lhs : `${lhs} = ${latexOf(withParams(golden.value, golden.params)) ?? rhs}`;
}

/** The same identity as a sentence, for the accessible name of the formula. */
export function identityText(family: Family, golden: Golden): string {
  return `${targetText(family.targets[0], { at: golden.params })} = ${withParams(golden.value, golden.params)}`;
}
