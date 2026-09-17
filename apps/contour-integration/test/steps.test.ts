// **The lecturer's order, over the whole corpus** — M8 step 3.1.
//
// `buildSteps` regroups and computes nothing, so what is worth asserting is that the regrouping
// LOSES nothing and INVENTS nothing. Three invariants from the plan, plus the two shapes that were
// measured rather than assumed (the residue split and the limit steps), plus the one thing an
// invariant cannot express: that a step's focus names something the app can actually find.
import { describe, expect, it } from "vitest";

import { DERIVATION_STAGES, buildDerivation, type Derivation } from "../src/engine/derivation.js";
import { buildSteps, type DerivationStep } from "../src/engine/steps.js";
import type { Params, Piece } from "../src/engine/contour/model.js";
import { loadFamilies } from "../src/families/index.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { compile, defaultState, resolveState } from "../src/shell/state.js";

const RECORDS = [...loadFamilies().families.keys()];

interface Ran {
  readonly id: string;
  readonly fixture: number;
  readonly derivation: Derivation;
  readonly steps: readonly DerivationStep[];
  readonly spec: readonly Piece[];
  readonly params: Params;
}

/** Every record at fixture 0, through the same path the Derivation card takes. */
function runAll(fixture = 0): Ran[] {
  const base = defaultState(circleTemplate([0, 0], 1.5));
  const out: Ran[] = [];
  for (const id of RECORDS) {
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
      // A caller's problem statement, the way the Derivation card supplies one — without it
      // `buildDerivation` drops the `setup` stage and there is no problem step to be first.
      statements: [{ label: "the integral", text: `the record ${id}` }],
      ...(r.solved === null ? {} : { solved: r.solved }),
    });
    const params = r.run.contour.params;
    out.push({ id, fixture, derivation, steps: buildSteps(derivation, { spec, params }), spec, params });
  }
  return out;
}

const RAN = runAll();

