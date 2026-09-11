// The derivation panel's content, as data.
//
// These are the M3.5b gate: C1 naming L4 and its `iα·Res` while `∮` is 0, C2 landing the same π on a
// different piece, and the wrong half-plane showing its bound diverge. They also pin the two rules
// that keep the panel from becoming PLAN §9's R2, *certification theatre*: a line may not be stronger
// than the certificate it came from, and the answer's badge comes from the answer's own evidence
// rather than from the argument-wide meet.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { assembleVerdict, unknown } from "@cas/rigor";
import { analyse } from "../src/engine/analyse.js";
import { buildDerivation, DERIVATION_STAGES, type Derivation, type StageId } from "../src/engine/derivation.js";
import type { Contour } from "../src/engine/contour/model.js";
import { semicircleTemplate } from "../src/engine/contour/templates.js";
import type { LedgerResult } from "../src/engine/ledger.js";
import { findPoles } from "../src/kernel/poles.js";
import type { Cx } from "../src/kernel/geom.js";
import { FAMILIES } from "../src/families/index.js";
import { primaryGolden, runFamily, solveFamily } from "../src/families/runFamily.js";

const must = <T,>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`expected ${what} to be present`);
  return v;
};

const familyById = (id: string) => must(FAMILIES.find((f) => f.id === id), id);

/** A record, solved, as the shell's gallery mode builds it. */
function fromRecord(id: string): Derivation {
  const family = familyById(id);
  const r = solveFamily(family, primaryGolden(family));
  if (!r.ok) throw new Error(r.reason);
  return buildDerivation({
    ledger: r.run.ledger,
    poles: r.run.poles,
    integral: r.run.integral,
    theorem: r.run.theorem,
    spec: r.run.contour.pieces,
    solved: r.solved,
  });
}

/** The sandbox path: an integrand and a contour, no family and therefore no Pass 5. */
function fromSandbox(src: string, contour: Contour): Derivation {
  const ast = parse(src);
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const poles = findPoles(ast);
  const a = analyse({ ast, f, poles, contour });
  return buildDerivation({
    ledger: a.ledger,
    poles,
    integral: a.integral,
    theorem: a.theorem,
    spec: contour.pieces,
  });
}

const stage = (d: Derivation, id: StageId) => d.stages.find((s) => s.id === id);
const linesOf = (d: Derivation, id: StageId) => stage(d, id)?.lines ?? [];
const textsOf = (d: Derivation, id: StageId) => linesOf(d, id).map((l) => l.text);
const saidIn = (d: Derivation, id: StageId) =>
  (stage(d, id)?.statements ?? []).map((s) => `${s.label}: ${s.text}`);

describe("C1 — the indentation, and where ∮ stops being the answer", () => {
  const d = fromRecord("indented-sinc");

  it("closes, and concludes with the INTEGRAL rather than with ∮", () => {
    expect(d.closes).toBe(true);
    expect(must(d.conclusion, "a conclusion").label).toBe("the integral");
    expect(must(d.conclusion, "a conclusion").text).toBe("π/2");
  });

  it("names L4 and its iα·Res on the KILL line, with the swept angle that fixes the sign", () => {
    const line = must(
      linesOf(d, "kill").find((l) => l.text.includes("iα·Res")),
      "an L4 line",
    );
    expect(line.text).toContain("α = −1π");
    expect(line.method).toContain("L4");
    // The sign is geometry, not taste — the two classical wrong answers are each one factor away.
    expect(line.method).toContain("swept angle");
    expect(line.level).toBe("=");
  });

  it("shows ∮ = 0 in the same breath as the integral being π/2", () => {
    expect(textsOf(d, "solve")).toContain("∮ f dz = 0");
    expect(textsOf(d, "solve")).toContain("the integral = π/2");
  });

  it("states the indentation's contribution as Pass 5's own input", () => {
    const said = must(
      saidIn(d, "solve").find((s) => s.includes("indentation")),
      "the indentation's bᵢ",
    );
    expect(said).toContain("−iπ");
    expect(said).toContain("not zero");
  });
});

