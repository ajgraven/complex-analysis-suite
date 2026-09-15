// **THE SANDBOX REACHES AN EXACT ANSWER BY HAND** — M5.1b, and the end of PLAN §7's half-met clause.
//
// Before this the sandbox could declare branch points, exponents and cuts but not the
// FACTORISATION, and the consequence was bigger than it sounds: `findPoles` on `z^0.3/(1+z)` reports
// `rational: false` and ZERO poles, so `applyResidueTheorem` returns an estimate with no
// `exactValue` and the ledger fails at KILL. The sandbox did not compute a wrong answer for a
// multivalued integrand — it computed none. Which is why "dragging a cut across the contour changes
// the answer" was half delivered: there was no answer for it to be true of.
//
// The gate is this file's first claim, and it is deliberately the hardest one available: a
// declaration assembled here, from nothing but a keyhole template and five field values, must
// reproduce **D1's own closed form** — `π/sin(πα)`. Not "an exact value", not "a plausible number":
// the gallery record's, character for character, through the same engine the golden corpus runs. If
// the hand route and the record route can disagree, one of them is wrong and the app cannot say
// which.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { parse } from "@cas/expr";
import { runDeclared, type SandboxDeclaration } from "../src/engine/declaredRun.js";
import { keyholeTemplate } from "../src/engine/contour/templates.js";
import { buildDeclaration } from "../src/kernel/branch/declaration.js";
import { offeredFamilies, primaryGolden, runFamily } from "../src/families/runFamily.js";
import type { Contour } from "../src/engine/contour/model.js";
import type { BranchChoice } from "../src/kernel/branch/model.js";

const KEYHOLE = [Frac.ZERO, Frac.of(2n)] as const;

/**
 * D1 by hand: `∮ z^{α−1}/(1+z) dz` on a keyhole, `arg z ∈ [0, 2π)`.
 *
 * α = 3/10 is the record's primary fixture, so the factor's exponent is `α − 1 = −7/10`.
 */
function d1ByHand(alpha: Frac = Frac.of(3n, 10n)): {
  declaration: SandboxDeclaration;
  contour: Contour;
  branch: BranchChoice;
} {
  const declaration: SandboxDeclaration = {
    constant: [1, 0],
    pointId: "b",
    order: { kind: "power", alpha: alpha.sub(Frac.ONE), sign: 1 },
    window: KEYHOLE,
    cofactor: parse("1/(1+z)"),
  };
  // The cut system the window implies, which is also what the sandbox would start from.
  const built = buildDeclaration({
    constant: declaration.constant,
    at: 0,
    window: KEYHOLE,
    order: declaration.order,
  });
  if (!built.ok) throw new Error(built.reason);
  return { declaration, contour: keyholeTemplate(), branch: built.choice };
}

describe("the gate: a hand-built declaration reproduces D1's own closed form", () => {
  it("prints the record's `∮`, from a keyhole and five field values", () => {
    const { declaration, contour, branch } = d1ByHand();
    const r = runDeclared(declaration, contour, branch);
    if (!r.ok) throw new Error(r.reason);

    const d1 = offeredFamilies().tiers.flatMap((t) => t.families).find((f) => f.id === "mellin-keyhole");
    if (d1 === undefined) throw new Error("mellin-keyhole should be offered");
    const record = runFamily(d1, primaryGolden(d1));
    if (!record.ok) throw new Error(record.reason);

    // The SAME text, not merely the same number: the closed form is what the app shows, and two
    // routes that agreed numerically while printing different forms would still be a bug.
    expect(r.analysis.theorem.exactValue?.text).toBe(record.run.theorem.exactValue?.text);
    expect(r.analysis.theorem.exactValue?.text).toBe("2πi·e^(−7iπ/10)");
    expect(r.analysis.theorem.verdict.level).toBe("=");
    // And bit-identical numerically, because it is the same arithmetic on the same inputs.
    expect(r.analysis.theorem.exactValue?.value).toEqual(record.run.theorem.exactValue?.value);
  });

  it("and the quadrature corroborates it, in the declared determination", () => {
    // M5.0's machinery, now driven by hand rather than by a record: each lip sampled at the limit
    // from its own declared side, so the second opinion is of the same integral.
    const { declaration, contour, branch } = d1ByHand();
    const r = runDeclared(declaration, contour, branch);
    if (!r.ok) throw new Error(r.reason);
    expect(r.analysis.integral.quadratureSkipped).toBeUndefined();
    expect(r.analysis.theorem.agrees).toBe(true);
    const worst = Math.max(0, ...r.analysis.integral.pieces.map((p) => p.errorEstimate));
    expect(r.analysis.theorem.disagreement).toBeLessThan(2 * worst);
  });

  it("at a second exponent too, so the agreement is not one lucky fixture", () => {
    for (const alpha of [Frac.of(1n, 2n), Frac.of(2n, 3n), Frac.of(1n, 4n)]) {
      const { declaration, contour, branch } = d1ByHand(alpha);
      const r = runDeclared(declaration, contour, branch);
      if (!r.ok) throw new Error(r.reason);
      expect({ alpha: `${alpha.n}/${alpha.d}`, level: r.analysis.theorem.verdict.level }).toEqual({
        alpha: `${alpha.n}/${alpha.d}`,
        level: "=",
      });
      expect({ alpha: `${alpha.n}/${alpha.d}`, agrees: r.analysis.theorem.agrees }).toEqual({
        alpha: `${alpha.n}/${alpha.d}`,
        agrees: true,
      });
    }
  });
});

