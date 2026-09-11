import { describe, expect, it } from "vitest";
import { Frac, QiPoly } from "@cas/exact";
import { parse } from "@cas/expr";
import { mayReportValue, assembleVerdict } from "@cas/rigor";
import {
  coefficientUpperBound,
  denominatorLowerBound,
  jordanArcBound,
  maxModulusBound,
  mlArcBound,
} from "../src/kernel/bounds/mlRational.js";
import { toExactRational } from "../src/kernel/exactRational.js";

const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const exact = (src: string) => {
  const r = toExactRational(parse(src));
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

/** The true maximum of |P/Q| on |z| = R, sampled densely. The bound must dominate every sample. */
function sampledMax(num: QiPoly, den: QiPoly, R: number, samples = 4000): number {
  const horner = (p: QiPoly, z: [number, number]): [number, number] => {
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
  let best = 0;
  for (let k = 0; k < samples; k++) {
    const th = (2 * Math.PI * k) / samples;
    const z: [number, number] = [R * Math.cos(th), R * Math.sin(th)];
    const n = horner(num, z);
    const d = horner(den, z);
    best = Math.max(best, Math.hypot(n[0], n[1]) / Math.hypot(d[0], d[1]));
  }
  return best;
}

describe("the coefficient bounds are SOUND", () => {
  it("dominates the true max of |f| on the circle, for every corpus entry", () => {
    // The property the whole certificate rests on. Sampling cannot prove a bound, but it can refute
    // one, and a bound that fails here is not a bound.
    for (const src of [
      "1/(1+z^2)",
      "1/(1+z^4)",
      "z/(z^2+2*z+2)",
      "(3+4i)/(z^3-1)",
      "(z^2+1)/(z^4+3*z+7)",
      "1/(z-1)^3",
    ]) {
      const { num, den } = exact(src);
      for (const R of [3, 5, 10, 50]) {
        const certified = maxModulusBound(num, den, q(R));
        // Null below the Cauchy root bound is correct, not a gap: (z−1)³ has that bound at 4, so at
        // R = 3 the reverse triangle inequality genuinely gives nothing. A large R always works,
        // which the next assertion pins.
        if (!certified) {
          expect(R).toBeLessThan(5);
          continue;
        }
        // The slack is for the SAMPLER, not the bound. On 1/(1+z⁴) at R = 3 the certified value is
        // exactly 1/80 and the true maximum is exactly 1/80 — the bound is tight — so the sampler's
        // own float Horner overshoots it by 4e-18. A relative 1e-12 is far below the factor-of-R
        // error the earlier bug produced, so this still bites hard.
        expect(certified.toNumber()).toBeGreaterThanOrEqual(sampledMax(num, den, R) * (1 - 1e-12));
      }
    }
  });

  it("always produces a bound once R is comfortably past the Cauchy root bound", () => {
    for (const src of ["1/(1+z^2)", "1/(1+z^4)", "1/(z-1)^3", "(z^2+1)/(z^4+3*z+7)"]) {
      const { num, den } = exact(src);
      expect(maxModulusBound(num, den, q(100))).not.toBeNull();
    }
  });

  it("bounds the numerator above and the denominator below, in the right directions", () => {
    const { num, den } = exact("(2+3*z)/(5*z^2+z+1)");
    const R = q(4);
    // |P| on |z|=R is at most Σ|aₖ|Rᵏ = 2 + 3·4 = 14.
    expect(coefficientUpperBound(num, R).equals(q(14))).toBe(true);
    // |Q| is at least 5·16 − 4 − 1 = 75.
    expect(denominatorLowerBound(den, R).equals(q(75))).toBe(true);
  });

  it("uses exact irrational moduli correctly: |3+4i| = 5 exactly", () => {
    const { num } = exact("(3+4i)/z");
    expect(coefficientUpperBound(num, q(1)).equals(q(5))).toBe(true);
  });

  it("declines below the Cauchy root bound instead of producing a bound that is not one", () => {
    // At R = 1 the pole of 1/(z−2) is outside the circle, so |Q| has no positive lower bound from
    // the reverse triangle inequality — and the honest answer is to ask for a larger R.
    const { den } = exact("1/(z-2)");
    expect(denominatorLowerBound(den, q(1)).n <= 0n).toBe(true);
    expect(maxModulusBound(exact("1/(z-2)").num, den, q(1))).toBeNull();
  });
});

describe("mlArcBound", () => {
  const semicircle = q(1); // θ = 1·π

  it("certifies the vanishing arc for 1/(1+z²) — gallery A5's lemma", () => {
    const { num, den } = exact("1/(1+z^2)");
    const b = mlArcBound(num, den, q(50), semicircle);
    expect(b.asymptotics).toBe("vanishes");
    expect(b.degreeGap).toBe(2);
    expect(b.exponent).toBe(-1);
    expect(b.certificate.level).toBe("≤");
    // π·50/(50²−1) ≈ 0.0629 — small, and above the true maximum of |∫|.
    expect(b.value?.toNumber()).toBeLessThan(0.07);
    expect(b.value?.toNumber()).toBeGreaterThan(0.06);
  });

  it("shrinks like 1/R, so the limit is visible rather than asserted", () => {
    const { num, den } = exact("1/(1+z^2)");
    const at = (R: number) => mlArcBound(num, den, q(R), semicircle).value?.toNumber() ?? NaN;
    expect(at(500)).toBeLessThan(at(50) / 9);
    expect(at(5000)).toBeLessThan(at(500) / 9);
  });

  it("DERIVES the degree condition rather than checking it separately", () => {
    // deg Q ≥ deg P + 2 is not consulted anywhere; it falls out of the exponent.
    for (const [src, gap, kind] of [
      ["1/(1+z^2)", 2, "vanishes"],
      ["1/(1+z^4)", 4, "vanishes"],
      ["z/(1+z^2)", 1, "bounded"],
      ["1/(z+1)", 1, "bounded"],
      ["z^2/(1+z^2)", 0, "diverges"],
      ["z^3/(1+z)", -2, "diverges"],
    ] as const) {
      const { num, den } = exact(src);
      const b = mlArcBound(num, den, q(100), semicircle);
      expect(b.degreeGap).toBe(gap);
      expect(b.asymptotics).toBe(kind);
    }
  });

  it("refuses when the bound does not vanish — a valid bound is not a discharged lemma", () => {
    const { num, den } = exact("z/(1+z^2)");
    const b = mlArcBound(num, den, q(100), semicircle);
    expect(b.certificate.level).toBe("⚠");
    expect(mayReportValue(assembleVerdict([b.certificate]))).toBe(false);
    expect(b.certificate.claim).toMatch(/does NOT vanish|DIVERGES/);
  });

  it("uses no floating point to produce the number", () => {
    // The bound is a rational; `toNumber` is only for display. A Math call in the chain would make
    // it a bound on nothing in particular.
    const { num, den } = exact("1/(1+z^2)");
    const b = mlArcBound(num, den, q(50), semicircle);
    expect(b.value).toBeInstanceOf(Frac);
    expect(b.value?.d).toBeGreaterThan(1n); // a genuine fraction, not a rounded decimal
  });
});

describe("jordanArcBound — where the sign of a is a hard branch", () => {
  it("certifies the UPPER semicircle for a > 0", () => {
    const { num, den } = exact("1/(1+z^2)");
    const b = jordanArcBound(num, den, q(1), "upper", q(50));
    expect(b.asymptotics).toBe("vanishes");
    expect(b.certificate.level).toBe("≤");
    // (π/1)·max|g| ≈ π/2499 — and independent of R apart from max|g|.
    expect(b.value?.toNumber()).toBeLessThan(2e-3);
  });

  it("DIVERGES on the lower semicircle for a > 0 — the gate's own demonstration", () => {
    // ∫cos x/(1+x²) dx closed downward: |e^{iz}| = e^{−Im z} grows like e^{R} there. The app shows
    // the bound diverging and names the failing constraint instead of quietly producing a number.
    const { num, den } = exact("1/(1+z^2)");
    const b = jordanArcBound(num, den, q(1), "lower", q(50));
    expect(b.asymptotics).toBe("diverges");
    expect(b.value).toBeUndefined();
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.method).toMatch(/KILL/);
    expect(b.certificate.provenance.some((s) => s.text.includes("repair"))).toBe(true);
  });

  it("mirrors for a < 0: the LOWER semicircle is the one that closes", () => {
    const { num, den } = exact("1/(1+z^2)");
    expect(jordanArcBound(num, den, q(-1), "lower", q(50)).asymptotics).toBe("vanishes");
    expect(jordanArcBound(num, den, q(-1), "upper", q(50)).asymptotics).toBe("diverges");
  });

  it("reaches where plain ML cannot: g = z/(1+z²) has degree gap 1", () => {
    // ∫ x sin x/(1+x²) dx = π/e. The plain ML bound is O(1) here and establishes nothing; Jordan
    // trades the factor R for the constant π/|a| and vanishes.
    const { num, den } = exact("z/(1+z^2)");
    expect(mlArcBound(num, den, q(100), q(1)).asymptotics).toBe("bounded");
    expect(jordanArcBound(num, den, q(1), "upper", q(100)).asymptotics).toBe("vanishes");
  });

  it("declines at a = 0, where the lemma does not apply", () => {
    const { num, den } = exact("1/(1+z^2)");
    const b = jordanArcBound(num, den, Frac.ZERO, "upper", q(50));
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.method).toMatch(/non-zero frequency/);
  });
});
