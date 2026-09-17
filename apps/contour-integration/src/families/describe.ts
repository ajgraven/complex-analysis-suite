// What a record SAYS about itself, rendered from the record's own fields.
//
// These four functions were module-level helpers inside `shell/app.ts` until M8 step 0.1. They are
// pure functions of a `Family` and a `Golden` with no DOM in them, and moving them here does three
// things: it lets a NODE test read what the app will print (the shell's own tests are jsdom, because
// they mount the app, and that is the wrong instrument for a sentence); it puts them beside the
// schema whose fields they read, so a field that changes meaning changes its reader in the same
// directory; and it gives step 0.4's LaTeX siblings an obvious home.
//
// **The rule they all obey**: a sentence here is built from a field the engine also acts on, never
// written per record as prose. A second, hand-written statement of what a record claims would be a
// second source of truth, and the first time it disagreed with the executable one the app would be
// lying in the most legible place on the screen.
import { evaluate, parse, type Complex } from "@cas/expr";

import { fmt } from "../kernel/decimal.js";

import type { Citation, Family, FamilyTarget, Golden } from "./schema.js";

/** Substitute a fixture's bindings into an expression before printing it. */
export function withParams(src: string, params: Golden["params"] | undefined): string {
  if (params === undefined) return src;
  let out = src;
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "boolean") continue;
    out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, "g"), `(${value})`);
  }
  return out;
}

/**
 * The real quantity a record is about: `∫ (0 → 2π)  1/(a + b*cos(theta))  dtheta`.
 *
 * `at` substitutes the fixture's numbers, exactly as `targetLatex` does — **and it has to, because
 * the two are a pair**: this is the spoken form of that formula, and step 2.2 found them apart the
 * moment the Target card started passing an explicit label. The picture said `1/(1 + 1\cdot\cos)`
 * and the accessible name said `1/(a + b*cos(theta))`, which is the one place a reader who cannot
 * see the formula would have been told the symbols were still there.
 */
export function targetText(t: FamilyTarget, opts: { readonly at?: Golden["params"] } = {}): string {
  const bound = (x: string): string => (x === "inf" ? "∞" : x === "-inf" ? "−∞" : x);
  const range = `(${bound(t.lower)} → ${bound(t.upper)})`;
  const body = withParams((t.kind === "sum" ? t.summand : t.integrand) ?? "?", opts.at);
  return t.kind === "sum" ? `Σ ${t.variable} ${range}  ${body}` : `∫ ${range}  ${body}  d${t.variable}`;
}

/**
 * What the auxiliary integrand's relation to the target actually IS, in one line.
 *
 * **The functional relates the target to the integral over the TARGET PIECES, not to `∮`.** Until
 * M8 step 0.1 this printed `the target is ${relation} of ∮ f dz`, which is false wherever the
 * contour does more than carry the target: `∮ = 0` for both indented records (C1's whole value is
 * the indentation's limit), and every keyhole, dogbone, strip and wedge multiplies the unknown by a
 * factor before `∮` is reached. On C1 the sentence printed the exact misconception the record exists
 * to correct — *"∫₀^∞ sin x/x is Im/2 of ∮"* — beside a ledger whose own rows say the enclosed
 * residue sum is empty.
 *
 * What is true of every record with an auxiliary integrand is the two-step statement below: the
 * functional recovers the target from the integral over the pieces the record marks `target`, and
 * the boundary terms are what relate that integral to `∮`. Both halves are read off the same
 * declaration the ledger reads, so the sentence and the rows cannot disagree.
 *
 * A tier-G record keeps its own sentence: its target is a TERM of the residue sum — the kernel has
 * residue 1 at every integer, so `Res(K·f, n)` IS the summand — and `∮` tends to zero, taking any
 * functional of it with it.
 */
export function relationText(family: Family): string {
  const aux = family.auxiliary;
  if (aux === undefined) return "";
  const inSum = family.residueSelection.targetTerms?.[0];
  if (inSum !== undefined) {
    return `${inSum.targetId} is a term of the residue sum, not a functional of ∮ f dz — ${aux.note}`;
  }
  const targets = family.contour.pieces.filter((p) => p.role === "target").length;
  const piece = targets === 1 ? "the target piece" : "the target pieces";
  // `components` is not a functional name — D4, D5, E3 and F2 determine several real unknowns from
  // one complex identity, and no one of them is "Re of" anything. Naming the unknowns is the honest
  // reading, and it is what Pass 5 does.
  const how =
    aux.relation === "components"
      ? `the target is one of the real unknowns this contour's identity determines`
      : `the target is ${aux.relation} of the integral over ${piece} in the limit`;
  return `${how}; the boundary terms below relate that integral to ∮ f dz — ${aux.note}`;
}