describe("what it is that the answer does NOT depend on", () => {
  it("the cut's drawn position — exactly, because nothing gave it to the residues", () => {
    // **M4.7d's invariance, now a fact about a number instead of a claim about nothing.** `∮` comes
    // from `2πi Σ n·Res` with residues read in the declared WINDOW, and `powerAtPole` takes no
    // geometry at all. So deforming the cut cannot move the value — not "to within tolerance", but
    // bit-for-bit — and that is a property of the call graph rather than of the arithmetic.
    const { declaration, contour, branch } = d1ByHand();
    const base = runDeclared(declaration, contour, branch);
    if (!base.ok) throw new Error(base.reason);

    // Swing the ray to a different direction, bend it, lengthen it — every deformation that keeps it
    // clear of the keyhole. The keyhole's contour lies on ℝ₊ near the cut, so these all go upward.
    const deformations: readonly { readonly label: string; readonly via: readonly [number, number][] }[] = [
      { label: "straight up", via: [[0, 1e4]] },
      { label: "up and to the left", via: [[-1e4, 1e4]] },
      { label: "bent, with an interior vertex", via: [[-2, 3], [-1e4, 1e4]] },
      { label: "a long way out", via: [[-1e6, 1e6]] },
    ];
    for (const { label, via } of deformations) {
      const moved: BranchChoice = {
        ...branch,
        cuts: branch.cuts.map((c) => ({ ...c, via: via.map((v) => [v[0], v[1]] as const) })),
      };
      const r = runDeclared(declaration, contour, moved);
      if (!r.ok) throw new Error(`${label}: ${r.reason}`);
      expect({ label, text: r.analysis.theorem.exactValue?.text }).toEqual({
        label,
        text: base.analysis.theorem.exactValue?.text,
      });
      expect({ label, value: r.analysis.theorem.exactValue?.value }).toEqual({
        label,
        value: base.analysis.theorem.exactValue?.value,
      });
    }
  });
});

