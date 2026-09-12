// **THE `side` TAG IS HONOURED** — M5.0, and the end of tier D's one evidence gap.
//
// Research 06 §3.3: *"Don't offset the contour; offset the branch."* Give each piece a `side` and let
// the evaluator pin `θₖ` to its limiting value from that side, so the contour lies exactly on `ℝ₊`
// and the integrand is exactly the limiting boundary value — "the same idea as C99's signed zero,
// lifted from a float bit to a data field".
//
// The field has existed since M4.1, and LEGALITY has required it of any piece meeting a cut. Nothing
// read it to evaluate anything, and the consequence was larger than it looked: the quadrature had to
// be **skipped for every tier-D record**, because sampling `z^α` with `@cas/expr`'s principal branch
// makes a keyhole's two lips return the same value, cancel, and answer a different question with
// confidence. So tier D was the one tier whose values had no independent numeric corroboration,
// while every record in A–C was checked against floating Gauss–Legendre panels sharing no machinery
// with the exact route.
//
// These are the four claims that closes on:
//
//  1. The mechanism: the two lips differ by exactly the crossing factor the record declares.
//  2. All seven records now report an AGREEING quadrature.
//  3. **Mis-declaring a side makes it disagree.** Without this the suite would prove only that a
//     number was produced, not that the tag decided it.
//  4. A side that cannot resolve keeps the skip, and names why.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { resolveAll, type CutSide } from "../src/engine/contour/model.js";
import { evaluateDeclared, sideResolves, type DeclaredProduct } from "../src/kernel/branch/declared.js";
import { offeredFamilies, primaryGolden, runFamily, type FamilyRun } from "../src/families/runFamily.js";
import { accumulate } from "../src/engine/contour/accumulate.js";
import type { Family } from "../src/families/schema.js";
import { pointAt, type Cx } from "../src/kernel/geom.js";

/** Every record that declares a branch factor, run at its primary fixture. */
function branchRuns(): { id: string; run: FamilyRun; product: DeclaredProduct }[] {
  const out: { id: string; run: FamilyRun; product: DeclaredProduct }[] = [];
  for (const family of offeredFamilies().tiers.flatMap((t) => t.families)) {
    const r = runFamily(family, primaryGolden(family));
    if (r.ok && r.run.declared !== undefined) {
      out.push({ id: family.id, run: r.run, product: r.run.declared.product });
    }
  }
  return out;
}

/** A point on the real axis that lies ON this record's cut, where the lips run. */
const onTheCut = (id: string): Cx => (id === "dogbone-inverse-sqrt" ? [0.4, 0] : [1.7, 0]);

const div = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

describe("the two lips differ by the factor the record declares", () => {
  // The mechanism, on the corpus rather than on a fixture written here. `arg(below/above)/π` is the
  // crossing phase, and for a POWER product it is `2J` with `J` the arc's jump weight — which is the
  // same number `kernel/branch/monodromy.ts` prints in the app.
  const powers: Record<string, number> = {
    // α = 3/10, integrand `x^{α−1}`, so J = −7/10 and 2J = −1.4 ≡ 0.6 (mod 2).
    "mellin-keyhole": 0.6,
    "keyhole-two-poles": 1,
    "keyhole-x-to-the-n": 1,
    // J = α_{b₁} = −1/2 on the bounded arc: 2J = −1.
    "dogbone-inverse-sqrt": -1,
    // J = μ = 3/4: 2J = 3/2 ≡ −1/2 (mod 2).
    "dogbone-two-fractional-powers": -0.5,
  };

  it.each(Object.keys(powers).map((id) => [id] as const))("%s", (id) => {
    const kase = branchRuns().find((r) => r.id === id);
    if (kase === undefined) throw new Error(`${id} should be offered`);
    const z = onTheCut(id);
    const above = evaluateDeclared(kase.product, z, "above");
    const below = evaluateDeclared(kase.product, z, "below");
    const ratio = div(below, above);
    // Unimodular, because a power's monodromy multiplies by a phase.
    expect(Math.hypot(...ratio)).toBeCloseTo(1, 9);
    expect(Math.atan2(ratio[1], ratio[0]) / Math.PI).toBeCloseTo(powers[id], 9);
  });

  it("a LOG's lips do not differ by a phase, and the ratio is not even unimodular", () => {
    // `log_{[0,2π)} = log_{(−π,π]} + 2πi` below the cut, and `(L + 2πi)^m` is not `L^m` times a
    // phase — the same additive-monodromy fact M4.7c measured in the modulus contours. A test that
    // asserted a phase here would be asserting the power case twice.
    for (const id of ["log-squared-keyhole", "log-cubed-keyhole"]) {
      const kase = branchRuns().find((r) => r.id === id);
      if (kase === undefined) throw new Error(`${id} should be offered`);
      const z = onTheCut(id);
      const ratio = div(
        evaluateDeclared(kase.product, z, "below"),
        evaluateDeclared(kase.product, z, "above"),
      );
      expect({ id, unimodular: Math.abs(Math.hypot(...ratio) - 1) < 0.01 }).toEqual({
        id,
        unimodular: false,
      });
    }
  });

  it("and with no side at all the two agree, which is the bug this closes", () => {
    // Called without a side, `evaluateDeclared` returns the window's lower edge for BOTH lips. That
    // is what the compiled evaluator did for the whole of tier D, and why the lips cancelled.
    for (const kase of branchRuns()) {
      const z = onTheCut(kase.id);
      const a = evaluateDeclared(kase.product, z);
      const b = evaluateDeclared(kase.product, z);
      expect({ id: kase.id, same: a[0] === b[0] && a[1] === b[1] }).toEqual({ id: kase.id, same: true });
    }
  });
});