/**
 * The expression that is actually integrated — which is NOT the posed integrand.
 *
 * GALLERY §5.0 calls confusing the two "the single commonest error in the whole subject":
 * `cos 2θ/(5 − 4cos θ)` is smooth at every real θ, and the contour integrand it becomes has a pole
 * of order 2 at the origin.
 *
 * **A record may carry both an auxiliary integrand and a substitution, and then the auxiliary is
 * only half of it.** A4 is the case: its auxiliary `exp(z)/z^n` is PRE-Jacobian, and what the engine
 * integrates is that times `dθ = dz/(iz)`. Printing the auxiliary alone gave the reader an
 * expression with a pole of order `n` beside a residues table reporting order `n + 1` — the two
 * disagreeing about the singularity the record is entirely about.
 */
export function contourIntegrandExpr(fam: Family): string {
  const sub = fam.targets[0]?.substitution;
  if (fam.auxiliary !== undefined) {
    return sub === undefined
      ? fam.auxiliary.integrand
      : `(${fam.auxiliary.integrand}) * ${sub.jacobian}`;
  }
  const t = fam.targets[0];
  return t?.integrand ?? "?";
}

/** {@link contourIntegrandExpr}, with the substitution that produced it named. */
export function contourIntegrandText(fam: Family): string {
  const expr = contourIntegrandExpr(fam);
  const t = fam.targets[0];
  const sub = t?.substitution;
  if (sub === undefined) {
    return fam.auxiliary !== undefined
      ? expr
      : `${expr}   read in z — the real axis is a piece of the contour`;
  }
  // When the auxiliary carried the Jacobian into `expr`, naming it again in the suffix prints the
  // same factor twice; the substitution's map is the half that is not already there.
  return fam.auxiliary !== undefined
    ? `${expr}   with  z = ${sub.map}`
    : `${expr}   with  z = ${sub.map},  d${t?.variable ?? "x"} = ${sub.jacobian} dz`;
}

/**
 * Whether a fixture selects an alternative DERIVATION rather than binding parameters.
 *
 * Decided by NAME, not by type. `halfRange` and `closeDown` are booleans, but B2's
 * `companion: "re"` is a string, and keying off the type silently treats it as a parameter binding —
 * which made a test compare the wrong half of the contour value against zero. A declared SYMBOL is a
 * binding too: A4's fixtures name `g: "exp(z)"`, the entire function whose Taylor coefficients the
 * contour reads off, and counting that as a variant skipped every one of A4's fixtures.
 */
export function isVariant(family: Family, golden: Golden): boolean {
  const declared = new Set(family.parameters.map((p) => p.name));
  for (const t of family.targets) for (const name of Object.keys(t.symbols)) declared.add(name);
  return Object.keys(golden.params).some((k) => !declared.has(k));
}

/**
 * What the record claims, in two scopes: at THIS fixture, and for the family.
 *
 * Until M8 step 0.1 the card printed `closedForm.simplified` unconditionally, and five records'
 * simplified forms are sign-restricted or fixture-specific: `2π/√(a²−b²)` is positive at `a = −2`
 * where the value is negative, `2π/(1−a²)` is negative at `a = 2` where the value is positive,
 * `π/6` is A3's value at `n = 2` only, and the two log families state a particular `R`. The card
 * printed each of them beside the engine's number for that fixture, contradicting it.
 *
 * `Golden.value` is the closed form **at this fixture**, and `Golden.numeric` is its value —
 * verified during research and pinned against the engine by the golden corpus. So it cannot
 * contradict the number beside it, and it is what the comparison on the card is FOR.
 *
 * The family's general form is worth showing too — a reader wants `π/sin(πα)`, not `π/sin(0.3π)` —
 * so it is a second line, shown only where it holds. {@link Family.closedForm.simplifiedWhen} is the
 * condition; absent means unrestricted.
 */
