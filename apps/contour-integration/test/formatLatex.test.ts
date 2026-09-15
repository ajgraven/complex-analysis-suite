// The two notations denote the same value, over every number the gallery prints.
//
// M8 step 0.4b did not write a second set of formatters — it parameterised the existing ones over a
// `Notation` and instantiated it twice (`src/kernel/notation.ts`). That makes a DROPPED TERM
// impossible by construction, since it is the same line of code; what it does not make impossible is
// a notation whose spelling of one join is wrong, and a LaTeX form that renders beautifully while
// denoting a different number is the worst failure this app could ship.
//
// So two checks, over a corpus built from the values the engine actually produces:
//
//  1. **KaTeX accepts it** — `renderToString` with `throwOnError`, because emitting a string is not
//     the same as emitting LaTeX.
//  2. **It says the same thing.** Both forms are stripped to a common canonical shape — every
//     bracket removed, `\frac{A}{B}` flattened to `A/B`, `\pi` to `π`, a Unicode superscript to
//     `^n` — and required to be EQUAL. Stripping the brackets is what makes the comparison fair
//     (the two notations legitimately draw them in different places) and it still catches a missing
//     term, a wrong sign, a wrong digit, a wrong symbol and a wrong denominator.
import { describe, expect, it } from "vitest";
import katex from "katex";
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";

import { LATEX, TEXT, superscript, type Notation } from "../src/kernel/notation.js";
import {
  formatFrac,
  formatGauss,
  formatPiSqrt,
  formatSqrtExt,
  formatTwoPiI,
  formatTwoPiISqrt,
} from "../src/kernel/formatExact.js";
import { ExpSum, formatExpSum, formatPiExpSum, formatTwoPiIExpSum } from "../src/kernel/expSum.js";
import { Exponent, formatExponent } from "../src/kernel/exponent.js";
import { LogPart, formatLogPart, formatLogPower } from "../src/kernel/logPart.js";
import { RatPi, formatRatPi } from "../src/kernel/ratPi.js";
import { FAMILIES } from "../src/families/index.js";
import { solveFamily } from "../src/families/runFamily.js";

/** `\frac{A}{B}` → `A/B`, matching braces so a nested fraction survives. */
function flattenFractions(tex: string): string {
  let out = tex;
  for (let guard = 0; guard < 40 && out.includes("\\frac{"); guard++) {
    const at = out.indexOf("\\frac{");
    const num = braced(out, at + "\\frac".length);
    if (num === null) break;
    const den = braced(out, num.end);
    if (den === null) break;
    out = `${out.slice(0, at)}${num.body}/${den.body}${out.slice(den.end)}`;
  }
  return out;
}

/** The `{…}` group starting at `at`, with its contents and the index just past it. */
function braced(s: string, at: number): { body: string; end: number } | null {
  if (s[at] !== "{") return null;
  let depth = 0;
  for (let k = at; k < s.length; k++) {
    if (s[k] === "{") depth++;
    else if (s[k] === "}") {
      depth--;
      if (depth === 0) return { body: s.slice(at + 1, k), end: k + 1 };
    }
  }
  return null;
}

/** Both notations reduced to the same alphabet, with every bracket and space removed. */
function canonical(s: string): string {
  let out = flattenFractions(s);
  out = out
    .replace(/\\sqrt\{([^}]*)\}/g, "√$1")
    .replace(/\\operatorname\{([^}]*)\}/g, "$1")
    .replace(/\\left|\\right/g, "")
    .replace(/\\pi/g, "π")
    .replace(/\\cdot/g, "·")
    .replace(/\\(ln|sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|coth)\b/g, "$1")
    .replace(/\^\{([^}]*)\}/g, "^$1")
    .replace(/\^\(([^)]*)\)/g, "^$1");
  // The text notation's Unicode superscripts, back to `^n` — a maximal RUN at a time, so a
  // multi-digit or negative exponent comes back as one exponent rather than several (`7⁻³` is
  // `7^-3`, not `7^-^3`, which is what converting character by character produced).
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) =>
    `^${[...run].map((ch) => (ch === "⁻" ? "-" : String(SUPERSCRIPTS.indexOf(ch)))).join("")}`,
  );
  return out.replace(/[()\s]/g, "").replace(/−/g, "-");
}

/** The digits `superscript` produces, indexed by value. */
const SUPERSCRIPTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => superscript(d));

