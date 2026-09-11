import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger, ledgerHeadline } from "../src/engine/ledger.js";
import { resolveAll, type Contour } from "../src/engine/contour/model.js";
import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";

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
  return evaluateLedger({ ast, pieces, spec: contour.pieces, poles, integral, theorem });
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

  it("still does not CLOSE that one, because e^{−1} is outside the output basis", () => {
    // ∫cos x/(1+x²) dx = π/e. The arc is certified and the pole locations are exact, but the residue
    // carries e^{i·i} = e^{−1}, which ℚ(i)(√d) cannot express. The honest report is an incomplete
    // argument with the reason named — not a decimal dressed as a closed form.
    const r = run("exp(i*z)/(1+z^2)", semicircleTemplate(50, "upper"));
    expect(r.closes).toBe(false);
    expect(ledgerHeadline(r)).toBe("This argument is incomplete.");
    const catchRow = rowsFor(r, "CATCH").find((x) => x.status === "unknown");
    expect(catchRow?.claim).toMatch(/not every residue is known exactly/);
  });

  it("finds the pole LOCATIONS exactly even there, which it previously missed entirely", () => {
    const poles = findPoles(parse("exp(i*z)/(1+z^2)"));
    expect(poles.poles).toHaveLength(2);
    expect(poles.poles.every((p) => p.orderCertain)).toBe(true);
    expect(poles.poles.some((p) => Math.hypot(p.at[0], p.at[1] - 1) < 1e-15)).toBe(true);
    // But no residue is claimed, because none is expressible.
    expect(poles.poles.every((p) => p.residue === undefined)).toBe(true);
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
