// The faded drill — every declaration checked against the engine, and the measurements that shaped
// it kept as tests.
//
// The load-bearing ones are the ones that would otherwise be prose:
//
//  * **the twin really is the record's integrand** — a hand-written string compared against the
//    record's own compiled `f`, which also closes a gap M7.1 left (its wrong-way cell transcribes
//    B1's integrand and nothing checked it);
//  * **the menu's exclusion rule is load-bearing** — the wedge ANSWERS B1 at `a = 1`, so a menu
//    without the rule would mark a false friend correct;
//  * **rung ii is not a tick-everything** — the naive strategies score what the module's header
//    says they score, measured rather than claimed;
//  * **every rung is addressable**, which is M7's gate clause 2 and rides M6.2's round trip.
import { describe, expect, it } from "vitest";
import {
  allCorrect,
  checkDrawing,
  disposalOf,
  DISPOSALS,
  DRILL_STAGES,
  DRILL_TASKS,
  gradePieces,
  menuVerdict,
  pickState,
  pieceQuestions,
  runTask,
  taskById,
  taskState,
  VERIFIED_ROLE_TEMPLATES,
  type Disposal,
  type DrillStage,
  type WindingRow,
} from "../src/shell/drill.js";
import {
  clearedOf,
  isComplete,
  NO_PROGRESS,
  PROGRESS_KEY,
  readProgress,
  stageFor,
  withCleared,
  writeProgress,
  type KeyStore,
} from "../src/shell/drillProgress.js";
import { CONTRAST_CELLS } from "../src/shell/contrastGrid.js";
import { rowFrom } from "../src/engine/ledger.js";
import { certificateClaim } from "../src/engine/claims.js";
import { compile, resolveState, type ShellState } from "../src/shell/state.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { TEMPLATES } from "../src/shell/templates.js";
import type { Cx } from "../src/kernel/geom.js";

/** The ledger, as the app would compute it for a state. One path, `resolveState`'s. */
function verdictOf(state: ShellState): { closes: boolean; failedAt: string | null; rows: string[]; value: string | null } {
  const res = resolveState(state, state.mode === "sandbox" ? compile(state.expr) : null);
  const ledger =
    res.kind === "gallery"
      ? (res.run?.ledger ?? null)
      : res.kind === "plain" || res.kind === "declared"
        ? res.analysis.ledger
        : null;
  if (ledger === null) return { closes: false, failedAt: "NO LEDGER", rows: [], value: null };
  return {
    closes: ledger.closes,
    failedAt: ledger.failedAt,
    rows: ledger.rows.map((r) => `${r.constraint}${r.pieceId ? "/" + r.pieceId : ""}:${r.status}:${r.claim}`),
    value: ledger.value?.text ?? null,
  };
}

