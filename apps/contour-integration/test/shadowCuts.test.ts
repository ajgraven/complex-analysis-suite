// **CUTS AS SHADOWS OF THE BASE POINT** — research 06 §2.3, and free.
//
// If `f(z)` is defined by continuing along the straight segment `[z₀, z]`, the induced cut system is
// exactly the ray from each `bₖ` pointing directly away from `z₀`; move `z₀` and the cuts "swing
// like shadows around a lamp". §2.3 recommends offering it as the cheap intuition-builder alongside
// explicit editable cuts, and these pin the two facts it exists to teach:
//
//  - **A shadow system is ALWAYS admissible.** Every ray reaches infinity, so no component of Γ is
//    bounded and rules (b) and (c) hold for free; rule (a) holds because every genuine point casts
//    one. That is exactly what makes the mode safe to drag around.
//  - **And therefore it cannot express the dogbone**, whose whole content is a BOUNDED arc between
//    two points that individually carry `−1/2`. The freedom and the limitation are the same fact,
//    which is why §2.3 says "the explicit mode is needed for the dogbone" rather than treating
//    shadow mode as a replacement.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import {
  INFINITY,
  effectiveBranch,
  shadowCuts,
  type BranchChoice,
  type BranchPoint,
} from "../src/kernel/branch/model.js";
import { checkAdmissibility } from "../src/kernel/branch/admissibility.js";
import { branchHandles, setShadow } from "../src/engine/branchEdit.js";
import { jumpWeights } from "../src/kernel/branch/correction.js";
import type { Cx } from "../src/kernel/geom.js";

const q = (n: bigint, d = 1n) => Frac.of(n, d);

const point = (id: string, at: Cx, alpha: Frac): BranchPoint => ({
  id,
  at,
  order: { kind: "power", alpha },
  label: `z = ${id}`,
});

const two = (base: Cx, shadow = true): BranchChoice => ({
  convention: "principal",
  points: [point("b1", [-1, 0], q(-1n, 2n)), point("b2", [1, 0], q(-1n, 2n))],
  // A DECLARED bounded arc, kept underneath on purpose: turning shadow mode off must give it back.
  // It carries an interior VERTEX so that "the cut handles disappear in shadow mode" is a claim
  // about something — with `via: []` there is no cut handle either way, and the assertion below
  // passed against a `branchHandles` that had forgotten to exclude them.
  cuts: [{ id: "Γ", from: "b1", to: "b2", via: [[0, 0.4]] }],
  basePoint: base,
  shadow,
  sheet: 0,
});

/** The direction of a shadow ray from its branch point, as a unit vector. */
function direction(branch: BranchChoice, id: string): Cx | null {
  const cut = branch.cuts.find((c) => c.from === id);
  const at = branch.points.find((p) => p.id === id)?.at;
  if (cut === undefined || at === undefined || cut.via.length === 0) return null;
  const dx = cut.via[0][0] - at[0];
  const dy = cut.via[0][1] - at[1];
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len];
}

describe("the shadow a base point casts", () => {
  it("runs from each branch point directly AWAY from z₀, to infinity", () => {
    // z₀ above the axis, so both rays point downward-ish and away.
    const derived = shadowCuts(two([0, 2]));
    expect(derived.cuts.map((c) => c.to)).toEqual([INFINITY, INFINITY]);
    const d1 = direction(derived, "b1");
    const d2 = direction(derived, "b2");
    // b1 = −1 seen from (0,2): the direction away is (−1,−2)/√5.
    expect(d1?.[0]).toBeCloseTo(-1 / Math.sqrt(5), 12);
    expect(d1?.[1]).toBeCloseTo(-2 / Math.sqrt(5), 12);
    // b2 = +1 from the same lamp: (1,−2)/√5 — the mirror, as the picture should be.
    expect(d2?.[0]).toBeCloseTo(1 / Math.sqrt(5), 12);
    expect(d2?.[1]).toBeCloseTo(-2 / Math.sqrt(5), 12);
  });

  it("swings as the lamp moves, which is the whole gesture", () => {
    const before = direction(shadowCuts(two([0, 2])), "b1");
    const after = direction(shadowCuts(two([0, -2])), "b1");
    if (before === null || after === null) throw new Error("both should cast a shadow");
    // Reflecting the lamp across the axis reflects the shadow.
    expect(after[0]).toBeCloseTo(before[0], 12);
    expect(after[1]).toBeCloseTo(-before[1], 12);
  });

  it("puts the base point on ℝ₋ of each point when the lamp is to the right", () => {
    // The keyhole convention, arrived at by moving a lamp rather than by naming a window: with z₀
    // far to the right of a branch point at the origin, its shadow runs along ℝ₋.
    const one: BranchChoice = {
      convention: "principal",
      points: [point("b", [0, 0], q(1n, 2n))],
      cuts: [],
      basePoint: [5, 0],
      shadow: true,
      sheet: 0,
    };
    const d = direction(shadowCuts(one), "b");
    expect(d?.[0]).toBeCloseTo(-1, 12);
    expect(d?.[1]).toBeCloseTo(0, 12);
  });

  it("skips a point with an INTEGER exponent, which is single-valued and casts nothing", () => {
    const mixed: BranchChoice = {
      ...two([0, 2]),
      points: [point("b1", [-1, 0], q(-1n, 2n)), point("b2", [1, 0], q(3n))],
    };
    expect(shadowCuts(mixed).cuts.map((c) => c.from)).toEqual(["b1"]);
  });

  it("gives a point sitting ON the lamp no ray, so admissibility refuses it BY NAME", () => {
    // There is no direction away from z₀ there, and inventing one would put a cut where the
    // definition does not. The definition is in trouble anyway: a continuation from a base point
    // that IS a singularity does not start.
    const onTop = shadowCuts({ ...two([-1, 0]), points: [point("b1", [-1, 0], q(-1n, 2n))] });
    expect(onTop.cuts).toHaveLength(0);
    const report = checkAdmissibility(onTop);
    expect(report.ok).toBe(false);
    expect(report.failure).toBe("unplaced");
    expect(report.detail).toContain("no cut reaches it");
  });
});

