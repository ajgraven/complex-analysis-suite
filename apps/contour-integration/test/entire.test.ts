// **ENTIRETY IS A DECISION — and a refusal is UNDECIDED, not a claim.**
//
// The tests below are in two halves on purpose. The first pins what is decided; the second pins
// that specific things are NOT decided, including two that are genuinely entire (`sin z / z`,
// `1/(1+z²) + z²/(1+z²)`). A sufficient condition that quietly widened into a necessary one would
// be the worst possible failure here, because a `false` would then read as "f has a pole" — and
// E3's argument is built on the opposite reading.
import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr";
import { decideEntire } from "../src/kernel/entire.js";
import { makeComplexFn } from "@cas/expr";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger } from "../src/engine/ledger.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import type { Cx } from "../src/kernel/geom.js";

const decide = (src: string) => decideEntire(parse(src));

/** The CATCH row about residues, for an integrand on the sandbox's default circle. */
function catchRow(src: string) {
  const ast = parse(src);
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const contour = circleTemplate([0, 0], 1.5);
  const pieces = resolveAll(contour);
  const poles = findPoles(ast);
  const integral = integrateContour(f, pieces, poles.poles.map((p) => ({ at: p.at, order: p.order })));
  const theorem = applyResidueTheorem(poles, integral);
  const r = evaluateLedger({ ast, pieces, spec: contour.pieces, poles, integral, theorem });
  return r.rows.filter((x) => x.constraint === "CATCH").find((x) => x.claim.includes("residue"));
}
const why = (src: string): string => {
  const d = decide(src);
  if (d.entire) throw new Error(`expected ${src} to be undecided`);
  return d.reason;
};

describe("what is decided entire", () => {
  it("decides the tier-E and tier-F integrands the records need", () => {
    // E3's, F2's, and the ∫₀^∞ e^{−xⁿ}dx family's.
    for (const src of ["exp(-z^2 + i*1.7*z)", "exp(-z^2)", "exp(i*z^2)", "exp(-z^3)"]) {
      expect(decide(src).entire).toBe(true);
    }
  });

  it("decides polynomials, and compositions of the five entire functions", () => {
    for (const src of [
      "1",
      "z",
      "z^3 - 2*z + i",
      "sin(z)",
      "cos(z)*cosh(z)",
      "sinh(exp(z))",
      "exp(sin(z^2)) + cos(z)^4",
      "-z^2",
    ]) {
      expect(decide(src).entire).toBe(true);
    }
  });

  it("allows division by a constant the exact reader sees is non-zero", () => {
    // Refusing `z/2` would be pedantry; refusing `z/b` for an unbound b is honest.
    expect(decide("z/2").entire).toBe(true);
    expect(decide("exp(-z^2)/(1+i)").entire).toBe(true);
    expect(why("z/b")).toMatch(/not a constant the exact reader can see is non-zero/);
    // `z/0` is not a function at all, and "non-zero" is the word doing that work. The literal `0`
    // is caught by `degree() === 0` alone (the zero polynomial has degree −1), so the case that
    // actually exercises the `isZero` guard is a denominator that IS zero without being written `0`.
    expect(why("z/0")).toMatch(/non-zero/);
    expect(why("z/(1-1)")).toMatch(/non-zero/);
  });

  it("checks BOTH sides of a product and a sum", () => {
    // A walk that recursed only on the left would wave these through.
    expect(why("z*tan(z)")).toMatch(/which has poles/);
    expect(why("exp(z) + sqrt(z)")).toMatch(/which has branch points/);
    expect(why("sqrt(z) - exp(z)")).toMatch(/which has branch points/);
  });

  it("takes e^w as exp(w), because that base fixes no branch", () => {
    expect(decide("e^(i*z)").entire).toBe(true);
    // Any other constant base does fix one, and the app declares determinations rather than
    // assuming them — so it refuses and names the rewrite.
    expect(why("2^z")).toMatch(/determination of log c/);
    // `2` is a `num`, not a `const`, so `2^z` would refuse even if the base check read only "is it a
    // constant". The named constants are the case that separates them — and `π^z` is as entire as
    // `e^z` is, once you fix a determination of log π, which is exactly the point.
    expect(why("pi^z")).toMatch(/determination of log c/);
    expect(why("i^z")).toMatch(/determination of log c/);
  });
});