describe("C2 — the same π, moved onto a different piece", () => {
  const c1 = fromRecord("indented-sinc");
  const c2 = fromRecord("removable-one-minus-cos");

  it("names L5 and a limit that is explicitly NOT zero", () => {
    const line = must(
      linesOf(c2, "kill").find((l) => l.text.includes("iα·L")),
      "an L5 line",
    );
    expect(line.method).toContain("L5");
    expect(line.text).toContain("NOT zero");
    // L5 is DECLARED, not inferred: the degree test that would pick L2 is exactly the one that fails
    // here, so guessing would pick the wrong lemma and silently return 0 for the target.
    expect(line.level).toBe("=");
  });

  it("lands on the same π/2 from a contour that also encloses nothing", () => {
    expect(must(c2.conclusion, "C2's conclusion").text).toBe("π/2");
    expect(textsOf(c2, "solve")).toContain("∮ f dz = 0");
  });

  it("puts the non-zero contribution on the ARC, where C1 puts it on the indentation", () => {
    // GALLERY §5.0c's claim, executed: subtracting a principal part does not delete that term, it
    // MOVES its contribution onto the large arc. Same π, different piece.
    const c1Piece = must(saidIn(c1, "solve").find((s) => s.includes("from KILL")), "C1's bᵢ");
    const c2Piece = must(saidIn(c2, "solve").find((s) => s.includes("from KILL")), "C2's bᵢ");
    expect(c1Piece).toContain("indentation");
    expect(c2Piece).toContain("semicircle");
    expect(c1Piece).not.toBe(c2Piece);
  });

  it("is exact end to end, where C1 leans on a bound — and the panel says which", () => {
    // C2's arc carries an exact LIMIT (L5); C1's carries a Jordan BOUND. That is a real difference
    // between the two arguments, and the argument-wide meet is where it shows.
    expect(c2.verdict.level).toBe("=");
    expect(c1.verdict.level).toBe("≤");
    // …and the line says what that level is about, so `≤` beside a `=` answer cannot read as a caveat
    // on the answer.
    const head = must(linesOf(c1, "verdict")[0], "C1's verdict line");
    expect(head.method).toContain("not the label of the answer");
    expect(must(c1.conclusion, "C1's conclusion").level).toBe("=");
  });
});

describe("the wrong half-plane fails diagnostically", () => {
  const lower = fromSandbox("exp(i*z)/(1+z^2)", semicircleTemplate(6, "lower"));
  const upper = fromSandbox("exp(i*z)/(1+z^2)", semicircleTemplate(6, "upper"));

  it("shows the bound DIVERGING, and names the constraint that failed", () => {
    const line = must(
      linesOf(lower, "kill").find((l) => l.status === "failed"),
      "a failed KILL line",
    );
    expect(line.text).toContain("DIVERGES");
    expect(line.level).toBe("⚠");
    expect(must(line.repair, "a repair")).toContain("other half-plane");
    expect(lower.failedAt).toBe("KILL");
    expect(lower.closes).toBe(false);
    expect(lower.conclusion).toBeUndefined();
  });

  it("puts only the FAILED steps on the summary line, so the ✗ is not buried", () => {
    const head = must(linesOf(lower, "verdict")[0], "a verdict line");
    expect(head.provenance.length).toBeGreaterThan(0);
    expect(head.provenance.every((s) => !s.ok)).toBe(true);
    expect(head.provenance.some((s) => s.text.includes("upper half-plane"))).toBe(true);
  });

  it("closes through the OTHER half-plane — so the test above discriminates", () => {
    expect(upper.closes).toBe(true);
    expect(must(upper.conclusion, "a conclusion").text).toBe("π/e");
    expect(linesOf(upper, "kill").every((l) => l.status !== "failed")).toBe(true);
  });
});

describe("a line is never stronger than the certificate it came from", () => {
  const emptyPoles = { poles: [], rational: true, exactlyComplete: true, certificates: [] } as const;
  const emptyIntegral = {
    pieces: [],
    verdict: assembleVerdict([]),
    windings: [],
    closed: true,
  } as const;

  /** A ledger carrying exactly one row, whose evidence is `unknown`. */
  const oneUnknownRow: LedgerResult = {
    rows: [
      {
        constraint: "CATCH",
        status: "unknown",
        claim: "not every residue is known exactly, so the total is an estimate",
        evidence: unknown("the residues", "some poles are not expressible in ℚ(i)(√d)"),
      },
    ],
    closes: false,
    verdict: assembleVerdict([unknown("the residues", "some poles are not expressible")]),
    failedAt: null,
    hasTarget: false,
    pieceLimits: [],
  };

  it("renders an unknown certificate as unknown, with the row's own words", () => {
    const d = buildDerivation({
      ledger: oneUnknownRow,
      poles: emptyPoles,
      integral: emptyIntegral,
      theorem: { verdict: assembleVerdict([]) },
      spec: [],
    });
    const line = must(linesOf(d, "catch")[0], "the CATCH line");
    expect(line.level).toBe("?");
    expect(line.status).toBe("unknown");
    expect(line.text).toBe("not every residue is known exactly, so the total is an estimate");
    expect(d.closes).toBe(false);
    expect(d.conclusion).toBeUndefined();
  });

  it("drops a stage with nothing to say rather than printing an empty heading", () => {
    const d = buildDerivation({
      ledger: { ...oneUnknownRow, rows: [] },
      poles: emptyPoles,
      integral: emptyIntegral,
      theorem: { verdict: assembleVerdict([]) },
      spec: [],
    });
    // SOLVE always states the residue theorem, and VERDICT always says whether it closed; the four
    // constraint stages have no rows and no poles, so they do not appear at all.
    expect(d.stages.map((s) => s.id)).toEqual(["solve", "verdict"]);
    expect(d.stages.length).toBeLessThan(DERIVATION_STAGES.length);
  });
});

