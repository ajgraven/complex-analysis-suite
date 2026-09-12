// **THE PICTURE IS IN THE DETERMINATION THE LEDGER COMPUTES IN** — asserted over the corpus.
//
// `kernel/branch/declared.ts` says why the phase portrait is CONSTRUCTED from a record's declared
// factorisation rather than corrected out of `@cas/expr`'s principal-branch compile. These are the
// claims that make that more than a comment, and every one of them runs against the seven records
// that declare a branch rather than against a fixture written here:
//
//  1. The split is a split. `declared.product · declared.cofactor` is the contour integrand — not a
//     related function, not the integrand times a Jacobian — so rendering the two halves and
//     multiplying is rendering the record's own integrand.
//  2. The two determinations AGREE where their windows overlap, which is the upper half plane for
//     every record here, and DIFFER below the cut. Both directions matter: agreement alone would be
//     satisfied by ignoring the declaration, and difference alone by getting it wrong.
//  3. For a POWER product they differ by a unimodular factor, so `|f|` is determination-independent
//     (research 06 §5.1's device #2). For a LOG they differ in modulus too, by factors of 18.7 and
//     80.7 — because `log` composes additively and `(L + 2πi)^m` is not `L^m` times a phase.
//  4. The picture agrees with the ANSWER: at each pole, the declared product matches the exact
//     `ExpSum` the residue was built from. A picture in a different branch from the residue would
//     be showing the reader the wrong sheet of the very thing the app is computing.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { makeComplexFn } from "@cas/expr";
import { offeredFamilies, primaryGolden, runFamily, type FamilyRun } from "../src/families/runFamily.js";
import { multiFactorOf, powerFactorOf } from "../src/families/branchFactor.js";
import { multiPowerAtPole } from "../src/kernel/branchResidue.js";
import { declaredReference, evaluateDeclared, windowOrigin } from "../src/kernel/branch/declared.js";
import { declaredProductGlsl } from "../src/ui/stage/declared.glsl.js";
import type { Cx } from "../src/kernel/geom.js";

const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const abs = (z: Cx): number => Math.hypot(z[0], z[1]);

/** Every record the loader offers that declares a branch factor, run at its primary fixture. */
function branchRuns(): { id: string; run: FamilyRun }[] {
  const out: { id: string; run: FamilyRun }[] = [];
  for (const family of offeredFamilies().tiers.flatMap((t) => t.families)) {
    const r = runFamily(family, primaryGolden(family));
    if (r.ok && r.run.declared !== undefined) out.push({ id: family.id, run: r.run });
  }
  return out;
}

/** `declared · cofactor` at `z` — the integrand as the PICTURE now builds it. */
function drawn(run: FamilyRun, z: Cx): Cx {
  const declared = run.declared;
  if (declared === undefined) throw new Error("not a branch record");
  const co = makeComplexFn(declared.cofactor);
  return cmul(evaluateDeclared(declared.product, z), co(z as [number, number], [0, 0]) as Cx);
}

/** Whether every factor is a power — the case in which `|f|` cannot see the determination. */
const allPowers = (run: FamilyRun): boolean =>
  (run.declared?.product.factors ?? []).every((f) => f.kind === "power");

/** Points in the UPPER half plane, where `(−π,π]` and `[0,2π)` agree. */
const ABOVE: readonly Cx[] = [
  [0.3, 0.7],
  [-0.4, 1.1],
  [2.2, 0.35],
  [-1.7, 0.9],
  [0.05, 2.4],
];
/** Points BELOW, where they do not. */
const BELOW: readonly Cx[] = [
  [0.6, -1.3],
  [-2.5, -0.8],
  [1.9, -0.45],
  [-0.7, -2.1],
];