const rendersInKatex = (tex: string): string | null => {
  try {
    katex.renderToString(tex, { throwOnError: true, displayMode: true });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

/** One value, rendered both ways. */
interface Pair {
  readonly where: string;
  readonly text: string;
  readonly tex: string;
}

const frac = (n: bigint, d: bigint): Frac => Frac.of(n, d);
const gauss = (a: readonly [bigint, bigint], b: readonly [bigint, bigint]): Gauss =>
  new Gauss(frac(a[0], a[1]), frac(b[0], b[1]));

/** `Σ qⱼ ln pⱼ` over primes. */
const logOf = (terms: readonly (readonly [bigint, Frac])[]): LogPart =>
  LogPart.of(terms.map(([prime, weight]) => ({ prime, weight })));

/** Hand-built values covering every shape the formatters can take. */
function unitPairs(): Pair[] {
  const pairs: Pair[] = [];
  const add = <T>(where: string, f: (v: T, n?: Notation) => string, v: T): void => {
    pairs.push({ where, text: f(v, TEXT), tex: f(v, LATEX) });
  };

  for (const f of [frac(3n, 1n), frac(-3n, 1n), frac(1n, 2n), frac(-7n, 12n), Frac.ZERO]) {
    add(`formatFrac ${f.n}/${f.d}`, formatFrac, f);
  }
  const gs = [
    Gauss.ZERO,
    Gauss.ONE,
    gauss([0n, 1n], [-1n, 2n]),
    gauss([1n, 1n], [4n, 3n]),
    gauss([1n, 2n], [-1n, 1n]),
    gauss([-5n, 4n], [0n, 1n]),
  ];
  for (const g of gs) {
    add(`formatGauss ${formatGauss(g)}`, formatGauss, g);
    add(`formatTwoPiI ${formatGauss(g)}`, formatTwoPiI, g);
  }
  const xs = [
    SqrtExt.fromGauss(gauss([0n, 1n], [-1n, 4n])),
    SqrtExt.of(gauss([1n, 2n], [0n, 1n]), gauss([0n, 1n], [1n, 2n]), 2n),
    SqrtExt.of(gauss([1n, 1n], [0n, 1n]), gauss([-1n, 2n], [1n, 3n]), 3n),
    SqrtExt.of(Gauss.ZERO, Gauss.ONE, 5n),
  ];
  for (const x of xs) {
    add(`formatSqrtExt ${formatSqrtExt(x)}`, formatSqrtExt, x);
    add(`formatPiSqrt ${formatSqrtExt(x)}`, formatPiSqrt, x);
    add(`formatTwoPiISqrt ${formatSqrtExt(x)}`, formatTwoPiISqrt, x);
  }
  // Exponents: algebraic, π, logarithmic, and a sum of all three.
  const exponents = [
    Exponent.fromSqrtExt(SqrtExt.fromGauss(Gauss.ONE)),
    Exponent.fromSqrtExt(SqrtExt.fromGauss(Gauss.ONE)).neg(),
    Exponent.piTimes(gauss([-1n, 4n], [0n, 1n])),
    Exponent.piTimes(gauss([0n, 1n], [2n, 1n])),
    Exponent.fromLog(logOf([[2n, frac(1n, 2n)]])),
    Exponent.fromLog(logOf([[2n, frac(9n, 4n)], [5n, frac(3n, 4n)]])),
    Exponent.piTimes(gauss([1n, 3n], [0n, 1n])).add(Exponent.fromLog(logOf([[3n, frac(-1n, 1n)]]))),
  ];
  for (const e of exponents) {
    add(`formatExponent ${formatExponent(e)}`, formatExponent, e);
    add(`formatExpSum e^{${formatExponent(e)}}`, formatExpSum, ExpSum.of(SqrtExt.fromGauss(Gauss.ONE), e));
    add(`formatPiExpSum e^{${formatExponent(e)}}`, formatPiExpSum, ExpSum.of(SqrtExt.fromGauss(Gauss.ONE), e));
    add(
      `formatTwoPiIExpSum e^{${formatExponent(e)}}`,
      formatTwoPiIExpSum,
      ExpSum.of(SqrtExt.fromGauss(Gauss.ONE), e),
    );
  }
  for (const l of [
    logOf([[2n, frac(1n, 1n)]]),
    logOf([[2n, frac(9n, 4n)], [5n, frac(3n, 4n)]]),
    logOf([[7n, frac(-3n, 1n)]]),
    logOf([[2n, frac(12n, 1n)]]),
  ]) {
    add(`formatLogPart ${formatLogPart(l)}`, formatLogPart, l);
    add(`formatLogPower ${formatLogPower(l)}`, formatLogPower, l);
  }
  // `RatPi`: a polynomial, a bare power denominator, and a compound one.
  const poly = (...cs: Gauss[]): QiPoly => QiPoly.fromCoeffs(cs);
  for (const r of [
    RatPi.of(poly(Gauss.ZERO, Gauss.ZERO, Gauss.int(4n)), poly(Gauss.ONE)),
    RatPi.of(poly(Gauss.ONE), poly(Gauss.ZERO, Gauss.ZERO, Gauss.int(4n))),
    RatPi.of(poly(Gauss.ZERO, Gauss.int(2n)), poly(Gauss.ONE, Gauss.ZERO, Gauss.ONE)),
    RatPi.of(poly(new Gauss(frac(1n, 2n), Frac.ZERO), Gauss.int(-3n)), poly(Gauss.ONE)),
  ]) {
    add(`formatRatPi ${formatRatPi(r)}`, formatRatPi, r);
  }
  return pairs;
}

/** Every value the 28 records actually solve to, rendered both ways. */
function corpusPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const family of FAMILIES) {
    family.golden.forEach((golden, k) => {
      const r = solveFamily(family, golden);
      if (!r.ok || r.solved === undefined) return;
      const limits = r.run.ledger.pieceLimits;
      pairs.push({
        where: `${family.id}[${k}] ∮`,
        text: r.run.theorem.exactValue?.text ?? "",
        tex: r.run.theorem.exactValue?.latex ?? "",
      });
      limits.forEach((limit, j) => {
        pairs.push({
          where: `${family.id}[${k}] limit ${j}`,
          text: formatPiExpSum(limit.contribution, TEXT),
          tex: formatPiExpSum(limit.contribution, LATEX),
        });
      });
    });
  }
  return pairs.filter((p) => p.text !== "");
}

