import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { parse } from "@cas/expr";
import { simplestRational, toExactRational } from "../src/kernel/exactRational.js";
import { findPoles } from "../src/kernel/poles.js";
import {
  exactPoleAt,
  exactResidues,
  gaussToCx,
  residueSum,
  weightedResidueSum,
} from "../src/kernel/exactResidue.js";
import { rootsOfQiPoly } from "./helpers/rootsOfQiPoly.js";


const g = (re: number, im = 0): Gauss => new Gauss(Frac.of(BigInt(re)), Frac.of(BigInt(im)));
const half = new Gauss(Frac.of(1n, 2n), Frac.ZERO);
const exact = (src: string) => {
  const r = toExactRational(parse(src));
  if (!r.ok) throw new Error(`expected an exact rational, got: ${r.reason}`);
  return r.value;
};

describe("simplestRational", () => {
  it("recovers what the user meant, not what the double literally is", () => {
    // 0.1 as a double is 3602879701896397/2^55, which is exact and useless. The simplest rational
    // that round-trips to the same double is 1/10, which is what someone typing `0.1` meant.
    expect(simplestRational(0.1).equals(Frac.of(1n, 10n))).toBe(true);
    expect(simplestRational(0.5).equals(Frac.of(1n, 2n))).toBe(true);
    expect(simplestRational(-2.25).equals(Frac.of(-9n, 4n))).toBe(true);
    expect(simplestRational(3).equals(Frac.of(3n))).toBe(true);
  });

  it("round-trips exactly for every value it returns", () => {
    for (const x of [0.1, 0.2, 0.3, 1 / 3, 1 / 7, Math.PI, -1234.5, 1e-5, 6.02e23]) {
      expect(simplestRational(x).toNumber()).toBe(x);
    }
  });
});

describe("toExactRational", () => {
  it("reads a rational integrand exactly", () => {
    const { num, den } = exact("(3+4i)/(z^2+1)");
    expect(num.equals(QiPoly.constant(g(3, 4)))).toBe(true);
    expect(den.equals(QiPoly.fromCoeffs([g(1), g(0), g(1)]))).toBe(true);
  });

  it("handles negative integer powers", () => {
    const { den } = exact("1/(z-1)^3");
    expect(den.degree()).toBe(3);
    expect(den.eval(g(1)).isZero()).toBe(true);
  });

  it("REFUSES rather than rounding what it cannot represent", () => {
    // The whole point: @cas/expr's own fToRational would round these into floating coefficients,
    // and an exact residue computed from a rounded coefficient is an estimate wearing a decision's
    // clothes.
    for (const [src, pattern] of [
      ["pi/z", /not a Gaussian rational/],
      ["sin(z)/z", /not a rational function/],
      ["z^(1/2)", /constant integer exponent/],
      ["exp(1/z)", /not a rational function/],
      ["1/(z-c)", /free variable/],
    ] as const) {
      const r = toExactRational(parse(src));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(pattern);
    }
  });

  it("does NOT reduce to lowest terms, so a removable singularity stays visible", () => {
    const { num, den } = exact("z/(z*(z-2))");
    expect(den.degree()).toBe(2);
    expect(num.degree()).toBe(1);
  });
});

