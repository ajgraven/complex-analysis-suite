// **A DECLARED lemma, and the target a certified contour determines** — M8 step 4.1.
//
// Two claims, and they are the two halves of what a `vanish` piece IS. The first: a piece says
// which lemma disposes of it, and the engine honours that declaration instead of guessing from the
// integrand's shape — so a reader who chooses the wrong one is told which hypothesis fails rather
// than being quietly given the right bound. The second: with one `target` piece and every other
// piece certified, `∮ f dz` read backwards gives the target's own integral, which is the sandbox's
// first real-integral answer.
//
// **The corpus is the no-op proof for the first half and it is not repeated here.** Every one of
// the 28 records declares a lemma on every vanishing piece, every declaration agrees with what the
// shape-driven chain picks, and `test/ledgerDump.test.ts` is byte-identical across all of them —
// which is the finding: the agreement was never checked, so it held because the guess happened to
// be right. What this file covers is the cases the corpus cannot reach, because no record declares
// a lemma its own integrand does not satisfy.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";

import type { Cx } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger } from "../src/engine/ledger.js";
import { resolveAll, type Contour, type LemmaId, type PieceRole } from "../src/engine/contour/model.js";
import { semicircleTemplate } from "../src/engine/contour/templates.js";
import { loadFamilies } from "../src/families/index.js";
import { solveFamily } from "../src/families/runFamily.js";

const FAMILIES = [...loadFamilies().families.values()];

function run(src: string, contour: Contour) {
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
  return {
    ...evaluateLedger({ ast, pieces, spec: contour.pieces, poles, integral, theorem }),
    // Carried out so the target's value can be checked against the quadrature of the very piece it
    // is about, rather than against a number this file computed for itself.
    integral,
  };
}

/** The upper semicircle with its arc's role and lemma set — the sandbox's own editing operation. */
function arcDeclared(lemma?: LemmaId, role: PieceRole = "vanish"): Contour {
  const base = semicircleTemplate(200);
  return {
    ...base,
    pieces: base.pieces.map((p) =>
      p.id === "arc" ? { ...p, role, ...(lemma === undefined ? {} : { lemma }) } : p,
    ),
  };
}

const arcRow = (r: ReturnType<typeof run>) =>
  r.rows.filter((x) => x.constraint === "KILL").find((x) => x.pieceId === "arc");

