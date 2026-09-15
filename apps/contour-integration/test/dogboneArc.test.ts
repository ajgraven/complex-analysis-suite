// The ML bound on a cap that sits ON a branch point — the dogbone's end, and where `α > −1` is spent.
//
// The load-bearing test is the second: the bound is checked against a numerical integral of the same
// cap, at several radii. A bound that is not actually a bound is the worst thing this directory can
// produce, because it wears a `≤`.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { dogboneArcBound, type DogboneArcInput } from "../src/kernel/bounds/branchArc.js";

const q = (n: bigint, d = 1n) => Frac.of(n, d);
const poly = (...c: bigint[]) => QiPoly.fromCoeffs(c.map((k) => Gauss.int(k)));
const ratPoly = (...c: Frac[]) => QiPoly.fromCoeffs(c.map((k) => new Gauss(k, Frac.ZERO)));

/** D6's right-hand cap: f = 1/((z²+a²)·√(1−z²)), centred at the branch point z = 1. */
function d6Cap(aSquared: Frac, eta: Frac): DogboneArcInput {
  // The cofactor 1/(z²+a²) shifted so w = z − 1 is the variable: (1+w)² + a² = w² + 2w + (1+a²).
  const den = ratPoly(Frac.ONE.add(aSquared), q(2n), Frac.ONE);
  return {
    alpha: q(-1n, 2n),
    others: [{ distanceSquared: q(4n), alpha: q(-1n, 2n), label: "z = −1" }],
    constantModulusSquared: q(1n), // |i|² = 1
    num: poly(1n),
    den,
    eta,
    piMultiple: q(2n),
  };
}

/** `1/((z²+a²)W(z))` with W pinned by W(x + i0) = +√(1−x²), evaluated directly in floats. */
function f(a: number, x: number, y: number): [number, number] {
  const argIn = (px: number, py: number): number => {
    const t = Math.atan2(py, px);
    return t < 0 ? t + 2 * Math.PI : t;
  };
  const lm = 0.5 * (Math.log(Math.hypot(x - 1, y)) + Math.log(Math.hypot(x + 1, y)));
  const th = 0.5 * (argIn(x - 1, y) + argIn(x + 1, y));
  // W = −i·e^{lm+i·th}
  const wr = Math.exp(lm) * Math.sin(th);
  const wi = -Math.exp(lm) * Math.cos(th);
  // (z² + a²)·W
  const zr = x * x - y * y + a * a;
  const zi = 2 * x * y;
  const dr = zr * wr - zi * wi;
  const di = zr * wi + zi * wr;
  const m = dr * dr + di * di;
  return [dr / m, -di / m];
}

/** `∮` over the cap |z − 1| = η, the full turn the template draws, by the trapezoidal rule. */
function capIntegral(a: number, eta: number, n = 20000): number {
  let re = 0;
  let im = 0;
  for (let k = 0; k < n; k++) {
    const t = Math.PI - (2 * Math.PI * k) / n; // θ: π → −π, the template's direction
    const x = 1 + eta * Math.cos(t);
    const y = eta * Math.sin(t);
    const [fr, fi] = f(a, x, y);
    // dz = i·η·e^{iθ}·dθ, dθ = −2π/n
    const dr = -eta * Math.sin(t);
    const di = eta * Math.cos(t);
    const step = (-2 * Math.PI) / n;
    re += (fr * dr - fi * di) * step;
    im += (fr * di + fi * dr) * step;
  }
  return Math.hypot(re, im);
}

