import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { pt, resolveAll, type Contour, type Piece } from "../src/engine/contour/model.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger } from "../src/engine/ledger.js";
import { findPoles } from "../src/kernel/poles.js";
import { asExponentialSum, isEntire, numeratorSeriesAtZero } from "../src/kernel/exponentialSum.js";
import { largeArcLimit } from "../src/kernel/bounds/largeArcLimit.js";
import { formatExpSum } from "../src/kernel/expSum.js";
import { formatGauss } from "../src/kernel/formatExact.js";
import { solveTarget } from "../src/families/solveTarget.js";
import { c2RemovableOneMinusCos } from "../src/families/records/c2-removable-one-minus-cos.js";
import type { Cx, Resolved } from "../src/kernel/geom.js";

const C2_AUX = "(1 - exp(i*z) + i*z)/z^2";
const upperArc = (R: number): Resolved => ({
  kind: "arc",
  center: [0, 0],
  radius: R,
  theta0: 0,
  theta1: Math.PI,
});

const formOf = (src: string) => {
  const f = asExponentialSum(parse(src));
  if (f === null) throw new Error(`${src} is not of the form (Σ Nₖe^{iaₖz})/D`);
  return f;
};

describe("asExponentialSum — a SUM of exponential terms, which the single-factor reader cannot see", () => {
  it("decomposes C2's auxiliary", () => {
    const form = formOf(C2_AUX);
    expect(form.den.degree()).toBe(2);
    // Two exponents: the rational part 1 + iz (λ = 0), and −1·e^{iz} (λ = i).
    expect(form.terms.map((t) => t.lambda.toTuple())).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(form.terms.map((t) => t.num.degree())).toEqual([1, 0]);
  });

  it("refuses what genuinely leaves the field", () => {
    expect(asExponentialSum(parse("exp(z^2)"))).toBeNull();
    expect(asExponentialSum(parse("log(z)"))).toBeNull();
    // e^{iaz+c} = e^c·e^{iaz}, and e^c is not a Gaussian rational — so a constant term refuses
    // rather than being quietly factored out of the exact field.
    expect(asExponentialSum(parse("exp(i*z + 1)"))).toBeNull();
    // exp(z) DOES read — λ = 1 is a perfectly good Gaussian rational, and A4 needs it. What refuses
    // it is the arc BOUND, where |e^{λz}| = e^{Re λz} grows along the real axis.
    expect(asExponentialSum(parse("exp(z)"))?.terms[0].lambda.toTuple()).toEqual([1, 0]);
    // Dividing BY an exponential introduces e^{−iaz}, unbounded where e^{iaz} is bounded.
    expect(asExponentialSum(parse("1/exp(i*z)"))).toBeNull();
  });
});

describe("removability is DETECTED, not assumed", () => {
  it("finds the numerator vanishing to order 2 at the origin, matching the denominator", () => {
    // The exact Taylor expansion: 1 + iw − e^{iw} = w²/2 + iw³/6 − …
    const coeffs = numeratorSeriesAtZero(formOf(C2_AUX), 4);
    expect(coeffs[0].isZero()).toBe(true);
    expect(coeffs[1].isZero()).toBe(true);
    expect(formatGauss(coeffs[2])).toBe("1/2");
    expect(formatGauss(coeffs[3])).toBe("i/6");
    expect(isEntire(formOf(C2_AUX)).ok).toBe(true);
  });

  it("reports a genuine pole as a genuine pole", () => {
    // C2's OTHER auxiliary, before the principal part is subtracted: (1 − e^{iz})/z² has a simple
    // pole at 0 with residue −i. This is the route that needs the indentation.
    const r = isEntire(formOf("(1 - exp(i*z))/z^2"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/vanishes to order 1.+denominator to order 2.+pole of order 1/s);
  });

  it("refuses removability at a root away from the origin, rather than guessing", () => {
    // There the constant factor e^{iar} appears, and whether such a sum vanishes is a transcendence
    // question. `exp(i·0) = 1` is what makes the origin decidable and nothing else.
    const r = isEntire(formOf("(1 - exp(i*z))/(z - 1)"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/transcendence question/);
  });

  it("gives C2's auxiliary an EMPTY singular set through findPoles", () => {
    const report = findPoles(parse(C2_AUX));
    expect(report.rational).toBe(true);
    expect(report.exactlyComplete).toBe(true);
    expect(report.poles).toHaveLength(0);
    expect(report.exactResidueSum?.text).toBe("0");
  });
});

describe("L5 — the large arc that does not vanish", () => {
  it("finds z·f(z) → i and returns iα·L = −π, not zero", () => {
    const r = largeArcLimit(formOf(C2_AUX), upperArc(50), "upper");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatGauss(r.limit.L)).toBe("i");
    // iπ·i = −π, i.e. −1 in units of π.
    expect(formatExpSum(r.limit.contribution)).toBe("−1");
    expect(r.limit.certificate.claim).toMatch(/NOT zero/);
  });

  it("returns zero when the limit is zero — which is L1, and the arc really does vanish", () => {
    const r = largeArcLimit(formOf("(1 - exp(i*z))/z^2"), upperArc(50), "upper");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.limit.L.isZero()).toBe(true);
    expect(r.limit.contribution.isZero()).toBe(true);
  });

  it("refuses on the wrong half-plane, where the exponential grows", () => {
    const lowerArc: Resolved = { kind: "arc", center: [0, 0], radius: 50, theta0: 0, theta1: -Math.PI };
    const r = largeArcLimit(formOf(C2_AUX), lowerArc, "lower");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.certificate.method).toMatch(/GROWS on the lower arc/);
  });

  it("refuses a rational part that diverges rather than tending to a limit", () => {
    const r = largeArcLimit(formOf("z^2/(z + 1)"), upperArc(50), "upper");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.certificate.method).toMatch(/diverges rather than tending to a limit/);
  });
});