describe("a declared lemma is HONOURED, and refused by name when it does not apply", () => {
  it("refuses Jordan's lemma on a rational integrand, naming the factor it needs", () => {
    // The plan's own test. `asExponentialTimesRational` returns null here — there is no factor at
    // all — which is what distinguishes this from the degenerate case below.
    const r = run("1/(1+z^2)", arcDeclared("L3"));
    const row = arcRow(r);
    expect(row?.status).toBe("failed");
    expect(row?.claim).toContain("Jordan's lemma");
    expect(row?.claim).toContain("carries no such factor");
    // The name, not the id: step 0.2's decision reaches the lemmas at last.
    expect(row?.claim).not.toContain("L3");
    // And the argument does not close on a piece nobody has bounded.
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("KILL");
    expect(r.target, "a refused lemma must not leave a target value standing").toBeUndefined();
  });

  it("does NOT refuse Jordan at zero frequency — the hypothesis degenerates, it does not fail", () => {
    // B1's family runs through `a = 0`, where `e^{iaz} = 1` and Jordan's `π/|a|` is `∞`. The
    // record's own trap says an engine treating that as a failure "will paper over exactly the case
    // it was built to catch". The factor is PRESENT with frequency zero, which is a different fact
    // from the factor being absent — measured rather than assumed, and the whole reason the test
    // above can be written at all.
    const r = run("exp(i*0*z)/(1+z^2)", arcDeclared("L3"));
    expect(arcRow(r)?.status).toBe("satisfied");
    expect(r.closes).toBe(true);
    expect(r.target?.text).toBe("π");
  });

  it("refuses the ML estimate on an integrand with a live frequency, and says which bound applies", () => {
    // The plan's second test, on B1's sandbox twin. `max|f|` on the arc is `O(R^{-2})` in the upper
    // half-plane only because `|e^{iz}| ≤ 1` there; in the lower it is `e^{R}`. A reader who picks
    // the ML estimate has picked a bound that is either false or true for the wrong reason.
    const r = run("exp(i*z)/(1+z^2)", arcDeclared("L2"));
    const row = arcRow(r);
    expect(row?.status).toBe("failed");
    expect(row?.claim).toContain("the large-arc decay lemma");
    expect(row?.claim).toContain("Jordan's lemma is the one that applies");
    expect(r.closes).toBe(false);
  });

  it("refuses the ML estimate on an integrand that is not rational at all", () => {
    // A third wall, distinct from the two above: `1/cosh z` carries no `e^{iaz}` factor, so the
    // frequency refusal has nothing to fire on, and it is not a rational function either, so there
    // is no degree gap to reason about. Without this the reader would fall through to the shape
    // chain and get "no bound is available for this integrand" — true, and silent about the fact
    // that they named a lemma.
    const row = arcRow(run("1/cosh(z)", arcDeclared("L1")));
    expect(row?.status).toBe("failed");
    expect(row?.claimData.template).toBe("kill.lemma-refused");
    expect(row?.claim).toContain("degree gap");
  });

  it("refuses the wedge bound where the arc's angles cannot be read as multiples of π", () => {
    // The wedge bound is stated on a sector measured from the positive real axis, and its constant
    // carries the sweep — so an angle that is not an exact `p/q·π` is not a wedge the lemma covers.
    // The refusal names the GEOMETRY rather than the integrand, which is M5.4b's finding applied to
    // a declared lemma: the integrand here is exactly the one the wedge bound exists for.
    //
    // A sector rather than a doctored semicircle, because an arc whose sweep is unreadable is also
    // an arc that does not meet the diameter — and LEGALITY then refuses the contour before KILL
    // ever sees the piece. The first draft did exactly that and asserted on a row that was not
    // there.
    // **A readable EXTENT with unreadable ENDPOINTS**, which is the only shape that reaches the
    // wedge bound's own check: `disposeArc` returns early when the arc's extent cannot be read as a
    // multiple of π, and the generic "sweep unreadable" row says so — correctly, and before any
    // declared lemma is consulted. What only the wedge cares about is WHERE the sector starts, and
    // a quarter-turn beginning at 0.11 has an extent of exactly π/4 and no readable endpoint.
    const from = 0.11;
    const to = from + Math.PI / 4;
    const ray = (angle: number, out: boolean) => ({
      kind: "segment" as const,
      from: out
        ? { x: 0, y: 0 }
        : { x: { param: "R", mul: Math.cos(angle) }, y: { param: "R", mul: Math.sin(angle) } },
      to: out
        ? { x: { param: "R", mul: Math.cos(angle) }, y: { param: "R", mul: Math.sin(angle) } }
        : { x: 0, y: 0 },
    });
    const sector: Contour = {
      params: semicircleTemplate(4).params,
      pieces: [
        { id: "out", name: "the outward ray", geom: ray(from, true), role: "target", colour: 0 },
        {
          id: "arc",
          name: "the wedge arc",
          geom: { kind: "arc", center: { x: 0, y: 0 }, radius: { param: "R" }, theta0: from, theta1: to },
          role: "vanish",
          lemma: "L6",
          colour: 1,
        },
        { id: "back", name: "the return ray", geom: ray(to, false), role: "free", colour: 2 },
      ],
    };
    const row = arcRow(run("exp(i*z^2)", sector));
    expect(row?.status).toBe("failed");
    expect(row?.claim).toContain("measured from the positive real axis");
    expect(row?.claim).toContain("multiples of");
  });

  it("refuses a lemma that is not a vanishing lemma at all, by what it IS", () => {
    // L7 and L8 are in research 03 §14 and neither bounds a piece: L7 is the periodic-side
    // cancellation, which is the `reproduces` role, and L8 is Sokhotski–Plemelj. A menu offering
    // eight lemmas would offer these two, so they are refused by name rather than by falling
    // through to "no bound is available for this integrand", which would blame the integrand.
    const seven = arcRow(run("1/(1+z^2)", arcDeclared("L7")));
    expect(seven?.status).toBe("failed");
    expect(seven?.claim).toContain("the periodic-side cancellation");
    expect(seven?.claim).toContain("reproduces");
    const eight = arcRow(run("1/(1+z^2)", arcDeclared("L8")));
    expect(eight?.status).toBe("failed");
    expect(eight?.claim).toContain("Sokhotski–Plemelj");
  });

  it("accepts the lemma that DOES apply, and an undeclared piece keeps the shape-driven pick", () => {
    // The pairing that makes the four refusals above claims rather than noise: the same contour and
    // the same integrand, certified — once by naming the lemma and once by naming none.
    const declared = run("1/(1+z^2)", arcDeclared("L2"));
    const bare = run("1/(1+z^2)", arcDeclared());
    expect(arcRow(declared)?.status).toBe("satisfied");
    expect(arcRow(bare)?.status).toBe("satisfied");
    // Byte for byte the same row: honouring a declaration that agrees with the guess must change
    // nothing, which is the corpus's no-op proof in miniature.
    expect(arcRow(declared)?.claim).toBe(arcRow(bare)?.claim);
    expect(declared.closes).toBe(true);
  });
});

