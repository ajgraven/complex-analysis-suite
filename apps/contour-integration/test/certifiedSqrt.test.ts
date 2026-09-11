import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { assembleVerdict, mayReportValue } from "@cas/rigor";
import { certifiedSqrt } from "../src/kernel/bounds/certifiedSqrt.js";
import { fracCmp } from "../src/kernel/bounds/ratBound.js";

const q = (n: bigint, d: bigint = 1n) => Frac.of(n, d);
const sq = (x: Frac) => x.mul(x);

describe("certifiedSqrt", () => {
  it("labels a rational square exact, and the enclosure is a single point", () => {
    for (const c of [q(4n), q(9n, 4n), q(1n, 4n), q(10n ** 30n, 49n)]) {
      const { lo, hi, certificates } = certifiedSqrt(c);
      expect(lo.equals(hi)).toBe(true);
      expect(sq(hi).equals(c)).toBe(true);
      expect(assembleVerdict(certificates).level).toBe("=");
    }
  });

  it("labels a genuine enclosure ≈, not ≤ and not =", () => {
    // The enclosure rule in @cas/rigor: a `≤` meeting a `≥` is an enclosure, which is better than an
    // estimate but is not a one-sided bound — so it must not be reported as one.
    for (const c of [q(2n), q(3n), q(1n, 3n), q(123456789n, 987654321n)]) {
      const { lo, hi, certificates } = certifiedSqrt(c);
      expect(fracCmp(sq(lo), c)).toBeLessThanOrEqual(0);
      expect(fracCmp(c, sq(hi))).toBeLessThanOrEqual(0);
      expect(assembleVerdict(certificates).level).toBe("≈");
    }
  });

  it("never refuses — an enclosure of a non-negative rational always exists", () => {
    expect(mayReportValue(assembleVerdict(certifiedSqrt(q(2n)).certificates))).toBe(true);
  });

  it("states the individual bounds in the direction each was actually proved", () => {
    const levels = certifiedSqrt(q(2n))
      .certificates.map((c) => c.level)
      .sort();
    expect(levels).toEqual(["≤", "≥"]);
  });
});
