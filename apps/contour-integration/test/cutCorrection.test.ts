// Which determination the PICTURE is drawn in — and three independent ways of deciding it.
//
// The correction is a difference of two crossing counts. Nothing about that is obviously right, so it
// is checked against two mechanisms that share none of its machinery: `argCut`, which takes a
// modulus rather than counting anything, and `liftArgument` — the continuous-argument lift that
// carries the ANSWER, so agreement with it is the statement that the picture and the ledger are in
// the same branch.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import {
  argCut,
  cutCorrection,
  cutSegments,
  jumpWeights,
  logCut,
  powCut,
  signedCross,
  PRINCIPAL_DIRECTION,
} from "../src/kernel/branch/correction.js";
import { INFINITY, NO_BRANCH, type BranchChoice } from "../src/kernel/branch/model.js";
import { liftArgument } from "../src/kernel/branch/lift.js";
import type { Cx } from "../src/kernel/geom.js";

const q = (n: bigint, d = 1n) => Frac.of(n, d);
const RADIUS = 1e4;

/** The reference determination, declared: one ray per branch point, as a multiple of π. */
const rays = (...entries: [string, Frac][]): ReadonlyMap<string, Frac> => new Map(entries);
const PRINCIPAL_RAYS = rays(["b", PRINCIPAL_DIRECTION]);

/** `√z` with the keyhole determination: one branch point at 0, α = 1/2, cut along ℝ₊. */
const keyhole = (alpha = q(1n, 2n)): BranchChoice => ({
  ...NO_BRANCH,
  convention: "zeroToTwoPi",
  points: [{ id: "b", at: [0, 0], order: { kind: "power", alpha }, label: "z = 0" }],
  cuts: [{ id: "Γ", from: "b", to: INFINITY, via: [[1, 0]] }],
});

/** D6's cut: ±1 joined by the bounded segment between them, α = −1/2 at each. */
const dogbone = (): BranchChoice => ({
  ...NO_BRANCH,
  convention: "zeroToTwoPi",
  points: [
    { id: "b1", at: [-1, 0], order: { kind: "power", alpha: q(-1n, 2n) }, label: "z = −1" },
    { id: "b2", at: [1, 0], order: { kind: "power", alpha: q(-1n, 2n) }, label: "z = 1" },
  ],
  cuts: [{ id: "Γ", from: "b1", to: "b2", via: [] }],
});

const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const phase = (m: number): Cx => [Math.cos(2 * Math.PI * m), Math.sin(2 * Math.PI * m)];

describe("argCut, the rotatable ray", () => {
  it("reproduces atan2 exactly at θ₀ = −π, and differs only ON the cut", () => {
    // Research 06 §5.2 asks for this by name, and getting it is why `argCut` counts turns rather
    // than taking a modulus: `mod(carg − θ₀, τ) + θ₀` is one ulp off at `[3,4]`, and "exactly" is a
    // claim this app may not make loosely. Two slips in research 06's line, both recorded here: the
    // sign (with the window `[θ₀, θ₀+2π)` it is `−π` that lands on C99's `(−π, π]`) and the word
    // "exactly" itself.
    for (const z of [
      [1, 0],
      [0, 1],
      [0, -1],
      [3, 4],
      [-3, 4],
      [-3, -4],
      [1e-9, -1],
    ] as Cx[]) {
      expect({ z, cut: argCut(z, -Math.PI) }).toEqual({ z, cut: Math.atan2(z[1], z[0]) });
    }
    // ON ℝ₋ the two windows genuinely disagree, because `[−π, π)` is half-open at the top and C99's
    // `(−π, π]` at the bottom. That is the cut, where the value is a limit and the `side` tag decides.
    expect(argCut([-1, 0], -Math.PI)).toBeCloseTo(-Math.PI, 15);
    expect(Math.atan2(0, -1)).toBeCloseTo(Math.PI, 15);
    expect(argCut([0, 1], Math.PI)).toBeCloseTo(Math.PI / 2 + 2 * Math.PI, 14);
  });

  it("lands its value in the declared window, wherever the window is", () => {
    for (const theta0 of [-Math.PI, 0, Math.PI / 3, 2 * Math.PI]) {
      for (let k = 0; k < 32; k++) {
        const t = (2 * Math.PI * k) / 32;
        const value = argCut([Math.cos(t), Math.sin(t)], theta0);
        expect(value).toBeGreaterThanOrEqual(theta0 - 1e-12);
        expect(value).toBeLessThan(theta0 + 2 * Math.PI + 1e-12);
      }
    }
  });

  it("gives logCut and powCut the determination it fixes", () => {
    // `√` at `arg ∈ [0, 2π)`: just below ℝ₊ the argument is nearly 2π, so the root is nearly −1.
    const below = powCut([1, -1e-6], 0.5, 0);
    expect(below[0]).toBeCloseTo(-1, 6);
    expect(logCut([Math.E, 0], 0)[0]).toBeCloseTo(1, 15);
  });
});

