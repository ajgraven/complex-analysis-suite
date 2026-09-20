// **THE SHARED DECLARATION BUILDER** — `kernel/branch/declaration.ts`, extracted in M5.1a.
//
// One branch factor becomes three things: the `PowerFactor`/`LogFactor` the residue reader consumes,
// the `BranchChoice` the ledger and the picture read, and the `DeclaredProduct` both backends
// evaluate. Records have built those since M4.2; the sandbox is the second consumer (ADR-0007), and
// building them twice is how the two silently drift — each side self-consistent, neither the other.
//
// Two kinds of claim here. First, **the extraction changed nothing**: the record path's outputs are
// pinned field by field, so a future edit to the shared builder cannot quietly move a gallery
// record's answer. (The extraction itself was checked differently and more strongly — all seven
// records' full declarations were dumped before and after and diffed byte for byte, 859 lines
// identical. A diff proves the step; these assertions keep it proven.)
//
// Second, **the invariants the consuming engines assumed and could not state.** A window one turn
// wide is `PowerFactor.argRange`'s own documented contract and nothing checked it.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { buildDeclaration, SINGLE_POINT_ID } from "../src/kernel/branch/declaration.js";
import { INFINITY } from "../src/kernel/branch/model.js";
import { logFactorOf, powerFactorOf } from "../src/families/branchFactor.js";
import { offeredFamilies, primaryGolden, runFamily } from "../src/families/runFamily.js";
import type { Family } from "../src/families/schema.js";

const KEYHOLE_WINDOW = [Frac.ZERO, Frac.of(2n)] as const;
const PRINCIPAL_WINDOW = [Frac.of(-1n), Frac.ONE] as const;

const family = (id: string): Family => {
  const f = offeredFamilies().tiers.flatMap((t) => t.families).find((x) => x.id === id);
  if (f === undefined) throw new Error(`${id} should be offered`);
  return f;
};
const bindingsOf = (id: string) => {
  const r = runFamily(family(id), primaryGolden(family(id)));
  if (!r.ok) throw new Error(r.reason);
  return r.run.bindings;
};

