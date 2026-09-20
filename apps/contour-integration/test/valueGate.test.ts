// **ADR-0045: the one predicate on showing a value**, and the four surfaces that used to decide it
// separately.
//
// Every case here FAILED on the tree before the gate landed, and each pins the REASON rather than
// the absence: the refusal's own sentence, the failing constraint's word, the level the result card
// derives. The fixture for the first three is `test/ledger.test.ts`'s own — `1/(z+3)` on the circle
// `|z + 3| = 1` with a cut down ℝ₋ and no side declared — chosen because its QUADRATURE is perfectly
// happy (`integral.value` is defined, every residue exact) and only the argument is not. That is the
// state each of the three got wrong, and a contour dragged onto a pole would have hidden it: there
// `integral.value === undefined` and the old rule already refused.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { makeComplexFn, parse } from "@cas/expr";
import { assembleVerdict, exact } from "@cas/rigor";
import type { Cx } from "../src/kernel/geom.js";
import { findPoles, type PoleReport } from "../src/kernel/poles.js";
import { integrateContour, type ContourIntegral } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { applyBranchTheorem } from "../src/engine/branchTheorem.js";
import { applyLogTheorem } from "../src/engine/logTheorem.js";
import { evaluateLedger, legalityRefusal, valueRefusal } from "../src/engine/ledger.js";
import { resolveAll, type Contour } from "../src/engine/contour/model.js";
import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";
import { INFINITY, type BranchChoice, type BranchPoint } from "../src/kernel/branch/model.js";
import { buildDerivation } from "../src/engine/derivation.js";
import { buildSteps } from "../src/engine/steps.js";
import { accumulateForIntegral } from "../src/engine/contour/accumulate.js";
import { constraintLabel } from "../src/engine/vocabulary.js";
import { FAMILIES } from "../src/families/index.js";
import { solveFamily } from "../src/families/runFamily.js";

const f = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));

const ORIGIN: BranchPoint = {
  id: "0",
  at: [0, 0],
  order: { kind: "power", alpha: f(1, 3) },
  label: "z = 0",
};

/** A single cut from the origin out along `dir` — `ledger.test.ts`'s `rayTo`. */
const rayTo = (dir: [number, number]): BranchChoice => ({
  convention: "zeroToTwoPi",
  points: [ORIGIN],
  cuts: [{ id: "Γ", from: "0", to: INFINITY, via: [[100 * dir[0], 100 * dir[1]]] }],
  basePoint: [0, 1],
  sheet: 0,
});

function run(src: string, contour: Contour, branch?: BranchChoice) {
  const ast = parse(src);
  const fn = makeComplexFn(ast);
  const fz = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const pieces = resolveAll(contour);
  const poles = findPoles(ast);
  const integral = integrateContour(
    fz,
    pieces,
    poles.poles.map((p) => ({ at: p.at, order: p.order })),
  );
  const theorem = applyResidueTheorem(poles, integral);
  const ledger = evaluateLedger({ ast, pieces, spec: contour.pieces, poles, integral, theorem, branch });
  return { ast, f: fz, pieces, poles, integral, theorem, ledger, contour };
}

/** The review's fixture: legal quadrature, illegal argument. */
const crossedCut = () => run("1/(z+3)", circleTemplate([-3, 0], 1), rayTo([-1, 0]));

const derivationOf = (r: ReturnType<typeof run>) =>
  buildDerivation({
    ledger: r.ledger,
    poles: r.poles,
    integral: r.integral,
    theorem: r.theorem,
    spec: r.contour.pieces,
  });

const allLines = (d: ReturnType<typeof derivationOf>): string[] =>
  d.stages.flatMap((s) => s.lines.map((l) => l.text));

const allStatements = (d: ReturnType<typeof derivationOf>): string[] =>
  d.stages.flatMap((s) => s.statements.map((x) => x.text));

