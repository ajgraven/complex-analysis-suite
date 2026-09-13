import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr";
import { Frac } from "@cas/exact";
import { solveExact } from "../src/families/linear.js";
import { buildSystem, exactConstant } from "../src/families/system.js";
import { a5SemicircleOrder2 } from "../src/families/records/a5-semicircle-order2.js";
import type { Family } from "../src/families/schema.js";
import type { RationalSystem } from "../src/families/system.js";

/**
 * The ℚ arm of a built system, checked rather than cast.
 *
 * Two coefficient rings are in play and neither contains the other, so `matrix` is a union; every
 * family in this file is rational, and asserting that is how the test says so.
 */
const rational = (built: ReturnType<typeof buildSystem>): RationalSystem => {
  if (!built.ok) throw new Error(built.reason);
  if (built.system.field !== "Q") throw new Error(`expected a rational system, got ${built.system.field}`);
  return built.system;
};

const con = (src: string, bindings = {}): ReturnType<typeof exactConstant> =>
  exactConstant(parse(src), bindings);

describe("exactConstant — Gaussian rationals, or a refusal", () => {
  it("evaluates the coefficients tiers A and B actually use", () => {
    const one = con("1");
    expect(one.ok && one.value.toTuple()).toEqual([1, 0]);
    const minus = con("-1");
    expect(minus.ok && minus.value.toTuple()).toEqual([-1, 0]);
    const half = con("1/2");
    expect(half.ok && half.value.toTuple()).toEqual([0.5, 0]);
    const im = con("2*i");
    expect(im.ok && im.value.toTuple()).toEqual([0, 2]);
    const mixed = con("(3 + 4*i)/(1 - 2*i)");
    expect(mixed.ok && mixed.value.toTuple()).toEqual([-1, 2]);
  });

  it("handles integer powers, including negative ones", () => {
    const sq = con("(1 + i)^2");
    expect(sq.ok && sq.value.toTuple()).toEqual([0, 2]);
    const inv = con("(1 + i)^(-1)");
    expect(inv.ok && inv.value.toTuple()).toEqual([0.5, -0.5]);
  });

  it("refuses π rather than rounding it — the tier-D coefficient this cannot hold", () => {
    // The log keyhole's lower edge reproduces ∫R log + 2πi∫R, so its coefficient carries a 2π and
    // no rational matrix can hold it. Refusing loudly is the whole point: a rounded 2π would make
    // `rank` a matter of tuning, which is what `linear.ts` exists to prevent.
    const r = con("2*pi*i");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/irrational/);
  });

  it("refuses a transcendental call and a fractional power", () => {
    expect(con("exp(1)").ok).toBe(false);
    expect(con("sqrt(2)").ok).toBe(false);
    const frac = con("2^(1/2)");
    expect(frac.ok).toBe(false);
    expect(!frac.ok && frac.reason).toMatch(/integer power/);
  });

  it("binds a parameter, and refuses one bound to a variant flag", () => {
    const bound = con("a", { a: 3 });
    expect(bound.ok && bound.value.toTuple()).toEqual([3, 0]);
    const flag = con("a", { a: true });
    expect(flag.ok).toBe(false);
    expect(!flag.ok && flag.reason).toMatch(/variant flag/);
    const missing = con("a");
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.reason).toMatch(/not bound/);
  });

  it("refuses division by zero rather than producing an infinity", () => {
    const r = con("1/0");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/division by zero/);
  });
});

