// **THE STRIP'S POLES, AND THE RESIDUES E1 AND E2 RUN ON.**
//
// The claims here are checked two ways on purpose. The FORM is asserted against the record's own
// text — E1's residue is `−e^{iπa}`, and the engine is required to produce that expression, not a
// decimal that agrees with it. The VALUE is then checked against an independent numeric contour
// integral `(1/2πi)∮ f dz` on a small circle about the pole, which shares no arithmetic with the
// exact route: the exact side is a polynomial division over ℚ(i), the numeric side is a trapezoid.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { makeComplexFn, parse } from "@cas/expr";
import {
  asExponentialLattice,
  polesInStrip,
  turnsOf,
  MAX_ROOT_ORDER,
} from "../src/kernel/expLattice.js";
import type { Cx } from "../src/kernel/geom.js";

const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const form = (src: string) => {
  const f = asExponentialLattice(parse(src));
  if (f === null) throw new Error(`expected ${src} to read as a lattice form`);
  return f;
};
const strip = (src: string, height: Frac) => {
  const r = polesInStrip(form(src), height);
  if (!r.ok) throw new Error(`expected ${src} to resolve: ${r.reason}`);
  return r;
};

/** `(1/2πi)∮ f dz` on `|z − z₀| = r`, by the trapezoid rule — exact for an analytic annulus. */
function numericResidue(src: string, z0: Cx, r = 0.12, n = 4096): Cx {
  const fn = makeComplexFn(parse(src));
  let re = 0;
  let im = 0;
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    const z: [number, number] = [z0[0] + r * Math.cos(t), z0[1] + r * Math.sin(t)];
    const v = fn(z, [0, 0]) as [number, number];
    // f(z)·(z − z₀) averaged over the circle IS the residue at a simple pole.
    const dx = r * Math.cos(t);
    const dy = r * Math.sin(t);
    re += v[0] * dx - v[1] * dy;
    im += v[0] * dy + v[1] * dx;
  }
  return [re / n, im / n];
}

const close = (a: Cx, b: Cx, tol = 1e-9): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

describe("w = e^z reads the strip integrands as rational", () => {
  it("reads E1's e^{az}/(1 + e^z)", () => {
    const f = form("exp(0.3*z)/(1 + exp(z))");
    expect(f.a.equals(Gauss.rat(3n, 10n))).toBe(true);
    expect(f.num.degree()).toBe(0);
    // D(w) = 1 + w.
    expect(f.den.degree()).toBe(1);
  });

  it("reads E2's e^{iξz}/cosh z, with cosh cleared to a polynomial in w", () => {
    const f = form("exp(i*2*z)/cosh(z)");
    expect(f.a.equals(new Gauss(Frac.ZERO, q(2)))).toBe(true);
    // 1/cosh z = 2w/(w² + 1): the numerator carries the w that clearing w⁻¹ produced.
    expect(f.den.degree()).toBe(2);
    expect(f.num.degree()).toBe(1);
  });

  it("folds an INTEGER exponential into a power of w, leaving no carrier", () => {
    // Otherwise `e^{2z}/(1+e^z)` could be read two ways and `a` would not be unique.
    const f = form("exp(2*z)/(1 + exp(z))");
    expect(f.a.isZero()).toBe(true);
    expect(f.num.degree()).toBe(2);
  });

  it("reads sinh and tanh too, and locates their poles rather than their degrees", () => {
    // `toExactRational` does NOT reduce to lowest terms (its doc says why: a shared factor is a
    // removable singularity the caller must be able to see), so `tanh z` comes back as
    // `w(w²−1) / w(w²+1)` — degree 3 over 3. The meaningful claim is where the poles are.
    expect(strip("1/sinh(z)", q(2)).poles.map((x) => x.turns.toNumber())).toEqual([0.5]);
    expect(strip("tanh(z)", q(2)).poles.map((x) => x.turns.toNumber())).toEqual([0.25, 0.75]);
  });

  it("treats a root at w = 0 as no pole at all, because e^z is never zero", () => {
    // `sinh z` is ENTIRE. Clearing its `w⁻¹` leaves a bare `w` in the denominator, and reading that
    // as a pole would refuse an entire function for want of log 0.
    expect(strip("sinh(z)", q(2)).poles.length).toBe(0);
  });

  it("REFUSES a bare z — which is the whole soundness of the substitution", () => {
    // Rewriting blindly would turn `z·e^z` into `w·w`: a rational function of w, and not this
    // function. Every z must sit inside one of the recognised transcendental functions.
    expect(asExponentialLattice(parse("z*exp(z)"))).toBeNull();
    expect(asExponentialLattice(parse("z/(1 + exp(z))"))).toBeNull();
    expect(asExponentialLattice(parse("1/(z + exp(z))"))).toBeNull();
  });

  it("refuses cos and sin, which want a DIFFERENT substitution", () => {
    // `cos z` is rational in `e^{iz}`, and one expression cannot be rational in both.
    expect(asExponentialLattice(parse("1/cos(z)"))).toBeNull();
    expect(asExponentialLattice(parse("sin(z)/(1 + exp(z))"))).toBeNull();
  });

  it("refuses a non-integer exponential buried inside a sum", () => {
    expect(asExponentialLattice(parse("1/(1 + exp(z/2))"))).toBeNull();
  });
});