describe("every tier-D record now has an agreeing quadrature", () => {
  const cases = branchRuns();

  it("all seven of them, and none is skipped", () => {
    expect(cases).toHaveLength(7);
    for (const { id, run } of cases) {
      expect({ id, skipped: run.integral.quadratureSkipped }).toEqual({ id, skipped: undefined });
      expect({ id, value: run.integral.value !== undefined }).toEqual({ id, value: true });
    }
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s agrees with the exact value", (_id, { run }) => {
    expect(run.theorem.agrees).toBe(true);
    expect(run.theorem.crossCheck).toBeDefined();
    // **THE DISAGREEMENT TRACKS THE ESTIMATOR, WHICH IS THE POINT.** Tier D's lips carry an endpoint
    // singularity (`z^{α−1}` is unbounded at the branch point), so Gauss–Legendre converges slowly
    // and the gap is 1e-3…1e0 rather than tiers A–C's 1e-14. What makes it evidence is that it stays
    // within a small multiple of the quadrature's OWN error estimate: a systematic error in either
    // route would show as a gap the estimator does not explain.
    const worst = Math.max(0, ...run.integral.pieces.map((p) => p.errorEstimate));
    expect(run.theorem.disagreement).toBeLessThan(2 * worst);
  });
});

describe("MIS-DECLARING a side makes the quadrature disagree", () => {
  // Claims 1–2 would both pass against an evaluator that ignored `side` and simply happened to be
  // right — so this is the one that shows the tag DECIDES the number. Both lips are declared
  // "above": the two then return the same boundary value, cancel as they did before M5.0, and the
  // integral moves away from the exact value by far more than the estimator allows.
  it.each(branchRuns().map((c) => [c.id, c] as const))("%s", (_id, { run }) => {
    const resolved = resolveAll(run.contour);
    const singular = run.poles.poles.map((p) => ({ at: p.at, order: p.order }));
    const honest = run.contour.pieces.map((p) => p.side);
    const flipped = honest.map((side): CutSide | undefined => (side === undefined ? undefined : "above"));
    // At least two pieces declare a side, or "flipping" is not a change.
    expect(honest.filter((s) => s !== undefined).length).toBeGreaterThanOrEqual(2);

    const asDeclared = integrateContour(run.f, resolved, singular, undefined, honest);
    const bothAbove = integrateContour(run.f, resolved, singular, undefined, flipped);
    const exact = run.theorem.exactValue?.value;
    if (exact === undefined || asDeclared.value === undefined || bothAbove.value === undefined) {
      throw new Error("both integrals and the exact value should exist");
    }
    const gap = (v: Cx): number => Math.hypot(v[0] - exact[0], v[1] - exact[1]);
    // The honest declaration is the one that agrees; the mangled one is worse by a wide margin.
    expect(gap(asDeclared.value)).toBeLessThan(gap(bothAbove.value));
    expect(gap(bothAbove.value)).toBeGreaterThan(10 * gap(asDeclared.value));
  });
});