describe("the record path's outputs, pinned field by field", () => {
  it("D1's power factor — exponent, window, cut direction, shared id", () => {
    const r = powerFactorOf(family("mellin-keyhole"), bindingsOf("mellin-keyhole"));
    if (!r.ok) throw new Error(r.reason);
    // α = 3/10 at the primary fixture, and the integrand is `x^{α−1}` — so the FACTOR's exponent is
    // `α − 1 = −7/10`, which is also the jump weight `J` the app prints on the cut. The two are the
    // same number and it is worth asserting the one the engine uses.
    expect(r.factor.alpha.sub(Frac.of(-7n, 10n)).isZero()).toBe(true);
    expect(r.factor.argRange[0].isZero()).toBe(true);
    expect(r.factor.argRange[1].equals(Frac.of(2n))).toBe(true);
    // The window's lower edge is `0`, so the determination is `[0, 2π)` and the cut runs along ℝ₊.
    expect(r.choice.convention).toBe("zeroToTwoPi");
    expect(r.choice.points.map((p) => p.id)).toEqual([SINGLE_POINT_ID]);
    expect(r.choice.points[0].at).toEqual([0, 0]);
    expect(r.choice.cuts).toHaveLength(1);
    expect(r.choice.cuts[0].from).toBe(SINGLE_POINT_ID);
    expect(r.choice.cuts[0].to).toBe(INFINITY);
    // Along ℝ₊: the ray's control vertex is far out with a vanishing imaginary part.
    expect(r.choice.cuts[0].via[0][0]).toBeGreaterThan(1e3);
    expect(Math.abs(r.choice.cuts[0].via[0][1])).toBeLessThan(1e-9);
    // The declared product and the geometry name the same point. **M5.0's review found this bug the
    // other way round** — `declaredReference` keyed its map `b1, b2, …` while the single-point
    // records are named `"b"`, so `cutSegments` found no reference ray and the correction silently
    // became `m_Γ` instead of `m_Γ − m_ref` for five of the seven records. One id, one source.
    expect(r.declared.factors.map((f) => f.id)).toEqual([SINGLE_POINT_ID]);
  });

  it("D4's log factor — multiplicity 2, same cut, and no exponent", () => {
    const r = logFactorOf(family("log-squared-keyhole"), bindingsOf("log-squared-keyhole"));
    if (!r.ok) throw new Error(r.reason);
    expect(r.factor.power).toBe(2);
    expect(r.choice.convention).toBe("zeroToTwoPi");
    expect(r.choice.points[0].order.kind).toBe("log");
    const only = r.declared.factors[0];
    expect(only.kind).toBe("log");
    if (only.kind !== "log") throw new Error("unreachable");
    expect(only.power).toBe(2);
  });

  it("D5's is the same cut system with multiplicity 3 — which is why they can share it", () => {
    // `BranchPoint.order` for a log carries NO multiplicity, because admissibility only asks that
    // the monodromy have infinite order. `DeclaredOrder` does, because `log³` and `log²` are
    // different integrands. Keeping the two apart is exactly what lets D5 borrow D4's verdict.
    const four = logFactorOf(family("log-squared-keyhole"), bindingsOf("log-squared-keyhole"));
    const five = logFactorOf(family("log-cubed-keyhole"), bindingsOf("log-cubed-keyhole"));
    if (!four.ok || !five.ok) throw new Error("both should build");
    expect(four.factor.power).toBe(2);
    expect(five.factor.power).toBe(3);
    expect(five.choice.points[0].order).toEqual(four.choice.points[0].order);
    expect(five.choice.convention).toBe(four.choice.convention);
  });

  it("every record that declares a single factor still builds one", () => {
    const built: string[] = [];
    for (const fam of offeredFamilies().tiers.flatMap((t) => t.families)) {
      const r = runFamily(fam, primaryGolden(fam));
      if (!r.ok) continue;
      const p = powerFactorOf(fam, r.run.bindings);
      const l = logFactorOf(fam, r.run.bindings);
      if (p.ok || l.ok) built.push(fam.id);
    }
    // D1, D2, D3 are powers; D4, D5 are logs. D6 and D7 are MULTI-point and deliberately take a
    // different builder — see `kernel/branch/declaration.ts`'s header for why it is not extracted.
    expect(built).toEqual([
      "mellin-keyhole",
      "keyhole-two-poles",
      "keyhole-x-to-the-n",
      "log-squared-keyhole",
      "log-cubed-keyhole",
    ]);
  });
});

