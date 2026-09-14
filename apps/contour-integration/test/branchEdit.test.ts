// Guards for the cut-system editor: the operations behind "a cut is a choice".
//
// The gesture these exist for is research 06's "single most valuable interaction in the app" —
// dragging a dogbone between one bounded arc and two rays to infinity — so the tests check the round
// trip, and check that ADMISSIBILITY is decided by the rule rather than by which button was pressed.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import {
  OFFERED_ORDERS,
  addBranchPoint,
  applyBranchGrab,
  branchHandles,
  joinToOneCut,
  orderLabel,
  removeBranchPoint,
  setCutFromWindow,
  setOrder,
  splitToRays,
} from "../src/engine/branchEdit.js";
import { checkAdmissibility } from "../src/kernel/branch/admissibility.js";
import { INFINITY, NO_BRANCH, type BranchChoice } from "../src/kernel/branch/model.js";

const half = OFFERED_ORDERS[0].order; // α = 1/2
const minusHalf = OFFERED_ORDERS[1].order; // α = −1/2
const third = OFFERED_ORDERS[2].order; // α = 1/3
const logOrder = OFFERED_ORDERS[6].order;

/** Two points at ∓1 with the given order, each cut out to infinity. */
function pair(order = minusHalf): BranchChoice {
  let b = addBranchPoint(NO_BRANCH, [-1, 0]);
  b = addBranchPoint(b, [1, 0]);
  for (const p of b.points) b = setOrder(b, p.id, order);
  return b;
}

describe("adding and removing", () => {
  it("gives each point its own id and its own cut to infinity", () => {
    const b = addBranchPoint(addBranchPoint(NO_BRANCH, [0, 0]), [2, 0]);
    expect(b.points.map((p) => p.id)).toEqual(["b1", "b2"]);
    expect(b.cuts).toHaveLength(2);
    expect(b.cuts.every((c) => c.to === INFINITY)).toBe(true);
    expect(new Set(b.cuts.map((c) => c.id)).size).toBe(2);
  });

  it("aims a fresh cut straight out from the origin — the shadow-cut direction", () => {
    const b = addBranchPoint(NO_BRANCH, [3, 4]);
    const [via] = b.cuts[0].via;
    // Collinear with the origin, and further out than the point.
    expect(via[0] * 4 - via[1] * 3).toBeCloseTo(0, 9);
    expect(Math.hypot(via[0], via[1])).toBeGreaterThan(5);
  });

  it("still aims a cut for a point sitting at the origin", () => {
    const b = addBranchPoint(NO_BRANCH, [0, 0]);
    expect(Math.hypot(...b.cuts[0].via[0])).toBeGreaterThan(0);
  });

  it("removes the cuts that ended on a removed point — a cut to nowhere is malformed, not free", () => {
    const b = removeBranchPoint(pair(), "b1");
    expect(b.points.map((p) => p.id)).toEqual(["b2"]);
    expect(b.cuts).toHaveLength(1);
    expect(checkAdmissibility(b).ok).toBe(true);
  });

  it("removes a JOINED point's shared cut too", () => {
    const joined = joinToOneCut(pair(), "b1", "b2");
    expect(joined).not.toBeNull();
    if (joined === null) return;
    const b = removeBranchPoint(joined, "b2");
    expect(b.cuts).toHaveLength(0);
    // b1 is now unplaced, which is rule (a) and is what the ledger should say.
    expect(checkAdmissibility(b).failure).toBe("unplaced");
  });

  it("changes an order without touching the cuts", () => {
    const before = pair();
    const after = setOrder(before, "b1", logOrder);
    expect(orderLabel(after.points[0].order)).toBe("log");
    expect(after.cuts).toEqual(before.cuts);
  });
});

