import { describe, expect, it } from "vitest";
import { Frac, piUpper, QiPoly, toExactRational } from "@cas/exact";
import { parse } from "@cas/expr";
import { mayReportValue, assembleVerdict } from "@cas/rigor";
import {
  coefficientUpperBound,
  denominatorLowerBound,
  jordanArcBound,
  maxModulusBound,
  mlArcBound,
} from "../src/kernel/bounds/mlRational.js";

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
    expect(b.certificate.claim).toMatch(/does not vanish|diverges/);
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
  /** The upper half-turn, in units of π — the arc Jordan's bound is stated on. */
  const UPPER = { from: Frac.ZERO, to: Frac.ONE };
  const LOWER = { from: Frac.ONE.neg(), to: Frac.ZERO };

  it("certifies the UPPER semicircle for a > 0", () => {
    const { num, den } = exact("1/(1+z^2)");
    const b = jordanArcBound(num, den, q(1), "upper", q(50), "R", UPPER);
    expect(b.asymptotics).toBe("vanishes");
    expect(b.certificate.level).toBe("≤");
    // (π/1)·max|g| ≈ π/2499 — and independent of R apart from max|g|.
    expect(b.value?.toNumber()).toBeLessThan(2e-3);
  });

  it("DIVERGES on the lower semicircle for a > 0 — the gate's own demonstration", () => {
    // ∫cos x/(1+x²) dx closed downward: |e^{iz}| = e^{−Im z} grows like e^{R} there. The app shows
    // the bound diverging and names the failing constraint instead of quietly producing a number.
    const { num, den } = exact("1/(1+z^2)");
    const b = jordanArcBound(num, den, q(1), "lower", q(50), "R", LOWER);
    expect(b.asymptotics).toBe("diverges");
    expect(b.value).toBeUndefined();
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.method).toMatch(/the arc cannot be closed this way/);
    expect(b.certificate.provenance.some((s) => s.text.includes("repair"))).toBe(true);
  });

  it("mirrors for a < 0: the LOWER semicircle is the one that closes", () => {
    const { num, den } = exact("1/(1+z^2)");
    expect(jordanArcBound(num, den, q(-1), "lower", q(50), "R", LOWER).asymptotics).toBe("vanishes");
    expect(jordanArcBound(num, den, q(-1), "upper", q(50), "R", UPPER).asymptotics).toBe("diverges");
  });

  it("reaches where plain ML cannot: g = z/(1+z²) has degree gap 1", () => {
    // ∫ x sin x/(1+x²) dx = π/e. The plain ML bound is O(1) here and establishes nothing; Jordan
    // trades the factor R for the constant \\pi/|a| and vanishes.
    const { num, den } = exact("z/(1+z^2)");
    expect(mlArcBound(num, den, q(100), q(1)).asymptotics).toBe("bounded");
    expect(jordanArcBound(num, den, q(1), "upper", q(100), "R", UPPER).asymptotics).toBe("vanishes");
  });

  it("declines at a = 0, where the lemma does not apply", () => {
    const { num, den } = exact("1/(1+z^2)");
    const b = jordanArcBound(num, den, Frac.ZERO, "upper", q(50), "R", UPPER);
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.method).toMatch(/non-zero frequency/);
  });

  // **THE ARC'S EXTENT IS PART OF THE HYPOTHESIS.** Until it was read, the bound assumed a
  // semicircle: on a FULL CIRCLE at R = 4 it certified `≤ 2.094e-1`, at level `≤` and status
  // satisfied, for an arc whose `∫|f||dz|` is 1.841e+1 — 88× the claimed bound, because `|e^{iz}|`
  // grows like `e^R` over the half of it the bound says nothing about.
  describe("the arc's extent, which the bound used to assume", () => {
    /** `∫|f||dz|` over the arc, by a dense midpoint rule — the quantity a bound must dominate. */
    const absIntegral = (f: (z: [number, number]) => [number, number], R: number, from: number, to: number, n = 200000): number => {
      let total = 0;
      const dt = (to - from) / n;
      for (let k = 0; k < n; k++) {
        const th = from + (k + 0.5) * dt;
        const v = f([R * Math.cos(th), R * Math.sin(th)]);
        total += Math.hypot(v[0], v[1]) * R * Math.abs(dt);
      }
      return total;
    };
    /** `e^{iz}/(1+z²)`, the integrand the reproduction uses. */
    const eiz = (z: [number, number]): [number, number] => {
      const m = Math.exp(-z[1]);
      const er: [number, number] = [m * Math.cos(z[0]), m * Math.sin(z[0])];
      const d: [number, number] = [1 + z[0] * z[0] - z[1] * z[1], 2 * z[0] * z[1]];
      const s = d[0] * d[0] + d[1] * d[1];
      return [(er[0] * d[0] + er[1] * d[1]) / s, (er[1] * d[0] - er[0] * d[1]) / s];
    };
    const g = exact("1/(1+z^2)");

    it("REFUSES a full circle by name, where it used to certify a bound 88× too small", () => {
      const b = jordanArcBound(g.num, g.den, q(1), "upper", q(4), "R", { from: Frac.ZERO, to: q(2) });
      expect(b.certificate.level).toBe("⚠");
      expect(b.value).toBeUndefined();
      expect(b.asymptotics).toBe("unestablished");
      expect(b.certificate.claim).toMatch(/arc from \$0\$ to \$2\\pi\$/);
      expect(b.certificate.method).toMatch(/contained in the upper half-plane/);
      // And the number it used to print is measurably not a bound on that arc.
      expect(absIntegral(eiz, 4, 0, 2 * Math.PI)).toBeGreaterThan(18);
    });

    it("REFUSES [0, 3π/2] too — leaving the half-plane at all is enough", () => {
      const b = jordanArcBound(g.num, g.den, q(1), "upper", q(4), "R", { from: Frac.ZERO, to: q(3, 2) });
      expect(b.certificate.level).toBe("⚠");
      expect(b.asymptotics).toBe("unestablished");
      expect(b.certificate.method).toMatch(/contained in the upper half-plane/);
    });

    it("REFUSES when no extent is supplied at all, rather than assuming a semicircle", () => {
      // The signature tolerates the pre-extent call so that nothing fails to compile; what it may
      // not do is answer. An absent extent is an unknown arc, and there is no bound on one.
      const b = jordanArcBound(g.num, g.den, q(1), "upper", q(4));
      expect(b.certificate.level).toBe("⚠");
      expect(b.value).toBeUndefined();
      expect(b.asymptotics).toBe("unestablished");
      expect(b.certificate.method).toMatch(/angular extent was not supplied/);
    });

    it("CERTIFIES the half-turn and every sub-arc of it, and dominates the integral on each", () => {
      // A sub-arc stays sound: `∫_sub ≤ ∫_{[0,π]}`, so the same constant bounds it. The cases are
      // the three the reproduction measured (`[0,π] → 1.284e-1`) plus two proper sub-arcs.
      for (const [from, to] of [
        [Frac.ZERO, Frac.ONE],
        [Frac.ZERO, q(1, 2)],
        [q(1, 4), q(3, 4)],
        [q(1, 2), Frac.ONE],
      ] as const) {
        const b = jordanArcBound(g.num, g.den, q(1), "upper", q(4), "R", { from, to });
        expect(b.certificate.level, `[${from.n}/${from.d}, ${to.n}/${to.d}]`).toBe("≤");
        const measured = absIntegral(eiz, 4, from.toNumber() * Math.PI, to.toNumber() * Math.PI);
        expect(b.value?.toNumber(), `[${from.n}/${from.d}, ${to.n}/${to.d}]`).toBeGreaterThanOrEqual(measured);
      }
    });

    it("REFUSES an arc that dips below the axis, not only one that overshoots", () => {
      // Containment is TWO comparisons. `[−π/2, π/2]` overshoots nothing at the top and is still
      // half in the lower half-plane, where `|e^{iz}|` grows — a bound checking only the upper end
      // certifies it, and `[0, 3π/2]` above would not have caught that.
      const b = jordanArcBound(g.num, g.den, q(1), "upper", q(4), "R", { from: q(-1, 2), to: q(1, 2) });
      expect(b.certificate.level).toBe("⚠");
      expect(b.asymptotics).toBe("unestablished");
      expect(b.certificate.method).toMatch(/contained in the upper half-plane/);
      // Measured: over that arc `∫|f||dz|` is well past the π/|a|·max|g| the bound would print.
      expect(absIntegral(eiz, 4, -Math.PI / 2, Math.PI / 2)).toBeGreaterThan(1);
    });

    it("reads the lower half-plane in BOTH of its windows, and rejects the other one", () => {
      const at = (from: Frac, to: Frac) =>
        jordanArcBound(g.num, g.den, q(-1), "lower", q(4), "R", { from, to }).certificate.level;
      expect(at(Frac.ONE.neg(), Frac.ZERO)).toBe("≤");
      expect(at(Frac.ONE, q(2))).toBe("≤");
      // The same sweep read as "upper" is the arc leaving its half-plane, and refuses.
      expect(
        jordanArcBound(g.num, g.den, q(1), "upper", q(4), "R", { from: Frac.ONE, to: q(2) }).certificate.level,
      ).toBe("⚠");
    });

    it("is orientation-blind: a clockwise arc sweeps the same set", () => {
      const cw = jordanArcBound(g.num, g.den, q(1), "upper", q(4), "R", { from: Frac.ONE, to: Frac.ZERO });
      expect(cw.certificate.level).toBe("≤");
      expect(cw.certificate.claim).toMatch(/the upper semicircle/);
      // **And blind in the direction that MATTERS**, which the clockwise semicircle above cannot
      // show: with the endpoints taken in the order given rather than ordered, `from = 2π, to = 0`
      // passes both comparisons of `[0, π]` separately and certifies a FULL CIRCLE drawn clockwise
      // — the very arc the counter-clockwise case refuses. A sweep found this: the ordering is the
      // whole content of reading a window off two endpoints.
      const cwFull = jordanArcBound(g.num, g.den, q(1), "upper", q(4), "R", { from: q(2), to: Frac.ZERO });
      expect(cwFull.certificate.level).toBe("⚠");
      expect(cwFull.asymptotics).toBe("unestablished");
      expect(cwFull.certificate.method).toMatch(/contained in the upper half-plane/);
    });

    it("stops calling a sub-arc a semicircle", () => {
      // The sentence said "the upper semicircle" whatever the arc was, which is how the full-circle
      // certificate read plausibly.
      const b = jordanArcBound(g.num, g.den, q(1), "upper", q(4), "R", { from: Frac.ZERO, to: q(1, 2) });
      expect(b.certificate.claim).toMatch(/the upper arc:/);
      expect(b.certificate.claim).not.toMatch(/semicircle/);
    });
  });

  it("refuses without CLAIMING anything about the limit — a refused bound has no asymptotics", () => {
    // The field the disposal row's status is read from. Carrying the degree gap's verdict here is
    // what marked a `⚠` row *satisfied*: `1/(1+z²)` at R = 0.5 reported "vanishes" from a refusal.
    const { num, den } = exact("1/(1+z^2)");
    expect(mlArcBound(num, den, q(1, 2), q(1)).certificate.level).toBe("⚠");
    expect(mlArcBound(num, den, q(1, 2), q(1)).asymptotics).toBe("unestablished");
    expect(mlArcBound(num, den, q(0), q(1)).asymptotics).toBe("unestablished");
    // Jordan's two: below the Cauchy root bound, and at a zero frequency.
    expect(jordanArcBound(num, den, q(1), "upper", q(1, 2), "R", UPPER).asymptotics).toBe("unestablished");
    expect(jordanArcBound(num, den, Frac.ZERO, "upper", q(50), "R", UPPER).asymptotics).toBe("unestablished");
    // And the one refusal that IS a claim about the limit keeps it: the wrong half-plane is growth.
    expect(jordanArcBound(num, den, q(1), "lower", q(50), "R", LOWER).asymptotics).toBe("diverges");
    // As does a bound that was established and merely does not discharge.
    const flat = exact("z/(1+z^2)");
    expect(mlArcBound(flat.num, flat.den, q(100), q(1)).asymptotics).toBe("bounded");
    expect(mlArcBound(flat.num, flat.den, q(100), q(1)).certificate.level).toBe("⚠");
  });

  // **M5.2 rewired this bound through `dampedArcIntegral`, and rewiring it had to change nothing.**
  // The predicate returns `1` at the semicircle's range, so the arithmetic is identical — asserted
  // in ℚ rather than to a few decimals, because "identical" is the claim.
  it("is still exactly π·max|g|/|a| after discharging through the shared predicate", () => {
    const { num, den } = exact("1/(1+z^2)");
    for (const [a, R] of [
      [1, 50],
      [3, 7],
      [2, 1000],
    ] as const) {
      const b = jordanArcBound(num, den, q(a), "upper", q(R), "R", UPPER);
      const expected = piUpper().mul(maxModulusBound(num, den, q(R)) as Frac).div(q(a));
      expect((b.value as Frac).equals(expected)).toBe(true);
    }
  });

  it("quotes the shared predicate in its provenance, so the inequality has one home", () => {
    const { num, den } = exact("1/(1+z^2)");
    const b = jordanArcBound(num, den, q(1), "upper", q(50), "R", UPPER);
    const texts = b.certificate.provenance.map((s) => s.text).join(" | ");
    expect(texts).toMatch(/\\int_0\^\{\\pi\} e\^\{-\\kappa\\sin\\psi\}\\,d\\psi \\le \\pi\/\\kappa/);
    expect(texts).toMatch(/\\sin\\psi = \\sin\(\\pi - \\psi\)/);
  });
});