describe("a window is exactly one turn wide, and nothing checked that before", () => {
  it("accepts the two the corpus uses", () => {
    for (const window of [KEYHOLE_WINDOW, PRINCIPAL_WINDOW]) {
      const r = buildDeclaration({
        constant: [1, 0],
        at: 0,
        window,
        order: { kind: "power", alpha: Frac.of(1n, 2n), sign: 1 },
      });
      expect({ window: `${window[0].n}/${window[0].d}`, ok: r.ok }).toEqual({
        window: `${window[0].n}/${window[0].d}`,
        ok: true,
      });
    }
  });

  it.each([
    ["half a turn", Frac.ZERO, Frac.ONE],
    ["two turns", Frac.ZERO, Frac.of(4n)],
    ["nothing at all", Frac.ZERO, Frac.ZERO],
  ])("refuses %s, and says which", (_label, lo, hi) => {
    const r = buildDeclaration({
      constant: [1, 0],
      at: 0,
      window: [lo, hi],
      order: { kind: "power", alpha: Frac.of(1n, 2n), sign: 1 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    // Not merely "invalid": a half-turn window leaves part of the plane undetermined and a
    // two-turn one covers part of it twice, and `argumentOfPole` would answer for one and refuse
    // the other — which reads as a residue bug rather than a declaration bug.
    expect(r.reason).toMatch(/exactly one turn/);
    expect(r.reason).toMatch(/undetermined|twice/);
  });
});

describe("a log's multiplicity is a count", () => {
  it.each([0, -1, 1.5])("refuses log^%s", (power) => {
    const r = buildDeclaration({ constant: [1, 0], at: 0, window: KEYHOLE_WINDOW, order: { kind: "log", power } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/positive integer/);
  });

  it("accepts log^1, which is a plain logarithm and not a special case", () => {
    const r = buildDeclaration({ constant: [1, 0], at: 0, window: KEYHOLE_WINDOW, order: { kind: "log", power: 1 } });
    expect(r.ok).toBe(true);
  });
});

describe("declaring the determination IS declaring the cut", () => {
  it("[0, 2π) cuts along ℝ₊ and (−π, π] cuts along ℝ₋ — D1's trap, structurally", () => {
    const keyhole = buildDeclaration({
      constant: [1, 0],
      at: 0,
      window: KEYHOLE_WINDOW,
      order: { kind: "power", alpha: Frac.of(1n, 2n), sign: 1 },
    });
    const principal = buildDeclaration({
      constant: [1, 0],
      at: 0,
      window: PRINCIPAL_WINDOW,
      order: { kind: "power", alpha: Frac.of(1n, 2n), sign: 1 },
    });
    if (!keyhole.ok || !principal.ok) throw new Error("both should build");
    // The cut lies along the window's LOWER boundary, because that is where the determination jumps.
    // So asking for the principal determination swings the cut from ℝ₊ to ℝ₋ — under a keyhole
    // contour — and LEGALITY catches it without being told to look. Nothing states the position
    // twice, which is what makes the trap structural rather than detected.
    expect(keyhole.choice.cuts[0].via[0][0]).toBeGreaterThan(1e3);
    expect(principal.choice.cuts[0].via[0][0]).toBeLessThan(-1e3);
    expect(keyhole.choice.convention).toBe("zeroToTwoPi");
    expect(principal.choice.convention).toBe("principal");
  });

  it("a window that is neither is labelled custom rather than guessed at", () => {
    const r = buildDeclaration({
      constant: [1, 0],
      at: 0,
      window: [Frac.of(1n, 2n), Frac.of(5n, 2n)],
      order: { kind: "power", alpha: Frac.of(1n, 3n), sign: 1 },
    });
    if (!r.ok) throw new Error(r.reason);
    expect(r.choice.convention).toBe("custom");
    // Cut along `arg = π/2`: straight up.
    expect(Math.abs(r.choice.cuts[0].via[0][0])).toBeLessThan(1e-9);
    expect(r.choice.cuts[0].via[0][1]).toBeGreaterThan(1e3);
  });
});

describe("a single factor lives at the ORIGIN, and saying so closes a silent wrong answer", () => {
  // A mutation sweep found this: pinning the geometry's point to `[0,0]` regardless of what was
  // declared killed nothing, because every single-factor record declares `at: "0"`. The position was
  // carried and never exercised — and it is not merely untested, it is wrong.
  it.each([1, -1, 0.5, 2])("refuses a factor declared at z = %s, and says why", (at) => {
    const r = buildDeclaration({
      constant: [1, 0],
      at,
      window: KEYHOLE_WINDOW,
      order: { kind: "power", alpha: Frac.of(1n, 2n), sign: 1 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    // The reason names the arithmetic rather than the rule: `branchResidue` computes
    // `Res(z^α·R, z₀) = z₀^α·Res(R, z₀)` — literally `z^α`, about the origin — and a `PowerFactor`
    // has nowhere to put `b`, so an off-origin factor would need `(z₀ − b)^α` and would silently get
    // `z₀^α` instead. The cut would be drawn in exactly the right place while the residue was read
    // about the wrong point.
    // Lower case: this sentence is a reader's, and `kernelWords.test.ts` now sweeps it.
    expect(r.reason).toMatch(/about the origin/);
    expect(r.reason).toMatch(/z₀\^α/);
    expect(r.reason).toMatch(/multi-point/);
  });

  it("a log factor is refused off the origin for the same reason", () => {
    const r = buildDeclaration({ constant: [1, 0], at: 3, window: KEYHOLE_WINDOW, order: { kind: "log", power: 2 } });
    expect(r.ok).toBe(false);
  });

  it("and the origin itself is accepted, which is where the whole corpus sits", () => {
    for (const id of ["mellin-keyhole", "keyhole-two-poles", "keyhole-x-to-the-n"]) {
      const r = powerFactorOf(family(id), bindingsOf(id));
      expect({ id, ok: r.ok }).toEqual({ id, ok: true });
      if (!r.ok) continue;
      expect(r.choice.points[0].at).toEqual([0, 0]);
    }
  });
});

describe("the orientation and the constant are carried, not normalised away", () => {
  it("(b − z) is the same NUMBER as −(z − b) and not the same power", () => {
    // D7's trap, and the reason `sign` exists at all: at `z = c > b` approached from above,
    // `arg(b − z) = −π` and not `+π`, and using `+π` rotates the residue by `e^{iπ/2}` while
    // leaving the final answer real and plausible.
    for (const sign of [1, -1] as const) {
      // At the origin, where the builder allows a factor: `sign: -1` reads `(0 − z)^α = (−z)^α`,
      // which is still a different power from `z^α` and still a declaration a reader can make.
      const r = buildDeclaration({
        constant: [1, 0],
        at: 0,
        window: PRINCIPAL_WINDOW,
        order: { kind: "power", alpha: Frac.of(3n, 4n), sign },
      });
      if (!r.ok) throw new Error(r.reason);
      const only = r.declared.factors[0];
      if (only.kind !== "power") throw new Error("unreachable");
      expect({ sign, got: only.sign }).toEqual({ sign, got: sign });
    }
  });

  it("and the RECORD path passes its declared orientation through — untested until a sweep asked", () => {
    // The builder handles both signs (asserted above), but the one line that maps a record's
    // `orientation` onto them was never exercised for `b-minus-z`: the only record that declares it
    // is D7, which takes the multi-point builder instead. So a sweep that dropped the mapping
    // survived. Overriding a real record's orientation exercises exactly that line, without
    // inventing a gallery entry that no integral needs.
    const base = family("mellin-keyhole");
    const branch = base.branch;
    if (branch === undefined) throw new Error("D1 declares a branch");
    const flipped: Family = {
      ...base,
      branch: { ...branch, factors: branch.factors.map((f) => ({ ...f, orientation: "b-minus-z" as const })) },
    };
    const asWritten = powerFactorOf(base, bindingsOf("mellin-keyhole"));
    const asFlipped = powerFactorOf(flipped, bindingsOf("mellin-keyhole"));
    if (!asWritten.ok || !asFlipped.ok) throw new Error("both should build");
    const signOf = (r: typeof asWritten): number => {
      const only = r.declared.factors[0];
      if (only.kind !== "power") throw new Error("unreachable");
      return only.sign;
    };
    expect(signOf(asWritten)).toBe(1);
    expect(signOf(asFlipped)).toBe(-1);
  });

  it("a complex constant reaches the declared product intact", () => {
    // D6's leading `i` is load-bearing: its residues ADD where the symmetry reflex would cancel
    // them and return 0. A builder that dropped the constant would return a plausible zero.
    const r = buildDeclaration({
      constant: [0, 1],
      at: 0,
      window: KEYHOLE_WINDOW,
      order: { kind: "power", alpha: Frac.of(-1n, 2n), sign: 1 },
    });
    if (!r.ok) throw new Error(r.reason);
    expect(r.declared.constant).toEqual([0, 1]);
  });
});