describe("the tasks", () => {
  it("are the contrast set's GALLERY cells — four of the five", () => {
    expect(DRILL_TASKS.map((t) => t.id)).toEqual(["rational", "oscillatory", "forced-downward", "indented"]);
    // The wrong-way cell is excluded and this is why: it is a sandbox state with no target and no
    // answer — the same integral as `oscillatory`, deliberately mis-closed.
    const wrongWay = CONTRAST_CELLS.find((c) => c.id === "wrong-way");
    expect(wrongWay?.state().mode).toBe("sandbox");
    expect(DRILL_TASKS.some((t) => t.id === "wrong-way")).toBe(false);
  });

  it("each solve, and carry the cell's own label", () => {
    for (const task of DRILL_TASKS) {
      const run = runTask(task);
      expect(run, task.id).not.toBeNull();
      const cell = CONTRAST_CELLS.find((c) => c.id === task.id);
      expect(task.label).toBe(cell?.label);
    }
  });

  it("declare a twin that IS the record's integrand, sampled against the record's own `f`", () => {
    // **THE STRONGEST TEST IN THIS FILE.** Rungs iii and iv put the record's integrand in the
    // sandbox, and the sandbox holds TEXT — `@cas/expr` has no printer, so the string cannot be
    // derived from the record's substituted AST. Declaring it is therefore the only option, and this
    // is what stops a declaration from being a lookalike: 48 points where the two must agree.
    const probes: Cx[] = [];
    for (let k = 0; k < 48; k++) {
      const th = (2 * Math.PI * k) / 48;
      const r = 0.37 + 0.61 * (k % 5);
      probes.push([r * Math.cos(th), r * Math.sin(th)]);
    }
    for (const task of DRILL_TASKS) {
      const run = runTask(task);
      if (run === null) throw new Error(task.id);
      const twin = compile(task.twin);
      expect(twin.ok, `${task.id}: ${twin.ok ? "" : twin.error}`).toBe(true);
      if (!twin.ok) continue;
      let worst = 0;
      for (const z of probes) {
        const a = run.f(z, undefined);
        const b = twin.f(z);
        if (!Number.isFinite(a[0]) || !Number.isFinite(b[0])) continue;
        const scale = Math.max(1, Math.hypot(a[0], a[1]));
        worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]) / scale);
      }
      expect(worst, `${task.id}: twin '${task.twin}' disagrees with the record`).toBeLessThan(1e-12);
    }
  });

  it("and M7.1's wrong-way cell transcribes the same integrand — a gap that slice left open", () => {
    // Its note says "the same integrand, the arc taken through the other half-plane", and nothing
    // checked the first half of that sentence. It is B1 at `a = 1, b = 1`, which is `oscillatory`.
    const cell = CONTRAST_CELLS.find((c) => c.id === "wrong-way");
    const task = taskById("oscillatory");
    if (cell === undefined || task === null) throw new Error("missing");
    const theirs = compile(cell.state().expr);
    const run = runTask(task);
    if (!theirs.ok || run === null) throw new Error("did not compile");
    let worst = 0;
    for (let k = 0; k < 32; k++) {
      const z: Cx = [Math.cos(k) * 1.7, Math.sin(k) * 1.3];
      const a = run.f(z, undefined);
      const b = theirs.f(z);
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(1, Math.hypot(a[0], a[1])));
    }
    expect(worst).toBeLessThan(1e-12);
  });
});

