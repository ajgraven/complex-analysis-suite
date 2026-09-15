import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { resolveAll, type Contour, type Piece } from "../src/engine/contour/model.js";
import { pt } from "../src/engine/contour/model.js";
import { indentedSemicircleTemplate } from "../src/engine/contour/templates.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger } from "../src/engine/ledger.js";
import { findPoles } from "../src/kernel/poles.js";
import { signedSweepOverPi, smallArcLimit } from "../src/kernel/bounds/smallArc.js";
import { formatExpSum } from "../src/kernel/expSum.js";
import { solveTarget } from "../src/families/solveTarget.js";
import { c1IndentedSinc } from "../src/families/records/c1-indented-sinc.js";
import type { Cx, Resolved } from "../src/kernel/geom.js";

const arc = (radius: number, theta0: number, theta1: number): Resolved => ({
  kind: "arc",
  center: [0, 0],
  radius,
  theta0,
  theta1,
});

describe("signedSweepOverPi — the sign IS the physics", () => {
  it("reads a clockwise half-turn as −1 and a counter-clockwise one as +1", () => {
    // Indenting above (π → 0) and indenting below (π → 2π) differ by exactly this sign, and it is
    // what ties ±iπ·Res to the ∓iε prescription rather than to a picture.
    expect(signedSweepOverPi(arc(1, Math.PI, 0))?.toNumber()).toBe(-1);
    expect(signedSweepOverPi(arc(1, Math.PI, 2 * Math.PI))?.toNumber()).toBe(1);
    expect(signedSweepOverPi(arc(1, 0, Math.PI / 2))?.toNumber()).toBe(0.5);
    expect(signedSweepOverPi(arc(1, 0, -Math.PI / 3))?.toNumber()).toBeCloseTo(-1 / 3, 15);
  });

  it("returns null for a sweep that is not a recognised rational multiple of π", () => {
    expect(signedSweepOverPi(arc(1, 0, 1))).toBeNull();
    expect(signedSweepOverPi({ kind: "segment", from: [0, 0], to: [1, 0] })).toBeNull();
  });
});

describe("L4 — the one lemma whose piece does not vanish", () => {
  const polesOf = (src: string) => findPoles(parse(src));

  it("gives the indentation over exp(iz)/z the contribution −iπ·Res", () => {
    const report = polesOf("exp(i*z)/z");
    expect(report.exactlyComplete).toBe(true);
    const r = smallArcLimit(arc(0.01, Math.PI, 0), report.exactPoles ?? [], report.exponentialFrequency);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Res(e^{iz}/z, 0) = 1, α = −π, so the contribution is −iπ — i.e. −i in units of π.
    expect(formatExpSum(r.limit.contribution)).toBe("−i");
    expect(r.limit.sweptAnglePi.toNumber()).toBe(-1);
  });

  it("REFUSES at a pole of order 2, where no limit exists at all", () => {
    // ∫ over the ρ-semicircle of e^{iz}/z² is −2/ρ + O(1): it diverges, so the contour argument does
    // not close and no principal value exists either. L4 is false here, not merely inaccurate.
    const report = polesOf("exp(i*z)/z^2");
    const r = smallArcLimit(arc(0.01, Math.PI, 0), report.exactPoles ?? [], report.exponentialFrequency);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.certificate.level).toBe("⚠");
    expect(r.certificate.method).toMatch(/order 2.*false for order \$\\ge 2\$/s);
  });

  it("refuses when no pole sits at the centre — there is nothing being indented", () => {
    const report = polesOf("exp(i*z)/(z - 2)");
    const r = smallArcLimit(arc(0.01, Math.PI, 0), report.exactPoles ?? [], report.exponentialFrequency);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.certificate.method).toMatch(/nothing being indented/);
  });
});

