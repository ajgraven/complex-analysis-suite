// **L6, as corrected — and the measurement that refutes the version it replaces (finding D-1).**
//
// The first block is the refutation. Research 03 §0.3 stated the Gaussian wedge lemma on
// `θ ∈ [0, π/n]`; its majorant is computed here and comes out at 2.7e15, 1.1e93 and float overflow,
// so the wrong statement is denied by the suite and not only by a paragraph. The same block shows
// the predicate refusing exactly that range, which is what makes the correction structural: the
// bound cannot be computed there because the side condition is asked first.
//
// The rest measures the corrected bounds against the integrals they bound — the true arc integral
// AND the ML majorant, at four radii and three powers in both forms. A bound that holds
// asymptotically and fails at finite R is the charge D-2 lays against the square-contour bound
// ("certification theatre", PLAN §9 R2), so the finite-R claim is the one under test.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, piLower, piUpper } from "@cas/exact";
import { QiPoly } from "@cas/exact";
import { parse } from "@cas/expr";
import { wedgeArcBound } from "../src/kernel/bounds/wedgeArc.js";
import { jordanArcBound } from "../src/kernel/bounds/mlRational.js";
import { dampedArcIntegral } from "../src/kernel/bounds/linearMinorant.js";
import { asExponentialOfPower } from "../src/kernel/exponentialFactor.js";

const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const GAUSSIAN = Gauss.int(-1); // w = −1: |e^{−zⁿ}| = e^{−Rⁿcos nθ}
const OSCILLATORY = Gauss.I; //    w = +i: |e^{izⁿ}| = e^{−Rⁿ sin nθ}
const ONE = Gauss.ONE;

/**
 * Simpson on a mesh graded toward BOTH endpoints — and a uniform rule will not do, which the first
 * draft of this file found the hard way.
 *
 * `e^{−κ h(ψ)}` is a SPIKE of width `~1/κ` at whichever end the damping vanishes, and `κ = c·Rⁿ`
 * reaches 65536 at `n = 4, R = 16`. A uniform 40001-point rule has a step of 2e-5 against a spike
 * 1.5e-5 wide, so it measured 2.1e-4 where the true majorant is 1.2e-4 — and reported the
 * (correct) bound as VIOLATED. Resolving that uniformly needs ~2e7 points; textbook adaptive
 * Simpson halves its tolerance per level and never terminated on this integrand.
 *
 * The substitution `ψ = a + (b−a)·u²(3 − 2u)` has `dψ/du = 0` at both ends, so the mesh clusters
 * quadratically there — ~50 nodes land inside a spike 1.5e-5 wide — and no case analysis is needed
 * about WHICH end the spike is at, which matters because the two faces put it at different ones.
 */
function simpson(f: (x: number) => number, a: number, b: number, m = 20001): number {
  const width = b - a;
  const g = (u: number): number => {
    const term = f(a + width * u * u * (3 - 2 * u));
    const weight = width * 6 * u * (1 - u);
    // The endpoint weights are ZERO, and `Infinity × 0` is `NaN` — which would turn D-1's
    // divergence into a silent NaN and an assertion about nothing. An infinite integrand at an
    // endpoint makes the integral infinite whatever the Jacobian does, so it is carried through.
    if (weight === 0) return Number.isFinite(term) ? 0 : term;
    return term * weight;
  };
  const h = 1 / (m - 1);
  let s = g(0) + g(1);
  for (let i = 1; i < m - 1; i++) s += (i % 2 ? 4 : 2) * g(i * h);
  return (s * h) / 3;
}

/** `R·∫₀^Θ |e^{w zⁿ}| dθ` — the ML majorant, which is what the bound is a bound on. */
const majorant = (w: Gauss, n: number, R: number, upper: number): number =>
  R * simpson((t) => Math.exp(R ** n * (w.re.toNumber() * Math.cos(n * t) - w.im.toNumber() * Math.sin(n * t))), 0, upper);