describe("a shadow system is always admissible — and that is why it cannot do the dogbone", () => {
  it("passes admissibility from every lamp position, because every ray reaches infinity", () => {
    for (const base of [
      [0, 2],
      [0, -2],
      [5, 0],
      [-5, 0],
      [0.3, 0.001],
      [1000, -1000],
    ] as Cx[]) {
      const report = checkAdmissibility(shadowCuts(two(base)));
      expect({ base, ok: report.ok }).toEqual({ base, ok: true });
      // No bounded component exists to carry monodromy, so rule (b) has nothing to check.
      expect(report.components.every((c) => c.touchesInfinity)).toBe(true);
    }
  });

  it("replaces the dogbone's bounded arc with two rays, and each then carries −1/2 alone", () => {
    // The declared arc's jump weight is `α_{b₁} = −1/2`, the `from` side's exponent. In shadow mode
    // there are two arcs instead, and each carries its own point's exponent — a DIFFERENT cut
    // system with the same branch points, which is the lesson rather than a defect.
    const declared = two([0, 2], false);
    expect([...jumpWeights(declared).values()].map((f) => f?.toNumber())).toEqual([-0.5]);
    const derived = shadowCuts(two([0, 2]));
    expect([...jumpWeights(derived).values()].map((f) => f?.toNumber())).toEqual([-0.5, -0.5]);
  });

  it("keeps the declared arcs underneath, so turning the mode off gives the dogbone back", () => {
    // The alternative is to wipe them on the way in, and then the toggle is a one-way door that
    // silently destroys a bounded arc a reader spent a gesture building.
    //
    // The ROUND TRIP goes through `setShadow` both ways rather than starting from a flag set by
    // hand: a `setShadow` that cleared `cuts` when enabling would leave this test's own fixture
    // untouched otherwise, which is how the first version of it passed against exactly that bug.
    const declared = two([0, 2], false);
    const on = setShadow(declared, true);
    const off = setShadow(on, false);
    expect(effectiveBranch(on).cuts.map((c) => c.to)).toEqual([INFINITY, INFINITY]);
    expect(effectiveBranch(off).cuts).toEqual(declared.cuts);
    expect(effectiveBranch(off).cuts[0].via).toEqual([[0, 0.4]]);
  });
});

describe("what is draggable, and what is a consequence", () => {
  it("offers the base point in shadow mode and NOT the cut vertices", () => {
    // The fixture's declared arc HAS a vertex, so this is the exclusion and not an empty list.
    expect(two([0, 2], true).cuts[0].via).toHaveLength(1);
    const handles = branchHandles(two([0, 2], true));
    expect(handles.map((h) => h.grab.kind)).toEqual(["point", "point", "base"]);
    expect(handles.find((h) => h.grab.kind === "base")?.at).toEqual([0, 2]);
  });

  it("offers the cut vertices and NOT the base point with explicit cuts", () => {
    // A handle on a shadow cut would be a handle on a consequence: the drag would be undone by the
    // next derivation, which is the worst kind of control.
    expect(branchHandles(two([0, 2], false)).map((h) => h.grab.kind)).toEqual([
      "point",
      "point",
      "cut",
    ]);
  });
});

describe("effectiveBranch is the only door", () => {
  it("derives when the flag is set and passes the declaration through when it is not", () => {
    expect(effectiveBranch(two([0, 2], true)).cuts).toHaveLength(2);
    expect(effectiveBranch(two([0, 2], false)).cuts).toHaveLength(1);
  });

  it("clears the flag on what it returns, so a derived system cannot be edited as a declared one", () => {
    // Everything downstream reads the result as an ordinary cut system — there is no shadow-aware
    // path in admissibility, the crossing classifier, the jump weights, the correction or the ink
    // layer, which is the point of deriving rather than branching.
    expect(effectiveBranch(two([0, 2], true)).shadow).toBe(false);
    expect(branchHandles(effectiveBranch(two([0, 2], true))).map((h) => h.grab.kind)).toEqual([
      "point",
      "point",
      "cut",
      "cut",
    ]);
  });
});