describe("valueRefusal — the predicate itself", () => {
  it("is nothing on a closed argument, so it cannot be satisfied by refusing everything", () => {
    // The anti-vacuity clause. Every other case here asserts a refusal, and a predicate that always
    // refused would pass all of them.
    const r = run("1/(1+z^2)", semicircleTemplate(200));
    expect(r.ledger.closes).toBe(true);
    expect(valueRefusal(r.integral, r.ledger, "target")).toBeNull();
    expect(valueRefusal(r.integral, r.ledger, "contour")).toBeNull();
  });

  it("carries the LEGALITY row's own claim and repair, not a sentence of its own", () => {
    const r = crossedCut();
    const row = legalityRefusal(r.ledger);
    const withheld = valueRefusal(r.integral, r.ledger, "contour");
    expect(withheld?.claim).toBe(row?.claim);
    expect(valueRefusal(r.integral, r.ledger, "target")?.claim).toBe(row?.claim);
    expect(withheld?.repair).toBe(row?.repair);
    expect(withheld?.constraint).toBe("LEGALITY");
  });

  it("refuses a FAILING BOUND, which `legalityRefusal` deliberately does not", () => {
    // `legalityRefusal`'s own doc says so, and its test asserts it: `sin z/(1+z²)` on a big
    // semicircle fails KILL and is perfectly legal. That is the constraint `solveWithin` stopped
    // one short of, and the clause that makes this predicate wider than the one it wraps.
    const r = run("sin(z)/(1+z^2)", semicircleTemplate(50));
    expect(legalityRefusal(r.ledger)).toBeUndefined();
    expect(r.ledger.closes).toBe(false);
    expect(valueRefusal(r.integral, r.ledger, "target")?.constraint).toBe("KILL");
  });

  it("but only for the TARGET — `∮` itself is earned by LEGALITY and CATCH, and a failing bound does not touch it", () => {
    // Measured at integration: `z/(1+z²)` on the upper semicircle has `∮ = πi` EXACTLY, a KILL row
    // that fails (the arc is `O(1)`) and no target at all. Asking the target's clause of the `∮`
    // line withheld the one number the sandbox exists to show — M3.5's "drag it across a pole and
    // the value jumps by exactly 2πi·Res" — so the caller names what it is showing.
    const r = run("z/(1+z^2)", semicircleTemplate(3));
    expect(r.theorem.exactValue?.text).toBe("πi");
    expect(r.ledger.rows.some((row) => row.constraint === "KILL" && row.status === "failed")).toBe(true);
    expect(valueRefusal(r.integral, r.ledger, "target")?.constraint).toBe("KILL");
    expect(valueRefusal(r.integral, r.ledger, "contour")).toBeNull();
    // and the three `∮` surfaces show it: the derivation's line, the accumulator's trail.
    expect(allLines(derivationOf(r)).some((t) => t.includes("\\oint") && t.includes("\\pi i"))).toBe(true);
    expect(accumulateForIntegral(r.f, r.pieces, r.integral, r.ledger)).not.toBeNull();
  });
});

describe("the derivation and the stepper, past a LEGALITY refusal", () => {
  it("carry NO ∮ line at all", () => {
    const r = crossedCut();
    // The premise: the quadrature is happy and the ledger is not. Without this the case would be
    // the ordinary one the old rule already caught.
    expect(r.integral.value).toBeDefined();
    expect(r.theorem.exactValue?.text).toBe("2πi");
    expect(r.ledger.value).toBeUndefined();

    const d = derivationOf(r);
    expect(allLines(d).some((t) => t.includes("\\oint"))).toBe(false);
    const steps = buildSteps(d, { spec: r.contour.pieces, params: r.contour.params });
    expect(steps.flatMap((s) => s.lines).some((l) => l.text.includes("\\oint"))).toBe(false);
  });

  it("say WHY, in the refusal's own words, rather than going quiet", () => {
    const r = crossedCut();
    const claim = legalityRefusal(r.ledger)?.claim ?? "";
    expect(claim).not.toBe("");
    const solve = derivationOf(r).stages.find((s) => s.id === "solve");
    expect(solve?.statements.some((x) => x.text.includes(claim))).toBe(true);
    // And the stepper inherits it, because `buildSteps` computes nothing: the solve stage's
    // statements are the target step's.
    const steps = buildSteps(derivationOf(r), { spec: r.contour.pieces, params: r.contour.params });
    const target = steps.find((s) => s.kind === "target");
    expect(target?.statements.some((x) => x.text.includes(claim))).toBe(true);
  });

  it("do not corroborate a number they are not printing", () => {
    // The cross-check statement is a claim ABOUT the value. `1/(z+3)` has an agreeing quadrature
    // here, so this line was being composed and shown beside no value at all.
    const r = crossedCut();
    expect(r.theorem.agrees).toBe(true);
    expect(allStatements(derivationOf(r)).some((t) => t.includes("cross-check") || t.includes("quadrature"))).toBe(
      false,
    );
    // …and it IS shown when the argument stands, so the branch is not dead.
    const ok = run("1/(1+z^2)", semicircleTemplate(200));
    const okd = derivationOf(ok);
    expect(okd.stages.find((s) => s.id === "solve")?.statements.some((x) => x.label.includes("cross-check"))).toBe(
      true,
    );
  });
});

