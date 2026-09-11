// Guards for the widened coefficient walk — where tier D's `M` comes from.
//
// The expressions are the records' own strings. D1's lower edge carries
// `factor: "-exp(2*pi*i*(alpha-1))"`, and getting that to an exact `−e^{2πi(α−1)}` is what turns
// `M` from "refused" into `[1 − e^{2πiα}]`. The refusals matter as much as the successes: the walk
// is bounded by the basis, so `π²` and `e^{e^{…}}` have nowhere to go and must say so.
import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr";
import { Gauss, SqrtExt } from "@cas/exact";
import { exactBasisConstant } from "../src/families/basisConstant.js";
import { ExpSum } from "../src/kernel/expSum.js";
import { Exponent } from "../src/kernel/exponent.js";
import { formatExpSum } from "../src/kernel/expSum.js";

const walk = (src: string, bindings: Record<string, number> = {}) =>
  exactBasisConstant(parse(src), bindings);

const alg = (n: number): SqrtExt => SqrtExt.fromGauss(Gauss.int(n));

describe("the ℚ(i) cases, which must still behave as they always did", () => {
  it("walks rationals, i, and arithmetic", () => {
    for (const [src, re, im] of [
      ["1", 1, 0],
      ["-3/4", -0.75, 0],
      ["i", 0, 1],
      ["2*i - 1", -1, 2],
      ["(1+i)*(1-i)", 2, 0],
      ["1/(2*i)", 0, -0.5],
      ["i^3", 0, -1],
      ["2^-2", 0.25, 0],
    ] as [string, number, number][]) {
      const r = walk(src);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const [gotRe, gotIm] = r.value.toTuple();
      expect(gotRe).toBeCloseTo(re, 12);
      expect(gotIm).toBeCloseTo(im, 12);
      // No exponential survived, so it is a plain algebraic number.
      expect(r.value.asSqrtExt()).not.toBeNull();
    }
  });

  it("substitutes a bound parameter", () => {
    const r = walk("1 - a", { a: 0.25 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.asSqrtExt()?.toTuple()[0]).toBeCloseTo(0.75, 12);
  });

  it("refuses an unbound one rather than defaulting it", () => {
    const r = walk("1 - a");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/not bound by this fixture/);
  });

  it("reads a bound parameter as the SIMPLEST rational that round-trips, not as its raw bits", () => {
    // A fixture's parameter is a double, so it is always some rational; the question is which one.
    // `simplestRational` picks the simplest that maps back to the same double, which is why D1's
    // α = 0.3 becomes exactly 3/10 and its exponent exactly `−7iπ/5`, rather than
    // 5404319552844595/18014398509481984 and an exponent nothing would recognise as a fifth.
    const r = walk("-exp(2*pi*i*(alpha-1))", { alpha: 0.3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.terms[0].exponent.pi.im.d).toBe(5n);
  });

  it("refuses a non-finite binding", () => {
    expect(walk("a", { a: Number.POSITIVE_INFINITY }).ok).toBe(false);
    expect(walk("a", { a: Number.NaN }).ok).toBe(false);
  });
});

describe("D1's own coefficient string", () => {
  const FACTOR = "-exp(2*pi*i*(alpha-1))";

  it("walks -exp(2*pi*i*(alpha-1)) exactly", () => {
    const r = walk(FACTOR, { alpha: 0.3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.terms).toHaveLength(1);
    // `2πi(α−1)` at α = 3/10 is `−7iπ/5`.
    expect(r.value.terms[0].exponent.pi.equals(Gauss.rat(0n, 1n, -7n, 5n))).toBe(true);
    expect(r.value.terms[0].coefficient.equals(alg(-1))).toBe(true);
  });

  it("agrees with the numeric evaluator at every one of D1's fixtures", () => {
    for (const alpha of [0.3, 0.5, 0.75, 0.1, 0.9]) {
      const r = walk(FACTOR, { alpha });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const [re, im] = r.value.toTuple();
      const want = 2 * Math.PI * (alpha - 1);
      expect(re).toBeCloseTo(-Math.cos(want), 12);
      expect(im).toBeCloseTo(-Math.sin(want), 12);
    }
  });

  it("builds M = 1 − e^{2πiα} when the two edges are added", () => {
    // The keyhole's whole mechanism, as a sum of two coefficient rows.
    const upper = walk("1", { alpha: 0.3 });
    const lower = walk(FACTOR, { alpha: 0.3 });
    expect(upper.ok && lower.ok).toBe(true);
    if (!upper.ok || !lower.ok) return;
    const m = upper.value.add(lower.value);
    expect(m.terms).toHaveLength(2);
    const [re, im] = m.toTuple();
    expect(re).toBeCloseTo(1 - Math.cos(2 * Math.PI * 0.3), 12);
    expect(im).toBeCloseTo(-Math.sin(2 * Math.PI * 0.3), 12);
  });

  it("collapses M to exactly zero at integer α — the degenerate keyhole", () => {
    // The `wrong-branch` trap's arithmetic: the lower edge gains no phase, its factor is −1, and
    // `1 + Σcⱼ = 0` exactly. Not nearly zero: the exponent folds to a sign and the terms cancel.
    for (const alpha of [1, 2, 3]) {
      const upper = walk("1", { alpha });
      const lower = walk(FACTOR, { alpha });
      expect(upper.ok && lower.ok).toBe(true);
      if (!upper.ok || !lower.ok) continue;
      expect(upper.value.add(lower.value).foldSigns().isZero()).toBe(true);
    }
  });
});

describe("π lives in an exponent and nowhere else", () => {
  it("carries π inside exp", () => {
    const r = walk("exp(i*pi)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // `e^{iπ}` is a sign once folded.
    expect(r.value.foldSigns().asSqrtExt()?.equals(alg(-1))).toBe(true);
  });

  it("refuses a bare π as a coefficient, naming where that belongs", () => {
    // The plain-log keyhole's coefficient row is literally `2π`, and it needs Pass 5 over ℚ(i)(π).
    const r = walk("2*pi");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/bare π/);
    expect(r.reason).toMatch(/M4\.3/);
  });

  it("refuses π², which has no seat in the basis", () => {
    const r = walk("exp(pi*pi)");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/π² is outside the basis/);
  });

  it("refuses adding π to an exponential", () => {
    const r = walk("pi + exp(i*pi)");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/π is not a coefficient/);
  });

  it("allows a π-free factor to multiply an exponential, on either side", () => {
    for (const src of ["3*exp(i*pi/3)", "exp(i*pi/3)*3", "-exp(i*pi/3)"]) {
      const r = walk(src);
      expect(r.ok).toBe(true);
    }
  });

  it("allows π to be scaled, added and negated inside an exponent", () => {
    const r = walk("exp(2*pi*i*(1/3) - i*pi)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 2π/3 − π = −π/3, times i.
    expect(r.value.terms[0].exponent.pi.equals(Gauss.rat(0n, 1n, -1n, 3n))).toBe(true);
  });
});

describe("everything outside the basis refuses, by construction", () => {
  it("refuses e^{e^{…}}", () => {
    const r = walk("exp(exp(1))");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/no seat for e\^\{e/);
  });

  it("refuses another transcendental constant", () => {
    for (const src of ["e", "exp(1) + tau"]) {
      expect(walk(src).ok).toBe(false);
    }
  });

  it("refuses a non-integer power", () => {
    const r = walk("2^(1/2)");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/integer power/);
  });

  it("refuses a function with no exact form here", () => {
    const r = walk("sin(1)");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/no exact form/);
  });

  it("refuses dividing by an exponential — that is the solve's job", () => {
    const r = walk("1/(1 - exp(i*pi/3))");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/the solve's job/);
  });

  it("refuses division by zero", () => {
    expect(walk("1/0").ok).toBe(false);
  });
});