describe("the derivation, as steps", () => {
  it("runs every record in the corpus, so the invariants below are about all of them", () => {
    // The anti-vacuity clause for every `filter` beneath: a corpus of one would satisfy them all.
    expect(RECORDS.length).toBe(28);
    expect(RAN.length).toBe(28);
  });

  it("puts every derivation line in EXACTLY one step — none lost, none duplicated", () => {
    // The invariant that makes "regroups and computes nothing" checkable. Identity comparison, not
    // deep equality: a step must carry the line `buildDerivation` produced, not a copy of it, so a
    // step that rebuilt a line with a different level would fail here rather than read plausibly.
    const bad: string[] = [];
    for (const { id, derivation, steps } of RAN) {
      const all = derivation.stages.flatMap((s) => s.lines);
      const placed = steps.flatMap((s) => s.lines);
      for (const line of all) {
        const n = placed.filter((l) => l === line).length;
        if (n !== 1) bad.push(`${id}: “${line.text.slice(0, 40)}” appears in ${n} steps`);
      }
      for (const line of placed) {
        if (!all.includes(line)) bad.push(`${id}: a step carries a line the derivation does not`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("puts every pole row in exactly one step too", () => {
    const bad: string[] = [];
    for (const { id, derivation, steps } of RAN) {
      const all = derivation.stages.flatMap((s) => s.poles);
      const placed = steps.flatMap((s) => s.poles);
      for (const row of all) {
        const n = placed.filter((p) => p === row).length;
        if (n !== 1) bad.push(`${id}: a pole row appears in ${n} steps`);
      }
      // And the poles OUTSIDE the contour are among them — the first draft dropped them, and A5's
      // own prose is that the sum over all four residues is 0.
      const outside = all.filter((p) => !(p.windingDecided && p.winding !== undefined && p.winding !== 0));
      if (outside.length > 0) {
        const first = steps.find((s) => s.kind === "residues");
        expect(outside.every((p) => first?.poles.includes(p)), `${id}: a pole outside the contour is on no step`).toBe(true);
      }
      expect(placed.every((p) => all.includes(p)), id).toBe(true);
    }
    expect(bad).toEqual([]);
  });

  it("ends with the conclusion and opens with the problem, in every record", () => {
    for (const { id, steps } of RAN) {
      expect(steps[0]?.kind, id).toBe("problem");
      expect(steps[steps.length - 1]?.kind, id).toBe("conclusion");
      expect(steps.filter((s) => s.kind === "conclusion").length, id).toBe(1);
      expect(steps.filter((s) => s.kind === "problem").length, id).toBe(1);
      expect(steps.filter((s) => s.kind === "target").length, id).toBe(1);
      // No step is a blank card with a title on it.
      for (const step of steps) {
        expect(step.statements.length + step.lines.length + step.poles.length, `${id}/${step.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("gives one boundary step to each NON-TARGET piece, and none to the target", () => {
    for (const { id, steps, spec } of RAN) {
      const boundary = steps.filter((s) => s.kind === "boundary");
      const nonTarget = spec.filter((p) => p.role !== "target");
      expect(boundary.length, id).toBe(nonTarget.length);
      expect(boundary.map((s) => s.focus.pieceId), id).toEqual(nonTarget.map((p) => p.id));
    }
    // And the corpus really does vary, or the equality above is a tautology on one number.
    const counts = new Set(RAN.map((r) => r.steps.filter((s) => s.kind === "boundary").length));
    expect([...counts].sort(), "every record has the same piece count").not.toEqual([counts.values().next().value]);
  });

  it("gives every step's focus something the app can find", () => {
    for (const { id, steps, spec, params, derivation } of RAN) {
      const rows = derivation.stages.flatMap((s) => s.poles);
      for (const step of steps) {
        if (step.focus.pieceId !== undefined) {
          expect(spec.some((p) => p.id === step.focus.pieceId), `${id}/${step.id}`).toBe(true);
        }
        if (step.focus.param !== undefined) {
          expect(params[step.focus.param], `${id}/${step.id}`).toBeDefined();
        }
        if (step.focus.poleIndex !== undefined) {
          expect(rows[step.focus.poleIndex], `${id}/${step.id}`).toBeDefined();
        }
      }
    }
  });

  it("gives one limit step per limit parameter — none where nothing is taken to a limit", () => {
    // Measured over the corpus: 0, 1 or 2, never more, and 2 is always a keyhole's R → ∞ with its
    // ε → 0⁺. The four unit-circle records take no limit at all and get no step.
    const seen = new Map<number, string[]>();
    for (const { id, steps, params } of RAN) {
      const limits = Object.values(params).filter((p) => p.limit !== undefined);
      const limitSteps = steps.filter((s) => s.kind === "limit");
      expect(limitSteps.length, id).toBe(limits.length);
      expect(limitSteps.every((s) => s.action === "limit"), id).toBe(true);
      seen.set(limits.length, [...(seen.get(limits.length) ?? []), id]);
    }
    expect([...seen.keys()].sort()).toEqual([0, 1, 2]);
    expect(seen.get(0)?.length, "no record takes no limit").toBeGreaterThan(0);
    expect(seen.get(2)?.length, "no record takes two limits").toBeGreaterThan(0);
  });

  it("splits the residues per pole, and falls back to the SUM exactly where the corpus needs it", () => {
    // **The cyclotomic case is the corpus's own**, not a defensive branch: at `n = 5` and `n = 7`
    // D3 encloses five and seven poles of which one has an exact residue, because no root fits one
    // quadratic extension — and the route computes the sum without naming a root.
    const perPole = RAN.filter((r) => r.steps.filter((s) => s.kind === "residues").length > 1);
    expect(perPole.length, "no record gets a step per pole").toBeGreaterThan(5);
    for (const { id, steps, derivation } of perPole) {
      const rows = derivation.stages.flatMap((s) => s.poles);
      const residueSteps = steps.filter((x) => x.kind === "residues");
      for (const [k, s] of residueSteps.entries()) {
        // The FIRST also carries the poles outside the contour; each step's own pole is its first.
        if (k > 0) expect(s.poles.length, id).toBe(1);
        expect(s.poles[0]?.residue, `${id}: a per-pole step with no residue to show`).toBeDefined();
        expect(s.focus.poleIndex, `${id}: a per-pole step focuses nothing`).toBeDefined();
      }
      expect(steps.filter((s) => s.kind === "residues").length, id).toBeLessThanOrEqual(rows.length);
    }

    // D3 at n = 5: one step, for the sum.
    const cyclo = runAll(2).find((r) => r.id === "keyhole-x-to-the-n");
    expect(cyclo, "D3 has no fixture 2").toBeDefined();
    const residues = (cyclo as Ran).steps.filter((s) => s.kind === "residues");
    expect(residues.length, "the cyclotomic fixture was split per pole").toBe(1);
    expect(residues[0]?.poles.length, "the sum step dropped the pole rows").toBeGreaterThan(4);
  });

  it("keeps a boundary line whose piece the spec does not carry, rather than dropping it", () => {
    // **Unreachable from the corpus**, measured: every KILL line names a piece in the spec, so the
    // sweep's `drop-orphan` mutant survived. It is built by hand because the invariant it protects
    // is the one this module exists to satisfy — a line that reaches no step is a claim the reader
    // never sees, and it would be silent.
    const base = RAN[0] as Ran;
    const killStage = base.derivation.stages.find((x) => x.id === "kill");
    if (killStage === undefined) throw new Error("no kill stage");
    const orphan = { ...killStage.lines[0], pieceId: "a-piece-that-is-not-in-the-spec" };
    const derivation: Derivation = {
      ...base.derivation,
      stages: base.derivation.stages.map((x) =>
        x.id === "kill" ? { ...x, lines: [...x.lines, orphan] } : x,
      ),
    };
    const steps = buildSteps(derivation, { spec: base.spec, params: base.params });
    const placed = steps.flatMap((x) => x.lines).filter((l) => l === orphan);
    expect(placed.length, "a line naming an unknown piece reached no step").toBe(1);
    expect(steps.find((x) => x.lines.includes(orphan))?.kind).toBe("target");
  });

  it("emits no step at all where a caller supplied no problem statements", () => {
    // `buildDerivation` drops a stage that came out empty, so a caller with nothing to say about
    // the problem would otherwise get a card with a title and nothing under it.
    const base = RAN[0] as Ran;
    const bare: Derivation = {
      ...base.derivation,
      stages: base.derivation.stages.filter((x) => x.id !== "setup"),
    };
    const steps = buildSteps(bare, { spec: base.spec, params: base.params });
    expect(steps.some((x) => x.kind === "problem")).toBe(false);
    for (const step of steps) {
      expect(step.statements.length + step.lines.length + step.poles.length, step.id).toBeGreaterThan(0);
    }
  });

  it("carries the STAGE's own rationale, never a sentence minted here", () => {
    // From `DERIVATION_STAGES`, not from the emitted stages: `buildDerivation` drops a stage that
    // came out empty, and a step whose rationale was read off one would then be blank.
    const whys = new Set(DERIVATION_STAGES.map((s) => s.why));
    for (const { id, steps } of RAN) {
      for (const step of steps) {
        // The limit step is the one that has no stage of its own, and says so in one fixed sentence.
        if (step.kind === "limit") continue;
        expect(whys.has(step.why), `${id}/${step.id}: “${step.why.slice(0, 30)}”`).toBe(true);
        expect(step.why.length, `${id}/${step.id}`).toBeGreaterThan(20);
      }
    }
  });
});