describe("exactPoleAt", () => {
  const at = (src: string, a: Gauss) => {
    const { num, den } = exact(src);
    return exactPoleAt(num, den, a);
  };

  it("answers `f ≡ 0` with null rather than throwing on the zero polynomial", () => {
    // The guard used to sit BELOW the multiplicity count, which throws on the zero polynomial — so
    // it protected nothing, and `exactPoleAt(QiPoly.zero(), …)` came back
    // `THREW: multiplicityAt: the zero polynomial`. No live path reaches it (`cancelCommon` removes
    // the whole denominator first), which is why nothing noticed.
    expect(exactPoleAt(QiPoly.zero(), QiPoly.fromCoeffs([g(0), g(1)]), g(0))).toBeNull();
    for (const src of ["0/z", "(z-z)/z", "0/(z^2+1)", "(z*0)/(z-1)^2"]) {
      expect(findPoles(parse(src)).poles, src).toHaveLength(0);
    }
  });

  it("gives Res(1/z, 0) = 1", () => {
    expect(at("1/z", g(0))?.residue.equals(g(1))).toBe(true);
  });

  it("gives Res(1/(1+z²), i) = −i/2 — the Cauchy kernel's residue, exactly", () => {
    const p = at("1/(1+z^2)", g(0, 1));
    expect(p?.order).toBe(1);
    expect(p?.residue.equals(new Gauss(Frac.ZERO, Frac.of(-1n, 2n)))).toBe(true);
    // 2πi·Res = 2πi·(−i/2) = π, which is gallery entry A5's answer.
    expect(at("1/(1+z^2)", g(0, -1))?.residue.equals(new Gauss(Frac.ZERO, half.re))).toBe(true);
  });

  it("handles an order-5 pole — where the derivative formula would be explosive", () => {
    // f = 1/(z−1)^5 has Res = 0; f = z^4/(z−1)^5 has Res = 1 (the w⁴ coefficient of (w+1)⁴).
    expect(at("1/(z-1)^5", g(1))?.order).toBe(5);
    expect(at("1/(z-1)^5", g(1))?.residue.isZero()).toBe(true);
    expect(at("z^4/(z-1)^5", g(1))?.residue.equals(g(1))).toBe(true);
    // (z+1)^4/(z−1)^5: shift w = z−1 ⇒ (w+2)^4/w^5, so Res is the w⁴ coefficient of (w+2)⁴ = 1.
    expect(at("(z+1)^4/(z-1)^5", g(1))?.residue.equals(g(1))).toBe(true);
    // z^5/(z−1)^5: (w+1)^5/w^5, w⁴ coefficient of (w+1)^5 is C(5,4) = 5.
    expect(at("z^5/(z-1)^5", g(1))?.residue.equals(g(5))).toBe(true);
  });

  it("returns the whole principal part, not just the residue", () => {
    // 1/(z−1)² has principal part 1·(z−1)^{-2}, so c_{-2} = 1 and c_{-1} = 0.
    const p = at("1/(z-1)^2", g(1));
    expect(p?.principalPart).toHaveLength(2);
    expect(p?.principalPart[0].equals(g(1))).toBe(true);
    expect(p?.principalPart[1].isZero()).toBe(true);
  });

  it("returns null at a removable singularity and at a non-pole", () => {
    expect(at("z/(z*(z-2))", g(0))).toBeNull(); // cancels
    expect(at("1/(z-1)", g(5))).toBeNull(); // not a root at all
  });

  it("agrees with a numeric residue from a Cauchy circle", () => {
    // An independent check of the whole series route against the definition Res = (1/2πi)∮f dz.
    for (const [src, a, r] of [
      ["1/(1+z^2)", g(0, 1), 1e-2],
      ["z/(z^2+2*z+2)", g(-1, 1), 1e-2],
      ["(3+4i)/(z^3-1)", g(1), 1e-2],
      ["z^5/(z-1)^5", g(1), 0.4],
    ] as const) {
      const { num, den } = exact(src);
      const p = exactPoleAt(num, den, a);
      expect(p).not.toBeNull();
      if (!p) continue;
      const numeric = numericResidue(num, den, gaussToCx(a), r);
      const e = gaussToCx(p.residue);
      expect(Math.hypot(numeric[0] - e[0], numeric[1] - e[1])).toBeLessThan(1e-6);
    }
  });

  it("is right where the small-circle numeric residue is badly wrong", () => {
    // The radius trade-off (research 04 §3.1): on a circle of radius r about a pole of order m the
    // integrand is O(r^{-m}) while the answer is O(r^{1-m}), so a small radius cancels m orders of
    // magnitude away. At r = 1e-2 an order-5 pole loses ~9 digits and the numeric estimate is not
    // merely imprecise, it is wrong in the first digit — while the exact value is 5 and stays 5.
    const { num, den } = exact("z^5/(z-1)^5");
    const p = exactPoleAt(num, den, g(1));
    expect(p?.residue.equals(g(5))).toBe(true);

    const bad = numericResidue(num, den, [1, 0], 1e-2);
    expect(Math.hypot(bad[0] - 5, bad[1])).toBeGreaterThan(1);

    const good = numericResidue(num, den, [1, 0], 0.4);
    expect(Math.hypot(good[0] - 5, good[1])).toBeLessThan(1e-8);
  });
});