describe("the declared product is the record's own integrand", () => {
  it("covers every branch record the loader offers, and there are seven", () => {
    // The corpus is the specification, so the count is asserted: a record that stopped producing a
    // declaration would otherwise silently drop out of every test below.
    expect(branchRuns().map((r) => r.id)).toEqual([
      "mellin-keyhole",
      "keyhole-two-poles",
      "keyhole-x-to-the-n",
      "log-squared-keyhole",
      "log-cubed-keyhole",
      "dogbone-inverse-sqrt",
      "dogbone-two-fractional-powers",
    ]);
  });

  it.each(branchRuns().map((r) => [r.id, r] as const))(
    "%s — declared · cofactor IS the compiled integrand where the windows agree",
    (_id, { run }) => {
      for (const z of ABOVE) {
        const mine = drawn(run, z);
        const theirs = run.f(z);
        // Exactly the same function, to float precision: any Jacobian or missing factor in the
        // split would show up here as a ratio that is not 1.
        expect(Math.hypot(mine[0] - theirs[0], mine[1] - theirs[1])).toBeLessThan(
          1e-9 * Math.max(1, abs(theirs)),
        );
      }
    },
  );

  it.each(branchRuns().map((r) => [r.id, r] as const))(
    "%s — and DIFFERS from it below the cut, which is the whole point",
    (_id, { run }) => {
      let differed = 0;
      for (const z of BELOW) {
        const mine = drawn(run, z);
        const theirs = run.f(z);
        if (Math.hypot(mine[0] - theirs[0], mine[1] - theirs[1]) > 1e-6 * Math.max(1, abs(theirs))) {
          differed += 1;
        }
      }
      // Not "at least one": all four, because the cut of every record here runs along a ray and the
      // whole lower half plane is on the far side of it. A record where only some points differed
      // would mean the declaration is being applied unevenly.
      expect(differed).toBe(BELOW.length);
    },
  );
});

describe("|f| sees the determination only when a log is involved", () => {
  it.each(branchRuns().filter((r) => allPowers(r.run)).map((r) => [r.id, r] as const))(
    "%s — a power product's modulus is determination-independent (device #2 is honest here)",
    (_id, { run }) => {
      for (const z of [...ABOVE, ...BELOW]) {
        const mine = abs(drawn(run, z));
        const theirs = abs(run.f(z));
        // The two determinations differ by exp(2πi·Σα), which is unimodular — so the level curves
        // of |f| drawn over the declared picture are the level curves of the principal one, and
        // they run straight through the seam. This is the assertion behind the app's claim.
        expect(Math.abs(mine - theirs)).toBeLessThan(1e-9 * Math.max(1, theirs));
      }
    },
  );

  it.each(branchRuns().filter((r) => !allPowers(r.run)).map((r) => [r.id, r] as const))(
    "%s — a log's modulus DOES jump, so the contours break and the app must not claim otherwise",
    (_id, { run }) => {
      // Above the cut the two agree (checked in the suite above), so a test that only looked there
      // would find the log indistinguishable from a power. Below, |(L + 2πi)^m| ≠ |L^m|.
      const ratios = BELOW.map((z) => abs(drawn(run, z)) / abs(run.f(z)));
      expect(ratios.every((r) => Math.abs(r - 1) > 0.01)).toBe(true);
      // And the largest is large, not marginal: 18.7 for log², 80.7 for log³ at 0.6 − 1.3i.
      expect(Math.max(...ratios)).toBeGreaterThan(5);
    },
  );

  it("the two log records are exactly D4 and D5, so the split above is not vacuous", () => {
    expect(branchRuns().filter((r) => !allPowers(r.run)).map((r) => r.id)).toEqual([
      "log-squared-keyhole",
      "log-cubed-keyhole",
    ]);
  });
});

describe("the picture agrees with the ANSWER at every pole", () => {
  // The sharpest claim available, and the reason the declared product lives in `kernel/` rather than
  // in `ui/`: `multiPowerAtPole` computes the SAME product in exact arithmetic to build the residue
  // that carries `∮`. If the two disagreed, the app would be colouring one sheet and reporting
  // another — which is the defect M4.7 exists to remove, at the one point where both are defined.
  const dogbones = branchRuns().filter((r) => (r.run.declared?.product.factors.length ?? 0) > 1);

  it("there are two of them, D6 and D7", () => {
    expect(dogbones.map((r) => r.id)).toEqual(["dogbone-inverse-sqrt", "dogbone-two-fractional-powers"]);
  });

  it.each(dogbones.map((r) => [r.id, r] as const))("%s", (_id, { run }) => {
    const multi = multiFactorOf(run.family, run.bindings);
    expect(multi.ok).toBe(true);
    if (!multi.ok) return;
    expect(run.poles.exactPoles).toBeDefined();
    const poles = run.poles.exactPoles ?? [];
    expect(poles.length).toBeGreaterThan(0);
    for (const pole of poles) {
      const exactly = multiPowerAtPole(pole.at, multi.factor);
      expect(exactly.ok).toBe(true);
      if (!exactly.ok) continue;
      const want = exactly.value.toTuple();
      const got = evaluateDeclared(run.declared?.product ?? multi.declared, pole.at.toTuple() as Cx);
      expect(Math.hypot(got[0] - want[0], got[1] - want[1])).toBeLessThan(
        1e-9 * Math.max(1, Math.hypot(want[0], want[1])),
      );
    }
  });
});

