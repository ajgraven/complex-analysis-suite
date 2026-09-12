import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger, ledgerHeadline, legalityRefusal } from "../src/engine/ledger.js";
import { resolveAll, type Contour } from "../src/engine/contour/model.js";
import { isClosed } from "../src/kernel/geom.js";
import { windingNumber } from "../src/kernel/winding.js";
import {
  circleTemplate,
  dogboneTemplate,
  keyholeTemplate,
  semicircleTemplate,
} from "../src/engine/contour/templates.js";
import { INFINITY, type BranchChoice, type BranchPoint } from "../src/kernel/branch/model.js";
import { Frac } from "@cas/exact";

function run(src: string, contour: Contour, branch?: BranchChoice) {
  const ast = parse(src);
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const pieces = resolveAll(contour);
  const poles = findPoles(ast);
  const integral = integrateContour(
    f,
    pieces,
    poles.poles.map((p) => ({ at: p.at, order: p.order })),
  );
  const theorem = applyResidueTheorem(poles, integral);
  return evaluateLedger({ ast, pieces, spec: contour.pieces, poles, integral, theorem, branch });
}

const rowsFor = (r: ReturnType<typeof run>, c: string) => r.rows.filter((x) => x.constraint === c);

/** The same piece with no `side` declared — what the untagged refusals are tested against. */
function untag(piece: Contour["pieces"][number]): Contour["pieces"][number] {
  const copy = { ...piece } as { side?: "above" | "below" } & Contour["pieces"][number];
  delete copy.side;
  return copy;
}

describe("the ledger closes a correct argument", () => {
  it("closes ∫dx/(1+x²) = π on the upper semicircle", () => {
    const r = run("1/(1+z^2)", semicircleTemplate(200));
    expect(r.closes).toBe(true);
    expect(r.value?.text).toBe("π");
    expect(ledgerHeadline(r)).toBe("This argument closes.");
    expect(r.failedAt).toBeNull();
    expect(r.rows.every((x) => x.status !== "failed")).toBe(true);
  });

  it("closes ∫dx/(1+x⁴) = π√2/2, with the arc certified", () => {
    const r = run("1/(1+z^4)", semicircleTemplate(200));
    expect(r.closes).toBe(true);
    expect(r.value?.text).toBe("π√2/2");
    const kill = rowsFor(r, "KILL").find((x) => x.claim.includes("arc"));
    expect(kill?.status).toBe("satisfied");
    expect(kill?.evidence.level).toBe("≤");
    expect(kill?.evidence.method).toMatch(/no floating point anywhere/);
  });

  it("names all four constraints, every time", () => {
    const r = run("1/(1+z^2)", semicircleTemplate(100));
    for (const c of ["LEGALITY", "CATCH", "KILL", "COVER"]) {
      expect(rowsFor(r, c).length).toBeGreaterThan(0);
    }
  });

  it("shows the arc bound shrinking as R grows, so the limit is watched not asserted", () => {
    const boundAt = (R: number): number => {
      const kill = rowsFor(run("1/(1+z^2)", semicircleTemplate(R)), "KILL").find((x) =>
        x.claim.includes("arc"),
      );
      const m = /≤ ([0-9.e+-]+)/.exec(kill?.claim ?? "");
      return m ? Number(m[1]) : NaN;
    };
    expect(boundAt(1000)).toBeLessThan(boundAt(100));
    expect(boundAt(10000)).toBeLessThan(boundAt(1000));
  });
});