describe("what MOVES the answer, and what cannot — north-star #3, honestly", () => {
  // **THE PLAN'S GATE WORDING IS WRONG, AND M4.7d'S OWN RESULT IS WHY.** `M5-plan.md` asks for
  // "drag it across the contour, the answer jumps by the monodromy factor". That cannot happen.
  // `∮` comes from `2πi Σ n·Res` with residues read in the declared WINDOW, and `powerAtPole` takes
  // no geometry at all — so no deformation of the cut, crossing or not, can move the value. What
  // crossing does is make the argument ILLEGAL, and LEGALITY says so and names the factor.
  //
  // The jump is real, but it belongs to the DETERMINATION: change the window and the pole's argument
  // changes by a full turn, so its residue changes by exactly `e^{∓2πiJ}`. That is D1's
  // `wrong-branch` trap, and M5.1 is what makes it reachable by hand.
  //
  // Both halves are asserted here rather than reconciled in prose, because a gate that cannot be met
  // as written should be corrected in the open.
  it("crossing the contour WITHHOLDS the value and names the crossing — it does not move it", () => {
    const { declaration, contour, branch } = d1ByHand();
    const base = runDeclared(declaration, contour, branch);
    // The ray swung into the lower half-plane now crosses the outer circle and the lower lip.
    const crossing: BranchChoice = {
      ...branch,
      cuts: branch.cuts.map((c) => ({ ...c, via: [[1e4, -1e4] as const] })),
    };
    const r = runDeclared(declaration, contour, crossing);
    if (!base.ok || !r.ok) throw new Error("both should run");

    // The value the residue theorem computes is IDENTICAL — it never saw the cut.
    expect(r.analysis.theorem.exactValue?.text).toBe(base.analysis.theorem.exactValue?.text);
    // But the argument no longer closes, and the failure is LEGALITY naming the piece and the cut.
    expect(base.analysis.ledger.failedAt).toBeNull();
    expect(r.analysis.ledger.failedAt).toBe("LEGALITY");
    const failed = r.analysis.ledger.rows.filter((x) => x.constraint === "LEGALITY" && x.status === "failed");
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.map((x) => x.claim).join(" ")).toMatch(/crosses the cut/);
    expect(failed.map((x) => x.claim).join(" ")).toMatch(/with no side assigned/);
  });

  it("changing the DETERMINATION jumps the answer by exactly the monodromy factor", () => {
    const alpha = Frac.of(3n, 10n);
    const { declaration, contour, branch } = d1ByHand(alpha);
    const keyhole = runDeclared(declaration, contour, branch);

    // The same integrand read in the principal determination instead. The cut swings from ℝ₊ to ℝ₋,
    // so the pole at `z = −1` sits on the other edge of the window and its argument moves a turn.
    const principalWindow = [Frac.of(-1n), Frac.ONE] as const;
    const shifted = buildDeclaration({
      constant: [1, 0],
      at: 0,
      window: principalWindow,
      order: declaration.order,
    });
    if (!shifted.ok) throw new Error(shifted.reason);
    const principal = runDeclared({ ...declaration, window: principalWindow }, contour, shifted.choice);
    if (!keyhole.ok || !principal.ok) throw new Error("both should run");

    const a = keyhole.analysis.theorem.exactValue?.value;
    const b = principal.analysis.theorem.exactValue?.value;
    if (a === undefined || b === undefined) throw new Error("both should have a value");
    // It MOVED, which is the half that could not be shown before M5.1 because there was no value.
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(1);

    // And it moved by exactly `e^{−2πiJ}` with `J = α − 1 = −7/10` the factor's own exponent — the
    // number the app already prints on the cut. `ratio = b/a`.
    const den = a[0] * a[0] + a[1] * a[1];
    const ratio = [(b[0] * a[0] + b[1] * a[1]) / den, (b[1] * a[0] - b[0] * a[1]) / den] as const;
    const j = alpha.sub(Frac.ONE).toNumber();
    const want = [Math.cos(-2 * Math.PI * j), Math.sin(-2 * Math.PI * j)] as const;
    expect(ratio[0]).toBeCloseTo(want[0], 12);
    expect(ratio[1]).toBeCloseTo(want[1], 12);
    // Unimodular, because a power's monodromy multiplies by a phase.
    expect(Math.hypot(ratio[0], ratio[1])).toBeCloseTo(1, 12);
  });

  it("and the principal reading is REFUSED on a keyhole, which is D1's whole trap", () => {
    // The jump is not a second correct answer. Swinging the cut onto ℝ₋ puts it under the outer
    // circle, so LEGALITY catches the untagged crossing — the record's `wrong-branch` trap, now
    // reachable by changing one field rather than by editing a record.
    const principalWindow = [Frac.of(-1n), Frac.ONE] as const;
    const { declaration, contour } = d1ByHand();
    const shifted = buildDeclaration({ constant: [1, 0], at: 0, window: principalWindow, order: declaration.order });
    if (!shifted.ok) throw new Error(shifted.reason);
    const r = runDeclared({ ...declaration, window: principalWindow }, contour, shifted.choice);
    if (!r.ok) throw new Error(r.reason);
    expect(r.analysis.ledger.failedAt).toBe("LEGALITY");
    expect(r.analysis.theorem.verdict.level).not.toBe("=");
  });

  it("a determination that disagrees with the contour's own lips shows up as a disagreement", () => {
    // The subtlest case, and the app catches it without being told to look for it. Declare the
    // principal determination but leave the cut on ℝ₊: LEGALITY passes, because nothing crosses ℝ₋.
    // Yet in that determination ℝ₊ is interior, so the keyhole's two lips carry the SAME value and
    // cancel — the quadrature integrates a continuous function while the residues are read a turn
    // away. The two routes then disagree, and the verdict drops rather than printing an exact value
    // beside a second opinion that denies it.
    const principalWindow = [Frac.of(-1n), Frac.ONE] as const;
    const { declaration, contour, branch } = d1ByHand();
    const r = runDeclared({ ...declaration, window: principalWindow }, contour, branch);
    if (!r.ok) throw new Error(r.reason);
    expect(r.analysis.ledger.failedAt).toBeNull();
    expect(r.analysis.theorem.agrees).toBe(false);
    expect(r.analysis.theorem.verdict.level).toBe("⚠");
    expect(r.analysis.theorem.crossCheck).toBeUndefined();
  });
});

