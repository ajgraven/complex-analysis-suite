import { describe, expect, it } from "vitest";
import { headlineFails } from "../src/engine/vocabulary.js";
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
  stripTemplate,
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
    expect(ledgerHeadline(r)).toBe("The argument is complete.");
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
      const m = /\\le ([0-9.e+-]+)/.exec(kill?.claim ?? "");
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
    expect(ledgerHeadline(r)).toBe(headlineFails("KILL"));
    const arc = rowsFor(r, "KILL").find((x) => x.status === "failed");
    expect(arc?.claim).toMatch(/diverges/);
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
    // Jordan's constant is \\pi/|a|, which at a = 0 is ∞ and says nothing — correctly, since Jordan
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
    expect(arc?.claim).toMatch(/does not vanish/);
  });

  it("declines KILL rather than guessing when no lemma covers the integrand", () => {
    const r = run("sin(z)/(1+z^2)", semicircleTemplate(50));
    expect(r.closes).toBe(false);
    const arc = rowsFor(r, "KILL").find((x) => x.status === "unknown");
    expect(arc?.evidence.level).toBe("?");
    expect(arc?.claim).toMatch(/no bound is available for this integrand/);
  });
});

describe("sandbox mode", () => {
  it("reports the closed-contour value with COVER vacuous when there is no target", () => {
    // A full circle has no `target` piece: there is no real integral being solved for, and the
    // ledger says so rather than inventing one.
    const r = run("1/z", circleTemplate([0, 0], 1.5));
    const cover = rowsFor(r, "COVER")[0];
    expect(cover.status).toBe("unknown");
    expect(cover.claim).toMatch(/no target is designated/);
    // And the headline does not overclaim: nothing was "argued" to a real integral here.
    expect(r.hasTarget).toBe(false);
    expect(ledgerHeadline(r)).toBe("$\\oint_\\gamma f(z)\\,dz$ is established exactly.");
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

  // **Keyed on the TEMPLATE, not on the sentence.** These used to search the claim text for "cut"
  // and for "admissible", which meant the wording pass of M8 step 0.5b silently re-pointed them: the
  // admissibility row stopped containing the word, so `pieceRow` returned IT — satisfied — and four
  // tests reported a refusal that had not happened. A template id is what the row IS.
  const CUT_TEMPLATES = new Set([
    "legality.cuts-admissible",
    "legality.cuts-inadmissible",
    "legality.cuts-clear",
    "legality.cuts-sided",
    "legality.cut-grazed",
    "legality.cut-crossed",
    "legality.cut-invariance-one",
    "legality.cut-invariance-many",
    "legality.monodromy-on-sheet",
    "legality.monodromy-off-sheet",
    "legality.monodromy-undecided",
  ]);
  const cutRows = (r: ReturnType<typeof run>) =>
    rowsFor(r, "LEGALITY").filter((x) => CUT_TEMPLATES.has(x.claimData.template));
  /** The per-piece row specifically — the one about pieces meeting a cut, not about the cut system. */
  const pieceRow = (r: ReturnType<typeof run>) =>
    cutRows(r).find((x) =>
      ["legality.cuts-clear", "legality.cuts-sided", "legality.cut-grazed", "legality.cut-crossed"].includes(
        x.claimData.template,
      ),
    );

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

  it("passes an admissible cut the contour stays clear of, and says ∮ cannot see where it runs", () => {
    // The cut runs down ℝ₋; the contour is a circle of radius 1 about z = 3, nowhere near it.
    const r = run("1/(z-3)", circleTemplate([3, 0], 1), keyhole([-1, 0]));
    const rows = cutRows(r);
    expect(rows).toHaveLength(3);
    expect(rows.every((x) => x.status === "satisfied")).toBe(true);
    expect(rows[0].claim).toMatch(/single-valued off them/);
    expect(rows[1].claim).toMatch(/no piece crosses a branch cut/);
    // **NORTH-STAR #3's FIRST HALF.** The third row is the one that makes dragging legible: with the
    // cuts clear of the contour, `∮` does not depend on where they run, so the answer is EXACTLY
    // unchanged under a drag and a jump on crossing is the whole content of the monodromy.
    expect(rows[2].claimData.template).toBe("legality.cut-invariance-one");
    expect(rows[2].evidence.method).toMatch(/count of jump-weighted crossings/);
    expect(r.failedAt).toBeNull();
  });

  it("does NOT emit the invariance row once a piece declares a side against a cut", () => {
    // The claim is about a contour CLEAR of the cuts. A keyhole's lips run along the cut and declare
    // their sides, and there `∮` very much does depend on where the cut is — it is what the lips are
    // limits from. A row asserting invariance there would be false, so it is emitted only when the
    // contour is clear, and this pins that rather than trusting the condition to stay written.
    const r = run("1/(z-3)", crossedBy("above"), keyhole([-1, 0]));
    expect(cutRows(r).every((x) => x.status === "satisfied")).toBe(true);
    expect(cutRows(r).some((x) => x.claimData.template === "legality.cuts-sided")).toBe(true);
    expect(cutRows(r).some((x) => x.claimData.template.startsWith("legality.cut-invariance"))).toBe(false);
  });

  it("names what the crossing COSTS in the refusal itself — research 06 §3.2's contract", () => {
    // The half that was missing until M4.7d. "The app must either REFUSE the crossing or change
    // sheet and say so, WITH THE MULTIPLICATIVE FACTOR SHOWN … silently continuing is the
    // misconception generator." It refused from M4.1 and said nothing about the factor, which
    // teaches a reader that a cut is a wall rather than a bookkeeping choice with a price.
    const r = run("1/(z-3)", crossedBy(), keyhole([-1, 0]));
    const row = cutRows(r).find((x) => x.status === "failed");
    expect(row).toBeDefined();
    const lines = (row?.evidence.provenance ?? []).map((x) => x.text);
    expect(lines.some((t) => t.includes("multiplies the integrand by $e^{2\\pi i \\cdot \\frac{1}{3}}"))).toBe(true);
    // And it is marked as the cost of a FAILURE, not as a satisfied step.
    expect((row?.evidence.provenance ?? []).every((x) => !x.ok)).toBe(true);
    expect(r.failedAt).toBe("LEGALITY");
  });

  it("does not claim ∮ is unchanged by moving cuts when there are none to move", () => {
    // Reachable, narrowly: a branch point with an INTEGER exponent is not genuine, so admissibility
    // does not require a cut to reach it (rule (a)) and the system can legally have no cuts at all.
    // The invariance sentence would then be about an empty set — true but absurd, and the kind of
    // row that makes a reader distrust the others.
    const noCuts: BranchChoice = {
      convention: "principal",
      points: [{ id: "0", at: [0, 0], order: { kind: "power", alpha: Frac.of(2n) }, label: "z = 0" }],
      cuts: [],
      basePoint: [0, 1],
      sheet: 0,
    };
    const r = run("1/(z-3)", circleTemplate([3, 0], 1), noCuts);
    expect(cutRows(r).some((x) => x.claimData.template.startsWith("legality.cut-invariance"))).toBe(false);
  });

  it("names what a crossing would COST, on a cut the contour is clear of", () => {
    // Research 06 §3.2: refuse the crossing or change sheet, with the factor SHOWN. Knowing the
    // factor before the crossing is what lets a reader see it coming.
    const r = run("1/(z-3)", circleTemplate([3, 0], 1), keyhole([-1, 0]));
    const row = cutRows(r).find((x) => x.claimData.template === "legality.cuts-clear");
    const lines = (row?.evidence.provenance ?? []).map((x) => x.text);
    // α = 1/3 on this fixture's branch point, so J = 1/3 and the factor is e^(2πi·1/3). `4J ∉ ℤ`,
    // so it is CARRIED as an exponential rather than folded into ℚ(i) — the same rule
    // `Exponent.asAlgebraicFactor` applies to an answer, applied here to a crossing, so the app
    // never invents a radical it cannot write down.
    expect(lines.some((t) => t.includes("multiplies the integrand by $e^{2\\pi i \\cdot \\frac{1}{3}}"))).toBe(true);
    expect(lines.some((t) => t.includes("4J \\notin \\mathbb{Z}$"))).toBe(true);
    expect(lines.some((t) => t.includes("folds to"))).toBe(false);
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
    const row = cutRows(r).find((x) => x.claimData.template === "legality.monodromy-off-sheet");
    expect(row?.status).toBe("failed");
    expect(row?.claim).toMatch(/\\operatorname\{Ind\}_\\gamma\(0\) = 1/);
    expect(row?.evidence.method).toMatch(/\\alpha_j = \\frac\{1\}\{3\}\$ is not an integer/);
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
    const row = cutRows(r).find((x) => x.claimData.template === "legality.monodromy-on-sheet");
    expect(row?.status).toBe("satisfied");
    expect(row?.claim).toMatch(/\\alpha_j = 1 \\in \\mathbb\{Z\}/);
    expect(rowsFor(r, "LEGALITY").every((x) => x.status !== "failed")).toBe(true);
    // And a single end is not enough: half the dogbone leaves Σ n·α = 1/2.
    const oneEnd = run("(z+3)/(z^2+1)", circleTemplate([1, 0], 0.4), cut);
    const bad = cutRows(oneEnd).find((x) => x.claimData.template === "legality.monodromy-off-sheet");
    expect(bad?.status).toBe("failed");
    expect(bad?.evidence.method).toMatch(/\\alpha_j = -\\frac\{1\}\{2\}\$ is not an integer/);
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
    expect(row?.repair).toBe("Assign the piece to the upper or lower side of the cut, or move the cut.");
  });

  it("accepts the same crossing once the piece declares which side it runs on", () => {
    const row = pieceRow(run("1/(z+3)", crossedBy("above"), keyhole([-1, 0])));
    expect(row?.status).toBe("satisfied");
    expect(row?.claim).toMatch(/is assigned a side \(1 piece\)/);
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
    expect(row?.claim).toMatch(/crosses the cut/);
    expect(row?.repair).toBe("Assign the piece to the upper or lower side of the cut, or move the cut.");
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
    expect(row?.claim).toMatch(/touches the cut .* tangentially/);
    expect(row?.repair).toBe("Move the cut clear of the contour, or move the contour.");
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
    expect(row?.repair).toMatch(/Assign the piece to the upper or lower side/);
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
      /do not make the integrand single-valued/,
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
    expect(rows.some((x) => x.claimData.template === "legality.cuts-sided" && /\(2 pieces\)/.test(x.claim))).toBe(true);
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
    const row = cutRows(run("1/(z+1)", untagged, cutAlongPositiveAxis)).find((x) =>
      ["legality.cuts-clear", "legality.cuts-sided", "legality.cut-grazed", "legality.cut-crossed"].includes(
        x.claimData.template,
      ),
    );
    expect(row?.status).toBe("failed");
    expect(row?.claim).toMatch(/crosses the cut/);
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

// **L6 REACHES THE LEDGER (M5.2).** Before this the KILL pass had no bound for `e^{±zⁿ}` at all —
// Jordan's reader wants a linear exponent and the exact rational reader refuses a `call` — so the
// one integrand the wedge lemma exists for fell through to "no lemma here applies". The wedge
// TEMPLATE is M5.4; these contours are built by hand so the routing is exercised now rather than
// shipped as code nothing calls.
function sector(from: number, to: number, R = 4, lemma?: "L6"): Contour {
  return {
    pieces: [
      {
        id: "out",
        name: "the outward ray",
        geom: {
          kind: "segment",
          from: { x: 0, y: 0 },
          to: { x: { param: "R", mul: Math.cos(from) }, y: { param: "R", mul: Math.sin(from) } },
        },
        role: "target",
        colour: 0,
      },
      {
        id: "arc",
        name: "the wedge arc",
        geom: {
          kind: "arc",
          center: { x: 0, y: 0 },
          radius: { param: "R" },
          theta0: from,
          theta1: to,
        },
        role: "vanish",
        // **The lemma is a PARAMETER of the fixture since M8 step 4.1**, because the ledger now
        // honours a declaration instead of re-deriving it from the shape. The wedge tests below
        // declare `L6` and mean it; the SWEEP-reader tests share this geometry with a rational
        // integrand, where `L6` would be a declaration its own integrand does not satisfy — and the
        // engine refuses that by name, which is exactly what the step added. They declare nothing
        // and get the shape-driven pick, which is what a sandbox contour has anyway.
        ...(lemma === undefined ? {} : { lemma }),
        colour: 1,
      },
      {
        id: "back",
        name: "the return ray",
        geom: {
          kind: "segment",
          from: { x: { param: "R", mul: Math.cos(to) }, y: { param: "R", mul: Math.sin(to) } },
          to: { x: 0, y: 0 },
        },
        role: "free",
        colour: 2,
      },
    ],
    params: { R: { name: "R", value: R, range: [0.5, 1e6], scale: "log", limit: { to: "inf" } } },
  };
}

/** The `π/over` wedge, measured from the positive real axis — what L6 is stated on. */
const wedge = (over: number, R = 4): Contour => sector(0, Math.PI / over, R, "L6");

const arcRow = (r: ReturnType<typeof run>) => rowsFor(r, "KILL").find((x) => x.pieceId === "arc");

describe("L6 — the wedge lemma, routed and certified", () => {
  it("certifies the Fresnel arc: e^{iz²} on the π/4 wedge", () => {
    const row = arcRow(run("exp(i*z^2)", wedge(4)));
    expect(row?.status).toBe("satisfied");
    expect(row?.evidence.level).toBe("≤");
    expect(row?.evidence.method).toMatch(/the wedge lemma \(oscillatory form\)/);
  });

  it("certifies the Gaussian arc: e^{−z²} on the same π/4 wedge", () => {
    const row = arcRow(run("exp(-z^2)", wedge(4)));
    expect(row?.status).toBe("satisfied");
    expect(row?.evidence.method).toMatch(/the wedge lemma \(Gaussian form\)/);
  });

  it("D-1, side by side on one contour: the π/2 wedge kills e^{iz²} and REFUSES e^{−z²}", () => {
    // The same arc, the same n, the same lemma — and the face decides. This is the mistake research
    // 03 §0.3 made, as two rows a reader can put next to each other.
    const oscillatory = arcRow(run("exp(i*z^2)", wedge(2)));
    expect(oscillatory?.status).toBe("satisfied");

    const gaussian = arcRow(run("exp(-z^2)", wedge(2)));
    expect(gaussian?.status).toBe("failed");
    expect(gaussian?.evidence.level).toBe("⚠");
    expect(gaussian?.evidence.method).toMatch(/GROWS/);
    expect(gaussian?.evidence.method).toMatch(/runs past π\/2/);
  });

  it("reaches the wedge angles a π/(2n) wedge needs, which the extent reader could not measure", () => {
    // `π/6` and `π/8` were not in the whitelist before M5.2, so an `e^{−z³}` arc got no bound for
    // want of an EXTENT, one step before the missing lemma.
    expect(arcRow(run("exp(-z^3)", wedge(6)))?.status).toBe("satisfied");
    expect(arcRow(run("exp(-z^4)", wedge(8)))?.status).toBe("satisfied");
    expect(arcRow(run("exp(i*z^3)", wedge(3)))?.status).toBe("satisfied");
  });

  it("refuses a sector that does not START on the positive real axis", () => {
    // A closed, perfectly drawable sector — and not a wedge: the minorant is read about ψ = 0, so a
    // bound computed here would be the right formula on the wrong geometry, which is the mistake
    // M4.6c found in every arc bound at once when the dogbone's caps stopped being centred at 0.
    const row = arcRow(run("exp(-z^2)", sector(Math.PI / 4, Math.PI / 2)));
    expect(row?.status).not.toBe("satisfied");
  });

  it("…and the CLOCKWISE sector is why that refusal is not merely tidy", () => {
    // `[π/2 → π/4]` for `e^{−z²}`: reading the start as 0 leaves a range of `π/4`, which passes the
    // side condition and yields `π/(4R)` — while on the arc itself `2θ ∈ [π/2, π]`, `cos 2θ ≤ 0`,
    // and the integrand reaches `e^{+R²}`. That is a `≤` that is FALSE, not merely loose, and it is
    // what a mutation sweep found: the previous test refuses under the mutant too, by the range
    // check firing first, so it was pinning the outcome without pinning the reason.
    const row = arcRow(run("exp(-z^2)", sector(Math.PI / 2, Math.PI / 4)));
    expect(row?.status).not.toBe("satisfied");
    expect(row?.evidence.method).toMatch(/measured from the positive real axis/);
  });

  it("gives a DEGENERATE arc no extent, rather than a bound of ≤ 0 that is false", () => {
    // `asPiMultiple` answers `0` near zero so a wedge's START angle is expressible, and an extent of
    // `0` would make the ML bound `0·π·R·max|f| = 0` — a `≤ 0` on an arc whose integral is small and
    // NOT zero. That is certification theatre (PLAN §9 R2) wearing the sign of rigour, so the extent
    // reader refuses instead.
    const row = arcRow(run("1/(1+z^2)", sector(0, 1e-13)));
    expect(row?.status).toBe("unknown");
  });

  it("refuses BY NAME for a shape the declared lemma does not cover", () => {
    // `z·e^{−z²}` has a cofactor the wedge bound declines by name. The claim has not changed — no
    // bound is computed as though the cofactor were not there — but the ANSWER has, at M8 step 4.1:
    // the piece declares `L6`, so the honest report is that the chosen lemma does not apply, which
    // is strictly more than the old fallthrough's "no bound is available for this integrand". That
    // sentence blamed the integrand for a choice the reader made.
    const row = arcRow(run("z*exp(-z^2)", wedge(4)));
    expect(row?.status).toBe("failed");
    expect(row?.claimData.template).toBe("kill.lemma-refused");
    expect(row?.claim).toContain("the wedge bound");
    expect(row?.claim).toContain("not of that form");
    // And with NO lemma declared the same arc falls through as it always did, which is the pairing
    // that makes the line above a claim about the declaration rather than about the integrand.
    const bare = arcRow(run("z*exp(-z^2)", sector(0, Math.PI / 4)));
    expect(bare?.status).toBe("unknown");
    expect(bare?.evidence.method).toMatch(/λ·e\{?\^?\{?w z/);
  });
});

// **THE ANGLE READER IS A RULE, NOT A LIST (M5.4b).** A whitelist of thirteen fractions cannot
// enumerate `2π/n` for a record's own `n`, and at `n = 5` KILL blamed the INTEGRAND for a failure
// of the geometry reader — for the one integrand shape it discharges at `n = 4`.
describe("an arc's sweep as an exact multiple of π", () => {
  /** The `p·π/q` sector from the positive real axis — F1's wedge shape, at any angle. */
  const sweep = (p: number, q: number) => sector(0, (p * Math.PI) / q);

  it("reads every fraction the old whitelist held", () => {
    // The thirteen, so a cap that lost one would be caught rather than inferred. The integrand's
    // poles are `3 ± i`, at ±atan(1/3) = ±0.1024·π — no rational multiple with denominator ≤ 12, so
    // no return ray of any sweep below lands ON one and LEGALITY never pre-empts KILL. (`1/(1+z⁴)`
    // cannot be used here for exactly that reason: its own pole sits on the π/4 ray.)
    for (const [p, q] of [
      [2, 1],
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 3],
      [1, 4],
      [3, 2],
      [4, 1],
      [1, 5],
      [1, 6],
      [1, 8],
      [1, 10],
      [1, 12],
    ] as const) {
      expect(arcRow(run("1/(z^2 - 6*z + 10)", sweep(p, q)))?.status, `${p}π/${q}`).toBe("satisfied");
    }
  });

  it("reads 2π/5 and 2π/7, which no list of nice angles contained", () => {
    // F1's own sweeps. The integrand is the same shape discharged at every angle above.
    expect(arcRow(run("1/(1+z^5)", sweep(2, 5)))?.status).toBe("satisfied");
    expect(arcRow(run("1/(1+z^7)", sweep(2, 7)))?.status).toBe("satisfied");
    expect(arcRow(run("1/(1+z^9)", sweep(2, 9)))?.status).toBe("satisfied");
  });

  it("refuses a denominator past the cap, and an angle that is no rational multiple at all", () => {
    // The cap is what makes the reading a DECISION: two rationals with denominators ≤ 12 differ by
    // at least 1/144, so the 1e-12 window admits one candidate or none. Past it, `simplestRational`
    // of a float is a sixteen-digit fraction that is honest and useless.
    expect(arcRow(run("1/(1+z^4)", sector(0, Math.PI / 13)))?.status).toBe("unknown");
    expect(arcRow(run("1/(1+z^4)", sector(0, Math.PI / Math.sqrt(2))))?.status).toBe("unknown");
    // …and a sweep wider than two full turns.
    expect(arcRow(run("1/(1+z^4)", sector(0, 5 * Math.PI)))?.status).toBe("unknown");
  });

  it("blames the GEOMETRY, not the integrand, when the sweep is what could not be read", () => {
    // The row said "no lemma here applies to this integrand" whatever the cause. For `1/(1 + z⁴)`
    // that is false twice over: the plain ML bound is exactly the lemma for it, and the degree gap
    // is 4 ≥ 2. Sending a reader to inspect the one thing that was fine is worse than saying
    // nothing.
    const row = arcRow(run("1/(1+z^4)", sector(0, Math.PI / 13)));
    expect(row?.claim).toMatch(/is not a rational multiple of/);
    expect(row?.claim).not.toMatch(/integrand/);
    expect(row?.evidence.method).toMatch(/the sweep enters the number/);

    // …and an integrand no bound covers still says so, on an arc whose sweep reads perfectly.
    const unsupported = arcRow(run("z*exp(-z^2)", sweep(1, 4)));
    expect(unsupported?.claimData.template).toBe("kill.no-lemma");
  });
});

// **A VANISHING SEGMENT REACHES A LEMMA (M5.3c).** Until now `disposeArc` declined anything that
// was not an arc, so a rectangle's vertical side reported "no lemma here applies" — for the two
// pieces tier E's entire argument needs killed.
const sideRow = (r: ReturnType<typeof run>, id: string) =>
  rowsFor(r, "KILL").find((x) => x.pieceId === id);

describe("L1 on a strip's vertical sides", () => {
  it("kills both of E1's verticals at a = 3/10", () => {
    const r = run("exp((3/10)*z)/(1 + exp(z))", stripTemplate(2 * Math.PI, 9));
    for (const id of ["right", "left"]) {
      expect(sideRow(r, id)?.status).toBe("satisfied");
      expect(sideRow(r, id)?.evidence.level).toBe("≤");
      expect(sideRow(r, id)?.evidence.method).toMatch(/ML-estimate on a vertical side/);
    }
  });

  it("ONE CONDITION, TWO JOBS: a ≥ 1 breaks the right side and a ≤ 0 the left", () => {
    // The record's own claim, as two rows a reader can put side by side. Neither window is declared
    // anywhere; each is the sign of one exact rational exponent.
    const tooBig = run("exp((6/5)*z)/(1 + exp(z))", stripTemplate(2 * Math.PI, 9));
    expect(sideRow(tooBig, "right")?.status).toBe("failed");
    expect(sideRow(tooBig, "left")?.status).toBe("satisfied");

    const tooSmall = run("exp((-1/10)*z)/(1 + exp(z))", stripTemplate(2 * Math.PI, 9));
    expect(sideRow(tooSmall, "right")?.status).toBe("satisfied");
    expect(sideRow(tooSmall, "left")?.status).toBe("failed");
  });

  it("kills E2's verticals for a ξ of either sign, with no condition to state", () => {
    for (const xi of ["2", "-2"]) {
      const r = run(`exp(i*(${xi})*z)/cosh(z)`, stripTemplate(Math.PI, 9));
      expect(sideRow(r, "right")?.status).toBe("satisfied");
      expect(sideRow(r, "left")?.status).toBe("satisfied");
    }
  });

  it("never asks the TOP side for a bound — it reproduces, and its ML bound diverges", () => {
    const r = run("exp((3/10)*z)/(1 + exp(z))", stripTemplate(2 * Math.PI, 9));
    const top = rowsFor(r, "KILL").find((x) => x.pieceId === "top");
    expect(top?.status).toBe("satisfied");
    expect(top?.claim).toMatch(/a constant multiple of the target/);
  });

  it("declines a DIAGONAL side, where a bound read at one end would be the wrong geometry", () => {
    // `|f|` varies along a diagonal, and the strip bound reasons about a FIXED `Re z`. Reading the
    // start point's real part and bounding as though the whole piece sat there computes a `≤` from
    // geometry the piece does not have — M4.6c's finding about off-centre arcs, in the other shape.
    // The whole quadrilateral is slanted so it still CLOSES — an unclosed one stops at LEGALITY and
    // never reaches KILL, which is what the first draft of this test measured.
    const base = stripTemplate(2 * Math.PI, 9);
    const P = 2 * Math.PI;
    const diagonal: Contour = {
      ...base,
      pieces: base.pieces.map((piece) => {
        if (piece.id === "right") {
          return {
            ...piece,
            geom: {
              kind: "segment" as const,
              from: { x: { param: "R" }, y: 0 },
              to: { x: { param: "R", mul: 0.5 }, y: P },
            },
          };
        }
        if (piece.id === "top") {
          return {
            ...piece,
            geom: {
              kind: "segment" as const,
              from: { x: { param: "R", mul: 0.5 }, y: P },
              to: { x: { param: "R", mul: -1 }, y: P },
            },
          };
        }
        return piece;
      }),
    };
    const row = sideRow(run("exp((3/10)*z)/(1 + exp(z))", diagonal), "right");
    expect(row?.status).toBe("unknown");
    expect(row?.evidence.method).toMatch(/vertical side of a strip/);
  });

  it("still declines a vertical side whose integrand is not a strip integrand", () => {
    const r = run("1/(1+z^2)", stripTemplate(2 * Math.PI, 9));
    expect(sideRow(r, "right")?.status).toBe("unknown");
    expect(sideRow(r, "right")?.evidence.method).toMatch(/vertical side of a strip/);
  });
});
