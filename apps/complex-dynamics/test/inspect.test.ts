import { describe, it, expect } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { inspect, rotationNumber, findNucleus, fatouComponentType } from "../src/render/inspect";
import type { Complex } from "../src/complex";

const F = parse("z^2+c"); // Mandelbrot / Julia map
const ESC = parse("abs(z)>2");
const O: Complex = [0, 0]; // critical point of z²+c

describe("rotationNumber", () => {
  it("is 1/2 for a 2-cycle and 1/3 for a CCW 3-cycle (in orbit order)", () => {
    expect(
      rotationNumber([
        [1, 0],
        [-1, 0],
      ]),
    ).toEqual({ p: 1, q: 2 });
    expect(
      rotationNumber([
        [1, 0],
        [-0.5, 0.866],
        [-0.5, -0.866],
      ]),
    ).toEqual({ p: 1, q: 3 });
  });

  it("is null for a single point", () => {
    expect(rotationNumber([[1, 0]])).toBeNull();
  });

  it("is null for a collinear (real) cycle of period ≥ 3 — no winding", () => {
    expect(
      rotationNumber([
        [1, 0],
        [-0.5, 0],
        [-2, 0],
      ]),
    ).toBeNull();
    expect(
      rotationNumber([
        [0, 1],
        [0, -0.3],
        [0, 2],
        [0, -1.5],
      ]),
    ).toBeNull();
  });
});

describe("inspect — parameter plane (critical orbit)", () => {
  it("main cardioid: attracting fixed point (period 1, |λ| < 1)", () => {
    const r = inspect(F, ESC, "param", O, [-0.1, 0]);
    expect(r.fate).toBe("converged");
    expect(r.period).toBe(1);
    expect(r.multiplierMag).not.toBeNull();
    // `?? 9` so a null magnitude (which .not.toBeNull already guards) still fails here.
    expect(r.multiplierMag ?? 9).toBeGreaterThan(0.05);
    expect(r.multiplierMag ?? 9).toBeLessThan(1);
  });

  it("period-2 bulb centre c=-1: period 2, superattracting, rotation 1/2", () => {
    const r = inspect(F, ESC, "param", O, [-1, 0]);
    expect(r.period).toBe(2);
    expect(r.multiplierMag ?? 9).toBeLessThan(1e-3);
    expect(r.rotation).toEqual({ p: 1, q: 2 });
  });

  it("1/3 bulb centre: period 3, superattracting, rotation denominator 3", () => {
    const r = inspect(F, ESC, "param", O, [-0.1225611668, 0.7448617666]);
    expect(r.period).toBe(3);
    expect(r.multiplierMag ?? 9).toBeLessThan(1e-3);
    expect(r.rotation?.q).toBe(3);
  });

  it("exterior c=2: escapes with a positive, finite distance estimate", () => {
    const r = inspect(F, ESC, "param", O, [2, 0]);
    expect(r.fate).toBe("escaped");
    expect(r.distance).not.toBeNull();
    expect(r.distance ?? -1).toBeGreaterThan(0);
    expect(Number.isFinite(r.distance ?? NaN)).toBe(true);
  });
});

describe("inspect — dynamical plane", () => {
  it("escaped z₀ reports a positive distance to the Julia set", () => {
    const r = inspect(F, ESC, "dyn", [2, 0], [0, 0]);
    expect(r.fate).toBe("escaped");
    expect(r.distance ?? -1).toBeGreaterThan(0);
  });
});

describe("inspect — non-holomorphic fallback", () => {
  it("conjugate map (Mandelbar): period reported, multiplier null", () => {
    const bar = parse("conjugate(z)^2+c");
    const r = inspect(bar, ESC, "param", O, [0, 0]);
    expect(r.period).toBe(1); // 0 is a fixed point of conj(z)²
    expect(r.multiplier).toBeNull();
    expect(r.distance).toBeNull();
  });

  it("conjugate map that escapes: fate escaped, distance null (no derivative)", () => {
    const bar = parse("conjugate(z)^2+c");
    const r = inspect(bar, ESC, "param", O, [2, 0]); // c=2 escapes
    expect(r.fate).toBe("escaped");
    expect(r.distance).toBeNull(); // non-holomorphic ⇒ no analytic DE
  });
});