describe("the ledger fails visibly, and names which constraint", () => {
  it("DIVERGES on the lower semicircle for ∫cos x/(1+x²) — the M3 gate's demonstration", () => {
    // Static text can only assert that closing downward is wrong. This shows the bound growing like
    // e^{R} and names KILL as the failing constraint, with the repair.
    const lower = semicircleTemplate(50, "lower");
    const r = run("exp(i*z)/(1+z^2)", lower);
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("KILL");
    expect(ledgerHeadline(r)).toMatch(/does not close: KILL fails/);
    const arc = rowsFor(r, "KILL").find((x) => x.status === "failed");
    expect(arc?.claim).toMatch(/DIVERGES/);
    expect(arc?.repair).toMatch(/other half-plane/);
  });

  it("certifies the SAME arc through the upper half-plane — the contrast is the teaching", () => {
    // One integrand, two contours, opposite outcomes for the ARC. Upward, Jordan discharges.
    const r = run("exp(i*z)/(1+z^2)", semicircleTemplate(50, "upper"));
    const arc = rowsFor(r, "KILL").find((x) => x.claim.includes("semicircle"));
    expect(arc?.status).toBe("satisfied");
    expect(arc?.evidence.method).toMatch(/Jordan/);
    expect(rowsFor(r, "KILL").some((x) => x.status === "failed")).toBe(false);
  });

  it("now CLOSES that one, and reads π/e rather than a decimal", () => {
    // This test previously asserted the opposite, and the change is the point. e^{i·i} = e^{−1} is
    // not an algebraic number, so ℚ(i)(√d) cannot hold it — but it does not need to be EVALUATED to
    // be exact, only CARRIED, which is what `ExpSum` does. What was an honestly incomplete argument
    // is now an honestly complete one.
    const r = run("exp(i*z)/(1+z^2)", semicircleTemplate(50, "upper"));
    expect(r.closes).toBe(true);
    expect(r.value?.text).toBe("π/e");
    expect(r.value?.numeric[0]).toBeCloseTo(Math.PI / Math.E, 12);
    expect(rowsFor(r, "CATCH").some((x) => x.status === "unknown")).toBe(false);
  });

  it("finds the pole locations AND the residues exactly there", () => {
    const poles = findPoles(parse("exp(i*z)/(1+z^2)"));
    expect(poles.poles).toHaveLength(2);
    expect(poles.poles.every((p) => p.orderCertain)).toBe(true);
    expect(poles.poles.some((p) => Math.hypot(p.at[0], p.at[1] - 1) < 1e-15)).toBe(true);
    expect(poles.exactlyComplete).toBe(true);
    // Res(e^{iz}/(1+z²), i) = e^{−1}/(2i) = −i/(2e), which the record checks as −0.183939720585721 i.
    const upper = poles.poles.find((p) => p.at[1] > 0);
    expect(upper?.residue?.text).toBe("−i/2·e^(−1)");
    expect(upper?.residue?.value[1]).toBeCloseTo(-0.183939720585721, 14);
  });

  it("switches lemmas at a ZERO frequency rather than reporting π/0 as a failure", () => {
    // Jordan's constant is π/|a|, which at a = 0 is ∞ and says nothing — correctly, since Jordan
    // has no content without exponential decay. But e^{i·0·z} = 1 leaves an ordinary rational
    // integrand that plain ML discharges. Gallery B1's own trap: an engine that treats π/0 as a
    // failure "will paper over exactly the case it was built to catch".
    const r = run("exp(0*i*z)/(z^2 + 1)", semicircleTemplate(50, "upper"));
    expect(r.closes).toBe(true);
    expect(r.value?.text).toBe("π");
    const arc = rowsFor(r, "KILL").find((x) => x.pieceId === "arc");
    expect(arc?.status).toBe("satisfied");
    expect(arc?.evidence.method).not.toMatch(/Jordan/);
  });

  it("declines a REPEATED pole under an exponential rather than guessing its residue", () => {
    // At order m > 1 the residue is p(z₀)·e^{iaz₀} for a polynomial p built from derivatives, which
    // the exponential basis does not yet carry. Locations stay exact; the residues do not pretend.
    const poles = findPoles(parse("exp(i*z)/(1+z^2)^2"));
    expect(poles.rational).toBe(true);
    expect(poles.poles.every((p) => p.order === 2 && p.orderCertain)).toBe(true);
    expect(poles.exactlyComplete).toBe(false);
    expect(poles.certificates.some((c) => /order > 1/.test(c.method))).toBe(true);
  });

  it("fails LEGALITY, and computes nothing, when a pole sits on the contour", () => {
    const r = run("1/(z-1)", circleTemplate([0, 0], 1));
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("LEGALITY");
    expect(r.value).toBeUndefined();
    expect(r.rows).toHaveLength(1); // it stops there rather than reporting rows it cannot evaluate
    expect(r.rows[0].repair).toMatch(/indent|move/);
  });

  it("fails KILL when the degree gap is too small for the lemma to bite", () => {
    // ∫x/(1+x²)dx does not converge, and the ledger's reason is the right one: the arc bound is
    // O(1), so the lemma establishes nothing in the limit.
    const r = run("z/(1+z^2)", semicircleTemplate(100));
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("KILL");
    const arc = rowsFor(r, "KILL").find((x) => x.status === "failed");
    expect(arc?.claim).toMatch(/does NOT vanish/);
  });

  it("declines KILL rather than guessing when no lemma covers the integrand", () => {
    const r = run("sin(z)/(1+z^2)", semicircleTemplate(50));
    expect(r.closes).toBe(false);
    const arc = rowsFor(r, "KILL").find((x) => x.status === "unknown");
    expect(arc?.evidence.level).toBe("?");
    expect(arc?.claim).toMatch(/no lemma here applies/);
  });
});