/** Run one indented contour through the engine and solve C1's identity on it. */
function solveOn(contour: Contour) {
  const ast = parse("exp(i*z)/z");
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const poles = findPoles(ast);
  const resolved = resolveAll(contour);
  const integral = integrateContour(
    f,
    resolved,
    poles.poles.map((p) => ({ at: p.at, order: p.order })),
  );
  const theorem = applyResidueTheorem(poles, integral);
  const ledger = evaluateLedger({
    ast,
    pieces: resolved,
    spec: contour.pieces,
    poles,
    integral,
    theorem,
  });
  const piUnits = theorem.piUnits;
  if (piUnits === undefined) throw new Error("no closed-contour value");
  const solved = solveTarget(c1IndentedSinc, {
    closedContourPiUnits: piUnits,
    pieceLimits: ledger.pieceLimits,
  });
  if (!solved.ok) throw new Error(solved.reason);
  return { integral, theorem, ledger, solved: solved.solved };
}

describe("indenting below must agree with indenting above — the record's free self-test", () => {
  // C1's `indent-below-not-checked` trap: "Indenting BELOW puts the pole inside: the −iπ·Res becomes
  // +iπ·Res AND a 2πi·Res appears. The two routes must agree; that agreement is a free self-test,
  // not a variant to choose by taste."
  const below = (R: number, rho: number): Contour => {
    const pieces: Piece[] = [
      { id: "left", name: "left", geom: { kind: "segment", from: pt(-R, 0), to: pt(-rho, 0) }, role: "target", colour: 0 },
      {
        id: "indent",
        name: "the indentation, passing BELOW the origin",
        // θ: π → 2π dips into the lower half-plane, so the sweep is +π and the pole ends up INSIDE.
        geom: { kind: "arc", center: pt(0, 0), radius: rho, theta0: Math.PI, theta1: 2 * Math.PI },
        role: "vanish",
        lemma: "L4",
        colour: 3,
      },
      { id: "right", name: "right", geom: { kind: "segment", from: pt(rho, 0), to: pt(R, 0) }, role: "target", colour: 0 },
      { id: "bigarc", name: "bigarc", geom: { kind: "arc", center: pt(0, 0), radius: R, theta0: 0, theta1: Math.PI }, role: "vanish", lemma: "L3", colour: 1 },
    ];
    return { pieces, params: {} };
  };

  it("changes BOTH the winding number and the indentation's sign, and they cancel", () => {
    const above = solveOn(indentedSemicircleTemplate(40, 0.01));
    const under = solveOn(below(40, 0.01));

    // Above: the pole is excluded, ∮ = 0, and the indentation pays −iπ.
    expect(above.integral.windings[0].n).toBe(0);
    expect(formatExpSum(above.ledger.pieceLimits[0].contribution)).toBe("−i");
    expect(above.theorem.exactValue?.text).toBe("0");

    // Below: the pole is enclosed, ∮ = 2πi, and the indentation pays +iπ.
    expect(under.integral.windings[0].n).toBe(1);
    expect(formatExpSum(under.ledger.pieceLimits[0].contribution)).toBe("i");
    expect(under.theorem.exactValue?.text).toBe("2πi");

    // Two different routes, the same answer — which is the point. An engine that flipped only one of
    // the two signs would land on −π/2 or 3π/2 and look plausible in both cases.
    expect(under.solved.text).toBe(above.solved.text);
    expect(under.solved.value).toBeCloseTo(above.solved.value, 15);
    expect(above.solved.text).toBe("π/2");
  });
});

describe("the Dirichlet integral, end to end", () => {
  it("solves to π/2 from a contour that encloses nothing", () => {
    const { theorem, solved } = solveOn(indentedSemicircleTemplate(40, 0.01));
    // ∮ = 0 — reading the closed-contour value here would report 0 for an integral equal to π/2.
    expect(Math.abs(theorem.exactValue?.value[0] ?? NaN)).toBe(0);
    expect(Math.abs(theorem.exactValue?.value[1] ?? NaN)).toBe(0);
    expect(solved.text).toBe("π/2");
    expect(solved.value).toBeCloseTo(Math.PI / 2, 15);
  });

  it("is independent of ρ and R, as the limits require", () => {
    const a = solveOn(indentedSemicircleTemplate(40, 0.01));
    const b = solveOn(indentedSemicircleTemplate(120, 1e-4));
    expect(b.solved.text).toBe(a.solved.text);
    expect(b.solved.value).toBe(a.solved.value);
  });
});
