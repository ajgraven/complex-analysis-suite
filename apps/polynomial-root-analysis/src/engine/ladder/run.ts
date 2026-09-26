// One run of the ladder: a rung's polynomial, a formula, a word — the word's motion, the formula
// followed along it, and what that proves (PLAN §7 PRA-8). Evidence only; `certify.ts` labels it.
import { isIdentity, type Perm } from "@cas/monodromy";
import { evaluateAlong, type Evaluation } from "../formula/evaluate.js";
import { readFormula, type Formula } from "../formula/tree.js";
import { rung, type Rung, type RungDegree, type RungWord } from "./rungs.js";
import { wordDepth, wordMotion, wordPerm, type WordMotion } from "./word.js";

export type Outcome =
  /** The roots come back where they started: nothing is ruled out. */
  | { readonly kind: "trivial" }
  /** Every radical has level ≤ the word's depth, so every one closes (the theorem), yet the roots move. */
  | { readonly kind: "refuted"; readonly depth: number }
  /** Deeper radicals than the word's depth, all measured to close, and the roots move. */
  | { readonly kind: "refutedMeasured"; readonly depth: number }
  /** A radical failed to close: this word cannot rule the formula out. */
  | { readonly kind: "survives"; readonly radical: number }
  /** The measurement contradicts the theorem: a radical of level ≤ depth failed. Never shown as a result. */
  | { readonly kind: "contradiction"; readonly radical: number };

export interface LadderRun {
  readonly rung: Rung;
  readonly word: RungWord;
  readonly depth: number;
  readonly formula: Formula;
  readonly motion: WordMotion;
  /** Composed by the permutation engine. */
  readonly composed: Perm;
  /** The composed permutation and the one read off the motion agree. */
  readonly agrees: boolean;
  readonly evaluation: Evaluation;
  readonly outcome: Outcome | null;
}

export type LadderResult =
  | { readonly ok: true; readonly run: LadderRun }
  | { readonly ok: false; readonly reason: string; readonly formula: Formula | null };

const MEMO = new Map<string, LadderResult>();

export function runLadder(
  degree: RungDegree,
  formulaText: string,
  wordId: string,
): LadderResult {
  const key = JSON.stringify([degree, formulaText, wordId]);
  const hit = MEMO.get(key);
  if (hit) return hit;
  const r = compute(degree, formulaText, wordId);
  if (MEMO.size >= 24) MEMO.delete(MEMO.keys().next().value as string);
  MEMO.set(key, r);
  return r;
}

function compute(degree: RungDegree, formulaText: string, wordId: string): LadderResult {
  const rg = rung(degree);
  const read = readFormula(formulaText, degree);
  if (!read.ok) return { ok: false, reason: read.reason, formula: null };
  const formula = read.formula;
  const word = rg.words.find((w) => w.id === wordId);
  if (!word)
    return {
      ok: false,
      reason: `the ${rg.name.toLowerCase()} rung has no word '${wordId}'`,
      formula,
    };
  const motion = wordMotion(word.word, rg.roots);
  const composed = wordPerm(word.word);
  const agrees = composed.every((v, i) => v === motion.perm[i]);
  const depth = wordDepth(word.word);
  const evaluation = evaluateAlong(formula, motion.frames);
  return {
    ok: true,
    run: {
      rung: rg,
      word,
      depth,
      formula,
      motion,
      composed,
      agrees,
      evaluation,
      outcome: evaluation.ok ? outcome(formula, depth, composed, evaluation) : null,
    },
  };
}

function outcome(
  f: Formula,
  depth: number,
  perm: Perm,
  ev: Extract<Evaluation, { ok: true }>,
): Outcome {
  const bad = ev.radicals.find((r) => r.radical.level <= depth && !r.closes);
  if (bad) return { kind: "contradiction", radical: bad.radical.id };
  if (isIdentity(perm)) return { kind: "trivial" };
  if (f.depth <= depth) return { kind: "refuted", depth };
  const failed = ev.radicals.find((r) => !r.closes);
  if (failed) return { kind: "survives", radical: failed.radical.id };
  return { kind: "refutedMeasured", depth };
}