describe("moving", () => {
  it("carries a cut to infinity bodily, so its direction survives the move", () => {
    const b = addBranchPoint(NO_BRANCH, [1, 0]);
    const before = b.cuts[0].via[0];
    const after = applyBranchGrab(b, { kind: "point", id: "b1" }, [1, 5]);
    const moved = after.cuts[0].via[0];
    expect(moved[0] - before[0]).toBeCloseTo(0, 9);
    expect(moved[1] - before[1]).toBeCloseTo(5, 9);
  });

  it("keeps a bounded cut's bow centred by taking half the displacement", () => {
    const joined = joinToOneCut(pair(), "b1", "b2");
    if (joined === null) throw new Error("expected a join");
    expect(joined.cuts[0].via[0]).toEqual([0, 0]);
    const after = applyBranchGrab(joined, { kind: "point", id: "b2" }, [1, 2]);
    expect(after.cuts[0].via[0][1]).toBeCloseTo(1, 9);
  });

  it("moves a cut's control vertex and nothing else", () => {
    const b = addBranchPoint(NO_BRANCH, [1, 0]);
    const after = applyBranchGrab(b, { kind: "cut", id: b.cuts[0].id, index: 0 }, [-4, 2]);
    expect(after.cuts[0].via[0]).toEqual([-4, 2]);
    expect(after.points[0].at).toEqual([1, 0]);
  });

  it("leaves an unknown id alone rather than throwing", () => {
    const b = pair();
    expect(applyBranchGrab(b, { kind: "point", id: "nope" }, [9, 9])).toEqual(b);
    expect(applyBranchGrab(b, { kind: "cut", id: "nope", index: 0 }, [9, 9])).toEqual(b);
  });

  it("exposes one handle per point and one per cut vertex", () => {
    const h = branchHandles(pair());
    expect(h.filter((x) => x.grab.kind === "point")).toHaveLength(2);
    expect(h.filter((x) => x.grab.kind === "cut")).toHaveLength(2);
    expect(h.every((x) => x.label.length > 0)).toBe(true);
  });
});

describe("the dogbone gesture", () => {
  it("joins two rays into one bounded cut, and the ∓1/2 pair stays admissible", () => {
    const rays = pair(minusHalf);
    expect(checkAdmissibility(rays).ok).toBe(true);
    const joined = joinToOneCut(rays, "b1", "b2");
    if (joined === null) throw new Error("expected a join");
    expect(joined.cuts).toHaveLength(1);
    expect(joined.cuts[0].from).toBe("b1");
    expect(joined.cuts[0].to).toBe("b2");

    const report = checkAdmissibility(joined);
    expect(report.ok).toBe(true);
    const bounded = report.components.find((c) => !c.touchesInfinity);
    expect(bounded?.sum?.equals(Frac.of(-1n))).toBe(true);
  });

  it("splits back to two rays, and back again — the drag is a round trip", () => {
    const rays = pair(minusHalf);
    const joined = joinToOneCut(rays, "b1", "b2");
    if (joined === null) throw new Error("expected a join");
    const split = splitToRays(joined, joined.cuts[0].id);
    if (split === null) throw new Error("expected a split");
    expect(split.cuts).toHaveLength(2);
    expect(split.cuts.every((c) => c.to === INFINITY)).toBe(true);
    expect(checkAdmissibility(split).ok).toBe(true);
    expect(joinToOneCut(split, "b1", "b2")?.cuts).toHaveLength(1);
  });

  it("offers the join for a pair that does NOT close, and lets the rule refuse it", () => {
    // Two 1/3 points sum to 2/3. Both ends of the gesture exist; only one of them is legal, and it
    // is `checkAdmissibility` that says so rather than the editor declining to build the state.
    const rays = pair(third);
    expect(checkAdmissibility(rays).ok).toBe(true);
    const joined = joinToOneCut(rays, "b1", "b2");
    if (joined === null) throw new Error("expected a join");
    const report = checkAdmissibility(joined);
    expect(report.ok).toBe(false);
    expect(report.failure).toBe("component-not-integral");
    expect(report.detail).toMatch(/2\/3/);
  });

  it("refuses to join a log, which no bounded cut can ever make single-valued", () => {
    const rays = pair(logOrder);
    const joined = joinToOneCut(rays, "b1", "b2");
    if (joined === null) throw new Error("expected a join");
    expect(checkAdmissibility(joined).failure).toBe("log-bounded");
  });

  it("declines a join that names a point twice, or one that is not there", () => {
    expect(joinToOneCut(pair(), "b1", "b1")).toBeNull();
    expect(joinToOneCut(pair(), "b1", "ghost")).toBeNull();
  });

  it("declines to split a cut that already reaches infinity", () => {
    const rays = pair();
    expect(splitToRays(rays, rays.cuts[0].id)).toBeNull();
    expect(splitToRays(rays, "ghost")).toBeNull();
  });
});

describe("the offered orders", () => {
  it("are all distinct, and each is one the tier-D gallery actually uses", () => {
    const labels = OFFERED_ORDERS.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.some((l) => l.includes("1/2"))).toBe(true);
    expect(OFFERED_ORDERS.some((o) => o.order.kind === "log")).toBe(true);
  });

  it("are every one of them a genuine branch point, so rule (a) has something to say", () => {
    for (const o of OFFERED_ORDERS) {
      let b = addBranchPoint(NO_BRANCH, [1, 0]);
      b = setOrder(b, "b1", o.order);
      expect(checkAdmissibility({ ...b, cuts: [] }).failure).toBe("unplaced");
    }
  });

  it("labels a power by its exact fraction, never by a decimal", () => {
    expect(orderLabel(half)).toBe("α = 1/2");
    expect(orderLabel(minusHalf)).toBe("α = -1/2");
  });
});