/** Res = (1/2πi)∮ f dz on a circle of radius `r` about `centre`, by the periodic trapezoidal rule. */
function numericResidue(
  num: QiPoly,
  den: QiPoly,
  centre: readonly [number, number],
  r: number,
  N = 4096,
): [number, number] {
  let re = 0;
  let im = 0;
  for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N;
    const z: [number, number] = [centre[0] + r * Math.cos(th), centre[1] + r * Math.sin(th)];
    const fv = evalRatAt(num, den, z);
    const dzRe = -r * Math.sin(th) * ((2 * Math.PI) / N);
    const dzIm = r * Math.cos(th) * ((2 * Math.PI) / N);
    re += fv[0] * dzRe - fv[1] * dzIm;
    im += fv[0] * dzIm + fv[1] * dzRe;
  }
  // Dividing S = Sre + i·Sim by 2πi gives (Sim − i·Sre)/2π.
  return [im / (2 * Math.PI), -re / (2 * Math.PI)];
}

/** Evaluate num/den at a floating point, via the exact coefficients. */
function evalRatAt(num: QiPoly, den: QiPoly, z: readonly [number, number]): [number, number] {
  const horner = (p: QiPoly): [number, number] => {
    let re = 0;
    let im = 0;
    for (let k = p.degree(); k >= 0; k--) {
      const c = p.coeff(k).toTuple();
      const nr = re * z[0] - im * z[1] + c[0];
      im = re * z[1] + im * z[0] + c[1];
      re = nr;
    }
    return [re, im];
  };
  const n = horner(num);
  const d = horner(den);
  const mag = d[0] * d[0] + d[1] * d[1];
  return [(n[0] * d[0] + n[1] * d[1]) / mag, (n[1] * d[0] - n[0] * d[1]) / mag];
}

describe("exactResidues", () => {
  // The root finder is injected; here it is the app's own numeric pole locator, applied to whatever
  // polynomial exactResidues hands it (one Yun factor at a time).
  const report = (src: string) => {
    const { num, den } = exact(src);
    return exactResidues(num, den, (factor) => rootsOfQiPoly(factor));
  };

  it("pins every pole of a Gaussian-rational integrand, and says so", () => {
    for (const src of ["1/z", "1/(1+z^2)", "1/(z-1)^2", "z/(z^2+2*z+2)", "1/(z^2-1)"]) {
      const r = report(src);
      expect(r.complete).toBe(true);
      expect(r.poles.length).toBeGreaterThan(0);
    }
  });

  it("is NOT complete when a pole is algebraic — the honest outcome, not a shortfall", () => {
    // z⁴ + 1 has roots e^{±iπ/4}, e^{±3iπ/4}: irrational, so no exact ℚ(i) residue in this pass.
    // PLAN.md §3.3's ladder is where those get named.
    const r = report("1/(1+z^4)");
    expect(r.complete).toBe(false);
    expect(r.poles).toHaveLength(0);
  });

  it("reports the removable singularity it cancelled", () => {
    const r = report("z/(z*(z-2))");
    expect(r.removableDegree).toBe(1);
    expect(r.complete).toBe(true);
    expect(r.poles.map((p) => gaussToCx(p.at))).toEqual([[2, 0]]);
  });

  it("has total residue zero when deg den ≥ deg num + 2 — a free cross-check", () => {
    // The Euler–Jacobi identity, and a property of RATIONALITY rather than of the pole set:
    // research 03 §14 records that the same denominator with e^{iz} on top fails it.
    for (const src of [
      "1/(1+z^2)",
      "1/(z^2-1)",
      "z/((z-1)*(z+2)*(z-3))",
      "1/(z*(z-1)*(z-2))",
    ]) {
      const r = report(src);
      expect(r.complete).toBe(true);
      expect(residueSum(r.poles).isZero()).toBe(true);
    }
  });

  it("does not have total residue zero when the degree gap is only one", () => {
    const r = report("z/(z^2-1)");
    expect(r.complete).toBe(true);
    expect(residueSum(r.poles).equals(g(1))).toBe(true);
  });
});

