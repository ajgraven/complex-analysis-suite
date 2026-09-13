// The Gaussian's vertical side — the third integrand shape to need a vanishing SEGMENT, and the
// first certified bound in this app whose `max|f|` is ATTAINED rather than majorised.
//
// `Re Q(c+iy)` is a real quadratic in `y` with exact ℚ coefficients, so the maximum on a segment is a
// decision over three candidates rather than an inequality. Everything here is about that: the
// candidates, the one case where dropping the vertex would certify a FALSE bound, and the refusals.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { makeComplexFn, parse } from "@cas/expr";
import { gaussianSideBound } from "../src/kernel/bounds/gaussianSide.js";
import { asExponentialOfPolynomial, asExponentialOfPower } from "../src/kernel/exponentialFactor.js";

const f = (n: bigint, d = 1n): Frac => Frac.of(n, d);
const poly = (...c: Gauss[]): QiPoly => QiPoly.fromCoeffs(c);
/** `Q(z) = −z² + i·b·z`, E3's exponent. */
const e3 = (b: Frac): QiPoly => poly(Gauss.ZERO, new Gauss(Frac.ZERO, b), Gauss.int(-1));

/** `∫` over a vertical segment, by a fine midpoint rule — the number the bound must dominate. */
function verticalIntegral(src: string, params: Record<string, [number, number]>, c: number, y0: number, y1: number): number {
  const fn = makeComplexFn(parse(src), params);
  const N = 40000;
  let re = 0;
  let im = 0;
  for (let k = 0; k < N; k++) {
    const y = y0 + ((y1 - y0) * (k + 0.5)) / N;
    const v = fn([c, y], [0, 0]);
    // dz = i·dy
    re += -v[1] * ((y1 - y0) / N);
    im += v[0] * ((y1 - y0) / N);
  }
  return Math.hypot(re, im);
}

describe("the exponent is read WHOLE", () => {
  it("keeps the lower-order terms the wedge reader refuses", () => {
    // Two readers, two bounds. `asExponentialOfPower` declines `e^{−z²+ibz}` because a linear term's
    // sign flips across a sector and its inequality cannot see it; on a vertical line every term
    // lands in the same exact quadratic, so nothing is approximated and the term must be kept.
    expect(asExponentialOfPower(parse("exp(-z^2 + i*z)"))).toBeNull();
    const read = asExponentialOfPolynomial(parse("exp(-z^2 + i*z)"));
    expect(read).not.toBeNull();
    expect(read?.q.degree()).toBe(2);
    expect(read?.q.coeff(1).toTuple()).toEqual([0, 1]);
    expect(read?.q.coeff(2).toTuple()).toEqual([-1, 0]);
    expect(read?.lambda.toTuple()).toEqual([1, 0]);
  });

  it("declines what has no polynomial exponent at all", () => {
    expect(asExponentialOfPolynomial(parse("exp(1/z)"))).toBeNull(); // an essential singularity
    expect(asExponentialOfPolynomial(parse("exp(3)"))).toBeNull(); // a constant is a constant factor
    expect(asExponentialOfPolynomial(parse("z*exp(-z^2)"))).toBeNull(); // a z-dependent cofactor
  });
});

