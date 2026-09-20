import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { mayReportValue } from "@cas/rigor";
import type { Cx, Resolved } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";

const setup = (src: string, pieces: Resolved[]) => {
  const ast = parse(src);
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const poles = findPoles(ast);
  const integral = integrateContour(
    f,
    pieces,
    poles.poles.map((p) => ({ at: p.at, order: p.order })),
  );
  return { poles, integral, theorem: applyResidueTheorem(poles, integral) };
};

const circle = (r: number, centre: [number, number] = [0, 0]) =>
  resolveAll(circleTemplate(centre, r));

describe("the M2 gate: an exact ∮ that the quadrature confirms", () => {
  it("gives ∮dz/z = 2πi exactly, and the quadrature agrees", () => {
    const { theorem } = setup("1/z", circle(1.5));
    expect(theorem.exactValue?.text).toBe("2πi");
    expect(theorem.agrees).toBe(true);
    // `=`, and NOT capped by the agreeing quadrature. `meet` is for a claim that DEPENDS on two
    // sub-claims; `∮` does not depend on the quadrature, which is a second opinion about the same
    // number. The corroboration is reported beside the value instead of inside its label.
    expect(theorem.verdict.level).toBe("=");
    expect(theorem.verdict.certificates[0].level).toBe("=");
    expect(theorem.crossCheck?.level).toBe("≤");
    expect(theorem.verdict.certificates.some((c) => c.claim.includes("quadrature agrees"))).toBe(false);
  });

  it("gives π for the semicircular contour on 1/(1+z²) — gallery A5, exactly", () => {
    // 2πi·Res(f, i) = 2πi·(−i/2) = π, with no integration at all; the quadrature then confirms it.
    const { theorem } = setup("1/(1+z^2)", resolveAll(semicircleTemplate(200)));
    expect(theorem.exactValue?.text).toBe("π");
    expect(theorem.exactValue?.value[0]).toBeCloseTo(Math.PI, 12);
    expect(theorem.agrees).toBe(true);
  });

  it("gives π√2/2 for 1/(1+z⁴) over the upper half-plane — the M2 gate's own example", () => {
    // The residues live in ℚ(i)(√2), sum to −i√2/4 over the two upper poles, and 2πi times that is
    // π√2/2. Printing 2.2214414 there would be correct and worthless.
    const { theorem } = setup("1/(1+z^4)", resolveAll(semicircleTemplate(400)));
    expect(theorem.exactValue?.text).toBe("π√2/2");
    expect(theorem.exactValue?.value[0]).toBeCloseTo(Math.PI / Math.SQRT2, 12);
    expect(theorem.agrees).toBe(true);
  });

  it("gives 0 when the contour encloses nothing", () => {
    const { theorem } = setup("1/(z-5)", circle(1));
    expect(theorem.exactValue?.text).toBe("0");
    expect(theorem.agrees).toBe(true);
  });

  it("counts multiplicity: a doubly-traversed circle doubles the answer", () => {
    const twice: Resolved[] = [
      { kind: "arc", center: [0, 0], radius: 1.5, theta0: 0, theta1: 4 * Math.PI },
    ];
    const { theorem } = setup("1/z", twice);
    expect(theorem.exactValue?.text).toBe("4πi");
    expect(theorem.agrees).toBe(true);
  });

  it("handles an order-5 pole, where the exact route is the only accurate one", () => {
    // Res(z^5/(z−1)^5, 1) = 5, so ∮ = 10πi. The numeric residue from a small circle would be wrong
    // in the first digit here (see exactResidue.test.ts); the contour integral is well conditioned,
    // and the two still agree — which is the cross-check earning its keep.
    const { theorem } = setup("z^5/(z-1)^5", circle(0.6, [1, 0]));
    expect(theorem.exactValue?.text).toBe("10πi");
    expect(theorem.agrees).toBe(true);
  });

  it("sums several residues with their winding numbers", () => {
    // Poles at 0, 1, 2 with residues 1/2, −1, 1/2. A circle about 0.5 of radius 1.2 encloses 0 and
    // 1 and clears 2 — at radius 1.5 the pole at 2 would land exactly ON the contour, and the app
    // would (rightly) refuse instead of answering.
    const { theorem } = setup("1/(z*(z-1)*(z-2))", circle(1.2, [0.5, 0]));
    expect(theorem.exactValue?.text).toBe("−πi");
    expect(theorem.agrees).toBe(true);
  });
});