describe("a target the solve never reached is not a finished argument", () => {
  it("refuses to close on ∮ when a piece carries a known non-zero limit", () => {
    // C1 WITHOUT Pass 5. Its ledger closes — every row passes and ∮ is exact — but ∮ is 0 and the
    // integral is π/2, so reporting the ledger's own conclusion here is GALLERY §5.0b's wrong answer
    // in the most authoritative place on the page.
    const family = familyById("indented-sinc");
    const r = runFamily(family, primaryGolden(family));
    if (!r.ok) throw new Error(r.reason);
    expect(r.run.ledger.closes).toBe(true);

    const d = buildDerivation({
      ledger: r.run.ledger,
      poles: r.run.poles,
      integral: r.run.integral,
      theorem: r.run.theorem,
      spec: r.run.contour.pieces,
    });
    expect(d.closes).toBe(false);
    expect(d.conclusion).toBeUndefined();
    expect(d.verdict.level).toBe("?");
  });

  it("still closes when ∮ IS the answer — so the rule is not just 'no Pass 5'", () => {
    // The upper semicircle over a decaying integrand: the arc vanishes, nothing else contributes, and
    // the diameter is all that is left. ∮ and the target coincide, and the argument is finished.
    const d = fromSandbox("exp(i*z)/(1+z^2)", semicircleTemplate(6, "upper"));
    expect(d.closes).toBe(true);
    expect(must(d.conclusion, "a conclusion").label).toBe("∮ f dz");
  });
});

describe("the argument's verdict is the meet over ALL of it, Pass 5 included", () => {
  it("carries more evidence than the ledger's own verdict", () => {
    const family = familyById("indented-sinc");
    const r = solveFamily(family, primaryGolden(family));
    if (!r.ok) throw new Error(r.reason);
    const d = buildDerivation({
      ledger: r.run.ledger,
      poles: r.run.poles,
      integral: r.run.integral,
      theorem: r.run.theorem,
      spec: r.run.contour.pieces,
      solved: r.solved,
    });
    expect(d.verdict.certificates.length).toBeGreaterThan(r.run.ledger.verdict.certificates.length);
  });
});

describe("Pass 2's per-pole rows", () => {
  it("reports the winding number and the residue per pole, separately", () => {
    const d = fromRecord("semicircle-quartic");
    const rows = must(stage(d, "catch"), "the CATCH stage").poles;
    expect(rows).toHaveLength(4);
    // Two enclosed, two not — the distinction the summary line alone cannot make.
    expect(rows.filter((r) => r.winding === 1)).toHaveLength(2);
    expect(rows.filter((r) => r.winding === 0)).toHaveLength(2);
    expect(rows.every((r) => r.windingDecided)).toBe(true);
    expect(rows.every((r) => r.basis === "exact" && r.residue !== undefined)).toBe(true);
  });

  it("reads 'undecided' rather than the wrong pole's number when the lists do not correspond", () => {
    // `analyse` builds the two in step; a caller that did not would otherwise get a confident winding
    // number attributed to the wrong pole, which changes 2πi Σ n·Res by a whole residue.
    const ast = parse("1/(1+z^4)");
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const poles = findPoles(ast);
    const contour = semicircleTemplate(4, "upper");
    const a = analyse({ ast, f, poles, contour });
    const d = buildDerivation({
      ledger: a.ledger,
      poles,
      integral: { ...a.integral, windings: [{ at: [99, 99], n: 7, decided: true }] },
      theorem: a.theorem,
      spec: contour.pieces,
    });
    const rows = must(stage(d, "catch"), "the CATCH stage").poles;
    expect(rows.every((r) => !r.windingDecided)).toBe(true);
    expect(rows.every((r) => r.winding === undefined)).toBe(true);
  });
});

describe("the stage plan", () => {
  it("is ordered LEGALITY → CATCH → KILL → COVER → SOLVE → VERDICT, behind the problem", () => {
    expect(DERIVATION_STAGES.map((s) => s.id)).toEqual([
      "setup",
      "legality",
      "catch",
      "kill",
      "cover",
      "solve",
      "verdict",
    ]);
  });

  it("gives every stage a standing reason, so the panel explains the METHOD and not just the case", () => {
    for (const s of DERIVATION_STAGES) {
      expect(s.why.length).toBeGreaterThan(40);
      expect(s.title.length).toBeGreaterThan(0);
    }
  });
});