describe("weightedResidueSum", () => {
  it("weights each residue by its winding number, exactly", () => {
    const { num, den } = exact("1/(1+z^2)");
    const r = exactResidues(num, den, (factor) => rootsOfQiPoly(factor));
    // A contour enclosing only +i, as the semicircle in the upper half-plane does.
    const sum = weightedResidueSum(r.poles, (a) => (a.im.toNumber() > 0 ? 1 : 0));
    expect(sum.equals(new Gauss(Frac.ZERO, Frac.of(-1n, 2n)))).toBe(true);
    // 2πi · (−i/2) = π — gallery A5, from exact arithmetic end to end.
    const [re, im] = sum.toTuple();
    expect(-2 * Math.PI * im).toBeCloseTo(Math.PI, 12);
    expect(re).toBe(0);
  });
});

describe("a literal no arithmetic here should carry", () => {
  it("refuses a subnormal BY NAME instead of throwing a RangeError out of findPoles", () => {
    // `Number.isFinite(5e-324)` is true, so the continued fraction used to enter its loop, overflow
    // `1/frac` to `Infinity` and throw out of `BigInt(Math.floor(Infinity))` — measured,
    // `findPoles(parse("1/(z - 5e-324)"))` came back `THREW RangeError The number Infinity cannot be
    // converted to a BigInt`. A sandbox user typing it got a crash, not a refusal.
    const r = toExactRational(parse("1/(z - 5e-324)"));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/needs 1075 bits/);
    // …and the crash is gone from the caller that suffered it: `findPoles` falls through to the
    // numeric path and returns a report.
    expect(() => findPoles(parse("1/(z - 5e-324)"))).not.toThrow();
  });

  it("refuses a literal whose simplest rational is legitimate and enormous", () => {
    // Not a crash — `simplestRational` genuinely returns the simplest rational that round-trips,
    // and for `1e-300` that has a 997-bit denominator which would then multiply through every
    // `QiPoly` product downstream. `MAX_DEGREE` bounds a polynomial's LENGTH; nothing bounded one
    // entry. `1e-310` is the subnormal version of the same thing, at 1075 bits.
    expect(toExactRational(parse("1/(z - 1e-300)")).ok).toBe(false);
    const r = toExactRational(parse("1/(z - 1e-310)"));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/over the 256-bit limit/);
  });

  it("still reads every literal a reader plausibly types", () => {
    // The anti-vacuity half: the guard is 77 digits wide, and the widest literal in the corpus or
    // off a dragged handle is under 60 bits.
    for (const src of ["1/(z - 0.1)", "1/(z - 1e-20)", "(6.02e23)/(z^2 + 1)", "1/(z - 1234.56789)"]) {
      expect(toExactRational(parse(src)).ok, src).toBe(true);
    }
  });

  it("reports a THROW as a refusal rather than letting it escape", () => {
    // The other half of the same rule, and the one path that still raises something which is NOT a
    // `Refusal`: `1e999` is `Infinity` as a double, so `simplestRational` throws its own
    // `non-finite input` Error. The caller's contract is "refuse, with a reason, and fall back to
    // the numeric path", whatever the arithmetic raises.
    const r = toExactRational(parse("1/(z - 1e999)"));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/could not be read exactly/);
    expect(!r.ok && r.reason).toMatch(/non-finite/);
  });
});

describe("simplestRational on a subnormal", () => {
  it("falls through to the dyadic value the docstring promises, rather than overflowing", () => {
    const f = simplestRational(5e-324);
    expect(f.toNumber()).toBe(5e-324);
    expect(f.d).toBe(1n << 1074n);
  });
});