describe("sandbox mode", () => {
  it("reports the closed-contour value with COVER vacuous when there is no target", () => {
    // A full circle has no `target` piece: there is no real integral being solved for, and the
    // ledger says so rather than inventing one.
    const r = run("1/z", circleTemplate([0, 0], 1.5));
    const cover = rowsFor(r, "COVER")[0];
    expect(cover.status).toBe("unknown");
    expect(cover.claim).toMatch(/no piece is marked as the target/);
    // And the headline does not overclaim: nothing was "argued" to a real integral here.
    expect(r.hasTarget).toBe(false);
    expect(ledgerHeadline(r)).toBe("The closed-contour value is established exactly.");
  });
});

describe("LEGALITY, steps 2 and 3 — the cut system", () => {
  // The integrand below is rational; the cut system is declared alongside it. That pairing is
  // artificial only until M4.2 lands a `z^α` integrand, and it is the right unit to test here: these
  // two rows read the GEOMETRY and the exponents, never the expression, so an integrand that happens
  // to be single-valued exercises them exactly as a multivalued one would.
  const origin: BranchPoint = {
    id: "0",
    at: [0, 0],
    order: { kind: "power", alpha: Frac.of(1n, 3n) },
    label: "z = 0",
  };
  /**
   * A single cut from the origin out to infinity, in the direction `dir`.
   *
   * The interior vertex is placed far out along the ray rather than at `dir` itself, because a bend
   * is a real feature of a cut and the engine refuses one resting on the contour. A straight ray has
   * no bend near the picture; putting one at `|dir| = 1` would be drawing a different cut.
   */
  const keyhole = (dir: [number, number]): BranchChoice => ({
    convention: "zeroToTwoPi",
    points: [origin],
    cuts: [{ id: "Γ", from: "0", to: INFINITY, via: [[100 * dir[0], 100 * dir[1]]] }],
    basePoint: [0, 1],
    sheet: 0,
  });

  const cutRows = (r: ReturnType<typeof run>) =>
    rowsFor(r, "LEGALITY").filter((x) => x.claim.includes("cut") || x.claim.includes("branch point"));
  /** The per-piece row specifically — both cut rows mention "cut", and only one is about pieces. */
  const pieceRow = (r: ReturnType<typeof run>) =>
    cutRows(r).find((x) => !x.claim.includes("admissible"));

  /**
   * A circle around z = −3, which the cut down ℝ₋ runs straight through.
   *
   * Off the origin deliberately: a circle ABOUT the branch point is refused by the winding row
   * before any per-piece geometry is read, so it cannot be used to test the crossing rule.
   */
  const crossedBy = (side?: "above" | "below"): Contour => {
    const base = circleTemplate([-3, 0], 1);
    return side === undefined
      ? base
      : { ...base, pieces: base.pieces.map((p) => ({ ...p, side })) };
  };

  it("emits no cut rows at all for a rational integrand", () => {
    // A permanently green "no cuts to check" row would be noise in front of every one of the 28
    // records, twenty-something of which have no branch points.
    expect(cutRows(run("1/(1+z^2)", semicircleTemplate(200)))).toHaveLength(0);
  });

  it("passes an admissible cut the contour stays clear of", () => {
    // The cut runs down ℝ₋; the contour is a circle of radius 1 about z = 3, nowhere near it.
    const r = run("1/(z-3)", circleTemplate([3, 0], 1), keyhole([-1, 0]));
    const rows = cutRows(r);
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => x.status === "satisfied")).toBe(true);
    expect(rows[0].claim).toMatch(/admissible/);
    expect(rows[1].claim).toMatch(/no piece of the contour meets a branch cut/);
    expect(r.failedAt).toBeNull();
  });

  it("refuses an inadmissible cut system with NO value, before any geometry is read", () => {
    // A bounded cut between two points whose exponents sum to 2/3.
    const bounded: BranchChoice = {
      convention: "principal",
      points: [
        origin,
        { id: "1", at: [1, 0], order: { kind: "power", alpha: Frac.of(1n, 3n) }, label: "z = 1" },
      ],
      cuts: [{ id: "Γ", from: "0", to: "1", via: [] }],
      basePoint: [0, 1],
      sheet: 0,
    };
    const r = run("1/(z-3)", circleTemplate([3, 0], 1), bounded);
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("LEGALITY");
    expect(r.value).toBeUndefined();
    const row = cutRows(r)[0];
    expect(row.status).toBe("failed");
    expect(row.claim).toMatch(/2\/3/);
    expect(row.evidence.level).toBe("⚠");
    expect(row.repair).toMatch(/infinity/);
    // And the crossing row is never reached: there is no cut system to test a piece against.
    expect(cutRows(r)).toHaveLength(1);
  });

  it("refuses a contour whose total MONODROMY is not trivial, before reading any piece", () => {
    // The sharper form of a rule the per-piece geometry used to approximate. A circle about the
    // origin was refused for "crossing the cut at its seam"; what is actually wrong with it is that
    // `z^(1/3)` does not come back to the same value after a turn around 0. The winding number is
    // decided exactly, by the same sign predicates the poles use — and the test is on `Σ n·α`, not
    // on any single winding.
    const r = run("1/(z-3)", circleTemplate([0, 0], 1), keyhole([-1, 0]));
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("LEGALITY");
    expect(r.value).toBeUndefined();
    const row = cutRows(r).find((x) => x.claim.includes("does not close on one sheet"));
    expect(row?.status).toBe("failed");
    expect(row?.claim).toMatch(/n\(γ, z = 0\) = 1/);
    expect(row?.evidence.method).toMatch(/Σ n\(γ,bⱼ\)·αⱼ = 1\/3 is not an integer/);
    expect(row?.repair).toMatch(/keyhole/);
    // And it fires FIRST: the per-piece row is never reached.
    expect(cutRows(r).some((x) => /declaring which side|declares the side|meets a branch cut/.test(x.claim))).toBe(false);
  });

  it("will not certify an arc bound for an arc that is not centred at the origin", () => {
    // Every bound in `kernel/bounds/` reasons on |z| = R about 0. The dogbone's end caps sit at its
    // branch points, and are the first `vanish` arcs in the app that are not centred there — before
    // them the hypothesis held by accident. A `≤` computed from the wrong geometry is the one thing
    // this app may not print, so the row reports honestly that no bound of this shape applies.
    const half = { kind: "power", alpha: Frac.of(-1n, 2n) } as const;
    const cut: BranchChoice = {
      convention: "zeroToTwoPi",
      points: [
        { id: "b1", at: [-1, 0], order: half, label: "z = -1" },
        { id: "b2", at: [1, 0], order: half, label: "z = 1" },
      ],
      cuts: [{ id: "Γ", from: "b1", to: "b2", via: [] }],
      basePoint: [0, 1],
      sheet: 0,
    };
    const r = run("(z+3)/(z^2+1)", dogboneTemplate(), cut);
    const caps = rowsFor(r, "KILL").filter((x) => x.claim.includes("η-circle"));
    expect(caps).toHaveLength(2);
    for (const cap of caps) {
      expect(cap.status).toBe("unknown");
      expect(cap.evidence.level).toBe("?");
      expect(cap.evidence.method).toMatch(/centred elsewhere/);
    }
    // And the origin-centred arcs it used to be true-by-accident for still get their bound.
    const plain = run("1/(1+z^2)", semicircleTemplate(200));
    expect(rowsFor(plain, "KILL").find((x) => x.claim.includes("arc"))?.evidence.level).toBe("≤");
  });

  it("LETS THE DOGBONE THROUGH: two turns whose exponents sum to an integer", () => {
    // The rule read one branch point at a time refuses the dogbone — `n(D, ±1) = −1` at both — and
    // the refusal is wrong: `Σ n·α = (−1)(−½) + (−1)(−½) = 1 ∈ ℤ`, so `√(1−z²)` returns to itself and
    // the contour is a loop in ℂ∖Γ after all. This is the same arithmetic as admissibility, read
    // along the contour instead of along a component of the cut forest.
    const half = { kind: "power", alpha: Frac.of(-1n, 2n) } as const;
    const cut: BranchChoice = {
      convention: "zeroToTwoPi",
      points: [
        { id: "b1", at: [-1, 0], order: half, label: "z = -1" },
        { id: "b2", at: [1, 0], order: half, label: "z = 1" },
      ],
      cuts: [{ id: "Γ", from: "b1", to: "b2", via: [] }],
      basePoint: [0, 1],
      sheet: 0,
    };
    const r = run("(z+3)/(z^2+1)", dogboneTemplate(), cut);
    const row = cutRows(r).find((x) => x.claim.includes("still closes on one sheet"));
    expect(row?.status).toBe("satisfied");
    expect(row?.claim).toMatch(/Σ n\(γ,bⱼ\)·αⱼ = 1 ∈ ℤ/);
    expect(rowsFor(r, "LEGALITY").every((x) => x.status !== "failed")).toBe(true);
    // And a single end is not enough: half the dogbone leaves Σ n·α = 1/2.
    const oneEnd = run("(z+3)/(z^2+1)", circleTemplate([1, 0], 0.4), cut);
    const bad = cutRows(oneEnd).find((x) => x.claim.includes("does not close on one sheet"));
    expect(bad?.status).toBe("failed");
    expect(bad?.evidence.method).toMatch(/Σ n\(γ,bⱼ\)·αⱼ = −1\/2 is not an integer/);
  });

  it("does not apply the winding rule to a point that is not a branch point at all", () => {
    // α = 2 is single-valued: `z²` comes back to itself after a turn, so a loop around it changes
    // nothing and the declared cut is spurious. Testing every declared point rather than every
    // GENUINE one would refuse a perfectly ordinary contour.
    const integral: BranchChoice = {
      ...keyhole([-1, 0]),
      points: [{ id: "0", at: [0, 0], order: { kind: "power", alpha: Frac.of(2n) }, label: "z = 0" }],
    };
    const r = run("1/(z-3)", circleTemplate([0, 0], 1), integral);
    expect(cutRows(r).some((x) => x.claim.includes("encircles"))).toBe(false);
    // The declared cut is still a declared cut, and this circle still crosses it without saying
    // which side — the app does not get to decide a user's cut was pointless. So LEGALITY does fail
    // here; what must not happen is failing for the WINDING reason, which does not apply.
    expect(cutRows(r).find((x) => x.status === "failed")?.claim).toMatch(/crosses the cut/);
  });

  it("does not mind a contour that stays clear of the branch point", () => {
    expect(run("1/(z+3)", crossedBy(), keyhole([1, 0])).failedAt).toBeNull();
  });

  it("refuses a piece that crosses a cut without declaring its side, and names the repair", () => {
    const r = run("1/(z+3)", crossedBy(), keyhole([-1, 0]));
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("LEGALITY");
    expect(r.value).toBeUndefined();
    const row = pieceRow(r);
    expect(row?.status).toBe("failed");
    expect(row?.claim).toMatch(/crosses the cut/);
    expect(row?.repair).toBe("tag this segment `above` or `below`, or move the cut");
  });

  it("accepts the same crossing once the piece declares which side it runs on", () => {
    const row = pieceRow(run("1/(z+3)", crossedBy("above"), keyhole([-1, 0])));
    expect(row?.status).toBe("satisfied");
    expect(row?.claim).toMatch(/declares the side it runs on \(1 piece\)/);
  });

  it("accepts a TAGGED piece lying along the cut — that is what a keyhole lip is", () => {
    // `model.ts` is explicit that the `side` tag pins "which limit is meant where the piece runs
    // along a branch cut — never an ε-offset". So a lip lies IN the cut and says which side it means.
    // The first version of this engine refused that outright, which made tier D's flagship contour
    // illegal; the untagged case below is the one that must fail.
    const onTheCut: Contour = {
      pieces: [
        {
          id: "p",
          name: "the lip",
          geom: { kind: "segment", from: { x: 1, y: 0 }, to: { x: 4, y: 0 } },
          role: "free",
          side: "above",
          colour: 0,
        },
        {
          id: "q",
          name: "the return",
          geom: { kind: "segment", from: { x: 4, y: 0 }, to: { x: 1, y: 0 } },
          role: "free",
          side: "below",
          colour: 1,
        },
      ],
      params: {},
    };
    const alongPositiveAxis: BranchChoice = {
      ...keyhole([1, 0]),
      cuts: [{ id: "Γ", from: "0", to: INFINITY, via: [[1, 0]] }],
    };
    const tagged = pieceRow(run("1/(z-9)", onTheCut, alongPositiveAxis));
    expect(tagged?.status).toBe("satisfied");

    // …and untagged it refuses, naming the repair DESIGN §4 Pass 1 step 2 specifies.
    const bare: Contour = {
      ...onTheCut,
      pieces: onTheCut.pieces.map((q) => untag(q)),
    };
    const row = pieceRow(run("1/(z-9)", bare, alongPositiveAxis));
    expect(row?.status).toBe("failed");
    expect(row?.claim).toMatch(/runs along the cut/);
    expect(row?.repair).toBe("tag this segment `above` or `below`, or move the cut");
  });

  it("refuses a cut whose BEND rests on the contour's interior, tagged or not", () => {
    // A bend has no side — the cut leaves it in two directions — so no tag pins anything there, and
    // "move the cut" is the only real repair. It is also a state a drag passes through on its way
    // somewhere legal, which is why it is a refusal and not an error. (A bend at a piece's own END
    // is different: that is the handover a keyhole is built from, and it is legal.)
    const bent: BranchChoice = {
      ...keyhole([-1, 0]),
      cuts: [{ id: "Γ", from: "0", to: INFINITY, via: [[-3, 1], [-5, 4]] }],
    };
    const row = pieceRow(run("1/(z+3)", crossedBy("above"), bent));
    expect(row?.status).toBe("failed");
    expect(row?.claim).toMatch(/grazes/);
    expect(row?.repair).toBe("move the cut clear of the contour, or move the contour");
  });

  it("moves the cut instead, and the same contour becomes legal", () => {
    // The whole lesson in one assertion: the cut is a CHOICE. The circle about the origin crosses a
    // cut down ℝ₋; there is no placement of a single cut from 0 to ∞ that it does not cross, so the
    // repair that works is the tag — but a contour that does not enclose the branch point is freed
    // by moving the cut out of its way.
    const away = circleTemplate([3, 0], 1);
    expect(run("1/(z-3)", away, keyhole([-1, 0])).failedAt).toBeNull();
    expect(run("1/(z-3)", away, keyhole([1, 0])).failedAt).toBe("LEGALITY");
  });
});