// Solving 28 records at every fixture is the expensive half of this file, and three tests ask about
// the same values.
const CORPUS = corpusPairs();
const UNITS = unitPairs();

describe("the LaTeX notation", () => {
  it("says the same thing as the text, on every shape a formatter can take", () => {
    const wrong = UNITS
      .filter((p) => canonical(p.text) !== canonical(p.tex))
      .map((p) => `${p.where}\n     text ${p.text}  →  ${canonical(p.text)}\n     tex  ${p.tex}  →  ${canonical(p.tex)}`);
    expect(wrong).toEqual([]);
  });

  it("renders in KaTeX, on every shape a formatter can take", () => {
    const refused = UNITS
      .map((p) => {
        const why = rendersInKatex(p.tex);
        return why === null ? null : `${p.where}: ${p.tex} — ${why}`;
      })
      .filter((x): x is string => x !== null);
    expect(refused).toEqual([]);
  });

  it("covers every formatter, so neither sweep can pass by looking at nothing", () => {
    const pairs = UNITS;
    expect(pairs.length).toBeGreaterThan(60);
    // The canonical form must be capable of telling two values APART, or both sweeps are vacuous.
    expect(canonical(formatPiSqrt(SqrtExt.fromGauss(Gauss.ONE), LATEX))).not.toBe(
      canonical(formatPiSqrt(SqrtExt.fromGauss(Gauss.int(2n)), LATEX)),
    );
    expect(canonical("\\frac{\\pi\\sqrt{2}}{2}")).toBe(canonical("π√2/2"));
    expect(canonical("\\pi^{2}")).toBe(canonical("π²"));
  });

  it("is LaTeX — no Unicode mathematics survives into it", () => {
    // The canonical comparison above maps `−` to `-` on BOTH sides, so it cannot see a LaTeX form
    // that emits the text notation's own characters. KaTeX renders several of them, which makes the
    // defect invisible on screen and real in the file: a figure's caption, a copied formula and any
    // other renderer all want `-`, `\pi`, `\sqrt{2}`, `\cdot`, `^{2}`.
    const UNICODE_MATHS = /[−·√π⁰¹²³⁴⁵⁶⁷⁸⁹⁻∞Σ∮]/;
    const offending = [...UNITS, ...CORPUS]
      .filter((p) => UNICODE_MATHS.test(p.tex))
      .map((p) => `${p.where}: ${p.tex}`);
    expect(offending).toEqual([]);
  });

  it("brackets a compound coefficient before a product, in BOTH notations", () => {
    // The bug the text formatter's own comment records — appending `·e^{β}` to `a − b` prints a
    // DIFFERENT FORMULA, one in which only the last term is multiplied — is a bug in LaTeX too, and
    // the canonical comparison cannot see it because it strips every bracket. So the two shapes are
    // pinned outright, on the value that found it (B3's `π√2/4 − πi√2/4`).
    const coefficient = SqrtExt.of(Gauss.ZERO, gauss([1n, 4n], [-1n, 4n]), 2n);
    const sum = ExpSum.of(coefficient, Exponent.piTimes(gauss([0n, 1n], [1n, 4n])));
    expect(formatPiExpSum(sum, TEXT)).toBe("(π√2/4 − iπ√2/4)·e^(iπ/4)");
    expect(formatPiExpSum(sum, LATEX)).toBe(
      "\\left(\\frac{\\pi\\sqrt{2}}{4} - \\frac{i\\pi\\sqrt{2}}{4}\\right) \\cdot e^{\\frac{i\\pi}{4}}",
    );
  });

  it("says the same thing on every value the 28 records solve to", () => {
    const pairs = CORPUS;
    expect(pairs.length).toBeGreaterThan(50);
    const wrong = pairs
      .filter((p) => canonical(p.text) !== canonical(p.tex))
      .map((p) => `${p.where}\n     text ${p.text}\n     tex  ${p.tex}`);
    expect(wrong).toEqual([]);
  });

  it("renders in KaTeX on every value the 28 records solve to", () => {
    const refused = CORPUS
      .map((p) => {
        const why = rendersInKatex(p.tex);
        return why === null ? null : `${p.where}: ${p.tex} — ${why}`;
      })
      .filter((x): x is string => x !== null);
    expect(refused).toEqual([]);
  });
});