describe("rebuilding the cut from the declared window", () => {
  const zeroToTwoPi: readonly [Frac, Frac] = [Frac.ZERO, Frac.of(2n)];
  const principal: readonly [Frac, Frac] = [Frac.of(-1n), Frac.ONE];
  const power = { kind: "power", alpha: Frac.of(1n, 2n), sign: 1 } as const;

  /** The keyhole template's seed: one point at the origin, id `b1`, with a ray to infinity. */
  const seeded = (): BranchChoice => setOrder(addBranchPoint(NO_BRANCH, [0, 0]), "b1", half);

  it("KEEPS THE READER'S POINT — the defect that made the whole declaration vanish", () => {
    // The id is the entire bug. `buildDeclaration`'s own system carries `SINGLE_POINT_ID` (`"b"`),
    // the reader's point is `"b1"`, and the shell used to adopt the former wholesale — so the id
    // `declaration.pointId` names stopped existing and the factor was silently dropped, leaving the
    // cofactor in the box under an `R(z) =` label and being integrated as the whole integrand.
    const next = setCutFromWindow(seeded(), "b1", principal, power);
    if (next === null) throw new Error("expected a rebuild");
    expect(next.points.map((p) => p.id)).toEqual(["b1"]);
    expect(next.points[0].at).toEqual([0, 0]);
    expect(next.points[0].order).toEqual(half);
  });

  it("moves the cut to the window's LOWER edge, which is where the determination jumps", () => {
    const toZero = setCutFromWindow(seeded(), "b1", zeroToTwoPi, power);
    const toPi = setCutFromWindow(seeded(), "b1", principal, power);
    if (toZero === null || toPi === null) throw new Error("expected rebuilds");
    // `arg ∈ [0, 2π)` cuts along ℝ₊; `arg ∈ [−π, π)` cuts along ℝ₋. The via vertex is the ray's
    // direction, so its sign is the whole claim.
    expect(toZero.cuts[0].via[0][0]).toBeGreaterThan(0);
    expect(toPi.cuts[0].via[0][0]).toBeLessThan(0);
    // Scale-free, because the ray's length is not the claim: its DIRECTION is. `sin(π)` is
    // 1.2e-16 rather than 0, so an absolute tolerance would be a test of how far out the vertex
    // happens to be placed.
    const angle = (c: BranchChoice): number => Math.abs(Math.atan2(c.cuts[0].via[0][1], c.cuts[0].via[0][0]));
    expect(angle(toZero)).toBeLessThan(1e-12);
    expect(Math.abs(angle(toPi) - Math.PI)).toBeLessThan(1e-12);
    expect(toZero.convention).toBe("zeroToTwoPi");
    expect(toPi.convention).toBe("principal");
  });

  it("carries the sheet and the base point through, because neither is a determination", () => {
    const from = { ...seeded(), sheet: 3, basePoint: [0, 2] as const };
    const next = setCutFromWindow(from, "b1", principal, power);
    if (next === null) throw new Error("expected a rebuild");
    expect(next.sheet).toBe(3);
    expect(next.basePoint).toEqual([0, 2]);
  });

  it("leaves a BOUNDED cut alone — the dogbone is a second declaration, not a stale ray", () => {
    const rays = pair();
    const joined = joinToOneCut(rays, "b1", "b2");
    if (joined === null) throw new Error("expected a join");
    // Nothing to rebuild: no ray leaves `b1`, so the window and the drawn cut are allowed to
    // disagree and admissibility is where that shows.
    expect(setCutFromWindow(joined, "b1", principal, power)).toBeNull();
    expect(joined.cuts[0].from).toBe("b1");
    expect(joined.cuts[0].to).toBe("b2");
  });

  it("declines a point that is not there, and one the single-factor builder will not draw for", () => {
    expect(setCutFromWindow(seeded(), "ghost", principal, power)).toBeNull();
    // A factor away from the origin: `buildDeclaration` refuses it by name (the residue reader is
    // about the ORIGIN), and `runDeclared` refuses the same declaration — so leaving the cut where
    // it is keeps that reason the one on screen instead of drawing a cut for an unrunnable factor.
    const offOrigin = setOrder(addBranchPoint(NO_BRANCH, [1, 0]), "b1", half);
    expect(setCutFromWindow(offOrigin, "b1", principal, power)).toBeNull();
  });

  it("refuses a window that is not one turn wide, rather than half-drawing it", () => {
    expect(setCutFromWindow(seeded(), "b1", [Frac.ZERO, Frac.ONE], power)).toBeNull();
  });
});