describe("MIS-DECLARING a side reaches the VERDICT, not just the value", () => {
  // The sweep's finding. The block above integrates by hand and compares distances, which shows the
  // tag decides the NUMBER — but it left `agrees` itself unasserted, so forcing it to `true` in
  // `branchTheorem.ts` survived a mutation. The claim that closes that is the whole chain: a record
  // whose lips are both declared "above" must reach a *refused* verdict, because the contradiction
  // certificate `checkAgainstQuadrature` emits on disagreement goes INTO the verdict (the exact
  // route and the quadrature cannot both be right, and the app must not pick a favourite).
  const bothAbove = (f: Family): Family => ({
    ...f,
    contour: {
      ...f.contour,
      pieces: f.contour.pieces.map((p) => (p.side === undefined ? p : { ...p, side: "above" as const })),
    },
  });

  it.each(
    offeredFamilies()
      .tiers.flatMap((t) => t.families)
      .filter((fam) => {
        const r = runFamily(fam, primaryGolden(fam));
        return r.ok && r.run.declared !== undefined;
      })
      .map((fam) => [fam.id, fam] as const),
  )("%s", (_id, family) => {
    const honest = runFamily(family, primaryGolden(family));
    const mangled = runFamily(bothAbove(family), primaryGolden(family));
    if (!honest.ok || !mangled.ok) throw new Error("both should run");
    // Honestly declared: the two routes agree and the exact value keeps its `=`.
    expect(honest.run.theorem.agrees).toBe(true);
    expect(honest.run.theorem.verdict.level).toBe("=");
    // Mis-declared: they disagree, and the verdict says so rather than printing the exact value
    // beside a quadrature that contradicts it.
    expect(mangled.run.theorem.agrees).toBe(false);
    expect(mangled.run.theorem.verdict.level).toBe("⚠");
    // And no corroboration is offered on a disagreement — `crossCheck` is the AGREEING `≤`.
    expect(mangled.run.theorem.crossCheck).toBeUndefined();
  });
});

describe("the accumulation panel draws the determination the value is in", () => {
  // The sweep's other finding, and it is about the PICTURE rather than the number. The panel is a
  // head-to-tail sum of `f(zₖ)·Δzₖ`, so without the sides a keyhole's two lips draw as retracing
  // each other — a trail that visibly closes to nothing beside a result card saying the integral is
  // `π√2`. `Analysis.sides` exists so both come from one array; these are the two claims that make
  // dropping it fail rather than merely look wrong.
  const cases = branchRuns();

  it.each(cases.map((c) => [c.id, c] as const))("%s — sides mirror the spec exactly", (_id, { run }) => {
    expect(run.sides).toEqual(run.contour.pieces.map((p) => p.side));
    expect(run.sides.filter((x) => x !== undefined).length).toBeGreaterThanOrEqual(2);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s — and the trail tracks the integral", (_id, { run }) => {
    const value = run.integral.value;
    if (value === undefined) throw new Error("the integral should have a value");
    const gap = (v: Cx): number => Math.hypot(v[0] - value[0], v[1] - value[1]);
    const withSides = gap(accumulate(run.f, run.resolved, 240, run.sides).total);
    const without = gap(accumulate(run.f, run.resolved, 240).total);
    // A 240-step midpoint sum is coarse against an endpoint singularity, so this is deliberately a
    // RATIO and not a tolerance: measured 4.7× (mellin) to 441× (D7).
    expect(without).toBeGreaterThan(4 * withSides);
  });
});

describe("a side that cannot resolve is refused rather than answered", () => {
  it("says so for a VERTICAL cut, where 'above' displaces along it instead of across", () => {
    // The one degenerate case, and it is decided rather than tolerated: the displacement leaves the
    // point on the ray, `arg` does not move, and whichever limit `atan2` returns would be taken.
    const withWindow = (window: Frac): DeclaredProduct => ({
      constant: [1, 0],
      factors: [{ kind: "power", id: "b", at: [0, 0], alpha: 0.5, sign: 1, window }],
    });
    // Declaring the window IS declaring the cut's direction, so `+1/2` cuts UP and `−1/2` cuts DOWN
    // — and each is degenerate only on its own ray. Asserting both directions is what stops the test
    // from passing on a `sideResolves` that had hard-coded one of them.
    const up = withWindow(Frac.of(1n, 2n));
    const down = withWindow(Frac.of(-1n, 2n));
    expect(sideResolves(up, [0, 2], "above")).toBe(false);
    expect(sideResolves(up, [0, 2], "below")).toBe(false);
    expect(sideResolves(down, [0, -2], "above")).toBe(false);
    expect(sideResolves(down, [0, -2], "below")).toBe(false);
    // The OTHER vertical ray is not this factor's cut, so there is nothing there to resolve.
    expect(sideResolves(up, [0, -2], "above")).toBe(true);
    expect(sideResolves(down, [0, 2], "above")).toBe(true);
    // And off the cut entirely, likewise — it does not pretend a side was needed.
    expect(sideResolves(up, [2, 0], "above")).toBe(true);
    expect(sideResolves(up, [1, 1], "above")).toBe(true);
  });

  it("and every record in the corpus DOES resolve, on every piece that declares a side", () => {
    // Which is why the skip is gone rather than merely narrowed.
    for (const { id, run, product } of branchRuns()) {
      const resolved = resolveAll(run.contour);
      run.contour.pieces.forEach((piece, k) => {
        if (piece.side === undefined) return;
        // A lip runs ALONG its cut, so its midpoint decides the whole of it.
        const mid = pointAt(resolved[k], 0.5);
        expect({ id, piece: piece.name, resolves: sideResolves(product, mid, piece.side) }).toEqual({
          id,
          piece: piece.name,
          resolves: true,
        });
      });
    }
  });
});