describe("buildSystem — one complex identity as two real rows", () => {
  it("builds M = [[1],[0]] for a real-axis family", () => {
    const built = buildSystem(a5SemicircleOrder2);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.system.unknowns).toBe(1);
    expect(built.system.targetIds).toEqual(["I"]);
    expect(built.system.matrix.map((r) => r.map((c) => c.toNumber()))).toEqual([[1], [0]]);
    expect(built.system.report.rank).toBe(1);
    expect(built.system.report.kernel).toHaveLength(0);
  });

  it("makes the imaginary row the reality condition", () => {
    // Row 1 is 0·t = Im(S − b). A residue sum with an imaginary part therefore lands in
    // `contradictions` rather than quietly disappearing, which is the behaviour the real-line
    // families need: ∫_ℝ dx/(1+x²)² is real, and an engine that produced −iπ/2 (A5's own trap) must
    // be contradicted by the system, not merely be surprising.
    const M = rational(buildSystem(a5SemicircleOrder2)).matrix;
    const real = solveExact(M, 1, [Frac.of(157n, 100n), Frac.ZERO]);
    expect(real.contradictions.map((c) => c.row)).toEqual([]);
    const imaginary = solveExact(M, 1, [Frac.ZERO, Frac.of(-157n, 100n)]);
    expect(imaginary.contradictions.map((c) => c.row)).toEqual([1]);
  });

  it("gives a vanish piece no coefficient — its whole content is on the right-hand side", () => {
    // Deleting the arc must not change M at all.
    const withoutArc: Family = {
      ...a5SemicircleOrder2,
      contour: {
        ...a5SemicircleOrder2.contour,
        pieces: a5SemicircleOrder2.contour.pieces.filter((p) => p.role !== "vanish"),
      },
      vanishingLemmas: [],
    };
    const a = buildSystem(a5SemicircleOrder2);
    const b = buildSystem(withoutArc);
    if (!a.ok || !b.ok) throw new Error("both should build");
    expect(b.system.matrix.map((r) => r.map((c) => c.toNumber()))).toEqual(
      a.system.matrix.map((r) => r.map((c) => c.toNumber())),
    );
  });

  it("refuses a target piece that does not say which unknown it is the target of", () => {
    const twoTargets: Family = {
      ...a5SemicircleOrder2,
      targets: [
        a5SemicircleOrder2.targets[0],
        { ...a5SemicircleOrder2.targets[0], id: "J" },
      ],
    };
    const built = buildSystem(twoTargets);
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/must name its target/);
  });

  it("refuses a coefficient naming a target that does not exist", () => {
    const bad: Family = {
      ...a5SemicircleOrder2,
      contour: {
        ...a5SemicircleOrder2.contour,
        pieces: a5SemicircleOrder2.contour.pieces.map((p) =>
          p.role === "target" ? { ...p, coefficients: [{ targetId: "nope", coefficient: "1" }] } : p,
        ),
      },
    };
    const built = buildSystem(bad);
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/unknown target 'nope'/);
  });

  it("sums coefficient rows across pieces — the affine combination D4 needs", () => {
    // A synthetic two-unknown family: one target piece and one `reproduces` piece returning
    // ∫₀ + 2∫₁, so the summed row is [2, 2] on the real part.
    const affine: Family = {
      ...a5SemicircleOrder2,
      id: "synthetic-affine",
      targets: [
        { ...a5SemicircleOrder2.targets[0], id: "I0" },
        { ...a5SemicircleOrder2.targets[0], id: "I1" },
      ],
      contour: {
        ...a5SemicircleOrder2.contour,
        pieces: [
          {
            ...a5SemicircleOrder2.contour.pieces[0],
            coefficients: [
              { targetId: "I0", coefficient: "1" },
              { targetId: "I1", coefficient: "2" },
            ],
          },
          {
            id: "lower",
            name: "the reproducing edge",
            geom: a5SemicircleOrder2.contour.pieces[0].geom,
            role: "reproduces",
            coefficients: [
              { targetId: "I0", coefficient: "1" },
              { targetId: "I1", coefficient: "0" },
            ],
            bonus: "0",
            colour: 2,
          },
        ],
      },
      vanishingLemmas: [],
    };
    const built = buildSystem(affine);
    if (!built.ok) throw new Error(built.reason);
    expect(built.system.matrix.map((r) => r.map((c) => c.toNumber()))).toEqual([
      [2, 2],
      [0, 0],
    ]);
    // Two unknowns, one real row: underdetermined, and the system says which combination is blind.
    expect(built.system.report.rank).toBe(1);
    expect(built.system.report.kernel[0].map((c) => c.toNumber())).toEqual([-1, 1]);
  });
});