describe("the accumulator, past a LEGALITY refusal", () => {
  it("draws nothing — and it is the LEDGER that decides, not the quadrature", () => {
    const r = crossedCut();
    // Without a ledger the walk is produced: that is the old rule, and it is what shipped. The
    // number it ended on was `6.28300587…i`, beside a result card reading `⚠ Refused`.
    const blind = accumulateForIntegral(r.f, r.pieces, r.integral, null);
    expect(blind).not.toBeNull();
    expect(blind?.total[1]).toBeGreaterThan(6);
    // With it, nothing.
    expect(accumulateForIntegral(r.f, r.pieces, r.integral, r.ledger)).toBeNull();
  });

  it("still draws a legal argument's walk", () => {
    const r = run("1/(1+z^2)", semicircleTemplate(200));
    expect(accumulateForIntegral(r.f, r.pieces, r.integral, r.ledger)).not.toBeNull();
  });
});

describe("the two theorem routes that had no `closed` guard", () => {
  // Five of the six state it in as many words; these two did not, so an OPEN contour reached a
  // confident `exactValue` for a theorem that does not apply, and only the ledger's first LEGALITY
  // row stood between that and a reader.
  const openIntegral = (closed: boolean): ContourIntegral => ({
    pieces: [],
    verdict: assembleVerdict([exact("the windings", "fabricated for this test")]),
    windings: [
      { at: [-1, 0], n: 1, decided: true },
    ],
    closed,
  });

  const poleAtMinusOne = (): PoleReport => ({
    poles: [],
    rational: true,
    exactlyComplete: true,
    exactPoles: [
      {
        at: SqrtExt.fromGauss(Gauss.int(-1, 0)),
        order: 1,
        residue: SqrtExt.fromGauss(Gauss.ZERO),
        radicand: 1n,
      },
    ],
    certificates: [],
  });

  it("applyBranchTheorem refuses an open contour by name", () => {
    const shared = {
      poles: poleAtMinusOne(),
      factor: { alpha: f(-7, 10), argRange: [f(0), f(2)] as const },
    };
    const closed = applyBranchTheorem({ ...shared, integral: openIntegral(true) });
    expect(closed.exactValue).toBeDefined();

    const open = applyBranchTheorem({ ...shared, integral: openIntegral(false) });
    expect(open.exactValue).toBeUndefined();
    expect(open.verdict.level).toBe("⚠");
    expect(open.verdict.certificates.some((c) => c.method.includes("closed contour"))).toBe(true);
  });

  it("applyLogTheorem refuses an open contour by name", () => {
    const shared = {
      poles: poleAtMinusOne(),
      factor: { power: 1, argRange: [f(0), f(2)] as const },
      rational: parse("1/(1+z)"),
    };
    const closed = applyLogTheorem({ ...shared, integral: openIntegral(true) });
    expect(closed.exactInPi).toBeDefined();

    const open = applyLogTheorem({ ...shared, integral: openIntegral(false) });
    expect(open.exactInPi).toBeUndefined();
    expect(open.verdict.level).toBe("⚠");
    expect(open.verdict.certificates.some((c) => c.method.includes("closed contour"))).toBe(true);
  });
});