/** C2's contour, with the arc's lemma under test. */
function c2Contour(R: number, lemma: Piece["lemma"]): Contour {
  const pieces: Piece[] = [
    { id: "line", name: "the real axis", geom: { kind: "segment", from: pt(-R, 0), to: pt(R, 0) }, role: "target", colour: 0 },
    {
      id: "bigarc",
      name: "the R → ∞ semicircle",
      geom: { kind: "arc", center: pt(0, 0), radius: R, theta0: 0, theta1: Math.PI },
      role: "vanish",
      ...(lemma === undefined ? {} : { lemma }),
      colour: 1,
    },
  ];
  return { pieces, params: {} };
}

function runC2(contour: Contour) {
  const ast = parse(C2_AUX);
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const poles = findPoles(ast);
  const resolved = resolveAll(contour);
  const integral = integrateContour(f, resolved, []);
  const theorem = applyResidueTheorem(poles, integral);
  const ledger = evaluateLedger({ ast, pieces: resolved, spec: contour.pieces, poles, integral, theorem });
  return { poles, theorem, ledger };
}

describe("C2 end to end — and the π that moved", () => {
  it("solves to π/2 from an ENTIRE integrand whose arc does not vanish", () => {
    const { theorem, ledger } = runC2(c2Contour(60, "L5"));
    // ∮ = 0 because there are no poles at all — so the whole value is the arc's.
    expect(theorem.exactValue?.text).toBe("0");
    expect(ledger.pieceLimits.map((p) => p.pieceId)).toEqual(["bigarc"]);
    expect(formatExpSum(ledger.pieceLimits[0].contribution)).toBe("−1");

    const piUnits = theorem.piUnits;
    if (piUnits === undefined) throw new Error("no closed-contour value");
    const solved = solveTarget(c2RemovableOneMinusCos, {
      closedContourPiUnits: piUnits,
      pieceLimits: ledger.pieceLimits,
    });
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    expect(solved.solved.text).toBe("π/2");
    expect(solved.solved.value).toBeCloseTo(Math.PI / 2, 15);
  });

  it("DECLINES the arc when L5 is not declared, rather than reporting the wrong answer", () => {
    // C2's `l2-instead-of-l5` trap: claiming an L1/L2/L3 bound here yields T = 0. The engine does
    // not claim it — no rational or Jordan bound applies to this integrand — so the KILL row goes
    // unknown and the ledger refuses to close. That refusal is what stops the 0 being printed.
    const { ledger } = runC2(c2Contour(60, undefined));
    const arc = ledger.rows.find((r) => r.pieceId === "bigarc");
    expect(arc?.status).toBe("unknown");
    expect(ledger.closes).toBe(false);
    // And nothing was recorded for it, so a solve run anyway would silently give 0 — which is
    // exactly the wrong answer the trap names.
    expect(ledger.pieceLimits).toHaveLength(0);
  });

  it("is the SAME π as C1's indentation, moved onto the arc", () => {
    // C1: the indentation pays −iπ·Res with Res = 1, i.e. −1 in units of π.
    // C2: the arc pays iπ·L with L = i, i.e. −1 in units of π.
    // Same number, different piece — because subtracting a principal part to make the origin
    // removable MOVES that contribution rather than deleting it.
    const { ledger } = runC2(c2Contour(60, "L5"));
    expect(formatExpSum(ledger.pieceLimits[0].contribution)).toBe("−1");
  });
});