describe("turnsOf — the order is exact, the numerator is read off it", () => {
  it("identifies the roots of unity in ℚ(i)", () => {
    expect(turnsOf(SqrtExt.fromGauss(Gauss.ONE))?.equals(Frac.ZERO)).toBe(true);
    expect(turnsOf(SqrtExt.fromGauss(Gauss.int(-1)))?.equals(q(1, 2))).toBe(true);
    expect(turnsOf(SqrtExt.fromGauss(Gauss.I))?.equals(q(1, 4))).toBe(true);
    expect(turnsOf(SqrtExt.fromGauss(Gauss.I.neg()))?.equals(q(3, 4))).toBe(true);
  });

  it("identifies one in a quadratic extension — a primitive cube root", () => {
    // ω = (−1 + i√3)/2, which `1 + w + w²` has as a root; q = 1/3.
    const omega = SqrtExt.of(Gauss.rat(-1n, 2n), Gauss.rat(0n, 1n, 1n, 2n), 3n);
    expect(turnsOf(omega)?.equals(q(1, 3))).toBe(true);
  });

  it("refuses anything not a root of unity of small order", () => {
    expect(turnsOf(SqrtExt.fromGauss(Gauss.int(2)))).toBeNull();
    expect(turnsOf(SqrtExt.fromGauss(Gauss.rat(1n, 2n)))).toBeNull();
    expect(turnsOf(SqrtExt.ZERO)).toBeNull();
  });

  it("has a stated bound rather than a tuned one", () => {
    expect(MAX_ROOT_ORDER).toBe(12);
  });
});

describe("E1 — the residue the record's closed form is built from", () => {
  const SRC = "exp(0.3*z)/(1 + exp(z))";

  it("puts exactly one pole in the strip 0 < Im z < 2π, at z = iπ", () => {
    const r = strip(SRC, q(2));
    expect(r.poles.length).toBe(1);
    expect(r.poles[0].turns.equals(q(1, 2))).toBe(true);
    expect(r.poles[0].at[1]).toBeCloseTo(Math.PI, 12);
  });

  it("gives the residue as −e^{iπa}, which is the record's own expression", () => {
    const p = strip(SRC, q(2)).poles[0];
    // a = 3/10, so iπa = 3iπ/10 and the residue is −e^{3iπ/10}.
    expect(p.residueText).toBe("−e^(3iπ/10)");
  });

  it("agrees with an independent numeric contour integral", () => {
    const p = strip(SRC, q(2)).poles[0];
    expect(close(p.residue.toTuple(), numericResidue(SRC, [0, Math.PI]))).toBe(true);
  });

  it("HEIGHT 4π encloses two poles — E1's wrong-strip-height trap, as arithmetic", () => {
    // The record: "Height 4π here reproduces with λ² but encloses z = iπ and z = 3iπ."
    const r = strip(SRC, q(4));
    expect(r.poles.length).toBe(2);
    expect(r.poles.map((x) => x.turns.toNumber())).toEqual([0.5, 1.5]);
  });

  it("height π encloses none, which is why that strip reproduces with nothing", () => {
    expect(strip(SRC, q(1)).poles.length).toBe(0);
  });

  it("is exact at every fixture the record declares", () => {
    for (const [n, d] of [[3, 10], [1, 2], [91, 100], [1, 20]] as const) {
      const src = `exp((${n}/${d})*z)/(1 + exp(z))`;
      const p = strip(src, q(2)).poles[0];
      expect(close(p.residue.toTuple(), numericResidue(src, [0, Math.PI]))).toBe(true);
    }
  });
});