describe("what is NOT decided, and why that is not a claim", () => {
  it("refuses a quotient, INCLUDING two that are entire", () => {
    // This is the point of the whole module's contract. `sin z / z` is entire (removable at 0) and
    // the second is the constant 1; both refuse, and neither refusal says anything about poles.
    expect(why("sin(z)/z")).toMatch(/A quotient CAN be entire/);
    expect(why("1/(1+z^2) + z^2/(1+z^2)")).toMatch(/pole question itself/);
    expect(why("1/(1 + exp(z))")).toMatch(/quotient/);
  });

  it("separates poles, branch points and non-holomorphy into three different sentences", () => {
    expect(why("tan(z)")).toMatch(/which has poles/);
    expect(why("gamma(z)")).toMatch(/which has poles/);
    expect(why("sqrt(z)")).toMatch(/which has branch points/);
    expect(why("log(z)")).toMatch(/which has branch points/);
    // Not a singularity question at all — filing it under one would be the wrong heading.
    expect(why("conjugate(z)")).toMatch(/not holomorphic anywhere/);
    expect(why("abs(z)")).toMatch(/not holomorphic anywhere/);
  });

  it("refuses a fractional or negative power by name", () => {
    expect(why("z^0.5")).toMatch(/branch point/);
    // `z^(-1)` parses as a NEGATION of 1, not a negative literal, so it refuses for a different
    // reason than the `>= 0` guard — and a sweep found that the guard itself was therefore
    // untested. A negative numeric literal reaches it only from a hand-built node.
    expect(why("z^(-1)")).toMatch(/non-negative integer/);
    const d = decideEntire({
      kind: "arith",
      op: "^",
      left: { kind: "var", name: "z" },
      right: { kind: "num", value: -1 },
    });
    expect(d.entire).toBe(false);
    expect(!d.entire && d.reason).toMatch(/non-negative integer/);
  });

  it("refuses an unknown function rather than assuming it is harmless", () => {
    // `@cas/expr`'s parser rejects a name its table does not carry, so this branch is unreachable
    // from typed input and the node is built by hand — which is legitimate, since the module's
    // contract is about a `Node` and `declaredRun.ts` builds those without the parser.
    const d = decideEntire({ kind: "call", name: "erf", args: [{ kind: "var", name: "z" }] });
    expect(d.entire).toBe(false);
    expect(!d.entire && d.reason).toMatch(/not in the decided set/);
  });

  it("refuses a two-argument call", () => {
    expect(why("arctan2(z, 1)")).toMatch(/2 arguments/);
  });
});

describe("findPoles tells an empty singular set from an unread one", () => {
  it("reports e^{−z²+ibz} as entire, with an exact empty residue sum", () => {
    const p = findPoles(parse("exp(-z^2 + i*1.7*z)"));
    expect(p.entire).toBe(true);
    expect(p.poles).toEqual([]);
    expect(p.exactlyComplete).toBe(true);
    expect(p.exactResidueSum?.text).toBe("0");
    expect(p.certificates[0].level).toBe("=");
  });

  it("reports 1/cosh(z) as UNREAD — the same empty pole list, a different claim", () => {
    // Before M5.3a these two reports were identical in every field a consumer reads.
    const p = findPoles(parse("1/cosh(z)"));
    expect(p.entire).toBeUndefined();
    expect(p.poles).toEqual([]);
    expect(p.exactlyComplete).toBe(false);
    // BOTH certificates are `?`, not `⚠`: nothing is ill-posed, the app simply did not answer. A
    // `⚠` absorbs in the meet and would drive every unread integrand's verdict to "no value".
    expect(p.certificates.every((c) => c.level === "?")).toBe(true);
    expect(p.certificates.length).toBe(2);
  });

  it("says WHY nothing was decided, beside saying that nothing was", () => {
    const p = findPoles(parse("1/(1 + exp(z))"));
    const undecided = p.certificates.find((c) => c.claim.includes("entire"));
    expect(undecided?.level).toBe("?");
    expect(undecided?.method).toMatch(/quotient/);
  });

  it("leaves every rational report untouched — the decision is a last resort", () => {
    const p = findPoles(parse("1/(1+z^2)"));
    expect(p.entire).toBeUndefined();
    expect(p.poles.length).toBe(2);
    expect(p.exactlyComplete).toBe(true);
  });

  it("marks C2's removable-singularity report entire too, which it always was", () => {
    // C2's CONTOUR integrand is the auxiliary `(1 − e^{iz} + iz)/z²`, not the posed `(1 − cos x)/x²`
    // — the exponential-sum reader sees the first and nothing sees the second, which is why the
    // record carries the substitution rather than hoping.
    const p = findPoles(parse("(1 - exp(i*z) + i*z)/z^2"));
    expect(p.entire).toBe(true);
    expect(p.exactResidueSum?.text).toBe("0");
  });
});

describe("the ledger's CATCH row stops inventing a reason", () => {
  it("names WHICH difficulty it hit — an unread f, or a pole outside ℚ(i)(√d)", () => {
    // For `1/cosh z` the engine found no pole at all, so "some poles are not expressible in
    // ℚ(i)(√d)" describes a difficulty it never reached. A browser pass found this printed under
    // CATCH, and the string had been unconditional since the row was written.
    const unread = catchRow("1/cosh(z)");
    expect(unread?.evidence.level).toBe("?");
    expect(unread?.evidence.method).toMatch(/could not be read exactly/);

    const inexact = catchRow("1/(1 + z^5 + z)");
    expect(inexact?.evidence.method).toMatch(/ℚ\(i\)\(√d\)/);
  });

  it("is SATISFIED for an entire integrand — the empty meet is the lattice top", () => {
    // E3's own rule, and `tier-efg.md` warns that getting it wrong ("no evidence" read as "?") is
    // the single most likely way to break that record.
    const row = catchRow("exp(-z^2 + i*z)");
    expect(row?.status).toBe("satisfied");
    expect(row?.evidence.level).toBe("=");
  });
});