describe("the reference the correction will measure a dragged cut from", () => {
  it("names one direction per branch point, keyed as the geometry is", () => {
    const { run } = branchRuns().find((r) => r.id === "dogbone-inverse-sqrt") ?? { run: null };
    expect(run).not.toBeNull();
    if (run === null) return;
    const reference = declaredReference(run.declared?.product ?? { constant: [1, 0], factors: [] });
    // D6 declares both factors in [0, 2π), so both cuts run along direction 0 — and the ids must be
    // the ones `branchFactor.ts` gave the geometry, or `cutSegments` silently adds no reference ray
    // at all and the correction is measured from nowhere.
    expect([...reference.keys()].sort()).toEqual(["b1", "b2"]);
    expect(reference.get("b1")?.equals(Frac.ZERO)).toBe(true);
    expect(reference.get("b2")?.equals(Frac.ZERO)).toBe(true);
    expect((run.branch?.points ?? []).map((p) => p.id).sort()).toEqual(["b1", "b2"]);
  });

  it("D1's keyhole window [0, 2π) puts its cut along ℝ₊, not ℝ₋", () => {
    const { run } = branchRuns().find((r) => r.id === "mellin-keyhole") ?? { run: null };
    if (run === null) throw new Error("D1 should be offered");
    const factors = run.declared?.product.factors ?? [];
    expect(factors).toHaveLength(1);
    expect(factors[0].window.equals(Frac.ZERO)).toBe(true);
    expect(windowOrigin(factors[0])).toBe(0);
  });
});

describe("the emitted GLSL carries the record's declaration in the program text", () => {
  // Deliberately few, and none of them a substitute for compiling it (`test/declaredParity.browser
  // .test.ts` does that). These assert the one thing generated code exists to protect: a factor the
  // record wrote BACKWARDS must appear backwards, because `(b − z)^ν` and `−(z − b)^ν` are the same
  // number and not the same power — D7's trap, and a wrong uniform away if this were data.
  it("emits csub(b, z) for an orientation the record declared as b − z", () => {
    const { run } = branchRuns().find((r) => r.id === "dogbone-two-fractional-powers") ?? { run: null };
    if (run === null) throw new Error("D7 should be offered");
    const product = run.declared?.product;
    if (product === undefined) throw new Error("D7 declares a product");
    expect(product.factors.filter((f) => f.kind === "power" && f.sign === -1)).toHaveLength(1);
    const glsl = declaredProductGlsl(product);
    // One factor each way round, and the backwards one is a reversed subtraction rather than a
    // negation of the forward one.
    expect(glsl.match(/csub\(z, vec_/g) ?? []).toHaveLength(1);
    expect(glsl.match(/csub\(vec_\([^)]*\), z\)/g) ?? []).toHaveLength(1);
    expect(glsl).not.toContain("cneg");
  });

  it("emits an integer loop for log^m and never a complex power of a logarithm", () => {
    const { run } = branchRuns().find((r) => r.id === "log-squared-keyhole") ?? { run: null };
    if (run === null) throw new Error("D4 should be offered");
    const glsl = declaredProductGlsl(run.declared?.product ?? { constant: [1, 0], factors: [] });
    expect(glsl).toContain("clogCut");
    expect(glsl).toContain("i < 2;");
    // `cpow(l, m)` would introduce a second branch choice — of the logarithm OF the logarithm —
    // which no record ever made.
    expect(glsl).not.toContain("cpow");
  });

  it("emits nothing exotic for a one-factor power record", () => {
    const { run } = branchRuns().find((r) => r.id === "keyhole-x-to-the-n") ?? { run: null };
    if (run === null) throw new Error("D3 should be offered");
    const power = powerFactorOf(run.family, run.bindings);
    expect(power.ok).toBe(true);
    if (!power.ok) return;
    const glsl = declaredProductGlsl(power.declared);
    expect(glsl.match(/cpowCut/g) ?? []).toHaveLength(1);
    expect(glsl).toContain("cvec casDeclared(cvec z)");
  });
});