describe("the refusals are decided rather than discovered downstream", () => {
  it("a factor declared on a point that is not there", () => {
    const { declaration, contour, branch } = d1ByHand();
    const r = runDeclared({ ...declaration, pointId: "nope" }, contour, branch);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/no branch point 'nope'/);
  });

  it("a factor on a point OFF THE REAL AXIS, which the single-factor engine cannot read", () => {
    const { declaration, contour, branch } = d1ByHand();
    const offAxis: BranchChoice = {
      ...branch,
      points: branch.points.map((p) => ({ ...p, at: [0, 1.5] as const })),
    };
    const r = runDeclared(declaration, contour, offAxis);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/off the real axis/);
    expect(r.reason).toMatch(/multi-point/);
  });

  it("a factor away from the origin, refused by the builder with its arithmetic named", () => {
    const { declaration, contour, branch } = d1ByHand();
    const shifted: BranchChoice = {
      ...branch,
      points: branch.points.map((p) => ({ ...p, at: [2, 0] as const })),
    };
    const r = runDeclared(declaration, contour, shifted);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/ORIGIN/);
  });

  it("a cofactor that is not rational gets no exact value, and says so rather than guessing", () => {
    // The branch factor being declared does not make the COFACTOR exact. `sin(z)/z` is not a
    // rational function, so its residues are not decidable and the theorem must not pretend.
    const { declaration, contour, branch } = d1ByHand();
    const r = runDeclared({ ...declaration, cofactor: parse("sin(z)/(1+z)") }, contour, branch);
    if (!r.ok) throw new Error(r.reason);
    expect(r.analysis.theorem.exactValue).toBeUndefined();
    expect(r.analysis.theorem.verdict.level).not.toBe("=");
  });
});

describe("M5.0's one surviving skip, now reachable BY HAND for the first time", () => {
  // A side pins no limit where the cut runs VERTICALLY through the piece: "above" displaces along
  // the cut rather than across it, `arg` does not move, and whichever limit `atan2` returns would
  // be taken — wrong half the time, silently. M5.0 established that and tested `sideResolves`
  // directly, but no record is in that shape, so the SKIP it produces had never been exercised
  // end to end. A hand-built declaration can be in that shape, which is why a sweep found this:
  // dropping the check, and dropping its effect on the budget, both survived.
  const verticalCase = () => {
    // Window `[π/2, 5π/2)` puts the cut straight UP from the origin.
    const window = [Frac.of(1n, 2n), Frac.of(5n, 2n)] as const;
    const order = { kind: "power" as const, alpha: Frac.of(-1n, 2n), sign: 1 as const };
    const built = buildDeclaration({ constant: [1, 0], at: 0, window, order });
    if (!built.ok) throw new Error(built.reason);
    // One piece running up the imaginary axis — along that cut — declaring a side it cannot have.
    const contour: Contour = {
      params: {},
      pieces: [
        {
          id: "up",
          name: "the ray up the imaginary axis",
          role: "free",
          colour: 0,
          side: "above",
          geom: { kind: "segment", from: { x: 0, y: 0.2 }, to: { x: 0, y: 3 } },
        },
      ],
    };
    return {
      declaration: {
        constant: [1, 0] as const,
        pointId: "b",
        order,
        window,
        cofactor: parse("1/(1+z)"),
      },
      contour,
      branch: built.choice,
    };
  };

  it("skips the quadrature and names the vertical cut rather than tossing a coin", () => {
    const { declaration, contour, branch } = verticalCase();
    const r = runDeclared(declaration, contour, branch);
    if (!r.ok) throw new Error(r.reason);
    expect(r.analysis.integral.quadratureSkipped).toBeDefined();
    expect(r.analysis.integral.quadratureSkipped).toMatch(/vertical/);
    expect(r.analysis.integral.quadratureSkipped).toMatch(/coin toss/);
    // The piece is named, so the reader knows which one to move.
    expect(r.analysis.integral.quadratureSkipped).toMatch(/the ray up the imaginary axis/);
    // And no corroboration is invented for a quadrature that never ran.
    expect(r.analysis.theorem.agrees).toBeUndefined();
    expect(r.analysis.theorem.crossCheck).toBeUndefined();
  });

  it("but the same piece off that cut resolves, so the skip is narrow rather than blanket", () => {
    // Window `[0, 2π)` cuts along ℝ₊ instead, and a piece on the imaginary axis is then simply
    // clear of it — there is no side to pin and none is asked for.
    const { declaration, contour } = verticalCase();
    const window = [Frac.ZERO, Frac.of(2n)] as const;
    const built = buildDeclaration({ constant: [1, 0], at: 0, window, order: declaration.order });
    if (!built.ok) throw new Error(built.reason);
    const r = runDeclared({ ...declaration, window }, contour, built.choice);
    if (!r.ok) throw new Error(r.reason);
    expect(r.analysis.integral.quadratureSkipped).toBeUndefined();
  });
});