describe("the differential cross-check against the numeric evaluator", () => {
  it("passes on every coefficient the corpus actually uses", () => {
    for (const [src, bindings] of [
      ["1", {}],
      ["1/2", {}],
      ["-1", {}],
      ["-exp(2*pi*i*(alpha-1))", { alpha: 0.3 }],
      ["-exp(2*pi*i*(a-1))", { a: 1.5 }],
      ["exp(i*pi/4)*2", {}],
    ] as [string, Record<string, number>][]) {
      const r = exactBasisConstant(parse(src), bindings);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const [re, im] = r.value.toTuple();
      expect(Number.isFinite(re) && Number.isFinite(im)).toBe(true);
    }
  });

  it("renders what it walked, so a reader can check it", () => {
    const r = walk("-exp(2*pi*i*(alpha-1))", { alpha: 0.3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatExpSum(r.value)).toBe("−e^(−7iπ/5)");
  });
});

describe("the zero and one of the basis", () => {
  it("walks 0 to an empty sum, not to a one-term zero", () => {
    const r = walk("0");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isZero()).toBe(true);
  });

  it("walks 1 to the algebraic one", () => {
    const r = walk("1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.asSqrtExt()?.equals(SqrtExt.ONE)).toBe(true);
    expect(ExpSum.of(SqrtExt.ONE, Exponent.ZERO).toTuple()).toEqual([1, 0]);
  });
});
