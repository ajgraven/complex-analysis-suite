// The identity the dogbone satisfies, and the four ways it refuses to be applied to a picture that
// is not one.
//
// The load-bearing test is the third: `Σ Res = 1` and the answer is `0`, which can only be true
// because `Res(f,∞) = −1` is in the sum. Drop that term and the exterior theorem prints `2πi`, the
// quadrature still prints `0`, and the cross-check turns the disagreement into a refusal — which is
// exactly the failure mode D7's `forgot-the-residue-at-infinity` trap describes, caught here on a
// rational integrand where the arithmetic is checkable by hand.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import { isClosed } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { windingNumber } from "../src/kernel/winding.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { resolveAll, pt, type Contour, type Piece } from "../src/engine/contour/model.js";
import {
  circleTemplate,
  dogboneTemplate,
  keyholeTemplate,
} from "../src/engine/contour/templates.js";
import { applyExteriorTheorem, enclosesTheCut } from "../src/engine/exteriorTheorem.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { analyse } from "../src/engine/analyse.js";
import { buildDerivation } from "../src/engine/derivation.js";
import { INFINITY, NO_BRANCH, type BranchChoice } from "../src/kernel/branch/model.js";

const HALF = { kind: "power", alpha: Frac.of(-1n, 2n) } as const;

/** D6's cut: branch points at ±1 joined by the bounded segment between them. */
const segmentCut = (left = -1, right = 1): BranchChoice => ({
  ...NO_BRANCH,
  convention: "zeroToTwoPi",
  points: [
    { id: "b1", at: [left, 0], order: HALF, label: `z = ${left}` },
    { id: "b2", at: [right, 0], order: HALF, label: `z = ${right}` },
  ],
  cuts: [{ id: "Γ1", from: "b1", to: "b2", via: [] }],
});

function run(src: string, contour: Contour, branch: BranchChoice) {
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
  return applyExteriorTheorem({ poles, integral, pieces, branch, rational: ast });
}

/** Claim, method AND provenance — the provenance is where the identity's two halves are named. */
/** The ordinary residue theorem on the same inputs — what σ = 0 has to reproduce exactly. */
function ordinaryRun(src: string, contour: Contour) {
  const ast = parse(src);
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const pieces = resolveAll(contour);
  const poles = findPoles(ast);
  return applyResidueTheorem(
    poles,
    integrateContour(f, pieces, poles.poles.map((p) => ({ at: p.at, order: p.order }))),
  );
}

const reasons = (r: ReturnType<typeof run>): string =>
  r.verdict.certificates
    .map((c) => [c.claim, c.method, ...(c.provenance ?? []).map((s) => s.text)].join(" :: "))
    .join(" | ");

describe("the dogbone", () => {
  it("is a closed path, and encloses no pole", () => {
    const pieces = resolveAll(dogboneTemplate());
    expect(isClosed(pieces)).toBe(true);
    for (const p of [
      [0, 1],
      [0, -1],
      [2, 0],
      [0, 0.3],
      [-3, 2],
    ] as Cx[]) {
      const w = windingNumber(pieces, p);
      expect({ p, decided: w.decided, n: w.n }).toEqual({ p, decided: true, n: 0 });
    }
  });

  it("winds −1 about each branch point: the cut IS inside it, clockwise", () => {
    const pieces = resolveAll(dogboneTemplate());
    for (const b of [
      [-1, 0],
      [1, 0],
    ] as Cx[]) {
      const w = windingNumber(pieces, b);
      expect({ b, decided: w.decided, n: w.n }).toEqual({ b, decided: true, n: -1 });
    }
    expect(enclosesTheCut(pieces, segmentCut())).toBe(true);
  });

  it("counts an UNDECIDED winding as 'the cut may be inside', so the refusal comes from the right theorem", () => {
    // The contour runs straight through the branch point at z = 1. Whether the cut is inside is not
    // a question with an answer, and treating that as "outside" would hand the picture to the
    // ordinary residue theorem, which would confidently return 2πi Σ n·Res for a contour it cannot
    // describe. Routing it here instead produces a refusal that names the branch point.
    const pieces = resolveAll(circleTemplate([0, 0], 1));
    expect(windingNumber(pieces, [1, 0]).decided).toBe(false);
    expect(enclosesTheCut(pieces, segmentCut(-1, 1))).toBe(true);
    const r = run("(z+3)/(z^2+4)", circleTemplate([0, 0], 1), segmentCut(-1, 1));
    expect(r.exactValue).toBeUndefined();
    expect(reasons(r)).toMatch(/winding number about the branch point z = -1 could not be decided/);
  });

  it("does not fire on a keyhole, whose branch point it leaves outside", () => {
    const pieces = resolveAll(keyholeTemplate(4, 0.15));
    const branch: BranchChoice = {
      ...NO_BRANCH,
      points: [{ id: "b1", at: [0, 0], order: HALF, label: "z = 0" }],
      cuts: [{ id: "Γ1", from: "b1", to: INFINITY, via: [[3, 0]] }],
    };
    expect(windingNumber(pieces, [0, 0])).toMatchObject({ decided: true, n: 0 });
    expect(enclosesTheCut(pieces, branch)).toBe(false);
  });
});