/** `|∫_arc e^{w zⁿ} dz|` itself, by quadrature — the quantity the majorant majorises. */
function arcIntegral(w: Gauss, n: number, R: number, upper: number): number {
  const at = (t: number): [number, number] => {
    // z = R e^{it}; w zⁿ = w·Rⁿ e^{int}; dz = i R e^{it} dt
    const zn: [number, number] = [R ** n * Math.cos(n * t), R ** n * Math.sin(n * t)];
    const e: [number, number] = [
      w.re.toNumber() * zn[0] - w.im.toNumber() * zn[1],
      w.re.toNumber() * zn[1] + w.im.toNumber() * zn[0],
    ];
    const mod = Math.exp(e[0]);
    const v: [number, number] = [mod * Math.cos(e[1]), mod * Math.sin(e[1])];
    const dz: [number, number] = [-R * Math.sin(t), R * Math.cos(t)];
    return [v[0] * dz[0] - v[1] * dz[1], v[0] * dz[1] + v[1] * dz[0]];
  };
  const re = simpson((t) => at(t)[0], 0, upper);
  const im = simpson((t) => at(t)[1], 0, upper);
  return Math.hypot(re, im);
}

describe("D-1: the range research 03 stated makes the majorant diverge", () => {
  it("measures 2.7e15, 1.1e93 and overflow for e^{−zⁿ} on [0, π/n]", () => {
    const measured = [2, 3, 4].map((n) => majorant(GAUSSIAN, n, 6, Math.PI / n));
    expect(measured[0]).toBeGreaterThan(1e15);
    expect(measured[0]).toBeLessThan(1e16);
    expect(measured[1]).toBeGreaterThan(1e92);
    expect(measured[2]).toBe(Number.POSITIVE_INFINITY);
    // …and it is worse the larger R gets, which is the opposite of what a vanishing lemma needs.
    expect(majorant(GAUSSIAN, 2, 8, Math.PI / 2)).toBeGreaterThan(measured[0]);
  });

  it("refuses that range rather than computing a number for it", () => {
    // `nθ` runs to π, so the predicate is asked about a range of π in the cos face.
    expect(dampedArcIntegral(Frac.ONE, "cos").constant).toBeNull();
    for (const n of [2, 3, 4]) {
      const b = wedgeArcBound({ w: GAUSSIAN, n, lambda: ONE }, q(6), { from: Frac.ZERO, to: q(1, n) });
      expect(b.value).toBeUndefined();
      expect(b.certificate.level).toBe("⚠");
      expect(b.asymptotics).toBe("diverges");
      // And the EXPONENT says so too. `1 − n` is negative for every n here, so carrying it would
      // leave a field reading "it vanishes" beside a certificate refusing the whole bound.
      expect(b.exponent).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it("but the OSCILLATORY form survives the very same range", () => {
    // `e^{izⁿ}`'s face is sin, which stays non-negative to π. Same arc, same n, other integrand.
    for (const n of [2, 3, 4]) {
      const b = wedgeArcBound({ w: OSCILLATORY, n, lambda: ONE }, q(6), { from: Frac.ZERO, to: q(1, n) });
      expect(b.asymptotics).toBe("vanishes");
      expect(b.certificate.level).toBe("≤");
    }
  });
});

describe("the corrected bounds hold, at finite R and not only in the limit", () => {
  const RADII = [2, 4, 8, 16];

  it("e^{−zⁿ} on [0, π/(2n)] ≤ π/(2nR^{n−1})", () => {
    for (const n of [2, 3, 4]) {
      for (const R of RADII) {
        const b = wedgeArcBound({ w: GAUSSIAN, n, lambda: ONE }, q(R), { from: Frac.ZERO, to: q(1, 2 * n) });
        expect(b.asymptotics).toBe("vanishes");
        const value = (b.value as Frac).toNumber();
        // The closed form the lemma is quoted as.
        expect(value).toBeCloseTo(Math.PI / (2 * n * R ** (n - 1)), 12);
        // And it really bounds both the majorant and the integral.
        expect(majorant(GAUSSIAN, n, R, Math.PI / (2 * n))).toBeLessThanOrEqual(value);
        expect(arcIntegral(GAUSSIAN, n, R, Math.PI / (2 * n))).toBeLessThanOrEqual(value);
      }
    }
  });

  it("e^{izⁿ} on the full [0, π/n] ≤ π/(nR^{n−1}) — twice the constant, from the fold", () => {
    for (const n of [2, 3, 4]) {
      for (const R of RADII) {
        const b = wedgeArcBound({ w: OSCILLATORY, n, lambda: ONE }, q(R), { from: Frac.ZERO, to: q(1, n) });
        const value = (b.value as Frac).toNumber();
        expect(value).toBeCloseTo(Math.PI / (n * R ** (n - 1)), 12);
        expect(majorant(OSCILLATORY, n, R, Math.PI / n)).toBeLessThanOrEqual(value);
        expect(arcIntegral(OSCILLATORY, n, R, Math.PI / n)).toBeLessThanOrEqual(value);
      }
    }
  });

  it("e^{izⁿ} on the HALF wedge gets the sharper constant, not the folded one", () => {
    // The Fresnel wedge. Getting this wrong by a factor of two would still be a true bound, which
    // is precisely why it is asserted: a bound nobody checks drifts to the loosest thing that works.
    for (const n of [2, 3, 4]) {
      const b = wedgeArcBound({ w: OSCILLATORY, n, lambda: ONE }, q(8), { from: Frac.ZERO, to: q(1, 2 * n) });
      expect((b.value as Frac).toNumber()).toBeCloseTo(Math.PI / (2 * n * 8 ** (n - 1)), 12);
    }
  });

  it("scales by |λ| and by the rate c, exactly", () => {
    const plain = wedgeArcBound({ w: GAUSSIAN, n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to: q(1, 4) });
    const scaled = wedgeArcBound({ w: GAUSSIAN, n: 2, lambda: Gauss.int(3, 4) }, q(4), { from: Frac.ZERO, to: q(1, 4) });
    // |3 + 4i| = 5, exactly — sqrtUp is exact on a rational square.
    expect((scaled.value as Frac).div(plain.value as Frac).equals(q(5))).toBe(true);

    const faster = wedgeArcBound({ w: Gauss.int(-3), n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to: q(1, 4) });
    expect((plain.value as Frac).div(faster.value as Frac).equals(q(3))).toBe(true);
  });

  it("π enters only through the certified upper bracket, so the bound is never short", () => {
    // In ℚ, not in doubles: `piUpper()` and `Math.PI` round to the SAME double, so the claim is
    // invisible at float precision and has to be made where it lives. `value·(2nR^{n−1})` is
    // `piUpper()` exactly, and `piUpper() > piLower()` — so the numerator is the bracket's upper end
    // and a bound computed this way can never fall below the true one.
    const b = wedgeArcBound({ w: GAUSSIAN, n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to: q(1, 4) });
    expect((b.value as Frac).mul(q(2 * 2 * 4)).equals(piUpper())).toBe(true);
    expect(piUpper().sub(piLower()).n).toBeGreaterThan(0n);
  });
});

describe("Jordan is this lemma at n = 1, which is the check that the sharing is real", () => {
  it("returns π/|a| on a semicircle, the same number jordanArcBound does", () => {
    for (const a of [1, 2, 5]) {
      const wedge = wedgeArcBound({ w: Gauss.int(0, a), n: 1, lambda: ONE }, q(7), {
        from: Frac.ZERO,
        to: Frac.ONE,
      });
      const jordan = jordanArcBound(QiPoly.fromCoeffs([Gauss.ONE]), QiPoly.fromCoeffs([Gauss.ONE]), q(a), "upper", q(7));
      expect((wedge.value as Frac).equals(jordan.value as Frac)).toBe(true);
    }
  });

  it("but does NOT discharge at n = 1 — the bound is constant in R", () => {
    const b = wedgeArcBound({ w: Gauss.I, n: 1, lambda: ONE }, q(7), { from: Frac.ZERO, to: Frac.ONE });
    expect(b.asymptotics).toBe("bounded");
    expect(b.certificate.level).toBe("⚠");
    expect(b.exponent).toBe(0);
    expect(b.certificate.claim).toMatch(/does NOT vanish/);
  });
});

describe("what the wedge bound refuses, and by name", () => {
  it("an arc that does not start on the positive real axis", () => {
    const b = wedgeArcBound({ w: GAUSSIAN, n: 2, lambda: ONE }, q(4), { from: q(1, 4), to: q(1, 2) });
    expect(b.value).toBeUndefined();
    expect(b.certificate.method).toMatch(/measured from the positive real axis/);
  });

  it("a w that is neither negative-real nor imaginary", () => {
    const b = wedgeArcBound({ w: Gauss.int(-1, 1), n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to: q(1, 4) });
    expect(b.value).toBeUndefined();
    expect(b.certificate.method).toMatch(/rational multiple of π/);
  });

  it("w = 0, which is not damping at all", () => {
    const b = wedgeArcBound({ w: Gauss.ZERO, n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to: q(1, 4) });
    expect(b.value).toBeUndefined();
    expect(b.certificate.method).toMatch(/plain ML bound is its lemma/);
  });

  it("the wrong sign — e^{+zⁿ} grows, and the repair is named", () => {
    for (const w of [Gauss.int(1), Gauss.int(0, -1)]) {
      const b = wedgeArcBound({ w, n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to: q(1, 4) });
      expect(b.value).toBeUndefined();
      expect(b.certificate.claim).toMatch(/DIVERGES/);
      expect(b.certificate.provenance.some((s) => s.text.includes("repair"))).toBe(true);
      expect(b.exponent).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it("a wedge swept CLOCKWISE, into the lower half-plane", () => {
    // `from` is still 0, so the refusal has to come from the range itself rather than the start.
    const b = wedgeArcBound({ w: GAUSSIAN, n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to: q(-1, 4) });
    expect(b.value).toBeUndefined();
    expect(b.certificate.method).toMatch(/positive multiple of π/);
  });

  it("a full circle and a semicircle, which are not wedges however the integrand looks", () => {
    // `e^{−z²}` on the upper semicircle is `e^{+R²}` at the top: the refusal is the honest answer,
    // and it comes from the same range test rather than from a shape check bolted on beside it.
    for (const to of [Frac.ONE, q(2)]) {
      const b = wedgeArcBound({ w: GAUSSIAN, n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to });
      expect(b.value).toBeUndefined();
      expect(b.asymptotics).toBe("diverges");
    }
  });

  it("a non-positive radius, and a degenerate arc", () => {
    expect(wedgeArcBound({ w: GAUSSIAN, n: 2, lambda: ONE }, q(0), { from: Frac.ZERO, to: q(1, 4) }).value).toBeUndefined();
    expect(wedgeArcBound({ w: GAUSSIAN, n: 2, lambda: ONE }, q(4), { from: Frac.ZERO, to: Frac.ZERO }).value).toBeUndefined();
  });

  it("reports no degreeGap, because the decay is not governed by one", () => {
    const b = wedgeArcBound({ w: GAUSSIAN, n: 3, lambda: ONE }, q(4), { from: Frac.ZERO, to: q(1, 6) });
    expect(b.degreeGap).toBeUndefined();
    expect(b.exponent).toBe(-2);
  });
});

describe("the recogniser reads λ·e^{w zⁿ}, and declines everything else", () => {
  it("reads the two forms the lemma is stated in", () => {
    const gauss = asExponentialOfPower(parse("exp(-z^2)"));
    expect(gauss?.n).toBe(2);
    expect(gauss?.w.equals(Gauss.int(-1))).toBe(true);
    expect(gauss?.lambda.equals(Gauss.ONE)).toBe(true);

    const osc = asExponentialOfPower(parse("exp(i*z^2)"));
    expect(osc?.w.equals(Gauss.I)).toBe(true);
  });

  it("reads a constant prefactor and a rational rate", () => {
    const f = asExponentialOfPower(parse("3*exp(-z^4/2)"));
    expect(f?.n).toBe(4);
    expect(f?.lambda.equals(Gauss.int(3))).toBe(true);
    expect(f?.w.equals(new Gauss(Frac.of(-1n, 2n), Frac.ZERO))).toBe(true);
  });

  it("declines a z-dependent cofactor rather than dropping it", () => {
    // `z·e^{−z²}`'s bound is not `π/(2·2·R)`: the cofactor changes the asymptotics, and silently
    // ignoring it would report a `≤` that is false at large R.
    expect(asExponentialOfPower(parse("z*exp(-z^2)"))).toBeNull();
    expect(asExponentialOfPower(parse("exp(-z^2)/(1+z)"))).toBeNull();
  });

  it("declines a lower-order term in the exponent", () => {
    expect(asExponentialOfPower(parse("exp(-z^2 + z)"))).toBeNull();
    expect(asExponentialOfPower(parse("exp(-z^2 + 1)"))).toBeNull();
  });

  it("declines two exponentials, an exponential in a denominator, and a constant exponent", () => {
    expect(asExponentialOfPower(parse("exp(-z^2)*exp(-z^3)"))).toBeNull();
    expect(asExponentialOfPower(parse("1/exp(-z^2)"))).toBeNull();
    expect(asExponentialOfPower(parse("exp(3)"))).toBeNull();
  });

  it("still reads the linear case, which the ledger routes to Jordan instead", () => {
    const linear = asExponentialOfPower(parse("exp(i*z)"));
    expect(linear?.n).toBe(1);
  });
});