describe("max|f| on the side is attained", () => {
  it("reproduces E3's own hand-computed M", () => {
    // The record states `|f| = e^{−R²+y²−by} ≤ e^{−R²}`, because `y² − by ≤ 0` on `[0,b]`. The engine
    // reaches the same number from the quadratic's endpoints, which is the same fact decided rather
    // than asserted.
    const got = gaussianSideBound(e3(f(17n, 10n)), Gauss.ONE, { c: f(6n), y0: Frac.ZERO, y1: f(17n, 20n) });
    expect(got.certificate.level).toBe("≤");
    expect(got.certificate.provenance[0].text).toContain("y = 0");
    const stated = Number(/≤ ([0-9.e+-]+) at/.exec(got.certificate.claim)?.[1]);
    // `L·M = (b/2)·e^{−36}`. Relatively, because the claim prints three significant figures.
    expect(Math.abs(stated - 0.85 * Math.exp(-36)) / stated).toBeLessThan(1e-3);
  });

  it("dominates the integral it bounds at every radius, without ever tightening onto it", () => {
    // The first draft asserted the slack was INDEPENDENT of `c` — `|∫| = e^{−c²}∫e^{y²−by}dy` against
    // `(b/2)e^{−c²}` — and measuring it said otherwise: 6.84 at c = 3, 10.11 at c = 4, 7.69 at c = 6.
    // The missing term is the PHASE. `Im Q(c+iy) = −2cy + bc` rotates at rate `2c` along the side, so
    // the cancellation inside `|∫ f dz|` depends on the radius while `∫|f|` does not, and the ML
    // inequality throws exactly that cancellation away. So the honest claim is the inequality itself
    // at each radius, plus a slack that stays within one order — never that the two converge.
    const ratios = [3n, 4n, 6n].map((c) => {
      const got = gaussianSideBound(e3(f(17n, 10n)), Gauss.ONE, { c: f(c), y0: Frac.ZERO, y1: f(17n, 20n) });
      const stated = Number(/≤ ([0-9.e+-]+) at/.exec(got.certificate.claim)?.[1]);
      const truth = verticalIntegral("exp(-z^2 + i*b*z)", { b: [1.7, 0] }, Number(c), 0, 0.85);
      expect(truth, `c = ${c}`).toBeLessThan(stated);
      return stated / truth;
    });
    for (const r of ratios) {
      expect(r).toBeGreaterThan(1);
      expect(r).toBeLessThan(20);
    }
  });

  it("takes the VERTEX when the parabola opens downward — where an endpoint-only max is FALSE", () => {
    // `e^{z²}` on the segment `Re z = 0`, `y ∈ [−1,1]`: there `Re Q = −y²`, maximal at the VERTEX
    // `y = 0` and strictly smaller at both endpoints. The integrand is real and positive there — no
    // phase to cancel — so `|∫| = 1.494` while an endpoint-only maximum would certify `2·e^{−1} =
    // 0.736`. That is not a loose bound, it is a FALSE one, and it is the whole reason the vertex is
    // a candidate.
    //
    // The line is the imaginary axis, which this bound allows on purpose: `e^{−z²}` decays in `Re z`
    // with no `R → ∞` hidden in a lattice, so unlike `stripSide.ts` there is nothing degenerate
    // about `c = 0`.
    const got = gaussianSideBound(poly(Gauss.ZERO, Gauss.ZERO, Gauss.ONE), Gauss.ONE, {
      c: Frac.ZERO,
      y0: f(-1n),
      y1: Frac.ONE,
    });
    expect(got.certificate.provenance[0].text).toContain("y = 0");
    const stated = Number(/≤ ([0-9.e+-]+) at/.exec(got.certificate.claim)?.[1]);
    expect(Math.abs(stated - 2) / stated).toBeLessThan(1e-3);
    const truth = verticalIntegral("exp(z^2)", {}, 0, -1, 1);
    expect(truth).toBeCloseTo(1.4936482656248538, 6);
    expect(truth).toBeLessThan(stated);
    expect(2 * Math.exp(-1)).toBeLessThan(truth);
  });
});

describe("the limit rests on Re(q₂), and only its sign", () => {
  it("discharges when it is negative and DIVERGES when it is positive", () => {
    const dies = gaussianSideBound(e3(Frac.ONE), Gauss.ONE, { c: f(5n), y0: Frac.ZERO, y1: f(1n, 2n) });
    expect(dies.asymptotics).toBe("vanishes");
    expect(dies.certificate.level).toBe("≤");

    const grows = gaussianSideBound(poly(Gauss.ZERO, Gauss.ZERO, Gauss.ONE), Gauss.ONE, {
      c: f(5n),
      y0: Frac.ZERO,
      y1: f(1n, 2n),
    });
    expect(grows.asymptotics).toBe("diverges");
    // The bound is still STATED — it holds at this `c`; what fails is the limit, and the row says
    // which. Reporting nothing would look like "no lemma applies", which is a different diagnosis.
    expect(grows.certificate.level).toBe("⚠");
    expect(grows.certificate.claim).toMatch(/≤ [0-9.e+-]+ at Re z = 5/);
    expect(grows.certificate.claim).toContain("DIVERGES");
  });

  it("refuses when there is no sign to read", () => {
    // `Q = i z²` has `Re(q₂) = 0`: the bound is then `O(e^{κc})` with `κ` depending on WHICH endpoint
    // attains the maximum — a different lemma, and no record needs it.
    const flat = gaussianSideBound(poly(Gauss.ZERO, Gauss.ZERO, Gauss.I), Gauss.ONE, {
      c: f(5n),
      y0: Frac.ZERO,
      y1: Frac.ONE,
    });
    expect(flat.certificate.level).toBe("⚠");
    expect(flat.certificate.method).toContain("Re(q₂) = 0");
  });

  it("refuses a degenerate segment and a non-quadratic exponent", () => {
    const point = gaussianSideBound(e3(Frac.ONE), Gauss.ONE, { c: f(5n), y0: Frac.ONE, y1: Frac.ONE });
    expect(point.certificate.method).toContain("vacuous");

    const cubic = gaussianSideBound(poly(Gauss.ZERO, Gauss.ZERO, Gauss.ZERO, Gauss.int(-1)), Gauss.ONE, {
      c: f(5n),
      y0: Frac.ZERO,
      y1: Frac.ONE,
    });
    expect(cubic.certificate.method).toContain("needs deg Q = 2");
  });
});