describe("the assembled integrand is shown, because the box now holds only R(z)", () => {
  it("reads back as the whole integrand, sign and exponent included", () => {
    const { declaration, contour, branch } = d1ByHand();
    const r = runDeclared(declaration, contour, branch);
    if (!r.ok) throw new Error(r.reason);
    // Built from AST nodes rather than by parsing an assembled string, so a cofactor needing
    // parentheses cannot be re-parsed into a different expression than the engine used.
    expect(r.ast.kind).toBe("arith");
    const shown = JSON.stringify(r.ast);
    expect(shown).toContain('"op":"^"');
    expect(shown).toContain('"name":"z"');
    // `sign: +1` here, so the base is `z` and NOT negated.
    expect(shown).not.toContain('"kind":"neg"');
  });

  it("and `(b − z)` shows as a NEGATED base, because it is not the same power as `(z − b)`", () => {
    // D7's trap in the assembled form: `(b − z)` and `−(z − b)` are the same number and not the
    // same power, so a reader checking the split has to be able to see which one was declared.
    // A sweep dropped the negation and nothing noticed until this assertion existed.
    const { contour, branch } = d1ByHand();
    const r = runDeclared(
      {
        constant: [1, 0],
        pointId: "b",
        order: { kind: "power", alpha: Frac.of(1n, 2n), sign: -1 },
        window: KEYHOLE,
        cofactor: parse("1/(1+z)"),
      },
      contour,
      branch,
    );
    if (!r.ok) throw new Error(r.reason);
    expect(JSON.stringify(r.ast)).toContain('"kind":"neg"');
    const only = r.declared.factors[0];
    if (only.kind !== "power") throw new Error("unreachable");
    expect(only.sign).toBe(-1);
  });

  it("a log declaration assembles log^m and not exp(m·log(log z))", () => {
    const { contour, branch } = d1ByHand();
    const r = runDeclared(
      {
        constant: [1, 0],
        pointId: "b",
        order: { kind: "log", power: 2 },
        window: KEYHOLE,
        cofactor: parse("1/(1+z^2)^2"),
      },
      contour,
      branch,
    );
    if (!r.ok) throw new Error(r.reason);
    expect(JSON.stringify(r.ast)).toContain('"name":"log"');
    expect(r.analysis.theorem.exactValue?.text).toBeDefined();
  });

  it("a complex constant survives into the assembled form", () => {
    const { contour, branch } = d1ByHand();
    const r = runDeclared(
      {
        constant: [0, 1],
        pointId: "b",
        order: { kind: "power", alpha: Frac.of(-1n, 2n), sign: 1 },
        window: KEYHOLE,
        cofactor: parse("1/(1+z)"),
      },
      contour,
      branch,
    );
    if (!r.ok) throw new Error(r.reason);
    expect(JSON.stringify(r.ast)).toContain('"name":"i"');
    expect(r.declared.constant).toEqual([0, 1]);
  });
});