describe("the exterior residue theorem", () => {
  it("adds −σ·Res(f,∞) to the poles it re-weights, and the two cancel", () => {
    // f = (z+3)/(z²+1): Res(f, i) = 1/2 − 3i/2, Res(f, −i) = 1/2 + 3i/2, so Σ Res = 1; and
    // f = z⁻¹ + 3z⁻² + … at infinity, so Res(f,∞) = −1. The dogbone has σ = −1 and leaves both poles
    // outside, so every weight is 0 − (−1) = 1 and the identity reads 1 + (−1)·(−1)·… = 0.
    const r = run("(z+3)/(z^2+1)", dogboneTemplate(), segmentCut());
    expect(r.exactValue).toBeDefined();
    expect(r.exactValue?.value[0]).toBeCloseTo(0, 12);
    expect(r.exactValue?.value[1]).toBeCloseTo(0, 12);
    // The whole point: Σ Res over the finite poles is NOT zero, so the answer is zero only because
    // Res(f,∞) is in it.
    expect(reasons(r)).toMatch(/\\sigma = -1\$, \$\\sum \\operatorname\{Res\}\$ over the 2 finite poles is \$1\$, and \$\\operatorname\{Res\}\(f, \\infty\) = -1\$/);
    expect(reasons(r)).toMatch(/null-homologous in the cut-free plane/);
    // And the quadrature, which shares no machinery with any of that, agrees.
    expect(r.agrees).toBe(true);
    expect(r.verdict.level).toBe("=");
  });

  it("reports the two facts separately: nothing enclosed, and a value that says nothing about it", () => {
    const r = run("(z+3)/(z^2+1)", dogboneTemplate(), segmentCut());
    expect(reasons(r)).toMatch(/n\(γ, aₖ\) ≠ 0 at 0 of the 2 poles/);
    expect(reasons(r)).toMatch(/says what is enclosed and says nothing whatever about the value/);
    expect(reasons(r)).toMatch(/encloses the cut clockwise \(\$\\sigma = -1\$ at every branch point\)/);
  });

  it("weights an ENCLOSED pole by n − σ, and the quadrature says so", () => {
    // |z| = 1.5 anticlockwise: σ = +1 about the cut [−0.5, 0.5], and the poles of (z+3)/(z²+1) at ±i
    // are inside it, n = +1. Every weight is 1 − 1 = 0, and the entire answer is −σ·Res(f,∞) = +1:
    //     ∮ = 2πi·1 = 2πi ≈ 6.2832i.
    // Weighting by n instead of n − σ would give 2πi(1 + 1) = 4πi, and the quadrature would catch it.
    const r = run("(z+3)/(z^2+1)", circleTemplate([0, 0], 1.5), segmentCut(-0.5, 0.5));
    expect(r.exactValue?.value[0]).toBeCloseTo(0, 9);
    expect(r.exactValue?.value[1]).toBeCloseTo(2 * Math.PI, 9);
    expect(reasons(r)).toMatch(/n\(γ, aₖ\) ≠ 0 at 2 of the 2 poles/);
    expect(reasons(r)).toMatch(/weighted by \$\\operatorname\{Ind\}_\\gamma\(a_k\) - \\sigma\$ with \$\\sigma = 1\$/);
    expect(r.agrees).toBe(true);
  });

  it("gives the residue theorem back when σ = 0, term for term", () => {
    // A keyhole leaves its branch point outside. The formula then has every weight equal to n(γ,aₖ)
    // and no residue at infinity at all — which is the ordinary theorem, recovered rather than
    // restated, and the check that `− σ` is in the right place.
    const branch: BranchChoice = {
      ...NO_BRANCH,
      points: [{ id: "b1", at: [0, 0], order: HALF, label: "z = 0" }],
      cuts: [{ id: "Γ1", from: "b1", to: INFINITY, via: [[3, 0]] }],
    };
    const src = "(z+3)/(z^2+1)";
    const contour = keyholeTemplate(4, 0.15);
    const mine = run(src, contour, branch);
    const ordinary = ordinaryRun(src, contour);
    expect(mine.exactValue?.text).toBe(ordinary.exactValue?.text);
    expect(mine.exactValue?.value[0]).toBeCloseTo(ordinary.exactValue?.value[0] ?? NaN, 12);
    expect(mine.exactValue?.value[1]).toBeCloseTo(ordinary.exactValue?.value[1] ?? NaN, 12);
    expect(reasons(mine)).toMatch(/leaves the cut outside \(\$\\sigma = 0\$ at every branch point\)/);
    expect(reasons(mine)).toMatch(/this IS the residue theorem, recovered rather than restated/);
  });

  it("says zero for a rational integrand a contour encloses nothing of, and that is the total-residue identity", () => {
    // Σ over ALL finite residues plus Res(f,∞) is zero for every rational f — so a rational
    // integrand on an exterior contour that encloses none of its poles must come out zero, whatever
    // they are. A term with the wrong sign would break this before it broke anything with a cut in it.
    for (const src of ["(z+3)/(z^2+1)", "1/(z^2+9)", "(z^3+1)/(z^4+16)", "(2*z+5)/((z^2+4)*(z+3*i))"]) {
      const r = run(src, dogboneTemplate(-0.5, 0.5), segmentCut(-0.5, 0.5));
      expect({ src, re: r.exactValue?.value[0], im: r.exactValue?.value[1] }).toEqual({
        src,
        re: expect.closeTo(0, 12) as unknown as number,
        im: expect.closeTo(0, 12) as unknown as number,
      });
    }
  });

  it("says out loud that a rational fixture cannot pin the sign of σ", () => {
    // The honest limitation, asserted rather than left to a reader: `Σ Res + Res(f,∞) = 0` kills the
    // whole σ-dependent term for a rational f, so nothing in this file falsifies σ's SIGN. D6 does.
    const r = run("(z+3)/(z^2+1)", dogboneTemplate(), segmentCut());
    expect(reasons(r)).toMatch(/cannot falsify the sign of \$\\sigma\$/);
  });
});