describe("E2 — a negative-real quasi-period, and a pole at iπ/2", () => {
  const SRC = "exp(i*2*z)/cosh(z)";

  it("puts exactly one pole in 0 < Im z < π, at z = iπ/2", () => {
    const r = strip(SRC, q(1));
    expect(r.poles.length).toBe(1);
    expect(r.poles[0].turns.equals(q(1, 4))).toBe(true);
    expect(r.poles[0].at[1]).toBeCloseTo(Math.PI / 2, 12);
  });

  it("gives −i·e^{−πξ/2}, agreeing with the numeric residue", () => {
    const p = strip(SRC, q(1)).poles[0];
    expect(close(p.residue.toTuple(), numericResidue(SRC, [0, Math.PI / 2]))).toBe(true);
    // ξ = 2 ⇒ e^{−π}; the coefficient is −i.
    expect(p.residue.toTuple()[0]).toBeCloseTo(0, 12);
    expect(p.residue.toTuple()[1]).toBeCloseTo(-Math.exp(-Math.PI), 12);
  });

  it("finds BOTH poles of cosh in the doubled strip, at iπ/2 and 3iπ/2", () => {
    const r = strip(SRC, q(2));
    expect(r.poles.map((x) => x.turns.toNumber())).toEqual([0.25, 0.75]);
  });

  it("is exact across ξ, including ξ = 0 and a negative ξ", () => {
    for (const xi of [0, 1, -1.5, 3]) {
      const src = `exp(i*(${xi})*z)/cosh(z)`;
      const p = strip(src, q(1)).poles[0];
      expect(close(p.residue.toTuple(), numericResidue(src, [0, Math.PI / 2]))).toBe(true);
    }
  });
});

describe("the strip is OPEN, and a carrier may sit in the denominator", () => {
  it("excludes a pole ON the boundary — E1's no-pole-on-the-boundary hypothesis, as arithmetic", () => {
    // `1/(1 − e^z)` has its root at w = 1, so its lattice sits at z = 0, 2πi, 4πi … — exactly the
    // lines Im z ∈ {0, 2π} that bound E1's strip. The record declares that no pole may lie there;
    // here that is not a check bolted on but the open interval `0 < turns < height/2`.
    const r = polesInStrip(form("1/(1 - exp(z))"), q(2));
    expect(r.ok && r.poles.length).toBe(0);
    // Widen the strip and the interior one appears, which is what shows the exclusion is about the
    // BOUNDARY rather than about that root.
    const wider = polesInStrip(form("1/(1 - exp(z))"), q(4));
    expect(wider.ok && wider.poles.map((x) => x.turns.toNumber())).toEqual([1]);
  });

  it("counts a carrier in the DENOMINATOR negatively", () => {
    // `1/(e^{az}(1+e^z))` is `e^{−az}/(1+e^z)`: same lattice, conjugate phase.
    const above = strip("exp(0.3*z)/(1 + exp(z))", q(2)).poles[0];
    const below = strip("1/(exp(0.3*z)*(1 + exp(z)))", q(2)).poles[0];
    expect(below.residueText).toBe("−e^(−3iπ/10)");
    expect(above.residue.toTuple()[0]).toBeCloseTo(below.residue.toTuple()[0], 12);
    expect(above.residue.toTuple()[1]).toBeCloseTo(-below.residue.toTuple()[1], 12);
    expect(close(below.residue.toTuple(), numericResidue("1/(exp(0.3*z)*(1 + exp(z)))", [0, Math.PI]))).toBe(true);
  });
});

describe("what the strip reader refuses, and by name", () => {
  it("a root of D off the unit circle, naming the extension that would carry it", () => {
    const r = polesInStrip(form("1/(2 + exp(z))"), q(2));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not a root of unity/);
    expect(!r.ok && r.reason).toMatch(/ln\|w\|/);
  });

  it("a repeated root, which needs derivatives the basis does not carry", () => {
    const r = polesInStrip(form("1/(1 + exp(z))^2"), q(2));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/multiplicity 2/);
  });

  it("a non-positive strip height", () => {
    expect(polesInStrip(form("1/(1 + exp(z))"), Frac.ZERO).ok).toBe(false);
    expect(polesInStrip(form("1/(1 + exp(z))"), q(-1)).ok).toBe(false);
  });
});
