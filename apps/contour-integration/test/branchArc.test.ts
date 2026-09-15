// Guards for the keyhole's two arc bounds — where `0 < α < 1` is spent.
//
// D1's `circles-asserted-not-proved` trap is the specification: "the inner circle needs α > 0, the
// outer needs α < 1. At α = 1 the outer bound is 2πR⁰ = 2π and does NOT tend to zero; at α = 0 the
// inner bound is 2π." Both endpoint cases are tested below, because a bound that silently discharges
// at α = 1 would make the app prove a false theorem.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { branchArcBound } from "../src/kernel/bounds/branchArc.js";

const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
/** `R = 1/(1+z)` — D1's rational part. */
const ONE = QiPoly.fromCoeffs([Gauss.ONE]);
const ONE_PLUS_Z = QiPoly.fromCoeffs([Gauss.ONE, Gauss.ONE]);
const FULL: Frac = q(2);

/** D1's arcs: `z^{α−1}/(1+z)`, so the exponent the arc sees is `α − 1`. */
const outer = (alpha: Frac, R: Frac) =>
  branchArcBound(alpha.sub(Frac.ONE), ONE, ONE_PLUS_Z, R, { limit: "inf", piMultiple: FULL });
const inner = (alpha: Frac, eps: Frac) =>
  branchArcBound(alpha.sub(Frac.ONE), ONE, ONE_PLUS_Z, eps, { limit: "0+", piMultiple: FULL });

describe("the outer circle spends α < 1", () => {
  it("vanishes for every α strictly below 1", () => {
    for (const a of [q(3, 10), q(1, 2), q(3, 4), q(9, 10), q(99, 100)]) {
      const b = outer(a, q(1000));
      expect(b.asymptotics).toBe("vanishes");
      expect(b.certificate.level).toBe("≤");
    }
  });

  it("does NOT vanish at α = 1, where the bound is 2π", () => {
    // The trap's own arithmetic. A bound that discharged here would prove a false theorem.
    const b = outer(q(1), q(1000));
    expect(b.asymptotics).toBe("bounded");
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.claim).toMatch(/does not vanish/);
  });

  it("diverges past α = 1", () => {
    const b = outer(q(3, 2), q(1000));
    expect(b.asymptotics).toBe("diverges");
    expect(b.certificate.claim).toMatch(/diverges/);
  });

  it("shrinks as R grows, so the limit is watched and not asserted", () => {
    const values = [q(10), q(100), q(1000), q(10000)].map((R) => {
      const m = /\\le ([0-9.e+-]+)/.exec(outer(q(3, 10), R).certificate.claim);
      return m === null ? NaN : Number(m[1]);
    });
    for (let k = 1; k < values.length; k++) {
      expect(values[k]).toBeLessThan(values[k - 1]);
    }
    expect(values[values.length - 1]).toBeLessThan(1);
  });
});

describe("the inner circle spends α > 0", () => {
  it("vanishes for every α strictly above 0", () => {
    for (const a of [q(1, 100), q(1, 10), q(3, 10), q(1, 2), q(9, 10)]) {
      const b = inner(a, q(1, 1000));
      expect(b.asymptotics).toBe("vanishes");
      expect(b.certificate.level).toBe("≤");
    }
  });

  it("does NOT vanish at α = 0, where the bound is 2π", () => {
    const b = inner(q(0), q(1, 1000));
    expect(b.asymptotics).toBe("bounded");
    expect(b.certificate.level).toBe("⚠");
  });

  it("diverges below α = 0", () => {
    expect(inner(q(-1, 2), q(1, 1000)).asymptotics).toBe("diverges");
  });

  it("shrinks as ε shrinks — and SLOWLY, which the record makes a point of", () => {
    // D1's golden note: "the inner circle is still 1.1e-2 at eps=1e-9 — it vanishes only like
    // eps^alpha = eps^0.3, which is a good live demonstration of a slow limit."
    const at = (eps: Frac): number => {
      const m = /\\le ([0-9.e+-]+)/.exec(inner(q(3, 10), eps).certificate.claim);
      return m === null ? NaN : Number(m[1]);
    };
    const small = at(q(1, 1000000000));
    expect(small).toBeLessThan(at(q(1, 1000)));
    // eps^0.3 at 1e-9 is about 2e-3, times 2π is about 1.3e-2 — the record's own order of magnitude.
    expect(small).toBeGreaterThan(1e-3);
    expect(small).toBeLessThan(1e-1);
  });
});

describe("the two directions are the same inequality read opposite ways", () => {
  it("disagree about the sign that discharges", () => {
    // α = 1/2: both circles vanish, and they do so for exponents of opposite sign.
    const o = outer(q(1, 2), q(1000));
    const i = inner(q(1, 2), q(1, 1000));
    expect(o.asymptotics).toBe("vanishes");
    expect(i.asymptotics).toBe("vanishes");
    expect(o.exponent).toBeLessThan(0);
    expect(i.exponent).toBeGreaterThan(0);
  });

  it("reads |R| by the DEGREE GAP at ∞ and by the ORDER OF VANISHING at 0", () => {
    // `R = z/(1+z)` has the same degree gap as `1/(1+z)` shifted by one, and vanishes to order 1 at
    // the origin — so it buys the inner circle a whole power of ε and costs the outer one.
    const z = QiPoly.fromCoeffs([Gauss.ZERO, Gauss.ONE]);
    const atInf = branchArcBound(q(-7, 10), z, ONE_PLUS_Z, q(1000), { limit: "inf", piMultiple: FULL });
    const atZero = branchArcBound(q(-7, 10), z, ONE_PLUS_Z, q(1, 1000), { limit: "0+", piMultiple: FULL });
    // At ∞ the extra `z` costs a whole power: `z^{α−1}·z/(1+z) ~ z^{α−1}`, so the bound is
    // `2πR·R^{α−1} = 2πR^α` and DIVERGES for every positive α. At 0 the same `z` buys a power, so
    // the inner circle vanishes faster than it did.
    expect(atInf.asymptotics).toBe("diverges");
    expect(atZero.asymptotics).toBe("vanishes");
    expect(atZero.exponent).toBeGreaterThan(1);
  });
});

describe("honesty about what is exact here", () => {
  it("labels the bound `≤` but says in its own audit trail that ρ^α is a float", () => {
    const b = outer(q(3, 10), q(1000));
    expect(b.certificate.level).toBe("≤");
    const trail = b.certificate.provenance;
    expect(trail.some((s) => s.ok && /exact ℚ coefficient bounds/.test(s.text))).toBe(true);
    expect(trail.some((s) => !s.ok && /irrational power/.test(s.text))).toBe(true);
    expect(trail.some((s) => s.ok && /its SIGN is decided/.test(s.text))).toBe(true);
  });

  it("refuses a radius inside the denominator's root bound rather than reporting a wrong number", () => {
    // At ρ = 1 the reverse triangle inequality gives |1 + z| ≥ 1 − 1 = 0: the pole at −1 may lie ON
    // the arc, and there is genuinely no bound of this form. Enlarging ρ is the repair.
    const b = outer(q(3, 10), q(1));
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.method).toMatch(/no positive lower bound/);
  });

  it("refuses a non-positive radius", () => {
    expect(outer(q(3, 10), q(0)).certificate.level).toBe("⚠");
  });
});