describe("it refuses a picture it does not describe", () => {
  it("refuses when there is no cut inside the contour", () => {
    const r = run("(z+3)/(z^2+1)", dogboneTemplate(), NO_BRANCH);
    expect(r.exactValue).toBeUndefined();
    expect(reasons(r)).toMatch(/no branch points/);
    expect(reasons(r)).toMatch(/the ordinary residue theorem applies/);
  });

  it("refuses a contour that leaves one end of the cut outside", () => {
    const r = run("(z+3)/(z^2+1)", circleTemplate([1, 0], 0.5), segmentCut());
    expect(r.exactValue).toBeUndefined();
    expect(reasons(r)).toMatch(/winding 0 about one branch point and 1 about z = 1/);
    expect(reasons(r)).toMatch(/no single σ describes the picture/);
  });

  it("refuses a contour that separates the ends of the cut", () => {
    // A figure-eight: anticlockwise about z = −1, clockwise about z = +1. Closed, and hugging
    // neither — half the cut is inside it and half outside.
    const arc = (cx: number, t0: number, t1: number, id: string): Piece => ({
      id,
      name: id,
      geom: { kind: "arc", center: pt(cx, 0), radius: 0.4, theta0: t0, theta1: t1 },
      role: "free",
      colour: 0,
    });
    const seg = (x0: number, x1: number, id: string): Piece => ({
      id,
      name: id,
      geom: { kind: "segment", from: pt(x0, 0), to: pt(x1, 0) },
      role: "free",
      colour: 1,
    });
    const eight: Contour = {
      pieces: [
        arc(-1, 0, 2 * Math.PI, "left"),
        seg(-0.6, 0.6, "across"),
        arc(1, Math.PI, -Math.PI, "right"),
        seg(0.6, -0.6, "back"),
      ],
      params: {},
    };
    const pieces = resolveAll(eight);
    expect(isClosed(pieces)).toBe(true);
    expect(windingNumber(pieces, [-1, 0])).toMatchObject({ decided: true, n: 1 });
    expect(windingNumber(pieces, [1, 0])).toMatchObject({ decided: true, n: -1 });
    const r = run("(z+3)/(z^2+1)", eight, segmentCut());
    expect(r.exactValue).toBeUndefined();
    expect(reasons(r)).toMatch(/separates the ends of the cut/);
  });

  it("refuses when a pole sits on the contour, where no side can be decided", () => {
    // |z| = 1 anticlockwise round the cut [−0.5, 0.5]: the poles of 1/(z²+1) sit at ±i, ON it.
    const r = run("1/(z^2+1)", circleTemplate([0, 0], 1), segmentCut(-0.5, 0.5));
    expect(r.exactValue).toBeUndefined();
    expect(reasons(r)).toMatch(/winding number about the pole .* could not be decided/);
  });

  it("refuses e^{iaz}, which has no residue at infinity to add", () => {
    const r = run("exp(i*z)/(z^2+1)", dogboneTemplate(), segmentCut());
    expect(r.exactValue).toBeUndefined();
    expect(reasons(r)).toMatch(/essentially singular at infinity/);
  });
});