describe("the ML bound about a branch point", () => {
  it("discharges D6's cap: O(η^{1/2}), and the exponent decides it", () => {
    const r = dogboneArcBound(d6Cap(q(1n), q(3n, 25n)));
    expect(r.asymptotics).toBe("vanishes");
    expect(r.exponent).toBeCloseTo(0.5, 15);
    expect(r.certificate.level).toBe("≤");
    expect(r.certificate.claim).toMatch(/O\(\\eta\^\{1\/2\}\)/);
    expect(r.certificate.provenance.map((s) => s.text).join(" | ")).toMatch(
      /α_b > −1 is the integrability of the endpoint singularity/,
    );
  });

  it("IS a bound: it dominates the cap's actual integral at every radius", () => {
    // The one check that matters. A `≤` that does not hold is worse than no bound at all.
    for (const [a, aSquared] of [
      [1, q(1n)],
      [0.5, q(1n, 4n)],
      [2, q(4n)],
      [3.7, q(1369n, 100n)],
    ] as [number, Frac][]) {
      for (const [n, d] of [
        [3n, 25n],
        [1n, 20n],
        [1n, 100n],
        [1n, 1000n],
      ] as [bigint, bigint][]) {
        const eta = q(n, d);
        const r = dogboneArcBound(d6Cap(aSquared, eta));
        const claimed = Number(/\\le ([0-9.e+-]+)/.exec(r.certificate.claim)?.[1] ?? "NaN");
        const actual = capIntegral(a, eta.toNumber());
        expect({ a, eta: eta.toNumber(), holds: actual <= claimed }).toEqual({
          a,
          eta: eta.toNumber(),
          holds: true,
        });
      }
    }
  });

  it("shrinks like √η, which is the whole claim about the limit", () => {
    const at = (n: bigint, d: bigint): number =>
      Number(/\\le ([0-9.e+-]+)/.exec(dogboneArcBound(d6Cap(q(1n), q(n, d))).certificate.claim)?.[1] ?? "NaN");
    const coarse = at(1n, 100n);
    const fine = at(1n, 10000n);
    // A hundredfold smaller η is a tenfold smaller bound.
    expect(coarse / fine).toBeGreaterThan(9);
    expect(coarse / fine).toBeLessThan(11);
  });

  it("does NOT discharge at α = −1, where the endpoint stops being integrable", () => {
    const r = dogboneArcBound({ ...d6Cap(q(1n), q(3n, 25n)), alpha: q(-1n) });
    expect(r.asymptotics).toBe("bounded");
    expect(r.exponent).toBe(0);
    expect(r.certificate.level).toBe("⚠");
    expect(r.certificate.claim).toMatch(/does not vanish/);
  });

  it("diverges below α = −1, and says so", () => {
    const r = dogboneArcBound({ ...d6Cap(q(1n), q(3n, 25n)), alpha: q(-3n, 2n) });
    expect(r.asymptotics).toBe("diverges");
    expect(r.certificate.claim).toMatch(/diverges/);
  });

  it("refuses a cap that reaches the other branch point", () => {
    // η = 2 is exactly the distance to z = −1, and η = 3 is past it. Either way the factor the cap
    // carries from the far end is not bounded on it, so there is no bound of this form at all.
    for (const eta of [q(2n), q(3n)]) {
      const r = dogboneArcBound(d6Cap(q(1n), eta));
      expect(r.certificate.level).toBe("⚠");
      expect(r.certificate.method).toMatch(/the cap reaches the other branch point z = −1/);
      expect(r.certificate.method).toMatch(/shrink η/);
    }
  });

  it("refuses a cap with a pole of the cofactor on it", () => {
    // a → 0 puts the cofactor's poles at the origin, which is distance 1 from the cap's centre; at
    // η = 1 the reverse triangle inequality gives nothing.
    const r = dogboneArcBound({ ...d6Cap(q(0n), q(1n)), den: poly(1n, 2n, 1n) });
    expect(r.certificate.level).toBe("⚠");
    expect(r.certificate.method).toMatch(/no positive lower bound/);
  });

  it("needs no other branch point at all, and says which case it is in", () => {
    const r = dogboneArcBound({ ...d6Cap(q(1n), q(3n, 25n)), others: [] });
    expect(r.asymptotics).toBe("vanishes");
    expect(r.certificate.provenance.map((s) => s.text).join(" | ")).toMatch(
      /this is the only branch point/,
    );
  });
});
