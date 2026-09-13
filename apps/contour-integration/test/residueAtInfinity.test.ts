// `Res(f, ∞)` — the coefficient the finite poles cannot see.
//
// D6's `forgot-the-residue-at-infinity` trap is the whole reason this exists: "'Regular at infinity'
// and 'zero residue at infinity' are different statements: `f = 1/z` is regular at infinity with
// `Res(f, ∞) = −1`." For the dogbone it is part of the identity, not an optimisation.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { exactResidues, residueAtInfinity, totalResidueCheck } from "../src/kernel/exactResidue.js";
import { formatFrac, formatGauss } from "../src/kernel/formatExact.js";
import { orderAtInfinity, residueAtInfinityOf } from "../src/kernel/atInfinity.js";
import { rootsOfQiPoly } from "./helpers/rootsOfQiPoly.js";

const poly = (...coeffs: number[]): QiPoly =>
  QiPoly.fromCoeffs(coeffs.map((c) => Gauss.int(c)));
const ONE = QiPoly.constant(Gauss.ONE);
const at = (num: QiPoly, den: QiPoly): string => {
  const got = residueAtInfinity(num, den);
  return got === null ? "refused" : formatGauss(got);
};

describe("residueAtInfinity", () => {
  it("is −1 for 1/z, which is REGULAR at infinity", () => {
    // The distinction the trap is about, in one line.
    expect(at(ONE, poly(0, 1))).toBe("−1");
  });

  it("is zero when the degree drops by two — research 03 §9(d)'s unification", () => {
    // The same computation that discharges L2 on the outer circle: `deg D − deg N ≥ 2` makes the
    // remainder's `z^{n−1}` coefficient vanish.
    expect(at(ONE, poly(1, 0, 1))).toBe("0");
    expect(at(ONE, poly(1, 0, 0, 1))).toBe("0");
    expect(at(poly(0, 1), poly(1, 0, 0, 1))).toBe("0");
  });

  it("is NOT zero at a degree drop of one", () => {
    // `z/(z²+1)`: the finite residues are 1/2 at ±i and sum to 1, so the residue at ∞ is −1.
    expect(at(poly(0, 1), poly(1, 0, 1))).toBe("−1");
    expect(at(poly(0, 0, 1), poly(1, 0, 0, 1))).toBe("−1");
  });

  it("can vanish without the degree condition, which is why the row says which way it argues", () => {
    // `(z³+1)/(z³+z)`: degree drop 0, and the residue at infinity is 0 all the same. The degree
    // condition is SUFFICIENT, not necessary, and a row claiming the converse would be wrong.
    expect(at(poly(1, 0, 0, 1), poly(0, 1, 0, 1))).toBe("0");
  });

  it("reads the polynomial part off, rather than being confused by it", () => {
    // `(z² + 3z + 5)/(z + 1)` = `z + 2 + 3/(z+1)`: the polynomial part contributes no z⁻¹ at all.
    expect(at(poly(5, 3, 1), poly(1, 1))).toBe("−3");
    // A pure polynomial has no z⁻¹ term either.
    expect(at(poly(1, 2, 3), ONE)).toBe("0");
  });

  it("refuses a zero denominator, which is not a rational function", () => {
    expect(at(ONE, QiPoly.zero())).toBe("refused");
  });
});

describe("the total-residue identity, as a differential check", () => {
  const check = (num: QiPoly, den: QiPoly) => {
    const report = exactResidues(num, den, (factor) => rootsOfQiPoly(factor));
    return totalResidueCheck(num, den, report);
  };

  it("agrees for every shape above — two computations sharing no arithmetic", () => {
    for (const [num, den] of [
      [ONE, poly(0, 1)],
      [ONE, poly(1, 0, 1)],
      [poly(0, 1), poly(1, 0, 1)],
      [poly(5, 3, 1), poly(1, 1)],
      [poly(1, 0, 0, 1), poly(0, 1, 0, 1)],
    ] as const) {
      const got = check(num, den);
      expect(got, "the poles should all pin exactly").not.toBeNull();
      expect(got?.ok, `Σ finite = ${formatGauss(got?.finiteSum ?? Gauss.ZERO)}`).toBe(true);
    }
  });

  it("has nothing to compare against when a pole is not pinned exactly", () => {
    // `z² − 2` has irrational roots: no exact finite sum, so no identity to check.
    expect(check(ONE, poly(-2, 0, 1))).toBeNull();
  });
});

describe("one number decides two rows — the order at infinity", () => {
  const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));

  it("is D6's −3, from the branch exponents against the degree drop", () => {
    // `1/((z²+a²)√(1−z²))`: the cofactor drops 2 and the branch factor is `z^{−1/2−1/2}`.
    const order = orderAtInfinity(ONE, poly(1, 0, 1), q(-1));
    expect(formatFrac(order)).toBe("−3");
    const got = residueAtInfinityOf(ONE, poly(1, 0, 1), q(-1));
    expect(got.ok && got.value?.isZero()).toBe(true);
    expect(got.certificate.level).toBe("=");
    expect(got.certificate.claim).toBe("Res(f, ∞) = 0");
    // The row says which direction it argues — the converse is false and is named.
    expect(got.certificate.provenance.some((p) => p.text.includes("one way"))).toBe(true);
  });

  it("is D7's 0, where neither the circle vanishes nor the residue is zero", () => {
    // `z^{3/4}(b−z)^{1/4}/(c−z)`: the exponents sum to 1 and the cofactor drops 1.
    const order = orderAtInfinity(ONE, poly(1, 1), q(1));
    expect(formatFrac(order)).toBe("0");
    const got = residueAtInfinityOf(ONE, poly(1, 1), q(1));
    expect(got.ok).toBe(false);
    // …and it refuses BY NAME rather than returning the rational answer for a function that is not
    // rational. The binomial series is D7's own work.
    expect(!got.ok && got.reason).toMatch(/binomial series/);
  });

  it("reads the exact coefficient when there is no branch factor at all", () => {
    const got = residueAtInfinityOf(ONE, poly(0, 1));
    expect(got.ok && got.value !== undefined && formatGauss(got.value)).toBe("−1");
    expect(got.certificate.level).toBe("=");
    // The certificate states the trap rather than leaving it implicit.
    expect(got.certificate.provenance[0].text).toMatch(/regular there and has Res = −1/);
  });
});