export interface ClosedFormClaim {
  /** The record's claim at this fixture, from `Golden.value`. Always present. */
  readonly atFixture: string;
  /** The family's closed form, when it is valid at this fixture. */
  readonly general: string | null;
  /**
   * Why this fixture documents a REFUSAL, or `null`.
   *
   * `Golden.refuses` carries the reason, and the distinction it draws is the dangerous one: the
   * VALUE is right (correct by continuity) and the DERIVATION collapses. A card that prints the
   * value with no qualifier presents a collapsed argument as an established one.
   */
  readonly refusal: string | null;
}

export function closedFormClaim(family: Family, golden: Golden): ClosedFormClaim {
  const { simplified, simplifiedWhen } = family.closedForm;
  const valid =
    simplified !== undefined &&
    // Nothing is gained by printing the same string twice, which is what an unrestricted simplified
    // form does at a fixture whose value IS it (`pi/2` on A5).
    simplified !== golden.value &&
    // A VARIANT fixture computes a different quantity — the half-range corollary, the companion
    // integral, the principal-value form, the two-sided sum — and the family's closed form is about
    // the primary one. Eight fixtures across six records contradicted it, which is the same defect
    // as the five restricted forms and is caught by the same line.
    !isVariant(family, golden) &&
    (simplifiedWhen === undefined || conditionHolds(simplifiedWhen, golden.params));
  return {
    atFixture: golden.value,
    general: valid ? (simplified ?? null) : null,
    refusal: golden.refuses ?? null,
  };
}

/**
 * Decide a `simplifiedWhen` condition at a fixture's parameters.
 *
 * A condition that cannot be decided — an unparseable expression, a name the fixture does not bind,
 * a value that is not a boolean — returns **false**, which withholds the general form rather than
 * showing it unguarded. The direction matters: the guard exists because an unguarded form was wrong,
 * so "could not tell" must fall on the side of saying less.
 */
function conditionHolds(condition: string, params: Golden["params"]): boolean {
  const scope: Record<string, Complex> = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "number") scope[name] = [value, 0];
  }
  try {
    const got = evaluate(parse(condition), [0, 0], [0, 0], undefined, scope);
    return got === true;
  } catch {
    return false;
  }
}

/**
 * How a fixture reads in the picker: `a = 2, b = 1`, `half-range corollary`, `a = 0.75, one-sided sum`.
 *
 * A variant fixture's `params` carry a FLAG rather than a binding, so the flag is printed from the
 * golden's own `label` and the key is skipped — `halfRange = true` named the implementation where a
 * reader is choosing between alternative derivations. Real bindings still come from `params`, so a
 * fixture carrying both (`series-cot-kernel` at `a = 0.75`) prints the number once, from one place.
 *
 * Moved here from `src/shell/app.ts` at M8 step 1.4 on the second-consumer rule: the new shell's
 * Target card is the second reader, and it sits beside {@link isVariant}, which decides the same
 * question about the same pair.
 */
export function fixtureLabel(family: Family, g: Golden): string {
  const declared = new Set(family.parameters.map((p) => p.name));
  for (const t of family.targets) for (const name of Object.keys(t.symbols)) declared.add(name);
  const parts = Object.entries(g.params)
    .filter(([k]) => declared.has(k))
    .map(([k, v]) => `${k} = ${typeof v === "number" ? fmt(v) : String(v)}`);
  if (g.label !== undefined) parts.push(g.label);
  return parts.length > 0 ? parts.join(", ") : "no parameters";
}

/**
 * `Ahlfors, Ch. 4 §5.3 — Jordan's lemma`, with the covering phrase only where the record gives one.
 *
 * **Here on the second-consumer rule**, having been a module const in `shell2/cards/target.ts` until
 * the front door's cards wanted the same line. Three fields composed one way is exactly the kind of
 * thing two readers come to disagree about — `Citation.text` may be empty, and a second copy is one
 * `?? ""` away from printing a trailing dash — and this file is where the schema's own vocabulary is
 * turned into sentences.
 */
export function citationLine(c: Citation): string {
  return c.text === "" ? `${c.book}, ${c.where}` : `${c.book}, ${c.where} — ${c.text}`;
}
