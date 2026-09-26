// The faded drill over the ladder (PLAN §7 PRA-10). One question, asked of eight formulas: WHICH WORD
// RULES THIS FORMULA OUT — the shallowest word of root motions along which every radical of the formula
// must come back while the roots do not — or does none? Three stages, each supplying less (research 02
// §6, as Contour Integration's M7.3): the worked answer; the question with the ladder's words and the
// formula's depth shown; the question alone.
//
// **The answer is the engine's, never the drill's.** `drillAnswer` runs every word of the rung through
// `runLadder` and takes the shallowest whose outcome is `refuted` — the commutator theorem's `=`, not a
// measurement — so a task cannot carry a stale key. Tasks are chosen so that no MEASURED refutation
// (`refutedMeasured`, `≈`) comes before the theorem's: the test pins it, because a drill that graded
// against an estimate would teach an estimate as a fact.
//
// **Progress may never change a number** (CI's drillProgress rule 3): it decides where a task opens and
// nothing else, and `resolveState` never reads it.
import type { Certificate } from "@cas/rigor";
import { ladderVerdict } from "../engine/certify.js";
import { runLadder, type LadderRun } from "../engine/ladder/run.js";
import { rung, type RungDegree } from "../engine/ladder/rungs.js";
import { permText, wordDepth, wordPerm, wordText } from "../engine/ladder/word.js";
import { frame, ladderPolynomial, type ShellState } from "./state.js";

export type DrillStage = 0 | 1 | 2;
export const LAST_STAGE: DrillStage = 2;

export interface DrillTask {
  readonly id: string;
  readonly rung: RungDegree;
  /** A gallery id (`#cardano`) or a formula's own text. */
  readonly formula: string;
  readonly label: string;
}

export const DRILL_TASKS: readonly DrillTask[] = [
  { id: "quadratic", rung: 2, formula: "#quadratic", label: "The quadratic formula" },
  { id: "mean", rung: 3, formula: "-a2/3", label: "The mean of the roots, on a cubic" },
  { id: "sqrt3", rung: 3, formula: "sqrt(disc)", label: "√disc, on a cubic" },
  { id: "cardano", rung: 3, formula: "#cardano", label: "Cardano's formula" },
  { id: "sqrt4", rung: 4, formula: "sqrt(disc)", label: "√disc, on a quartic" },
  { id: "ferrari", rung: 4, formula: "#ferrari", label: "Ferrari's formula" },
  { id: "q2", rung: 5, formula: "#q2", label: "A two-level quintic candidate" },
  { id: "q3", rung: 5, formula: "#q3", label: "A three-level quintic candidate" },
];

export const taskById = (id: string): DrillTask | undefined =>
  DRILL_TASKS.find((t) => t.id === id);

/** A gallery id or a formula's text, as the formula's text. */
export function drillFormula(t: DrillTask): string {
  if (!t.formula.startsWith("#")) return t.formula;
  const g = rung(t.rung).formulas.find((x) => x.id === t.formula.slice(1));
  if (!g) throw new Error(`no formula ${t.formula} on rung ${t.rung}`);
  return g.text;
}

/** One word of the task's rung, run: its label and what it shows about the formula. */
export interface DrillRow {
  readonly id: string;
  readonly depth: number;
  readonly word: string;
  readonly perm: string;
  readonly run: LadderRun | null;
  readonly verdict: Certificate | null;
}

export interface DrillAnswer {
  /** The shallowest word the theorem says rules the formula out; null when none does. */
  readonly word: string | null;
  readonly rows: readonly DrillRow[];
}

const ANSWERS = new Map<string, DrillAnswer>();

export function drillAnswer(t: DrillTask): DrillAnswer {
  const hit = ANSWERS.get(t.id);
  if (hit) return hit;
  const text = drillFormula(t);
  const rows: DrillRow[] = rung(t.rung).words.map((w) => {
    const r = runLadder(t.rung, text, w.id);
    const run = r.ok ? r.run : null;
    return {
      id: w.id,
      depth: wordDepth(w.word),
      word: wordText(w.word),
      perm: permText(wordPerm(w.word)),
      run,
      verdict: run ? ladderVerdict(run, permText(run.composed)) : null,
    };
  });
  const first = rows.find((x) => x.run?.outcome?.kind === "refuted");
  const a = { word: first?.id ?? null, rows };
  ANSWERS.set(t.id, a);
  return a;
}

/** The state a task opens at `stage`: its rung and formula, with the answer's word run only when worked. */
export function drillState(id: string, stage: DrillStage, base: ShellState): ShellState {
  const t = taskById(id);
  if (!t) return base;
  const ladder = {
    rung: t.rung,
    formula: drillFormula(t),
    word: stage === 0 ? drillAnswer(t).word : null,
  };
  const p = ladderPolynomial(ladder);
  return {
    ...base,
    drill: { task: id, stage },
    tour: null,
    family: null,
    loop: null,
    overlay: false,
    lattice: false,
    ring: "C",
    coefficient: null,
    ladder,
    poly: p ? { kind: "roots", roots: p.roots, lead: [1, 0] } : base.poly,
    ...(p ? { rootCam: frame(p.roots), coeffCam: frame(p.coeffs) } : {}),
  };
}

/** Whether `s` still shows the task's rung and formula (the reader may have edited them away). */
export function onDrillTask(id: string, s: ShellState): boolean {
  const t = taskById(id);
  return (
    !!t &&
    s.family === null &&
    s.ladder !== null &&
    s.ladder.rung === t.rung &&
    s.ladder.formula === drillFormula(t)
  );
}

// ── Progress: the only state in this app that outlives a tab.

/** Stages cleared per task: 0 nothing, 1 the worked answer read, 2 guided, 3 alone. */
export type DrillProgress = Readonly<Record<string, 0 | 1 | 2 | 3>>;

/** Versioned: a schema change gets a new key rather than a migration. */
export const PROGRESS_KEY = "pra.drill.v1";

export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Total: absence, garbage, a private window and a future shape all read as "no progress". */
export function readProgress(store: KeyStore | null): DrillProgress {
  let raw: string | null = null;
  try {
    raw = store?.getItem(PROGRESS_KEY) ?? null;
  } catch {
    return {};
  }
  if (raw === null) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {};
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, 0 | 1 | 2 | 3> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>))
    if (taskById(k) && (x === 0 || x === 1 || x === 2 || x === 3)) out[k] = x;
  return out;
}

/** Record that `stage` of `id` was cleared; never lowers what was cleared before. */
export function clearStage(
  store: KeyStore | null,
  id: string,
  stage: DrillStage,
): DrillProgress {
  const p = readProgress(store);
  const next = Math.max(p[id] ?? 0, stage + 1) as 1 | 2 | 3;
  const out = { ...p, [id]: next };
  try {
    store?.setItem(PROGRESS_KEY, JSON.stringify(out));
  } catch {
    // A refused write loses progress, never a number.
  }
  return out;
}

/** The stage a task opens at: the first it has not cleared, the last once all are. */
export const openingStage = (p: DrillProgress, id: string): DrillStage =>
  Math.min(p[id] ?? 0, LAST_STAGE) as DrillStage;