describe("signedCross", () => {
  it("is +1 right-to-left, −1 left-to-right, 0 for a miss or a touch", () => {
    const a: Cx = [0, 0];
    const b: Cx = [1, 0];
    expect(signedCross([0.5, -1], [0.5, 1], a, b)).toBe(1);
    expect(signedCross([0.5, 1], [0.5, -1], a, b)).toBe(-1);
    expect(signedCross([2, -1], [2, 1], a, b)).toBe(0); // past the end
    expect(signedCross([0.5, 1], [0.5, 2], a, b)).toBe(0); // never reaches
    expect(signedCross([0.5, 0], [0.5, 1], a, b)).toBe(0); // starts ON it: a touch, not a crossing
  });
});

describe("jump weights", () => {
  it("gives a ray from b the exponent at b", () => {
    const weights = jumpWeights(keyhole());
    expect(weights.get("Γ")?.equals(q(1n, 2n))).toBe(true);
  });

  it("gives a bounded arc the exponent at its `from` end — and the other end agrees, which IS admissibility", () => {
    const weights = jumpWeights(dogbone());
    expect(weights.get("Γ")?.equals(q(-1n, 2n))).toBe(true);
    // Taking the other side gives `α_{b₂} = −1/2` too, and in general the two agree modulo 1 exactly
    // when `α₁ + α₂ ∈ ℤ` — research 06 §2.1(b). Here the sum is −1, so `e^{2πiα₁} = e^{2πiα₂}`.
    const flipped = jumpWeights({
      ...dogbone(),
      cuts: [{ id: "Γ", from: "b2", to: "b1", via: [] }],
    });
    const one = weights.get("Γ");
    const other = flipped.get("Γ");
    if (one === undefined || one === null || other === undefined || other === null) {
      throw new Error("both orientations should have a weight");
    }
    expect(phase(one.toNumber())[0]).toBeCloseTo(phase(other.toNumber())[0], 14);
    expect(phase(one.toNumber())[1]).toBeCloseTo(phase(other.toNumber())[1], 14);
  });

  it("reports null for a log, which has no finite exponent to sum", () => {
    const logged: BranchChoice = {
      ...keyhole(),
      points: [{ id: "b", at: [0, 0], order: { kind: "log" }, label: "log z" }],
    };
    expect(jumpWeights(logged).get("Γ")).toBeNull();
  });
});