describe("when the residue theorem does not apply, it says so", () => {
  it("declines on a non-closed contour", () => {
    const open: Resolved[] = [{ kind: "segment", from: [-1, -1], to: [1, 1] }];
    const { theorem } = setup("1/(z-5)", open);
    expect(theorem.exactValue).toBeUndefined();
    expect(mayReportValue(theorem.verdict)).toBe(false);
  });

  it("declines when the integral itself was refused", () => {
    const { theorem } = setup("1/(z-1)", circle(1));
    expect(theorem.exactValue).toBeUndefined();
    expect(theorem.verdict.level).toBe("⚠");
  });

  it("estimates rather than claims when the poles outrun one quadratic extension", () => {
    // A general quintic has no closed-form roots, so no exact sum is available — and the result says
    // that rather than quietly reporting the numeric value as exact.
    const { theorem } = setup("1/(z^5-z-1)", circle(3));
    expect(theorem.exactValue).toBeUndefined();
    expect(theorem.verdict.level).toBe("≈");
  });

  it("estimates rather than claims for a transcendental integrand", () => {
    const { theorem } = setup("sin(z)/z", circle(2));
    expect(theorem.exactValue).toBeUndefined();
    expect(theorem.verdict.level).toBe("≈");
  });

  it("refuses a pole that was never asked for its winding, rather than weighting it 0", () => {
    // **`n = 0` is a DECISION and an unasked pole has none** — ADR-0045. `windingOf` matched by
    // distance and fell back to `0` on a miss, so a pole absent from the winding list dropped
    // silently out of `Σ n·Res` and the total came back exact. The five routes beside this one all
    // refuse such a pole by name.
    //
    // `1/(1+z²)` about the origin, with only `+i` measured: the missing `−i` weighs `0` either way
    // here, which is exactly why the old code looked right — the number it printed was `π`, a
    // number the contour does earn, and nothing said whether `−i` had been decided or skipped.
    const { poles, integral } = setup("1/(1+z^2)", circle(2));
    expect(integral.windings).toHaveLength(2);
    const short = { ...integral, windings: integral.windings.filter((w) => w.at[1] > 0) };
    const answered = applyResidueTheorem(poles, short);
    expect(answered.exactValue).toBeUndefined();
    expect(answered.verdict.level).toBe("⚠");
    expect(
      answered.verdict.certificates.some((c) => c.method.includes("never asked for its winding")),
    ).toBe(true);
    // …and with both measured it answers, so the guard is not simply refusing everything.
    expect(applyResidueTheorem(poles, integral).exactValue?.text).toBe("0");
  });
});

describe("the cross-check is a real check", () => {
  it("agrees to far better than the quadrature's own estimate", () => {
    for (const [src, pieces] of [
      ["1/z", circle(1)],
      ["1/(1+z^2)", circle(3)],
      ["1/(z-1)^2", circle(2)],
      ["(3+4i)/(z^2-1)", circle(2)],
    ] as const) {
      const { theorem } = setup(src, pieces as Resolved[]);
      expect(theorem.agrees).toBe(true);
      expect(theorem.disagreement).toBeLessThan(1e-9);
    }
  });

  it("would REPORT a disagreement rather than pick a side", () => {
    // Fed a deliberately mismatched pair — the residue data for one integrand, the quadrature for
    // another — the module refuses instead of preferring whichever route it trusts more.
    const ast = parse("1/z");
    const poles = findPoles(ast);
    const wrongFn = makeComplexFn(parse("2/z"));
    const integral = integrateContour(
      (z: Cx) => wrongFn(z as [number, number], [0, 0]) as Cx,
      circle(1),
      poles.poles.map((p) => ({ at: p.at, order: p.order })),
    );
    const theorem = applyResidueTheorem(poles, integral);
    expect(theorem.agrees).toBe(false);
    expect(mayReportValue(theorem.verdict)).toBe(false);
    expect(theorem.verdict.certificates.some((c) => c.claim.includes("disagree"))).toBe(true);
    // Corroboration never weakens; CONTRADICTION still refuses. A disagreement beyond the
    // quadrature's own error estimate means one of the two is wrong, so it goes in the verdict and
    // absorbs it — and there is no `crossCheck` to report, because nothing was corroborated.
    expect(theorem.crossCheck).toBeUndefined();
  });
});
