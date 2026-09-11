import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger, ledgerHeadline, legalityRefusal } from "../src/engine/ledger.js";
import { resolveAll, type Contour } from "../src/engine/contour/model.js";
import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";
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
    rowsFor(r, "LEGALITY").filter((x) => x.claim.includes("cut"));

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

  it("refuses a piece that crosses a cut without declaring its side, and names the repair", () => {
    // The cut down ℝ₋, and a circle about the origin that must cross it.
    const r = run("1/(z-3)", circleTemplate([0, 0], 1), keyhole([-1, 0]));
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("LEGALITY");
    expect(r.value).toBeUndefined();
    const row = cutRows(r)[1];
    expect(row.status).toBe("failed");
    expect(row.claim).toMatch(/crosses the cut/);
    expect(row.repair).toBe("tag this segment `above` or `below`, or move the cut");
  });

  it("accepts the same crossing once the piece declares which side it runs on", () => {
    const base = circleTemplate([0, 0], 1);
    const tagged: Contour = {
      ...base,
      pieces: base.pieces.map((p) => ({ ...p, side: "above" as const })),
    };
    const r = run("1/(z-3)", tagged, keyhole([-1, 0]));
    const row = cutRows(r)[1];
    expect(row.status).toBe("satisfied");
    expect(row.claim).toMatch(/declares the side it runs on \(1 crossing\)/);
  });

  it("refuses a piece lying ALONG the cut, and no tag rescues it", () => {
    // A tag says which limit is meant where the contour crosses; a piece running down the cut itself
    // is not approaching from a side at all, so `above` would pin nothing. The distinction matters
    // because the keyhole's two lips DO lie parallel to the cut and must stay legal — they are a
    // hair off it, not on it, and that hair is the entire integral.
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
    const r = run("1/(z-9)", onTheCut, alongPositiveAxis);
    const row = cutRows(r)[1];
    expect(row.status).toBe("failed");
    expect(row.claim).toMatch(/grazes/);
    expect(row.repair).toBe("move the cut clear of the contour, or move the contour");
  });

  it("refuses a cut whose BEND rests on the contour, tagged or not", () => {
    // The bend at z = −1 sits exactly on the unit circle. There is no side at a bend — the cut leaves
    // it in two directions — so no tag pins anything, and "move the cut" is the only real repair. It
    // is also the state a drag passes through on its way somewhere legal, which is why it is a
    // refusal and not an error.
    const base = circleTemplate([0, 0], 1);
    const tagged: Contour = {
      ...base,
      pieces: base.pieces.map((q) => ({ ...q, side: "above" as const })),
    };
    const bent: BranchChoice = {
      ...keyhole([-1, 0]),
      cuts: [{ id: "Γ", from: "0", to: INFINITY, via: [[-1, 0], [-3, 2]] }],
    };
    const row = cutRows(run("1/(z-3)", tagged, bent))[1];
    expect(row.status).toBe("failed");
    expect(row.claim).toMatch(/grazes/);
    expect(row.repair).toBe("move the cut clear of the contour, or move the contour");
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
    // The case the shell used to miss: the QUADRATURE is perfectly happy here — ∮ dz/z over this
    // circle is 2πi and every residue is exact — and LEGALITY still refuses. Reporting the number
    // anyway is exactly the "singular configuration produces a number that then has to be
    // suppressed" that running LEGALITY first exists to prevent.
    const r = run("1/z", circleTemplate([0, 0], 1.5), rayTo([1, 0]));
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
    const r = run("1/z", circleTemplate([0, 0], 1.5), rayTo([1, 0]));
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