describe("the correction against the rotatable ray", () => {
  it("turns the principal √ into the keyhole's √, off the cuts", () => {
    // `f_declared(z) = f_principal(z)·e^{2πi·m}`, checked against `powCut` — which counts nothing.
    const segments = cutSegments(keyhole(), RADIUS, PRINCIPAL_RAYS);
    const base: Cx = [0, 1];
    for (let k = 1; k < 40; k++) {
      const t = (2 * Math.PI * k) / 40;
      const z: Cx = [1.7 * Math.cos(t), 1.7 * Math.sin(t)];
      const m = cutCorrection(z, base, segments);
      const want = powCut(z, 0.5, 0);
      // The FACTOR on `z^α` is `e^{2πi·m}` with `m` already weighted by α — `jumpWeights` put it
      // there, which is why the correction is one number per pixel and not one per branch point.
      const direct = cmul(powCut(z, 0.5, -Math.PI), phase(m));
      expect({ k, re: direct[0], im: direct[1] }).toEqual({
        k,
        re: expect.closeTo(want[0], 10) as unknown as number,
        im: expect.closeTo(want[1], 10) as unknown as number,
      });
    }
  });

  it("is exactly zero when the declared system IS the principal one", () => {
    const principalRay: BranchChoice = {
      ...keyhole(),
      convention: "principal",
      cuts: [{ id: "Γ", from: "b", to: INFINITY, via: [[-1, 0]] }],
    };
    const segments = cutSegments(principalRay, RADIUS, PRINCIPAL_RAYS);
    const base: Cx = [0, 1];
    for (let k = 1; k < 24; k++) {
      const t = (2 * Math.PI * k) / 24;
      const z: Cx = [2.3 * Math.cos(t), 2.3 * Math.sin(t)];
      expect({ k, m: cutCorrection(z, base, segments) }).toEqual({ k, m: 0 });
    }
  });

  it("is zero for a rational integrand, which declares no branch at all", () => {
    expect(cutSegments(NO_BRANCH, RADIUS, PRINCIPAL_RAYS)).toHaveLength(0);
    expect(cutCorrection([3, -4], [0, 1], cutSegments(NO_BRANCH, RADIUS, PRINCIPAL_RAYS))).toBe(0);
  });

  it("adds no reference ray for an integer exponent, which is single-valued either way", () => {
    // The declared arc is still there — the user drew it, and the app does not overrule that — but
    // `z²` has no principal cut to correct FROM, so nothing carries a negative weight.
    const segments = cutSegments(keyhole(q(2n)), RADIUS, PRINCIPAL_RAYS);
    expect(segments.every((s) => s.jump > 0)).toBe(true);
    expect(segments.map((s) => s.jump)).toEqual([2, 2]); // the `via` vertex splits the ray in two
  });
});