describe("legalityRefusal — the one gate on printing a value at all", () => {
  const origin: BranchPoint = {
    id: "0",
    at: [0, 0],
    order: { kind: "power", alpha: Frac.of(1n, 3n) },
    label: "z = 0",
  };
  const rayTo = (dir: [number, number]): BranchChoice => ({
    convention: "zeroToTwoPi",
    points: [origin],
    cuts: [{ id: "Γ", from: "0", to: INFINITY, via: [[100 * dir[0], 100 * dir[1]]] }],
    basePoint: [0, 1],
    sheet: 0,
  });

  it("is nothing when the argument is legal, whatever else it fails", () => {
    // The gate is about LEGALITY alone, not about whether the argument CLOSES. `sin z/(1+z²)` on a
    // large semicircle does not close — no lemma kills its arc — and the contour integral over the
    // contour actually drawn is still a perfectly reportable number. Widening this to "does not
    // close" would blank a value the app is entitled to show.
    const open = run("sin(z)/(1+z^2)", semicircleTemplate(50));
    expect(open.closes).toBe(false);
    expect(open.failedAt).not.toBe("LEGALITY");
    expect(legalityRefusal(open)).toBeUndefined();
    expect(legalityRefusal(run("1/z", circleTemplate([0, 0], 1.5)))).toBeUndefined();
  });

  it("names the failing row when a piece crosses a cut it has not declared a side for", () => {
    // The case the shell used to miss: the QUADRATURE is perfectly happy here — every residue of
    // `1/(z+3)` is exact — and LEGALITY still refuses. Reporting the number anyway is exactly the
    // "singular configuration produces a number that then has to be suppressed" that running
    // LEGALITY first exists to prevent.
    const r = run("1/(z+3)", circleTemplate([-3, 0], 1), rayTo([-1, 0]));
    const row = legalityRefusal(r);
    expect(row?.claim).toMatch(/crosses the cut/);
    expect(row?.repair).toMatch(/tag this segment/);
    expect(r.value).toBeUndefined();
  });

  it("names it for an inadmissible cut system too", () => {
    const bounded: BranchChoice = {
      ...rayTo([1, 0]),
      points: [
        origin,
        { id: "1", at: [5, 0], order: { kind: "power", alpha: Frac.of(1n, 3n) }, label: "z = 5" },
      ],
      cuts: [{ id: "Γ", from: "0", to: "1", via: [] }],
    };
    expect(legalityRefusal(run("1/z", circleTemplate([0, 0], 1.5), bounded))?.claim).toMatch(
      /not admissible/,
    );
  });

  it("reports the FIRST failing LEGALITY row, which is the one that stopped the pass", () => {
    const r = run("1/(z+3)", circleTemplate([-3, 0], 1), rayTo([-1, 0]));
    const failures = r.rows.filter((x) => x.constraint === "LEGALITY" && x.status === "failed");
    expect(failures).toHaveLength(1);
    expect(legalityRefusal(r)).toBe(failures[0]);
  });

  it("is nothing again once the cut is moved out of the contour's way", () => {
    // The lesson, as a test: the cut is a choice, and the repair is to make a different one.
    const away = circleTemplate([3, 0], 0.5);
    expect(legalityRefusal(run("1/(z-3)", away, rayTo([-1, 0])))).toBeUndefined();
    expect(legalityRefusal(run("1/(z-3)", away, rayTo([1, 0])))?.claim).toMatch(/crosses the cut/);
  });
});

