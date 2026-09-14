// **THE FADED DRILL** — four rungs over the material the app already computes.
//
// Research 02 §7's contour-choice drill, item 11 of §8 minus its prompts (M7 §0: no prose, no
// prediction prompts, no self-explanation prompts). The rungs fade what is SUPPLIED:
//
//   i    the contour and the ledger      — today's app, unchanged
//   ii   the contour                     — the ledger's KILL column is masked and filled in
//   iii  the target integral             — a menu of contours; the ledger judges the pick
//   iv   the target integral             — draw one (M7.2's pen)
//
// Everything here is DATA plus the engine's own verdicts. Nothing grades by comparing strings, and
// nothing computes a second opinion: a stage-ii answer is checked against the ledger's own row, a
// stage-iii pick against `analyse` on the record's own integrand, and a stage-iv drawing against the
// exactly-decided winding numbers. DOM-free, so the whole thing runs in the node gate — the split
// `contrastGrid.ts` uses, for the same reason.
//
// ──────────────────────────────────────────────────────────────────────────────────────────────
// FOUR MEASUREMENTS SHAPED THIS, and each one changed the plan.
//
// **1. "Assert each ledger row" is not a task — it is a tick-everything, and the reason is
// structural.** A faded worked example is faded from a CORRECT argument, so on the drill's four
// tasks every row is satisfied: measured, **30 rows and 30 satisfied**, and 26 of the 30 exact. A
// learner who answers "satisfied" to everything therefore scores 30/30 without reading the
// mathematics, and one who answers "exact" scores 26/30. (The only failing row anywhere in the
// contrast set belongs to the wrong-way cell, which is a contrast rung and not a task — see
// {@link DrillTask}.) Whatever field the drill asked about the ROW, the drill would be free marks.
//
// What is not free is the KILL column: what each PIECE is for. Over the same four tasks that is
// target ×5, vanishes-by-a-bound ×4 and a known limit ×1 — a constant answer scores exactly 5/10 —
// and it is research 02 §7's own generalisation ("the pieces you cannot compute either vanish or
// give you back what you want times a constant"), so the drill asks that instead. See
// {@link Disposal}.
//
// **2. The menu needs no new failure machinery, but it does need a rule about which contours may be
// IN it.** Running the record's own integrand over all ten templates, four of them — strip, wedge,
// keyhole, dogbone — CLOSE for B1 at `a = 1` and report a target, because each carries a
// `reproduces` piece and **the ledger takes that role on faith**: nothing checks `f(ωz) = μ f(z)`,
// which for a record is the record's declaration and for a template under an arbitrary integrand is
// simply unverified. A menu containing them would mark a false friend correct. So the menu is drawn
// from the templates whose every role the ledger actually establishes — `target` (declared by the
// piece list, and COVER says so), `vanish` (discharged by a named lemma), `residue`/`free` (nothing
// claimed) — and the wedge's absence is a measurement, not taste.
//
// **3. At `a = 0` the wrong-way contour is not wrong** — the rational case closes in either
// half-plane and both report `π` — so the menu declares `alsoAnswers` rather than a single right
// choice. That is the ladder's first step arriving as data: without the kernel there is nothing to
// force the half-plane.
//
// **4. Rung iv cannot check what rungs i–iii check, and the reason is not a gap in the drill.** A
// drawn contour is a FIXED curve; the argument is about a limit (`R → ∞`), and the whole KILL
// apparatus is written on limit parameters a drawn piece does not have. Comparing `∮` against the
// answer instead would pass a small circle round the pole, which is the misconception the app exists
// to prevent. What a fixed curve CAN decide exactly is the enclosure — which poles it winds about,
// and with what sign — so that is what rung iv checks, and where even that says nothing (C1 encloses
// nothing at all) the task declares no check and says why. See {@link DrawCheck}.
// ──────────────────────────────────────────────────────────────────────────────────────────────

import { analyse } from "../engine/analyse.js";
import type { Piece } from "../engine/contour/model.js";
import type { ConstraintId, LedgerRow } from "../engine/ledger.js";
import { FAMILIES } from "../families/index.js";
import { primaryGolden, solveFamily, type FamilyRun } from "../families/runFamily.js";
import type { Bindings } from "../families/schema.js";
import type { Cx } from "../kernel/geom.js";
import { CONTRAST_CELLS } from "./contrastGrid.js";
import { defaultState, type DrillState, type ShellState } from "./state.js";
import { TEMPLATES, type TemplateId } from "./templates.js";