describe("inspect — located cycle points", () => {
  it("captures the attracting cycle (param plane, c=-1 → superattracting 2-cycle {0,-1})", () => {
    const r = inspect(F, ESC, "param", O, [-1, 0]);
    expect(r.cyclePoints).not.toBeNull();
    expect(r.cyclePoints?.length).toBe(r.period);
    expect(r.cyclePoints?.length).toBe(2);
    // The critical 2-cycle of z²−1 is {0, −1} (in some rotation); both points are real.
    const xs = (r.cyclePoints ?? []).map((p) => p[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1, 6);
    expect(xs[1]).toBeCloseTo(0, 6);
    for (const p of r.cyclePoints ?? []) expect(Math.abs(p[1])).toBeLessThan(1e-6);
  });

  it("captures the cycle on the dynamical plane (z₀=0 in the basilica basin)", () => {
    const r = inspect(F, ESC, "dyn", O, [-1, 0]);
    expect(r.cyclePoints?.length).toBe(2);
  });

  it("is null when the orbit escapes", () => {
    const r = inspect(F, ESC, "param", O, [2, 0]);
    expect(r.fate).toBe("escaped");
    expect(r.cyclePoints).toBeNull();
  });

  it("Newton-refines the cycle so fᵖ(z*) = z* to high precision", () => {
    const f = makeComplexFn(F);
    // Attracting (not superattracting) fixed point at c = -0.5: f(z*) = z*.
    const c1: Complex = [-0.5, 0];
    const z1 = inspect(F, ESC, "param", O, c1).cyclePoints?.[0] ?? [9, 9];
    const fz1 = f(z1, c1);
    expect(Math.hypot(fz1[0] - z1[0], fz1[1] - z1[1])).toBeLessThan(1e-12);
    // Period-3 (1/3 bulb centre): f³(z*) = z*.
    const c3: Complex = [-0.1225611668, 0.7448617666];
    const r3 = inspect(F, ESC, "param", O, c3);
    let w = r3.cyclePoints?.[0] ?? [9, 9];
    for (let k = 0; k < r3.period; k++) w = f(w, c3);
    const z3 = r3.cyclePoints?.[0] ?? [0, 0];
    expect(Math.hypot(w[0] - z3[0], w[1] - z3[1])).toBeLessThan(1e-9);
  });
});

describe("findNucleus", () => {
  it("snaps to the period-2 nucleus c = -1 from inside the bulb", () => {
    const c = findNucleus(F, O, 2, [-0.9, 0.1]);
    expect(c).not.toBeNull();
    expect(c?.[0] ?? 9).toBeCloseTo(-1, 10);
    expect(c?.[1] ?? 9).toBeCloseTo(0, 10);
  });

  it("snaps to the period-3 (rabbit) nucleus", () => {
    const c = findNucleus(F, O, 3, [-0.12, 0.74]);
    expect(c?.[0] ?? 9).toBeCloseTo(-0.1225611668, 8);
    expect(c?.[1] ?? 9).toBeCloseTo(0.7448617666, 8);
  });

  it("lands on a superattracting centre (|λ| ≈ 0 there)", () => {
    const c = findNucleus(F, O, 2, [-0.9, 0.1]);
    const r = inspect(F, ESC, "param", O, c ?? [0, 0]);
    expect(r.multiplierMag ?? 9).toBeLessThan(1e-3);
  });

  it("returns null for a non-holomorphic map (no analytic derivative)", () => {
    const bar = parse("conjugate(z)^2+c");
    expect(findNucleus(bar, O, 2, [-0.9, 0.1])).toBeNull();
  });
});

// ── WP2 / I1 (review 2026-09-16): the exterior distance estimate ──────────────────────────────
// It used to stop iterating the moment `escape(z, c)` fired — which is exactly where |z| is
// smallest and ln|z| is closest to zero, so the quotient was noise. At the default `abs(z) > 2`
// the estimate at c = −2.01 came back 70× too large. It now carries the orbit on to DE_RADIUS,
// and the leading ½ is gone (it was a systematic 2× under-read and contradicted the README).
//
// Truths: the unit disk is analytic (K for c = 0 is |z| ≤ 1); the real tip of M is exactly −2;
// the cardioid distances were computed by minimising |c − (e^{iθ}/2 − e^{2iθ}/4)| over θ to
// machine precision — note these are NOT the naive "0.26 − 0.25" values, because the cusp wraps
// to the RIGHT of ¼, so c = 0.26 is 1.96e-3 from M rather than 1e-2.
describe("inspect — the exterior distance estimate is honest", () => {
  const ratio = (got: number | null, truth: number): number => (got ?? NaN) / truth;

  it("is exact on the one case that has an exact answer (K = the unit disk, c = 0)", () => {
    // Nothing else pins the CONSTANT: the disk is where d ≈ |z|ln|z|/|z'| is an equality in the
    // limit, so a stray factor shows up here and nowhere else. The old ½ read 0.502.
    expect(ratio(inspect(F, ESC, "dyn", [1.01, 0], [0, 0]).distance, 0.01)).toBeCloseTo(1, 1);
    expect(ratio(inspect(F, ESC, "dyn", [1.0001, 0], [0, 0]).distance, 1e-4)).toBeCloseTo(1, 1);
  });

  it("stays inside the Koebe factor-of-4 band on the parameter plane", () => {
    // d/4 ≤ true ≤ 4d is a THEOREM, not slack in the implementation — no constant makes this
    // sharp, which is why the row is labelled ≈.
    const cases: Array<[string, [number, number], number]> = [
      ["real tip c = −2.01", [-2.01, 0], 1.0e-2],
      ["cusp c = 0.26", [0.26, 0], 1.9612e-3],
      ["cusp c = 0.2501", [0.2501, 0], 1.9996e-6],
      ["c = 0.3", [0.3, 0], 2.0412e-2],
    ];
    for (const [name, c, truth] of cases) {
      const r = ratio(inspect(F, ESC, "param", O, c).distance, truth);
      expect(r, `${name}: estimate/truth = ${r}`).toBeGreaterThan(0.25);
      expect(r, `${name}: estimate/truth = ${r}`).toBeLessThan(4);
    }
  });

  it("no longer reads 70× high at the real tip (the defect this closes)", () => {
    // The specific number from the review. Stopping at the predicate gave 0.70 for a true 0.01.
    const d = inspect(F, ESC, "param", O, [-2.01, 0]).distance ?? NaN;
    expect(d).toBeLessThan(0.1); // 10× the truth; the old code returned ~0.70
  });

  it("reports nothing when the predicate fires on something other than divergence", () => {
    // The magnet family escapes on CONVERGENCE to its fixed point z = 1, so |z| stays bounded and
    // an EXTERIOR distance estimate is meaningless there. Silence beats a confident wrong number.
    const magnetF = parse("((z^2+c-1)/(2*z+c-2))^2");
    const magnetEsc = parse("if(abs(z)>3,true,abs(z-1)<0.001)");
    const r = inspect(magnetF, magnetEsc, "dyn", [1.0001, 0], [1.5, 0.5]);
    expect(r.distance).toBeNull();
  });
});

// ── WP4 / I7 (review 2026-09-16): a Newton solve must land where it was sent ──────────────────
describe("findNucleus — refuses a centre of the wrong period", () => {
  // Every period-2 centre is also a root of g(c) = f⁴(0) − 0, so Newton had no reason to prefer the
  // period-4 one. The advice to "seed it inside the component" was never enforced, and the result
  // was snapped to and reported as the nucleus the user asked for.
  it("does not return the period-2 centre when asked for period 4", () => {
    // From inside the 1/2 bulb this returned c = −1 — a genuine nucleus, of the wrong period.
    expect(findNucleus(F, O, 4, [-0.9, 0.05])).toBeNull();
  });

  it("does not return the cardioid centre when asked for period 3 from far away", () => {
    // This returned c = 0, the period-1 centre, 0.85 away from the seed.
    expect(findNucleus(F, O, 3, [0.6, 0.6])).toBeNull();
  });

  it("still finds every nucleus it was finding before", () => {
    // The anti-vacuity clause: the guard must reject only the wrong-period answers.
    const half = findNucleus(F, O, 2, [-0.9, 0.05]);
    expect(half?.[0]).toBeCloseTo(-1, 9);
    const rabbit = findNucleus(F, O, 3, [-0.12, 0.75]);
    expect(rabbit?.[0]).toBeCloseTo(-0.122561, 5);
    expect(rabbit?.[1]).toBeCloseTo(0.744862, 5);
    const p4 = findNucleus(F, O, 4, [-1.31, 0.01]);
    expect(p4?.[0]).toBeCloseTo(-1.310703, 5);
  });
});

// ── WP5 / I5 (review 2026-09-16): the indifferent verdicts are reachable at last ──────────────
// `classifyOrbit` decides a cycle by waiting for the orbit to return within 1e-6 in ≤ 512
// iterations. That is a convergence-SPEED test, and it fails exactly where the interesting
// parameters are. Measured before the fallback existed: the golden-mean Siegel point, the parabolic
// c = −3/4, the cusp c = 1/4, the 1/3 root — and an ATTRACTING c at |λ| = 0.99 — every one reported
// `fate: "undetermined"`, period 0 and no multiplier. So the Siegel / Cremer / parabolic verdicts
// the README documents could not be reached from a click at all.
describe("inspect — indifferent and slow parameters are classified exactly", () => {
  /** c on the cardioid at internal angle θ: c = μ/2 − μ²/4 with μ = e^{2πiθ}. */
  const cardioid = (t: number): Complex => {
    const m: Complex = [Math.cos(2 * Math.PI * t), Math.sin(2 * Math.PI * t)];
    const m2: Complex = [m[0] * m[0] - m[1] * m[1], 2 * m[0] * m[1]];
    return [m[0] / 2 - m2[0] / 4, m[1] / 2 - m2[1] / 4];
  };
  const classify = (c: Complex): string | null => {
    const r = inspect(F, ESC, "param", O, c);
    return fatouComponentType(r.multiplier, r.multiplierMag)?.type ?? null;
  };

  it("classifies the parabolic points on the cardioid", () => {
    expect(classify(cardioid(0.5))).toBe("parabolic"); // c = −3/4, the period-2 root
    expect(classify(cardioid(1 / 3))).toBe("parabolic"); // the 1/3 root
    // The CUSP, c = 1/4. Here f(z) − z has a DOUBLE root, Durand–Kerner gets only √ε, and the
    // spurious imaginary part put θ at ~1e-8 instead of 0 — so the app reported a Siegel disc at the
    // one point on the cardioid where everyone can see there is none.
    expect(classify(cardioid(0))).toBe("parabolic");
  });

  it("classifies the golden-mean Siegel point", () => {
    expect(classify(cardioid((Math.sqrt(5) - 1) / 2))).toBe("siegel");
  });

  it("classifies a slowly-attracting parameter the orbit test could not settle", () => {
    // |λ| = 0.99 needs ≈ 1,375 iterations to return within 1e-6; the budget is 512.
    const lam = 0.99;
    const mu: Complex = [lam * Math.cos(1), lam * Math.sin(1)];
    const mu2: Complex = [mu[0] * mu[0] - mu[1] * mu[1], 2 * mu[0] * mu[1]];
    const c: Complex = [mu[0] / 2 - mu2[0] / 4, mu[1] / 2 - mu2[1] / 4];
    const r = inspect(F, ESC, "param", O, c);
    expect(r.period).toBe(1);
    expect(r.multiplierMag ?? 0).toBeCloseTo(0.99, 6);
    expect(fatouComponentType(r.multiplier, r.multiplierMag)?.type).toBe("attracting");
  });

  it("declines where the attractor is a genuine higher-period cycle", () => {
    // The anti-vacuity clause: in the 1/2 bulb α is REPELLING, so the fixed-point fallback must not
    // answer — the settled-cycle path does, with period 2.
    const r = inspect(F, ESC, "param", O, [-1, 0]);
    expect(r.period).toBe(2);
  });
});
