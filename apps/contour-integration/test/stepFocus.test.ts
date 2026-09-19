// **The step, as things on the plane** — M8 step 3.1c.
//
// The plan's gate is *stepping through A6, B1, C1, D1 and G1 highlights the right object at every
// step*, so those five are named and walked end to end; the rest is the whole corpus, because the
// three findings this module is built around were corpus measurements and an invariant about five
// records would not have found any of them.
//
// What is asserted is what the STAGE would draw, not what the module returns in the abstract: a
// piece INDEX resolves against the drawn piece list, a pole is compared by value against a marker
// the pole report carries, and a callout's text is a fragment of a line the ledger minted.
import { describe, expect, it } from "vitest";

import { buildDerivation, type Derivation } from "../src/engine/derivation.js";
import { buildSteps, type DerivationStep } from "../src/engine/steps.js";
import { firstFormula, stageFocus, NO_FOCUS } from "../src/shell/stepFocus.js";
import { argumentOf, stepIndex } from "../src/shell/argument.js";
import { handlesOf, type Handle } from "../src/engine/contour/edit.js";
import { resolveAll, type Params, type Piece } from "../src/engine/contour/model.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { compile, defaultState, resolveState } from "../src/shell/state.js";
import { loadFamilies } from "../src/families/index.js";
import type { Resolved } from "../src/kernel/geom.js";

/** The gate's five, by record id: A6, B1, C1, D1, G1. */
const GATE = {
  A6: "semicircle-quartic",
  B1: "jordan-cosine-kernel",
  C1: "indented-sinc",
  D1: "mellin-keyhole",
  G1: "series-cot-collision",
} as const;

interface Ran {
  readonly id: string;
  readonly derivation: Derivation;
  readonly steps: readonly DerivationStep[];
  readonly pieces: readonly Piece[];
  readonly resolved: readonly Resolved[];
  readonly handles: readonly Handle[];
  readonly params: Params;
  readonly poleCount: number;
}

/** Every record at fixture 0, through the same path the stage takes. */
function runAll(fixture = 0): Ran[] {
  const base = defaultState(circleTemplate([0, 0], 1.5));
  const out: Ran[] = [];
  for (const id of [...loadFamilies().families.keys()]) {
    const state = { ...base, mode: "gallery" as const, record: id, fixture };
    const r = resolveState(state, compile(state.expr));
    if (r.kind !== "gallery" || r.run === null) continue;
    const spec = r.run.contour.pieces;
    const derivation = buildDerivation({
      ledger: r.run.ledger,
      poles: r.run.poles,
      integral: r.run.integral,
      theorem: r.run.theorem,
      spec,
      statements: [{ label: "the integral", text: `the record ${id}` }],
      ...(r.solved === null ? {} : { solved: r.solved }),
    });
    const resolved = resolveAll(r.run.contour);
    out.push({
      id,
      derivation,
      steps: buildSteps(derivation, { spec, params: r.run.contour.params }),
      pieces: spec,
      resolved,
      handles: handlesOf(r.run.contour, resolved),
      params: r.run.contour.params,
      poleCount: r.run.poles.poles.length,
    });
  }
  return out;
}