describe("Pass 5's gate — the fifteen divergent integrals it used to print at `=`", () => {
  // Every row was measured on the tree before the gate: `ok: true`, both certificates `=`, and a
  // closed form printed under a headline reading *"a boundary term does not vanish"*. The bindings
  // go in directly because the slider's own clamp is a separate fix; the record has nothing to say
  // outside its declared range either way.
  const CASES: readonly (readonly [string, string, number, string])[] = [
    ["mellin-keyhole", "alpha", -0.3, "−π/sin(7π/10)"],
    ["mellin-keyhole", "alpha", 1.3, "−π/sin(3π/10)"],
    ["mellin-keyhole", "alpha", 1.5, "−π"],
    ["mellin-keyhole", "alpha", 2.3, "π/sin(3π/10)"],
    ["keyhole-two-poles", "s", -1.5, "−π/64 + π√2/16"],
    ["keyhole-two-poles", "s", 2.5, "−4π + π√2"],
    ["keyhole-two-poles", "s", 3.5, "16π − 2π√2"],
    ["keyhole-two-poles", "s", 4.5, "−64π + 4π√2"],
    ["keyhole-x-to-the-n", "a", -1.5, "(−π/4)/sin(3π/8)"],
    ["keyhole-x-to-the-n", "a", 4.5, "(−π/4)/sin(π/8)"],
    ["dogbone-two-fractional-powers", "mu", 2.25, "(−π·2^(-5/4)·5^(9/4) + 35π/4)/sin(π/4)"],
    ["dogbone-two-fractional-powers", "mu", 2.75, "(−π·2^(-7/4)·5^(11/4) + 41π/4)/sin(3π/4)"],
    ["strip-exponential-quasiperiod", "a", -0.3, "−π/sin(7π/10)"],
    ["strip-exponential-quasiperiod", "a", 1.3, "−π/sin(3π/10)"],
    ["strip-exponential-quasiperiod", "a", 2.3, "π/sin(3π/10)"],
    ["wedge-rational-power", "n", -3, "(−π/3)/sin(2π/3)"],
  ];

  it.each(CASES)("%s at %s = %s refuses instead of printing %s", (id, param, value) => {
    const family = FAMILIES.find((x) => x.id === id);
    if (family === undefined) throw new Error(`no record ${id}`);
    const r = solveFamily(family, family.golden[0], { bindings: { [param]: value } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // The FAILING CONSTRAINT's word, which is what makes this a refusal a reader can act on rather
    // than a blank: every one of the sixteen fails a boundary term, not a hypothesis.
    expect(r.run?.ledger.failedAt).toBe("KILL");
    expect(r.reason).toContain(constraintLabel("KILL").toLowerCase());
    expect(r.reason).toContain("diverges");
  });

  it("names the RECORD, and neither its slug nor a house id", () => {
    // `solveFamily`'s reason reaches the result card verbatim through `StateResolution.note`, and
    // `test/denylist.test.ts` reads string literals out of `src/shell/**` and `src/engine/**` only —
    // so `src/families/**` was the one path neither half of the denylist covered.
    for (const [id, param, value] of CASES) {
      const family = FAMILIES.find((x) => x.id === id);
      if (family === undefined) throw new Error(`no record ${id}`);
      const r = solveFamily(family, family.golden[0], { bindings: { [param]: value } });
      if (r.ok) throw new Error(`${id} at ${param} = ${value} did not refuse`);
      expect(r.reason).toContain(family.title);
      expect(r.reason).not.toContain(id);
      for (const houseId of ["LEGALITY", "CATCH", "KILL", "COVER"]) {
        expect(r.reason, `${id}: ${r.reason}`).not.toContain(houseId);
      }
    }
  });

  it("leaves every record at its own fixtures alone", () => {
    // The corpus is the no-op proof: a gate that refused anything real shows up here first, and the
    // count is MEASURED rather than "more than zero" — the fixtures a record declares as refusing
    // are part of it.
    let solved = 0;
    for (const family of FAMILIES) {
      for (const g of family.golden) {
        if (solveFamily(family, g).ok) solved += 1;
      }
    }
    expect(solved).toBe(SOLVED_FIXTURES);
  });
});

/** How many of the corpus's fixtures Pass 5 answers — measured, and the gate must not move it. */
const SOLVED_FIXTURES = 92;