describe("the keyhole is LEGAL — the contour tier D is built on", () => {
  // Everything in this block is about the contour's geometry against the cut, so the integrand is
  // any rational function with no pole on ℝ₊. The keyhole's own integrand arrives with D1.
  const origin: BranchPoint = {
    id: "0",
    at: [0, 0],
    order: { kind: "power", alpha: Frac.of(1n, 3n) },
    label: "z = 0",
  };
  const cutAlongPositiveAxis: BranchChoice = {
    convention: "zeroToTwoPi",
    points: [origin],
    cuts: [{ id: "Γ", from: "0", to: INFINITY, via: [[1000, 0]] }],
    basePoint: [0, 1],
    sheet: 0,
  };

  const cutRows = (r: ReturnType<typeof run>) =>
    rowsFor(r, "LEGALITY").filter((x) => x.claim.includes("cut") || x.claim.includes("branch point"));

  it("passes LEGALITY: the lips declare their sides and the circles only END on the cut", () => {
    const r = run("1/(z+1)", keyholeTemplate(4, 0.15), cutAlongPositiveAxis);
    const rows = cutRows(r);
    expect(rows.every((x) => x.status === "satisfied")).toBe(true);
    expect(rows.some((x) => /declares the side it runs on \(2 pieces\)/.test(x.claim))).toBe(true);
    // It stops later, at KILL: nothing kills a keyhole's circles for a RATIONAL integrand, because
    // the lemmas that do (`ε^α → 0` needs α > 0, `R^{α−1} → 0` needs α < 1) are statements about the
    // branch exponent. That is D1's integrand, and it arrives with D1.
    expect(r.failedAt).not.toBe("LEGALITY");
  });

  it("has net winding ZERO about the branch point — which is why it is a loop in ℂ∖Γ at all", () => {
    // `+1` from the outer circle and `−1` from the inner. This is the property that distinguishes a
    // keyhole from a bare circle, and the reason the bare circle cannot be repaired by a tag.
    const pieces = resolveAll(keyholeTemplate(4, 0.15));
    expect(windingNumber(pieces, [0, 0]).n).toBe(0);
    expect(windingNumber(pieces, [0, 0]).decided).toBe(true);
  });

  it("still encloses a pole off the cut, so the residue theorem has something to say", () => {
    // z = −1 is inside the annulus the keyhole sweeps, at arg π — squarely inside (0, 2π).
    const pieces = resolveAll(keyholeTemplate(4, 0.15));
    expect(windingNumber(pieces, [-1, 0]).n).toBe(1);
  });

  it("refuses once a lip's side tag is removed", () => {
    const bare = keyholeTemplate(4, 0.15);
    const untagged: Contour = {
      ...bare,
      pieces: bare.pieces.map((q) => untag(q)),
    };
    const row = cutRows(run("1/(z+1)", untagged, cutAlongPositiveAxis)).find(
      (x) => !x.claim.includes("admissible"),
    );
    expect(row?.status).toBe("failed");
    expect(row?.claim).toMatch(/runs along the cut/);
  });

  it("is closed, at every scale of its two limit parameters", () => {
    for (const [R, eps] of [
      [4, 0.15],
      [1e3, 1e-6],
      [0.6, 0.5],
    ]) {
      const pieces = resolveAll(keyholeTemplate(R, eps));
      expect(isClosed(pieces)).toBe(true);
      expect(windingNumber(pieces, [0, 0]).n).toBe(0);
    }
  });
});