const RAN = runAll();
const byId = (id: string): Ran => {
  const found = RAN.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no record ${id}`);
  return found;
};
const focusAt = (r: Ran, k: number) =>
  stageFocus({
    step: r.steps[k] as DerivationStep,
    derivation: r.derivation,
    pieces: r.pieces,
    resolved: r.resolved,
    handles: r.handles,
  });

describe("what a derivation step puts on the plane", () => {
  it("runs every record, so the sweeps below are about all of them", () => {
    expect(RAN.length).toBe(28);
  });

  // ── the plan's gate ───────────────────────────────────────────────────────────────────────

  it("highlights the right object at every step of A6, B1, C1, D1 and G1", () => {
    for (const [tier, id] of Object.entries(GATE)) {
      const r = byId(id);
      expect(r.steps.length, `${tier}: no steps`).toBeGreaterThan(4);
      for (const [k, step] of r.steps.entries()) {
        const f = focusAt(r, k);
        const where = `${tier}/${step.id}`;
        // Every index names a piece that is actually drawn.
        for (const i of f.pieces) expect(r.pieces[i], where).toBeDefined();
        switch (step.kind) {
          case "boundary":
            // The boundary step is about ONE piece, and it is the piece the step names.
            expect(f.pieces.length, where).toBe(1);
            expect(r.pieces[f.pieces[0] as number]?.id, where).toBe(step.focus.pieceId);
            expect(f.pole, where).toBeNull();
            break;
          case "residues":
            // A per-pole step rings its pole; the sum step (no `poleIndex`) rings none.
            if (step.focus.poleIndex === undefined) expect(f.pole, where).toBeNull();
            else expect(f.pole, where).toEqual(step.poles[0]?.at);
            expect(f.pieces, where).toEqual([]);
            break;
          case "target":
            // Every focused piece is a TARGET piece — which is two of them for C1.
            expect(f.pieces.length > 0 || step.focus.pieceId === undefined, where).toBe(true);
            for (const i of f.pieces) expect(r.pieces[i]?.role, where).toBe("target");
            break;
          default:
            // The problem, the hypotheses, the limits and the conclusion are about the argument
            // rather than about one object, so they emphasise nothing and dim nothing.
            if (step.kind !== "limit") expect(f.pieces, where).toEqual([]);
        }
      }
    }
  });

  it("is C1 that makes the union necessary: BOTH halves of the target are emphasised", () => {
    // The finding this module is built around. `buildSteps` fills the target step's focus with
    // `[...targetIds][0]`, so the single id alone would dim the right half of the real axis —
    // which is the target too, and whose own line is on the same step.
    const c1 = byId(GATE.C1);
    const k = c1.steps.findIndex((s) => s.kind === "target");
    const f = focusAt(c1, k);
    const named = f.pieces.map((i) => c1.pieces[i]?.id);
    expect(named.sort()).toEqual(["left", "right"]);
    expect((c1.steps[k] as DerivationStep).focus.pieceId, "the engine still names one").toBe("left");

    // And the widening is exactly this shape and no other: over the whole corpus it touches the
    // two records that split the real axis at an indentation, and nothing else.
    const widened: string[] = [];
    for (const r of RAN) {
      for (const [k2, step] of r.steps.entries()) {
        const one = step.focus.pieceId === undefined ? 0 : 1;
        if (focusAt(r, k2).pieces.length > one) widened.push(`${r.id}/${step.id}`);
      }
    }
    expect(widened.sort()).toEqual(["indented-sinc/target", "pv-sine-over-x-times-quadratic/target"]);
  });

  // ── the three measurements ────────────────────────────────────────────────────────────────

  it("puts a bound on 54 of the corpus's 57 boundary steps, and nothing on the other three", () => {
    const withCallout: string[] = [];
    const without: string[] = [];
    for (const r of RAN) {
      for (const [k, step] of r.steps.entries()) {
        if (step.kind !== "boundary") continue;
        const f = focusAt(r, k);
        (f.callouts.length === 1 ? withCallout : without).push(`${r.id}/${step.focus.pieceId ?? "?"}`);
      }
    }
    expect(withCallout.length + without.length, "the boundary-step count moved").toBe(57);
    expect(withCallout.length).toBe(54);
    // **The three are the pieces that REPRODUCE the target rather than vanishing.** Their line is
    // *the lower edge of the cut: a constant multiple of the target* — a sentence with no formula
    // in it, because there is no number to show. A chip there would have to invent one.
    expect(without.sort()).toEqual([
      "dogbone-inverse-sqrt/bottom",
      "keyhole-x-to-the-n/lower",
      "mellin-keyhole/lower",
    ]);
  });

  it("pulses a limit step's handle where there is one, and says nothing where there is not", () => {
    const pulsed: string[] = [];
    const silent: string[] = [];
    for (const r of RAN) {
      for (const [k, step] of r.steps.entries()) {
        if (step.kind !== "limit") continue;
        const f = focusAt(r, k);
        const where = `${r.id}/${step.focus.param ?? "?"}`;
        if (f.callouts.length === 0) silent.push(where);
        else {
          expect(f.callouts[0]?.pulse, where).toBe(true);
          // It is AT the handle, which is the only thing on the plane the parameter moves.
          const handle = r.handles.find((hd) => hd.param === step.focus.param);
          expect(f.callouts[0]?.at, where).toEqual(handle?.at);
          pulsed.push(where);
        }
      }
    }
    // **`handlesOf` makes a handle for a parameter-bound ARC radius and for nothing else**, so a
    // rectangle's width and a square's half-width have none — six limit steps with nothing on the
    // plane to point at. Saying so is the honest half: a chip at an invented place would teach a
    // reader that the parameter lives somewhere it does not.
    expect(silent.sort()).toEqual([
      "gaussian-shift-zero-residue/R",
      "series-cot-collision/N",
      "series-cot-kernel/N",
      "series-csc-kernel-collision/N",
      "strip-exponential-quasiperiod/R",
      "strip-sech-fourier/R",
    ]);
    expect(pulsed.length, "no limit step has a handle").toBeGreaterThan(10);
  });

  it("takes the FIRST formula of a claim, which is its number and not its paragraph", () => {
    // The KILL line is a sentence: *the arc: ⟨bound⟩ at R = 4, and → 0 as R → ∞, since …*. The
    // whole of it on a chip is a paragraph over the picture; the first formula is the claim.
    const a6 = byId(GATE.A6);
    const k = a6.steps.findIndex((s) => s.kind === "boundary");
    const line = (a6.steps[k] as DerivationStep).lines[0];
    expect(line?.text.length, "the line is already short").toBeGreaterThan(80);
    const callout = focusAt(a6, k).callouts[0];
    expect(callout?.text).toBe("$\\left|\\int f\\,dz\\right| \\le 4.928e-2$");
    expect(callout?.text.length).toBeLessThan(45);
    // The badge is the LINE's own level, never composed here.
    expect(callout?.level).toBe(line?.level);
    // At the arc's midpoint, which for the upper semicircle of radius 4 is its apex. Closeness
    // rather than equality, and not as a courtesy: the midpoint is `pointAt(g, 0.5)` and the real
    // part comes out of `cos(π/2)`, which is 6.1e-17 rather than 0 in float64.
    expect(callout?.at[0], "the bound sits at the arc's midpoint").toBeCloseTo(0, 12);
    expect(callout?.at[1]).toBeCloseTo(4, 12);

    expect(firstFormula("no mathematics here")).toBeNull();
    expect(firstFormula("a $b$ and $c$"), "past the first").toBe("$b$");
  });

  it("badges the target's chip from the CONCLUSION, so the chip and the card cannot disagree", () => {
    for (const r of RAN) {
      const k = r.steps.findIndex((s) => s.kind === "target");
      if (k < 0) continue;
      const f = focusAt(r, k);
      if (f.callouts.length === 0) {
        // Tier G has no target PIECE — its target is a term of the residue sum — so there is
        // nowhere on the plane to put the value, and that is the record's own content.
        expect((r.steps[k] as DerivationStep).focus.pieceId, r.id).toBeUndefined();
        continue;
      }
      const c = r.derivation.conclusion;
      expect(f.callouts[0]?.level, r.id).toBe(c?.level);
      expect(f.callouts[0]?.text, r.id).toBe(`${c?.label} = ${c?.text}`);
    }
    // The anti-vacuity clause: G1 is the record with no target piece, and it really has none.
    expect(focusAt(byId(GATE.G1), byId(GATE.G1).steps.findIndex((s) => s.kind === "target")).callouts).toEqual([]);
    expect(focusAt(byId(GATE.A6), byId(GATE.A6).steps.findIndex((s) => s.kind === "target")).callouts.length).toBe(1);
  });

  it("rings the pole the step is about, resolved against the DERIVATION's rows", () => {
    // `focus.poleIndex` indexes the derivation's CATCH rows, NOT the step's own `poles` — A6's
    // second residue step carries `poleIndex: 3` over a `poles` array of length 1. Reading it as
    // an index into the step would ring nothing there, which is the defect this pins.
    const a6 = byId(GATE.A6);
    const per = a6.steps.map((s, k) => ({ s, k })).filter(({ s }) => s.focus.poleIndex !== undefined);
    expect(per.length, "A6 encloses two poles").toBe(2);
    const second = per[1];
    expect(second?.s.focus.poleIndex, "the index is not out of the step's own range").toBeGreaterThan(0);
    expect(second?.s.poles.length, "the step carries one row").toBe(1);
    expect(focusAt(a6, second?.k ?? 0).pole).toEqual(second?.s.poles[0]?.at);

    // Every ringed pole is one the stage actually draws a marker for — a ring around nothing
    // would be a mark for a singularity the picture does not have.
    let ringed = 0;
    for (const r of RAN) {
      for (let k = 0; k < r.steps.length; k++) {
        if (focusAt(r, k).pole === null) continue;
        ringed++;
        expect(r.poleCount > 0, r.id).toBe(true);
      }
    }
    // Measured at 28 over the corpus at fixture 0 — a floor rather than the number, because a
    // fixture's enclosed count is the record's business and this is an anti-vacuity clause.
    expect(ringed, "no step rings a pole at all").toBeGreaterThan(20);
  });

  it("gives a residue chip the pole table's own text, and no level", () => {
    const a6 = byId(GATE.A6);
    const k = a6.steps.findIndex((s) => s.focus.poleIndex !== undefined);
    const f = focusAt(a6, k);
    const row = (a6.steps[k] as DerivationStep).poles[0];
    expect(f.callouts[0]?.text).toBe(`Res = ${row?.residue ?? ""}`);
    // **No level**, because a `PoleRow` carries none: the levelled claim about the residues is the
    // CATCH line on the same step, minted where the residues were computed.
    expect(f.callouts[0]?.level).toBeNull();
    expect(f.callouts[0]?.at).toEqual(row?.at);
  });

  // ── the clamp, which two surfaces read ────────────────────────────────────────────────────

  it("clamps a stale step index in ONE place, so the card and the stage cannot disagree", () => {
    const steps = byId(GATE.A6).steps;
    expect(stepIndex(steps, "all")).toBeNull();
    expect(stepIndex([], 3), "no argument, no step").toBeNull();
    expect(stepIndex(steps, -4), "below").toBe(0);
    expect(stepIndex(steps, 9999), "a keyhole's index on a unit circle").toBe(steps.length - 1);
    expect(stepIndex(steps, 2)).toBe(2);
  });

  it("builds the SAME step list the card builds, which is what makes the index mean one thing", () => {
    // The reason `argument.ts` exists. `buildSteps` drops a step with nothing in it, so a caller
    // that omitted the problem statements would get a list one shorter and every index off by one.
    const base = defaultState(circleTemplate([0, 0], 1.5));
    for (const id of [GATE.A6, GATE.D1, GATE.G1]) {
      const state = { ...base, mode: "gallery" as const, record: id, fixture: 0 };
      const resolution = resolveState(state, compile(state.expr));
      const a = argumentOf({ state, resolution, poles: null });
      expect(a.steps.map((s) => s.id), id).toEqual(byId(id).steps.map((s) => s.id));
      expect(a.steps[0]?.kind, id).toBe("problem");
    }
  });

  it("emphasises a boundary step's piece even when no claim was made about it", () => {
    // **Unreachable from the corpus, and built by hand for that reason.** `boundarySteps` makes a
    // step for every non-target piece whether or not the KILL pass emitted a line naming it, so a
    // step can carry a title about a piece and no line at all — and its focus is then the ONLY
    // thing that says which piece the stage should point at. Measured: on all 28 records every
    // boundary step has its line, so the sweep's `sf-drop-focus-piece` survived, the union over the
    // lines being enough everywhere the corpus goes.
    //
    // The property is not cosmetic: the step's heading NAMES the piece, so a stage that dimmed it
    // with the rest would contradict the card beside it.
    const a6 = byId(GATE.A6);
    const k = a6.steps.findIndex((s) => s.kind === "boundary");
    const bare = { ...(a6.steps[k] as DerivationStep), lines: [] };
    const f = stageFocus({
      step: bare,
      derivation: a6.derivation,
      pieces: a6.pieces,
      resolved: a6.resolved,
      handles: a6.handles,
    });
    expect(bare.focus.pieceId, "the step names no piece, so this proves nothing").toBeDefined();
    expect(f.pieces.map((i) => a6.pieces[i]?.id)).toEqual([bare.focus.pieceId]);
    // And with nothing to quote there is no chip — a callout would have to invent a bound.
    expect(f.callouts).toEqual([]);
  });

  it("dims NOTHING when a step names a piece the drawn contour does not carry", () => {
    // **The other half of the same hand-built case**, and the direction matters: an id the drawn
    // list does not hold gives `findIndex` −1, and −1 left in the set would be a focus no piece can
    // match — so `includes(k)` is false for every k and the WHOLE contour goes dim. "I do not know
    // which piece this is" must read as no focus at all, not as a focus on nothing.
    //
    // Unreachable from the corpus (every line's piece is in the spec, which is why the sweep's
    // `sf-no-index-filter` survived), and reachable the moment a record renames a piece.
    const a6 = byId(GATE.A6);
    const k = a6.steps.findIndex((s) => s.kind === "boundary");
    const step = a6.steps[k] as DerivationStep;
    const stray = { ...step, focus: { pieceId: "a-piece-that-is-not-drawn" }, lines: [] };
    const f = stageFocus({
      step: stray,
      derivation: a6.derivation,
      pieces: a6.pieces,
      resolved: a6.resolved,
      handles: a6.handles,
    });
    expect(f.pieces, "an unknown id reached the piece indices").toEqual([]);
    for (const i of f.pieces) expect(i).toBeGreaterThanOrEqual(0);
    // The real step, for contrast — otherwise this passes on a `stageFocus` that focuses nothing.
    expect(focusAt(a6, k).pieces.length).toBe(1);
  });

  it("has an empty focus as its own value, rather than a shape a caller has to remember", () => {
    expect(NO_FOCUS.pieces).toEqual([]);
    expect(NO_FOCUS.pole).toBeNull();
    expect(NO_FOCUS.callouts).toEqual([]);
  });
});