describe("analyse routes on the geometry", () => {
  const rational = "(z+3)/(z^2+1)";
  const build = (contour: Contour, branch: BranchChoice) => {
    const ast = parse(rational);
    const fn = makeComplexFn(ast);
    return analyse({
      ast,
      f: (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx,
      poles: findPoles(ast),
      contour,
      branch,
    });
  };

  it("takes the exterior route when the cut is inside, and the ordinary one when it is not", () => {
    const inside = build(dogboneTemplate(), segmentCut());
    expect(inside.theorem.verdict.certificates.map((c) => c.method).join(" | ")).toMatch(
      /null-homologous in the cut-free plane/,
    );
    const outside = build(dogboneTemplate(), NO_BRANCH);
    expect(outside.theorem.verdict.certificates.map((c) => c.claim).join(" | ")).toMatch(
      /2πi Σ n\(γ,aₖ\)/,
    );
    // Both say zero — but for different reasons, and only one of them is entitled to.
    expect(inside.theorem.exactValue?.value[0]).toBeCloseTo(0, 12);
    expect(outside.theorem.exactValue?.value[0]).toBeCloseTo(0, 12);
  });

  it("states the identity it actually used, in the derivation panel", () => {
    // The panel's SOLVE stage opens with the equation being applied. Printing `∮ = 2πi Σ n·Res` above
    // a dogbone's answer would state the very equation D6 exists to show is inapplicable — so the
    // sentence comes from the result, and a refusal carries it too.
    const inside = build(dogboneTemplate(), segmentCut());
    const panel = buildDerivation({
      ledger: inside.ledger,
      poles: findPoles(parse(rational)),
      integral: inside.integral,
      theorem: inside.theorem,
      spec: dogboneTemplate().pieces,
    });
    const solve = panel.stages.find((s) => s.id === "solve");
    const texts = [
      ...(solve?.statements ?? []).map((x) => x.text),
      ...(solve?.lines ?? []).map((l) => l.text),
    ].join(" | ");
    expect(texts).toMatch(/\\operatorname\{Ind\}_\\gamma\(a_k\) - \\sigma/);
    expect(texts).not.toMatch(/$\\oint_\\gamma f(z)\\,dz = 2πi Σₖ n\(γ,aₖ\)·Res\(f,aₖ\)( |$)/);
  });

  it("refuses rather than answering when a branch factor rides an exterior contour", () => {
    const ast = parse("1/(z^2+1)");
    const fn = makeComplexFn(ast);
    const r = analyse({
      ast,
      f: (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx,
      poles: findPoles(ast),
      contour: dogboneTemplate(),
      branch: segmentCut(),
      power: { factor: { alpha: Frac.of(-1n, 2n), argRange: [Frac.ZERO, Frac.of(2n)] }, rational: ast },
    });
    expect(r.theorem.exactValue).toBeUndefined();
    expect(r.theorem.verdict.certificates.map((c) => c.method).join(" | ")).toMatch(
      /that reader is not built yet/,
    );
  });
});