describe("the target a certified contour determines", () => {
  it("reports π for the semicircle on 1/(1+z²), exactly", () => {
    // The plan's third test, and the sandbox's first real-integral answer: `∮ = ∫_target + ∫_arc`,
    // the arc vanishes, so the target's integral is `∮` — read backwards. Exact because the whole
    // subtraction is in units of π and π is never evaluated.
    const r = run("1/(1+z^2)", arcDeclared("L2"));
    expect(r.target?.pieceId).toBe("diameter");
    expect(r.target?.text).toBe("π");
    expect(r.target?.numeric[0]).toBeCloseTo(Math.PI, 12);
    expect(r.target?.numeric[1]).toBeCloseTo(0, 12);
  });

  it("is the quadrature's own bookkeeping, read off the numbers instead of the residues", () => {
    // **An INDEPENDENT route to the same number, sharing no machinery with the one under test.**
    // The target's value comes from `2πi Σ Res` minus the known limits, exactly, in units of π. The
    // quadrature knows nothing of residues: it measures each piece at the finite `R` the contour is
    // drawn at, and `∮ = ∫_target + ∫_arc` is then an identity about those two numbers. So the gap
    // between the target's LIMIT and the target piece's measured value must be exactly what the arc
    // measures — the tail the limit discards. At R = 200 that is 1.0000e-2, and the arc's certified
    // ML bound is what says it goes to zero.
    const { target, integral } = run("1/(1+z^2)", arcDeclared("L2"));
    expect(target).toBeDefined();
    if (target === undefined) return;
    const [diameter, arc] = integral.pieces;
    expect(diameter?.pieceId).toBe("piece 1");
    expect(arc?.pieceId).toBe("piece 2");
    expect(target.numeric[0] - diameter.value[0]).toBeCloseTo(arc.value[0], 9);
    // And the tail is the size the bound says, which is what stops this passing on a contour whose
    // arc contributes nothing because it was drawn at a radius where everything is small.
    expect(arc.value[0]).toBeCloseTo(1.0e-2, 4);
  });

  it("SUBTRACTS the known limits, which is the whole of what makes it an identity", () => {
    // `∮ = ∫_target + Σ_others`, and a piece discharged by L4 or L5 contributes a known limit
    // rather than zero — so the target's value is `∮` minus those. `removable-one-minus-cos` is the
    // corpus's one record with exactly one target piece AND a non-zero piece limit: its big arc
    // carries `iα·L` under L5. Without the subtraction the answer would be `∮` itself, which is a
    // different number, and every other test in this file would still pass because nothing else in
    // the gallery has both.
    const record = FAMILIES.find((f) => f.id === "removable-one-minus-cos");
    expect(record).toBeDefined();
    if (record === undefined) return;
    const solved = solveFamily(record, record.golden[0]);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    const ledger = solved.run.ledger;
    expect(ledger.pieceLimits.length, "the record has no known limit to subtract").toBeGreaterThan(0);
    expect(ledger.pieceLimits.some((l) => !l.contribution.isZero())).toBe(true);
    // The target piece is `[−R, R]` and `∫(1 − cos x)/x² dx = π` over it; the record's own unknown
    // is `∫₀^∞`, half of it by evenness, which is why this is the value and not the record's.
    expect(ledger.target?.text).toBe("π");
    // And it is NOT `∮`, which is what the subtraction moved it away from.
    expect(ledger.value?.text).not.toBe("π");
  });

  it("reports NOTHING while a piece is free, and names the piece that is undisposed", () => {
    // The plan's fourth test. A free piece is a term in `∮ = Σ pieces` that nobody has bounded, so
    // the identity cannot be read backwards at all — and the row says which piece, because "the
    // argument does not close" sends a reader to look at all of it.
    const r = run("1/(1+z^2)", arcDeclared(undefined, "free"));
    expect(r.target).toBeUndefined();
    const cover = r.rows.filter((x) => x.constraint === "COVER");
    const undisposed = cover.find((x) => x.claim.includes("neither bounded by a lemma"));
    expect(undisposed?.status).toBe("unknown");
    expect(undisposed?.pieceId).toBe("arc");
    expect(undisposed?.claim).toContain("semicircle");
    // The target row itself still says there IS a target — the two are different facts, and
    // collapsing them would report "no target designated" about a contour that designates one.
    expect(cover.some((x) => x.claim.includes("the target is a piece of the contour"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The target piece's integral against Pass 5's answer, over the whole gallery.
//
// **THEY ARE NOT THE SAME QUANTITY, AND MEASURING IS WHAT SHOWED IT.** `LedgerResult.target` is the
// integral over the TARGET PIECE in the limit — `∮` read backwards. Pass 5 solves for the unknown
// the RECORD declares, which may be a real part, a half by evenness, or a weighted combination. On
// 31 of the 37 fixtures where both exist the record's unknown IS the piece's integral and the two
// agree to the character; on the other six the record declares a reduction, and the disagreement is
// the reduction rather than an error in either.
//
// Declared apart, and checked in BOTH directions, which is `contrastGrid.test.ts`'s rule: nothing
// undeclared may differ, and nothing declared may agree. A ledger that started reporting the
// record's unknown instead of the piece's integral would fail the second half — and the second half
// earned its place immediately: the first draft declared `jordan-quartic` a reduction too, on a
// measurement taken through `resolveState`, where Pass 5 reports no value at those fixtures. Run
// through `solveFamily` it reports one, and it agrees. The over-declaration failed rather than
// passing quietly, which is the whole reason a declaration is checked from both sides.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The records whose declared unknown is a REDUCTION of the target piece's integral, with which. */
const REDUCED: Readonly<Record<string, string>> = {
  "jordan-strict": "the unknown is the IMAGINARY part; the piece's integral is complex",
  "removable-one-minus-cos": "the unknown is ∫₀^∞, half the piece's [−R, R] by evenness (SG-3)",
};

describe("the target piece's integral, across the gallery", () => {
  const seen: { readonly id: string; readonly agrees: boolean }[] = [];
  for (const family of FAMILIES) {
    for (let i = 0; i < family.golden.length; i++) {
      const solved = solveFamily(family, family.golden[i]);
      if (!solved.ok) continue;
      const target = solved.run.ledger.target;
      if (target === undefined) continue;
      const answer = solved.solved?.value;
      seen.push({
        id: family.id,
        agrees: answer !== undefined && Math.abs(target.numeric[0] - answer) < 1e-9,
      });
    }
  }

  it("reaches enough of the gallery for the two sweeps below to be about something", () => {
    // The count first: a walk that found one fixture would satisfy both sweeps perfectly.
    expect(seen.length).toBeGreaterThan(30);
    expect(new Set(seen.map((s) => s.id)).size).toBeGreaterThan(6);
  });

  it("agrees with Pass 5 wherever the record declares no reduction", () => {
    const disagreed = seen.filter((s) => !s.agrees && REDUCED[s.id] === undefined).map((s) => s.id);
    expect(disagreed).toEqual([]);
  });

  it("and DISAGREES on every record that declares one — the reduction, not an error", () => {
    // The direction that has content: a declaration nobody checks is a comment. If `jordan-strict`
    // started agreeing, either the ledger had begun reporting the record's unknown (and the field's
    // whole meaning had moved) or the record had stopped declaring its reduction.
    for (const id of Object.keys(REDUCED)) {
      const rows = seen.filter((s) => s.id === id);
      expect(rows.length, `${id} reached no fixture with a target value`).toBeGreaterThan(0);
      expect(rows.every((s) => !s.agrees), `${id}: ${REDUCED[id]}`).toBe(true);
    }
  });
});