describe("the correction against the continuous-argument LIFT", () => {
  it("agrees with the mechanism the ANSWER depends on — research 06's own worked check", () => {
    // `√z`, cut dragged to ℝ₊, base `z₀ = i`. At `z = 1 − 0.001i`, just BELOW the new cut, the truth
    // is `arg z ≈ 2π` so `√z ≈ e^{iπ} = −1`. Research 06 §5.2 works this through by hand and gets
    // `m = 1/2`; this gets it from the crossing count, and then gets `arg z` a THIRD way — by lifting
    // `arg` continuously along a path from `i` that stays clear of ℝ₊.
    const segments = cutSegments(keyhole(), RADIUS, PRINCIPAL_RAYS);
    const base: Cx = [0, 1];
    const z: Cx = [1, -0.001];
    const m = cutCorrection(z, base, segments);
    expect(m).toBeCloseTo(0.5, 15);

    // The long way round: counterclockwise from arg = π/2 to just under 2π, never touching ℝ₊.
    const end = 2 * Math.PI + Math.atan2(z[1], z[0]);
    const path = (t: number): Cx => {
      const th = Math.PI / 2 + t * (end - Math.PI / 2);
      const r = 1 + t * (Math.hypot(z[0], z[1]) - 1);
      return [r * Math.cos(th), r * Math.sin(th)];
    };
    const lift = liftArgument(path, [0, 0]);
    if (!lift.ok) throw new Error(lift.reason);
    const argDeclared = Math.PI / 2 + lift.delta;
    expect(argDeclared).toBeCloseTo(end, 9);

    // Three routes to the same value of `√z`.
    const fromLift: Cx = [
      Math.exp(0.5 * Math.log(Math.hypot(z[0], z[1]))) * Math.cos(0.5 * argDeclared),
      Math.exp(0.5 * Math.log(Math.hypot(z[0], z[1]))) * Math.sin(0.5 * argDeclared),
    ];
    const fromCorrection = cmul(powCut(z, 0.5, -Math.PI), phase(m));
    expect(fromCorrection[0]).toBeCloseTo(fromLift[0], 8);
    expect(fromCorrection[1]).toBeCloseTo(fromLift[1], 8);
    expect(fromCorrection[0]).toBeCloseTo(-1, 5);
  });

  it("proves D6's bounded cut and its window rays are the SAME determination, by coming out an integer", () => {
    // D6 declares `arg ∈ [0, 2π)` at each of `±1`, so each factor's reference cut is the ray pointing
    // along `ℝ₊` from its own branch point. The declared cut system is the BOUNDED segment `[−1, 1]`.
    // Those are the same determination — M4.6c established it for the residues — and the correction
    // says so in the only way a picture can: it is an INTEGER at every point, so `e^{2πim} = 1` and
    // the base evaluation is already right. `α₁ + α₂ = −1 ∈ ℤ` is why, which is research 06 §2.1(b)
    // arriving as a property of the rendering rather than as a rule to remember.
    const windowRays = rays(["b1", Frac.ZERO], ["b2", Frac.ZERO]);
    const segments = cutSegments(dogbone(), RADIUS, windowRays);
    const base: Cx = [0, 1];
    for (let k = 0; k < 40; k++) {
      const t = (2 * Math.PI * k) / 40 + 0.07;
      for (const r of [0.4, 1.6, 5]) {
        const z: Cx = [r * Math.cos(t), r * Math.sin(t)];
        const m = cutCorrection(z, base, segments);
        expect({ k, r, fractional: Math.abs(m - Math.round(m)) }).toEqual({ k, r, fractional: 0 });
      }
    }
  });

  it("and it does NOT come out an integer when the exponents fail to sum to one", () => {
    // Change one exponent to −1/4 and the bounded cut stops being admissible: a loop around both
    // branch points has monodromy `e^{2πi(−3/4)} ≠ 1`, the two determinations genuinely differ, and
    // the correction is fractional. The app is not being told which case it is in; it is computing it.
    const inadmissible: BranchChoice = {
      ...dogbone(),
      points: [
        dogbone().points[0],
        { ...dogbone().points[1], order: { kind: "power", alpha: q(-1n, 4n) } },
      ],
    };
    const windowRays = rays(["b1", Frac.ZERO], ["b2", Frac.ZERO]);
    const segments = cutSegments(inadmissible, RADIUS, windowRays);
    const fractional = [0.4, 1.6, 5].flatMap((r) =>
      Array.from({ length: 24 }, (_, k) => {
        const t = (2 * Math.PI * k) / 24 + 0.07;
        const m = cutCorrection([r * Math.cos(t), r * Math.sin(t)], [0, 1], segments);
        return Math.abs(m - Math.round(m));
      }),
    );
    expect(fractional.some((f) => f > 1e-9)).toBe(true);
  });
});

describe("the reference system is declared, not assumed", () => {
  it("adds NO reference ray for a point the caller declares no direction for", () => {
    // The honest default. A typed expression's reference determination is a fact about how it is
    // written, which the app cannot see — so with no declaration there is nothing to correct FROM,
    // and the correction is relative to the declared arcs alone.
    expect(cutSegments(keyhole(), RADIUS).every((s) => s.jump > 0)).toBe(true);
  });

  it("points a declared reference ray along ℝ₋ for C99's principal window", () => {
    expect(PRINCIPAL_DIRECTION.equals(Frac.ONE)).toBe(true);
    const segments = cutSegments(keyhole(), RADIUS, PRINCIPAL_RAYS);
    const ray = segments.find((s) => s.jump < 0);
    if (ray === undefined) throw new Error("the reference ray should be present at negative weight");
    // From the branch point, pointing along ℝ₋.
    expect(ray.a).toEqual([0, 0]);
    expect(ray.b[0]).toBeLessThan(-RADIUS / 2);
    expect(Math.abs(ray.b[1])).toBeLessThan(1e-9);
    expect(ray.jump).toBeCloseTo(-0.5, 15);
  });
});