describe("rung ii — the KILL column", () => {
  it("asks about EVERY piece, exactly once", () => {
    for (const task of DRILL_TASKS) {
      const run = runTask(task);
      if (run === null) throw new Error(task.id);
      const qs = pieceQuestions(run);
      // A piece with no question would shorten the drill silently, and one asked twice would make
      // the answer sheet ambiguous.
      expect(qs.length, task.id).toBe(run.contour.pieces.length);
      expect(new Set(qs.map((q) => q.pieceId)).size).toBe(qs.length);
      expect(qs.map((q) => q.pieceId)).toEqual(run.contour.pieces.map((p) => p.id));
    }
  });

  it("reads the answer off (status, role, level) — the measured answers", () => {
    const answers = (id: string): readonly Disposal[] => {
      const task = taskById(id);
      const run = task === null ? null : runTask(task);
      if (run === null) throw new Error(id);
      return pieceQuestions(run).map((q) => q.answer);
    };
    expect(answers("rational")).toEqual(["target", "vanishes"]);
    expect(answers("oscillatory")).toEqual(["target", "vanishes"]);
    expect(answers("forced-downward")).toEqual(["target", "vanishes"]);
    // C1 is the entry that needs the third case: the indentation does NOT vanish, it contributes
    // `i\\alpha\\operatorname{Res}` exactly, which is why `∮` stops being the answer.
    expect(answers("indented")).toEqual(["target", "limit", "target", "vanishes"]);
  });

  it("asks about the KILL column and NOTHING ELSE, even where another row names a piece", () => {
    // A sweep survivor, and unreachable from the drill's own four tasks: their LEGALITY, CATCH and
    // COVER rows name no piece, so the constraint filter never decides anything. It is not
    // decorative — M4.1's LEGALITY step names the piece that crosses a cut without declaring its
    // side — so a future drill task with a branch cut would be asked a question about a row that is
    // not the KILL column at all. Built by hand, because no record in scope can produce it.
    const cert = { level: "=", claim: "", method: "", provenance: [] } as never;
    const piece = {
      id: "lip",
      name: "the upper lip",
      geom: { kind: "segment" as const, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      role: "target" as const,
      colour: 0 as const,
    };
    const qs = pieceQuestions({
      ledger: {
        rows: [
          rowFrom("LEGALITY", "satisfied", certificateClaim("runs above the cut"), cert, "lip"),
          rowFrom("KILL", "satisfied", certificateClaim("is the target"), cert, "lip"),
        ],
      },
      contour: { pieces: [piece] },
    });
    expect(qs).toHaveLength(1);
    expect(qs[0].row.constraint).toBe("KILL");
  });

  it("asks about a piece ONCE, however many KILL rows name it", () => {
    // The other half of the same survivor: an answer sheet with two questions keyed on one piece is
    // ambiguous about which row the answer was for, and `gradePieces` reads the sheet by piece id.
    const cert = { level: "≤", claim: "", method: "", provenance: [] } as never;
    const piece = {
      id: "arc",
      name: "the arc",
      geom: { kind: "segment" as const, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      role: "vanish" as const,
      colour: 0 as const,
    };
    const row = (claim: string) =>
      rowFrom("KILL", "satisfied", certificateClaim(claim), cert, "arc");
    const qs = pieceQuestions({
      ledger: {
        rows: [row("|∫| ≤ … at R = 4"), row("→ 0 as R → ∞")],
      },
      contour: { pieces: [piece] },
    });
    expect(qs).toHaveLength(1);
    // The FIRST row, which is the bound — the one that says how the piece dies.
    expect(qs[0].row.claim).toContain("≤");
  });

  it("says `fails` for a row the ledger did not satisfy, whatever the piece's role", () => {
    const row = rowFrom(
      "KILL",
      "failed",
      certificateClaim("the lower semicircle DIVERGES"),
      { level: "⚠", claim: "", method: "", provenance: [] } as never,
      "arc",
    );
    expect(disposalOf({ role: "vanish" }, row)).toBe("fails");
    expect(disposalOf({ role: "target" }, row)).toBe("fails");
    // And an `unknown` row is the same answer: the argument does not close there either.
    expect(disposalOf({ role: "vanish" }, { ...row, status: "unknown" })).toBe("fails");
  });

  it("is NOT a tick-everything, and the question it REPLACED scores 30/30", () => {
    // **THE MEASUREMENT THAT CHOSE THE QUESTION, kept as a test.** The plan's rung ii was "assert
    // each ledger row"; on these four tasks every row is satisfied, because a faded worked example
    // is faded from a CORRECT argument — so that question is answerable without reading any
    // mathematics. The numbers below are the drill's own, and if a future task made one disposal
    // dominant this is what would say so.
    const runs = DRILL_TASKS.map(runTask);
    const rows = runs.flatMap((run) => (run === null ? [] : [...run.ledger.rows]));
    expect(rows).toHaveLength(30);
    expect(rows.filter((r) => r.status === "satisfied")).toHaveLength(30);
    expect(rows.filter((r) => r.evidence.level === "=")).toHaveLength(26);

    const all = runs.flatMap((run) => (run === null ? [] : pieceQuestions(run)));
    expect(all).toHaveLength(10);
    const score = (d: Disposal): number => all.filter((q) => q.answer === d).length;
    expect(score("target")).toBe(5);
    expect(score("vanishes")).toBe(4);
    expect(score("limit")).toBe(1);
    // `fails` is correct nowhere here, for the same structural reason: a worked example works. It
    // stays in the vocabulary because rung iii's wrong picks are full of it.
    expect(score("fails")).toBe(0);
    expect(score("reproduces")).toBe(0);
    // No single answer does better than half — against 30/30 for the question this replaced.
    expect(Math.max(...DISPOSALS.map(score))).toBeLessThanOrEqual(all.length / 2);
  });

  it("grades an answer sheet, and an unanswered question is WRONG rather than skipped", () => {
    const task = taskById("indented");
    const run = task === null ? null : runTask(task);
    if (run === null) throw new Error("no run");
    const qs = pieceQuestions(run);
    const right = Object.fromEntries(qs.map((q) => [q.pieceId, q.answer]));
    expect(allCorrect(gradePieces(qs, right))).toBe(true);

    // One wrong: the indentation "vanishes" is the classical error — and the feedback is the
    // ledger's OWN row, which says what it contributes instead.
    const wrong = { ...right, indent: "vanishes" as Disposal };
    const graded = gradePieces(qs, wrong);
    expect(allCorrect(graded)).toBe(false);
    const bad = graded.find((g) => !g.ok);
    expect(bad?.question.pieceId).toBe("indent");
    expect(bad?.question.row.claim).toContain("i\\alpha\\operatorname{Res}");

    // Unanswered.
    const blank = gradePieces(qs, {});
    expect(blank.every((g) => !g.ok && g.given === null)).toBe(true);
    expect(allCorrect(blank)).toBe(false);
    // And an empty sheet is not "all correct" by vacuous truth.
    expect(allCorrect([])).toBe(false);
  });
});

describe("rung iii — the menu", () => {
  it("excludes the templates whose roles the ledger takes ON FAITH", () => {
    // The rule, and then the measurement that makes it load-bearing.
    expect([...VERIFIED_ROLE_TEMPLATES].sort()).toEqual(
      ["circle", "indented", "rectangle", "semicircle", "semicircleDown", "square"].sort(),
    );
    for (const id of ["strip", "wedge", "keyhole", "dogbone"] as const) {
      expect(VERIFIED_ROLE_TEMPLATES).not.toContain(id);
      expect(TEMPLATES.find((t) => t.id === id)?.build().pieces.some((p) => p.role === "reproduces")).toBe(true);
    }
    for (const task of DRILL_TASKS) expect(VERIFIED_ROLE_TEMPLATES).toEqual(expect.arrayContaining([...task.menu]));
  });

  it("and the wedge really is a FALSE FRIEND — it answers B1, on a claim nothing checked", () => {
    // `f(ωz) = μ f(z)` is false for `e^{iz}/(1+z²)`, and the ledger never asks: a `reproduces` row
    // is satisfied "by its role". Without the exclusion rule the menu would mark this correct.
    const task = taskById("oscillatory");
    const run = task === null ? null : runTask(task);
    if (run === null) throw new Error("no run");
    const wedge = menuVerdict(run, "wedge");
    expect(wedge.answers).toBe(true);
    expect(wedge.value).toBe("π/e");
    expect(TEMPLATES.find((t) => t.id === "wedge")?.build().pieces.find((p) => p.role === "reproduces")).toBeDefined();
  });

  it("has exactly one intended option, and the others FAIL with the ledger's own reason", () => {
    for (const task of DRILL_TASKS) {
      const run = runTask(task);
      if (run === null) throw new Error(task.id);
      const intended = menuVerdict(run, task.intended);
      expect(intended.answers, `${task.id}: the intended option must answer`).toBe(true);
      expect(intended.failedAt).toBeNull();

      for (const option of task.menu) {
        if (option === task.intended || task.alsoAnswers.includes(option)) continue;
        const v = menuVerdict(run, option);
        expect(v.answers, `${task.id}: '${option}' must not answer`).toBe(false);
        // Diagnostically: either a named failing constraint with the ledger's words, or a closed
        // contour that carries no target at all. Never a silent no.
        expect(v.failedAt !== null || !v.hasTarget, `${task.id}/${option}`).toBe(true);
        if (v.failedAt !== null) expect(v.why, `${task.id}/${option}`).toBeTruthy();
      }
    }
  });

  it("declares the rational case's SECOND right answer, because both half-planes work there", () => {
    const task = taskById("rational");
    const run = task === null ? null : runTask(task);
    if (run === null) throw new Error("no run");
    expect(task?.alsoAnswers).toEqual(["semicircleDown"]);
    const down = menuVerdict(run, "semicircleDown");
    expect(down.answers).toBe(true);
    // The same value by the other pole — which is the point, not a coincidence to be hidden.
    expect(down.value).toBe(menuVerdict(run, "semicircle").value);

    // And with a kernel it is NOT so: the same option now diverges, by name.
    const osc = taskById("oscillatory");
    const run2 = osc === null ? null : runTask(osc);
    if (run2 === null) throw new Error("no run");
    const bad = menuVerdict(run2, "semicircleDown");
    expect(bad.answers).toBe(false);
    expect(bad.failedAt).toBe("KILL");
    expect(bad.why).toContain("diverges");
  });

  it("the circle CLOSES and still does not answer — COVER, not KILL", () => {
    const task = taskById("oscillatory");
    const run = task === null ? null : runTask(task);
    if (run === null) throw new Error("no run");
    const circle = menuVerdict(run, "circle");
    expect(circle.closes).toBe(true);
    expect(circle.hasTarget).toBe(false);
    expect(circle.answers).toBe(false);
    // Its value is a real number about a real contour; it is just not the integral asked for.
    expect(circle.value).toBeTruthy();
  });

  it("C1's wrong options fail LEGALITY, because the pole is ON the plain semicircle", () => {
    const task = taskById("indented");
    const run = task === null ? null : runTask(task);
    if (run === null) throw new Error("no run");
    for (const id of ["semicircle", "semicircleDown"] as const) {
      const v = menuVerdict(run, id);
      expect(v.failedAt).toBe("LEGALITY");
      expect(v.why).toContain("singularity");
    }
    expect(menuVerdict(run, "indented").answers).toBe(true);
  });
});

describe("rung iv — the enclosure", () => {
  const w = (at: Cx, n: number, decided = true): WindingRow => ({ at, n, decided });

  it("declares `one-pole` exactly where a second option answers — the two declarations agree", () => {
    for (const task of DRILL_TASKS) {
      const free = task.alsoAnswers.length > 0;
      expect(task.drawCheck === "one-pole", task.id).toBe(free);
    }
  });

  it("`as-recorded` accepts the worked contour's windings and rejects the MIRROR", () => {
    const task = taskById("oscillatory");
    const run = task === null ? null : runTask(task);
    if (run === null) throw new Error("no run");
    const recorded = run.integral.windings.map((x) => w(x.at, x.n, x.decided));
    expect(recorded.map((r) => r.n)).toEqual([1, 0]);
    expect(checkDrawing("as-recorded", recorded, recorded).ok).toBe(true);

    // The lower half-plane: the other pole, the other sign. Rejected, and named.
    const mirror = [w([0, 1], 0), w([0, -1], -1)];
    const bad = checkDrawing("as-recorded", recorded, mirror);
    expect(bad.ok).toBe(false);
    expect(bad.why).toContain("winds 0 times");

    // A doubled loop is a different number too — `2πi Σ n·Res`, not `2πi Σ Res`.
    const twice = [w([0, 1], 2), w([0, -1], 0)];
    expect(checkDrawing("as-recorded", recorded, twice).ok).toBe(false);
  });

  it("`forced-downward`'s goal carries the SIGN, which is the whole point of that cell", () => {
    const task = taskById("forced-downward");
    const run = task === null ? null : runTask(task);
    if (run === null) throw new Error("no run");
    const recorded = run.integral.windings.map((x) => w(x.at, x.n, x.decided));
    expect(recorded.map((r) => r.n)).toEqual([0, -1]);
    // A counter-clockwise loop about the same pole is the wrong sign, and it is refused.
    const flipped = [w([0, 1], 0), w([0, -1], 1)];
    const bad = checkDrawing("as-recorded", recorded, flipped);
    expect(bad.ok).toBe(false);
    expect(bad.why).toContain("needs -1");
  });

  it("`one-pole` takes either pole and either orientation, and refuses none or both", () => {
    const rec = [w([0, 1], 1), w([0, -1], 0)];
    expect(checkDrawing("one-pole", rec, [w([0, 1], 1), w([0, -1], 0)]).ok).toBe(true);
    expect(checkDrawing("one-pole", rec, [w([0, 1], 0), w([0, -1], -1)]).ok).toBe(true);
    const none = checkDrawing("one-pole", rec, [w([0, 1], 0), w([0, -1], 0)]);
    expect(none.ok).toBe(false);
    expect(none.why).toContain("no singularity is enclosed");
    const both = checkDrawing("one-pole", rec, [w([0, 1], 1), w([0, -1], 1)]);
    expect(both.ok).toBe(false);
    expect(both.why).toContain("2 singularities");
    const twice = checkDrawing("one-pole", rec, [w([0, 1], 2), w([0, -1], 0)]);
    expect(twice.ok).toBe(false);
    expect(twice.why).toContain("winds 2 times");
  });

  it("refuses an EMPTY singular set rather than passing vacuously", () => {
    // A closing-review find. The check mapped over the DRAWN windings alone, so an integrand with no
    // poles at all — the reader has edited the box, which rung iv leaves them free to do — produced
    // an empty list, nothing wrong in it, and a rung reported correct for a contour enclosing
    // nothing. The set has to match in both directions.
    const rec = [w([0, 1], 1), w([0, -1], 0)];
    const empty = checkDrawing("as-recorded", rec, []);
    expect(empty.ok).toBe(false);
    expect(empty.why).toContain("cannot be compared");
    // One of the two missing is the same failure, and named for the one that is missing.
    const half = checkDrawing("as-recorded", rec, [w([0, 1], 1)]);
    expect(half.ok).toBe(false);
    expect(half.why).toContain("−i");
  });

  it("refuses an UNDECIDED winding by name rather than reading it as zero", () => {
    const rec = [w([0, 1], 1), w([0, -1], 0)];
    const r = checkDrawing("as-recorded", rec, [w([0, 1], 0, false), w([0, -1], 0)]);
    expect(r.ok).toBe(false);
    expect(r.why).toContain("could not be decided");
  });

  it("says so where there is nothing to check — C1 encloses nothing at all", () => {
    const task = taskById("indented");
    expect(typeof task?.drawCheck).toBe("object");
    const r = checkDrawing(task?.drawCheck ?? "as-recorded", [], []);
    expect(r.ok).toBe(false);
    expect(r.why).toContain("i\\alpha\\operatorname{Res}");
    // Measured: its own contour winds about nothing, so "wind about no pole" is free.
    const run = task === null ? null : runTask(task);
    expect(run?.integral.windings.map((x) => x.n)).toEqual([0]);
  });
});

describe("every rung is ADDRESSABLE — M7's gate clause 2", () => {
  it("round-trips by VERDICT, for every task at every rung", () => {
    for (const task of DRILL_TASKS) {
      for (const stage of DRILL_STAGES) {
        const state = taskState(task, stage);
        expect(state.drill).toEqual({ task: task.id, stage });
        const enc = encodeShell(state);
        expect(enc.ok, `${task.id}/${stage}: ${enc.ok ? "" : enc.reason}`).toBe(true);
        if (!enc.ok) continue;
        const back = decodeShell(enc.hash);
        expect(back?.ok, `${task.id}/${stage}`).toBe(true);
        if (back === null || !back.ok) continue;
        // The rung itself, and then the NUMBERS — decoded into a fresh default, so M6.1's
        // consistently-lossy trap cannot pass this.
        expect(back.state.drill).toEqual({ task: task.id, stage });
        expect(verdictOf(back.state)).toEqual(verdictOf(state));
      }
    }
  });

  it("round-trips a rung-iii PICK, so a wrong choice is shareable too", () => {
    for (const task of DRILL_TASKS) {
      for (const option of task.menu) {
        const state = pickState(task, option);
        const enc = encodeShell(state);
        expect(enc.ok, `${task.id}/${option}: ${enc.ok ? "" : enc.reason}`).toBe(true);
        if (!enc.ok) continue;
        const back = decodeShell(enc.hash);
        if (back === null || !back.ok) throw new Error(`${task.id}/${option} did not decode`);
        expect(back.state.contourSource).toEqual({ template: option, shift: [0, 0] });
        expect(back.state.expr).toBe(task.twin);
        expect(back.state.drill).toEqual({ task: task.id, stage: 3 });
        expect(verdictOf(back.state)).toEqual(verdictOf(state));
      }
    }
  });

  it("opens rungs i–iii on the RECORD and rung iv in the sandbox, where the pen is", () => {
    const task = taskById("oscillatory");
    if (task === null) throw new Error("no task");
    for (const stage of [1, 2, 3] as DrillStage[]) {
      const s = taskState(task, stage);
      expect(s.mode).toBe("gallery");
      expect(s.record).toBe(task.record);
    }
    const four = taskState(task, 4);
    expect(four.mode).toBe("sandbox");
    expect(four.expr).toBe(task.twin);
  });

  it("REFUSES a link it cannot honour, by name", () => {
    const bad = (dr: unknown): string => {
      const payload = { v: 1, app: "ci", state: { dr } };
      const hash = `#vs=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
      const r = decodeShell(hash);
      if (r === null) return "NULL";
      return r.ok ? "OK" : r.reason;
    };
    expect(bad(["oscillatory", 2])).toBe("OK");
    expect(bad(["no-such-task", 2])).toContain("not one of its tasks");
    expect(bad(["oscillatory", 0])).toContain("rung 0");
    expect(bad(["oscillatory", 5])).toContain("rung 5");
    expect(bad("oscillatory")).toContain("not [task, stage]");
    expect(bad(["oscillatory"])).toContain("not [task, stage]");
  });

  it("costs nothing when no drill is open — the field is absent from the wire", () => {
    const task = taskById("rational");
    if (task === null) throw new Error("no task");
    const open = encodeShell(taskState(task, 2));
    const shut = encodeShell({ ...taskState(task, 2), drill: null });
    expect(open.ok && shut.ok).toBe(true);
    if (!open.ok || !shut.ok) return;
    expect(open.hash.length).toBeGreaterThan(shut.hash.length);
    const back = decodeShell(shut.hash);
    expect(back?.ok === true && back.state.drill).toBeNull();
  });
});

describe("progress — the fade", () => {
  const store = (value?: string): KeyStore => {
    const map = new Map<string, string>();
    if (value !== undefined) map.set(PROGRESS_KEY, value);
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
    };
  };

  it("treats absence, garbage and a wrong shape IDENTICALLY", () => {
    expect(readProgress(null)).toEqual(NO_PROGRESS);
    expect(readProgress(store())).toEqual(NO_PROGRESS);
    expect(readProgress(store("not json"))).toEqual(NO_PROGRESS);
    expect(readProgress(store("[1,2,3]"))).toEqual(NO_PROGRESS);
    expect(readProgress(store("null"))).toEqual(NO_PROGRESS);
    expect(readProgress(store("42"))).toEqual(NO_PROGRESS);
    // A single bad entry is dropped; its neighbours are not evidence about it.
    expect(readProgress(store('{"rational":2,"oscillatory":"lots","indented":9,"forced-downward":-1}'))).toEqual({
      rational: 2,
    });
  });

  it("survives a store that THROWS, on read and on write", () => {
    const hostile: KeyStore = {
      getItem: () => {
        throw new Error("private window");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readProgress(hostile)).toEqual(NO_PROGRESS);
    expect(() => {
      writeProgress(hostile, { rational: 1 });
    }).not.toThrow();
    expect(() => {
      writeProgress(null, { rational: 1 });
    }).not.toThrow();
  });

  it("fades one rung at a time, and never un-fades", () => {
    let p = NO_PROGRESS;
    expect(stageFor(p, "rational")).toBe(1);
    p = withCleared(p, "rational", 1);
    expect(stageFor(p, "rational")).toBe(2);
    p = withCleared(p, "rational", 3);
    expect(stageFor(p, "rational")).toBe(4);
    // Revisiting rung 1 cannot take rung 4 away — the support fades, it does not oscillate.
    p = withCleared(p, "rational", 1);
    expect(clearedOf(p, "rational")).toBe(3);
    p = withCleared(p, "rational", 4);
    expect(stageFor(p, "rational")).toBe(4);
    expect(isComplete(p, "rational")).toBe(true);
    // Another task is untouched by all of it.
    expect(stageFor(p, "indented")).toBe(1);
    expect(isComplete(p, "indented")).toBe(false);
  });

  it("round-trips through a store", () => {
    const s = store();
    writeProgress(s, { rational: 2, indented: 4 });
    expect(readProgress(s)).toEqual({ rational: 2, indented: 4 });
  });

  it("uses a VERSIONED key, so a future shape cannot be half-read", () => {
    expect(PROGRESS_KEY).toMatch(/\.v\d+$/);
    // Written under a different key, this build sees nothing at all.
    const s = store();
    s.setItem("ci.drill.v2", '{"rational":4}');
    expect(readProgress(s)).toEqual(NO_PROGRESS);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The same CONTRACT, for the two rungs that are the sandbox — M8 step 1.8.
//
// Rung iv IS the sandbox: it is where the pen lives, and the Contour card offers the pen in the
// sandbox alone. A rung-iii pick puts an ORDINARY sandbox state on screen, which is what stops
// `drillMask` masking the reply to the reader's own move. Both spread `defaultState` and so were
// sandbox states only for as long as the app booted into one. As in `contrastGrid.test.ts`, this
// passes with the pin removed TODAY and is the assertion that bites when the cold start moves.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the drill's sandbox rungs pin their own mode", () => {
  it("opens rung iv in the sandbox for every task, whatever the app boots into", () => {
    for (const task of DRILL_TASKS) {
      const state = taskState(task, 4);
      expect(state.mode, `${task.id} rung iv`).toBe("sandbox");
      expect(state.record, `${task.id} rung iv`).toBeNull();
      expect(state.expr, `${task.id} rung iv carries the record's twin`).toBe(task.twin);
    }
  });

  it("opens a rung-iii pick in the sandbox, for every option the menu offers", () => {
    for (const task of DRILL_TASKS) {
      for (const option of task.menu) {
        const state = pickState(task, option);
        expect(state.mode, `${task.id}/${option}`).toBe("sandbox");
        expect(state.record, `${task.id}/${option}`).toBeNull();
      }
    }
  });
});