/**
 * The rung. 1 is the worked example; 4 is a blank plane and a pen.
 *
 * Defined by {@link DrillState} in `shell/state.ts` — that module cannot import this one (this one
 * imports it), and the stage is part of the state.
 */
export type DrillStage = DrillState["stage"];

export const DRILL_STAGES: readonly DrillStage[] = [1, 2, 3, 4];

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Rung ii — the KILL column.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a piece is FOR, as the ledger decides it.
 *
 * The vocabulary is research 02 §7's, which is why `reproduces` is offered even though no cell in
 * the contrast set uses it: the two-case generalisation IS "vanishes or reproduces", and a menu that
 * omitted the second case would teach the one-case version. `limit` is the third thing a piece can
 * do — not vanish, but contribute a known amount exactly (C1's indentation and its `iα·Res`), which
 * is the entry that makes `∮` stop being the answer.
 */
export type Disposal = "target" | "vanishes" | "limit" | "reproduces" | "fails";

export const DISPOSALS: readonly Disposal[] = ["target", "vanishes", "limit", "reproduces", "fails"];

/** One line of the offered vocabulary, for a picker. Not a lesson: a label. */
export const DISPOSAL_LABEL: Readonly<Record<Disposal, string>> = {
  target: "is the target",
  vanishes: "vanishes in the limit",
  limit: "contributes a known limit",
  reproduces: "reproduces the target",
  fails: "cannot be disposed of",
};

/**
 * The ledger's own decision about one piece.
 *
 * **Read off `(status, role, level)` and nothing else** — three structured fields, no string
 * anywhere. A row the ledger did not satisfy is `fails` whatever its role, because that is what the
 * argument does there; among satisfied rows the role says what the piece is for, and for a piece
 * that had to be disposed of the certificate's LEVEL says how: `≤` is a bound that kills it, `=` is
 * an exactly known contribution. `null` means this row is not a question — the caller drops it
 * rather than inventing an answer.
 */
export function disposalOf(piece: Pick<Piece, "role">, row: LedgerRow): Disposal | null {
  if (row.status !== "satisfied") return "fails";
  if (piece.role === "target") return "target";
  if (piece.role === "reproduces") return "reproduces";
  if (piece.role === "vanish") {
    if (row.evidence.level === "≤") return "vanishes";
    if (row.evidence.level === "=") return "limit";
    return null;
  }
  return null;
}

/** One masked row: the piece, what the ledger says about it, and the row that says so. */
export interface PieceQuestion {
  readonly pieceId: string;
  /** The piece's own name — the prompt, and already written for the piece list. */
  readonly name: string;
  readonly answer: Disposal;
  /** The ledger's row, carried so a wrong answer is answered by the LEDGER and not by this module. */
  readonly row: LedgerRow;
}

/**
 * The KILL column as questions, in piece order.
 *
 * Only KILL rows that name a piece become questions: LEGALITY, CATCH and COVER are about the
 * argument rather than about a piece, and `pieceQuestions` is not the place to decide what a reader
 * should be asked about those. A piece the ledger names twice, or not at all, yields no question
 * for the second row — and `drill.test.ts` pins that every task's question count equals its piece
 * count, so a future change that orphans a piece fails rather than quietly shortening the drill.
 */
export function pieceQuestions(run: {
  readonly ledger: { readonly rows: readonly LedgerRow[] };
  readonly contour: { readonly pieces: readonly Piece[] };
}): readonly PieceQuestion[] {
  const out: PieceQuestion[] = [];
  const asked = new Set<string>();
  for (const row of run.ledger.rows) {
    if (row.constraint !== "KILL" || row.pieceId === undefined) continue;
    if (asked.has(row.pieceId)) continue;
    const piece = run.contour.pieces.find((p) => p.id === row.pieceId);
    if (piece === undefined) continue;
    const answer = disposalOf(piece, row);
    if (answer === null) continue;
    asked.add(row.pieceId);
    out.push({ pieceId: piece.id, name: piece.name, answer, row });
  }
  return out;
}

export interface Graded {
  readonly question: PieceQuestion;
  readonly given: Disposal | null;
  readonly ok: boolean;
}

/** Grade an answer sheet. An unanswered question is wrong, not skipped. */
export function gradePieces(
  questions: readonly PieceQuestion[],
  given: Readonly<Record<string, Disposal | undefined>>,
): readonly Graded[] {
  return questions.map((question) => {
    const g = given[question.pieceId] ?? null;
    return { question, given: g, ok: g === question.answer };
  });
}

export const allCorrect = (graded: readonly Graded[]): boolean =>
  graded.length > 0 && graded.every((g) => g.ok);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Rung iii — the menu.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Templates whose every role the ledger ESTABLISHES rather than accepts.
 *
 * Measurement 2 above. `reproduces` is the role taken on faith, so the four templates carrying one
 * (strip, wedge, keyhole, dogbone) are out; what is left is exactly the set a menu can be built
 * from. Kept as one list rather than filtered at each use so the rule has a name.
 */
export const VERIFIED_ROLE_TEMPLATES: readonly TemplateId[] = TEMPLATES.filter((t) =>
  t.build().pieces.every((p) => p.role !== "reproduces"),
).map((t) => t.id);

/** What the ledger says about one menu option. */
export interface MenuVerdict {
  readonly template: TemplateId;
  readonly label: string;
  /** Does this contour ANSWER the integral — does the argument close, with the target on it? */
  readonly answers: boolean;
  readonly closes: boolean;
  readonly hasTarget: boolean;
  readonly failedAt: ConstraintId | null;
  /** The ledger's own words for the first row it did not satisfy. `null` when there is none. */
  readonly why: string | null;
  readonly value: string | null;
}

/**
 * Run the RECORD's own integrand over a template, and report the ledger.
 *
 * **The integrand comes from the record, not from a transcription.** `analyse` takes the compiled
 * `f`, its ast and its poles, so a menu option is the record's own integrand on a different contour
 * — there is no second expression that could disagree with it. (`@cas/expr` has no printer, so a
 * derived TEXT twin is not available; {@link DrillTask.twin} is declared instead and verified
 * against this same `f`.)
 */
export function menuVerdict(run: FamilyRun, template: TemplateId): MenuVerdict {
  const spec = TEMPLATES.find((t) => t.id === template);
  if (spec === undefined) throw new Error(`no template '${template}'`);
  const a = analyse({ ast: run.ast, f: run.f, poles: run.poles, contour: spec.build() });
  const bad = a.ledger.rows.find((r) => r.status !== "satisfied");
  return {
    template,
    label: spec.label,
    answers: a.ledger.closes && a.ledger.hasTarget,
    closes: a.ledger.closes,
    hasTarget: a.ledger.hasTarget,
    failedAt: a.ledger.failedAt,
    why: bad?.claim ?? null,
    value: a.ledger.value?.text ?? null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Rung iv — the enclosure.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What rung iv checks about a drawn contour.
 *
 * - `"as-recorded"` — the same winding number about every singularity as the record's own contour.
 *   Used where the half-plane is FORCED: with a kernel `e^{iaz}` the sign of `a` decides the side,
 *   and the sign of the winding decides the sign of the answer.
 * - `"one-pole"` — exactly one singularity wound once, either of them, either orientation. The
 *   rational case, where measurement 3 says both half-planes work.
 * - `{ none }` — there is nothing about the enclosure to check, with the reason. C1 encloses NOTHING
 *   (its whole value comes from the indentation), so "wind about no pole" is satisfied by any loop
 *   that misses the origin and would be a mark for nothing.
 */
export type DrawCheck = "as-recorded" | "one-pole" | { readonly none: string };

export interface WindingRow {
  readonly at: Cx;
  readonly n: number;
  readonly decided: boolean;
}

export interface DrawResult {
  readonly ok: boolean;
  /** Why not, in the drill's own words — the only place this module writes a sentence about maths. */
  readonly why: string | null;
  readonly rows: readonly { readonly at: Cx; readonly want: number | null; readonly got: number; readonly decided: boolean }[];
}

const fmtAt = (at: Cx): string =>
  `${at[0] === 0 ? "" : String(Number(at[0].toFixed(3)))}${at[1] === 0 ? (at[0] === 0 ? "0" : "") : `${at[1] > 0 ? (at[0] === 0 ? "" : "+") : "−"}${Math.abs(at[1]) === 1 ? "" : String(Number(Math.abs(at[1]).toFixed(3)))}i`}`;

/**
 * Check a drawn contour's enclosure against the task's declared rule.
 *
 * Both lists are the winding numbers of the SAME singular set — the drawn contour's integrand is the
 * record's twin, so `findPoles` returns the same poles in the same order — and an undecided winding
 * is a failure rather than a zero, exactly as the residue theorem treats one.
 */
export function checkDrawing(
  check: DrawCheck,
  recorded: readonly WindingRow[],
  drawn: readonly WindingRow[],
): DrawResult {
  if (typeof check === "object") return { ok: false, why: check.none, rows: [] };
  const undecided = drawn.find((w) => !w.decided);
  if (undecided !== undefined) {
    return {
      ok: false,
      why: `the winding number about ${fmtAt(undecided.at)} could not be decided — the contour passes too close to it`,
      rows: drawn.map((w) => ({ at: w.at, want: null, got: w.n, decided: w.decided })),
    };
  }
  if (check === "one-pole") {
    const wound = drawn.filter((w) => w.n !== 0);
    const ok = wound.length === 1 && Math.abs(wound[0].n) === 1;
    return {
      ok,
      why: ok
        ? null
        : wound.length === 0
          ? "no singularity is enclosed, so the residue theorem has nothing to give back"
          : wound.length > 1
            ? `${wound.length} singularities are enclosed — their residues cancel here, and the target is not what is left`
            : `the contour winds ${wound[0].n} times about ${fmtAt(wound[0].at)}; once is what the argument uses`,
      rows: drawn.map((w) => ({ at: w.at, want: null, got: w.n, decided: w.decided })),
    };
  }
  const rows = drawn.map((w) => {
    const want = recorded.find((r) => Math.hypot(r.at[0] - w.at[0], r.at[1] - w.at[1]) < 1e-9);
    return { at: w.at, want: want?.n ?? null, got: w.n, decided: w.decided };
  });
  // **EVERY RECORDED SINGULARITY HAS TO BE ACCOUNTED FOR, and M7's closing review found it was not.**
  // Mapping over `drawn` alone made an EMPTY list vacuously correct: with the integrand edited to
  // something with no poles at all, `rows` is empty, nothing is wrong, and the rung reported the
  // enclosure as exactly right. The set has to match in both directions — this is the other one.
  const missing = recorded.find(
    (r) => !drawn.some((w) => Math.hypot(r.at[0] - w.at[0], r.at[1] - w.at[1]) < 1e-9),
  );
  if (missing !== undefined) {
    return {
      ok: false,
      why:
        `${fmtAt(missing.at)} is a singularity of the worked integrand and is not one of this ` +
        "contour's — the enclosure cannot be compared",
      rows,
    };
  }
  const wrong = rows.find((r) => r.want === null || r.want !== r.got);
  return {
    ok: wrong === undefined,
    why:
      wrong === undefined
        ? null
        : wrong.want === null
          ? `${fmtAt(wrong.at)} is not one of the singularities the worked contour was measured against`
          : `the contour winds ${wrong.got} times about ${fmtAt(wrong.at)}, where the argument needs ${wrong.want}`,
    rows,
  };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The tasks.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One drill task: a contrast cell, plus the four things the rungs need that a cell does not carry.
 *
 * **Scoped to the contrast set** (M7 §M7.3: four stages × 28 records is a combinatorial temptation
 * with no pedagogical argument behind it) — and to its GALLERY cells, which is one fewer than the
 * five. The wrong-way cell is a sandbox state with no target and no answer: it is the same integral
 * as `oscillatory`, deliberately mis-closed, so as a task it would be that task with its answer
 * given away.
 */
export interface DrillTask {
  /** The contrast cell's id — what a permalink names and a test looks up. */
  readonly id: string;
  /** The integral, as the cell writes it. */
  readonly label: string;
  readonly record: string;
  readonly bindings: Bindings;
  /**
   * The record's contour integrand as the sandbox holds it — DECLARED, and verified against the
   * record's own compiled `f` by `drill.test.ts` at sample points.
   *
   * Declared rather than derived because `@cas/expr` has no printer: there is no way to turn the
   * record's substituted AST back into source text. Verification is the stronger half anyway — it
   * checks the string the app actually evaluates, which a derivation would still have needed.
   */
  readonly twin: string;
  readonly menu: readonly TemplateId[];
  readonly intended: TemplateId;
  /** Options that also answer the integral, for a reason of their own. Measurement 3. */
  readonly alsoAnswers: readonly TemplateId[];
  readonly drawCheck: DrawCheck;
}

/** The menu, one list for every task: what changes between tasks is which option works. */
const MENU: readonly TemplateId[] = ["semicircle", "semicircleDown", "indented", "circle"];

const DECLARED: Readonly<Record<string, Omit<DrillTask, "id" | "label" | "record" | "bindings">>> = {
  rational: {
    twin: "1/(z^2 + 1)",
    menu: MENU,
    intended: "semicircle",
    // Measured: the lower semicircle reports π too. Nothing forces the half-plane without a kernel.
    alsoAnswers: ["semicircleDown"],
    drawCheck: "one-pole",
  },
  oscillatory: {
    twin: "exp(i*z)/(z^2 + 1)",
    menu: MENU,
    intended: "semicircle",
    alsoAnswers: [],
    drawCheck: "as-recorded",
  },
  "forced-downward": {
    twin: "exp(-i*z)/(z^2 + 1)",
    menu: MENU,
    intended: "semicircleDown",
    alsoAnswers: [],
    drawCheck: "as-recorded",
  },
  indented: {
    twin: "exp(i*z)/z",
    menu: MENU,
    intended: "indented",
    alsoAnswers: [],
    drawCheck: {
      none:
        "C1 encloses no singularity at all — its whole value comes from the indentation's iα·Res, " +
        "which is a limit a fixed drawn curve cannot take. There is nothing here to check about the " +
        "enclosure that any loop missing the origin would not also satisfy.",
    },
  },
};

/** The tasks, in the ladder's order. */
export const DRILL_TASKS: readonly DrillTask[] = CONTRAST_CELLS.flatMap((cell) => {
  const declared = DECLARED[cell.id];
  if (declared === undefined) return [];
  const state = cell.state();
  if (state.mode !== "gallery" || state.record === null) return [];
  return [{ id: cell.id, label: cell.label, record: state.record, bindings: state.bindings, ...declared }];
});

export const taskById = (id: string): DrillTask | null => DRILL_TASKS.find((t) => t.id === id) ?? null;

/** The record, solved at the task's bindings — the worked example rungs i–iii are about. */
export function runTask(task: DrillTask): FamilyRun | null {
  const family = FAMILIES.find((f) => f.id === task.record);
  if (family === undefined) return null;
  const g = primaryGolden(family);
  const r = solveFamily(family, { ...g, params: { ...g.params, ...task.bindings } });
  return r.ok ? r.run : null;
}

/**
 * The app state a rung opens in.
 *
 * Rungs i–iii are the RECORD (the contour is the record's, and at rung iii it is the thing being
 * chosen, so it stays on screen until a pick replaces it); rung iv is the sandbox on the twin, where
 * the pen lives. Both are ordinary states, which is the milestone's gate clause 2 for free: a rung
 * is a state, so a rung is a permalink.
 */
export function taskState(task: DrillTask, stage: DrillStage): ShellState {
  const cell = CONTRAST_CELLS.find((c) => c.id === task.id);
  if (cell === undefined) throw new Error(`no contrast cell '${task.id}'`);
  if (stage !== 4) return { ...cell.state(), drill: { task: task.id, stage } };
  const contour = TEMPLATES[0].build();
  return {
    ...defaultState(contour),
    expr: task.twin,
    drill: { task: task.id, stage },
  };
}

/** The state a rung-iii pick opens: the twin on the chosen template, in the sandbox. */
export function pickState(task: DrillTask, template: TemplateId): ShellState {
  const spec = TEMPLATES.find((t) => t.id === template);
  if (spec === undefined) throw new Error(`no template '${template}'`);
  const contour = spec.build();
  return {
    ...defaultState(contour),
    expr: task.twin,
    contourSource: { template, shift: [0, 0] },
    sandboxContour: contour,
    drill: { task: task.id, stage: 3 },
  };
}

