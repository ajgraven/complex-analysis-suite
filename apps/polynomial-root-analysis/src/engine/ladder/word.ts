// Words of root motions (PLAN §7 PRA-8): the loops of Arnold's proof, built from the ROOT side. A
// letter is a permutation σ realised as a motion of the roots (`motion.ts`) — the root at position i
// travels to position σ(i) — whose coefficients trace a closed loop, since they depend only on the SET
// of roots. Letters, inverses (the same loop run backwards) and commutators [a, b] = a·b·a⁻¹·b⁻¹ make
// words; a word's permutation is composed by `@cas/monodromy` and, separately, read off the tracked
// motion itself, and the two must agree.
import {
  cycles,
  formatCycles,
  identityPerm,
  inverse,
  loopCommutator,
  type Perm,
} from "@cas/monodromy";
import type { Cx } from "../types.js";
import { motion } from "../loops/motion.js";

export type Word =
  | { readonly kind: "letter"; readonly perm: Perm }
  | { readonly kind: "inverse"; readonly of: Word }
  | { readonly kind: "commutator"; readonly a: Word; readonly b: Word };

export const letter = (perm: Perm): Word => ({ kind: "letter", perm });
export const comm = (a: Word, b: Word): Word => ({ kind: "commutator", a, b });

/** The permutation a word induces, composed (loops travelled left to right). */
export function wordPerm(w: Word): Perm {
  switch (w.kind) {
    case "letter":
      return [...w.perm];
    case "inverse":
      return inverse(wordPerm(w.of));
    case "commutator":
      return loopCommutator(wordPerm(w.a), wordPerm(w.b));
  }
}

/** How deeply commutators are nested: a letter is 0, [a, b] is one more than the deeper of a, b. */
export function wordDepth(w: Word): number {
  switch (w.kind) {
    case "letter":
      return 0;
    case "inverse":
      return wordDepth(w.of);
    case "commutator":
      return 1 + Math.max(wordDepth(w.a), wordDepth(w.b));
  }
}

/** The letters in travel order, each with its direction. */
export function lettersOf(w: Word, inv = false): { perm: Perm; inverse: boolean }[] {
  switch (w.kind) {
    case "letter":
      return [{ perm: w.perm, inverse: inv }];
    case "inverse":
      return lettersOf(w.of, !inv);
    case "commutator": {
      // a·b·a⁻¹·b⁻¹; `lettersOf(x, true)` is already x⁻¹'s letters in travel order.
      const seq = [
        ...lettersOf(w.a),
        ...lettersOf(w.b),
        ...lettersOf(w.a, true),
        ...lettersOf(w.b, true),
      ];
      // The inverse of a sequence: the letters in reverse order, each inverted.
      return inv ? seq.map((l) => ({ ...l, inverse: !l.inverse })).reverse() : seq;
    }
  }
}

/** A permutation in cycle notation, 1-based; the identity as (). */
export const permText = (p: Perm): string =>
  cycles(p).some((c) => c.length > 1) ? formatCycles(p) : "()";

/** A word as text: (12), (12)⁻¹, [(12), (23)], nested. */
export function wordText(w: Word): string {
  switch (w.kind) {
    case "letter":
      return permText(w.perm);
    case "inverse":
      return `${wordText(w.of)}⁻¹`;
    case "commutator":
      return `[${wordText(w.a)}, ${wordText(w.b)}]`;
  }
}

export interface WordMotion {
  /** frames[f][r]: where the root that started at index r is at frame f. */
  readonly frames: readonly (readonly Cx[])[];
  /** Read off the motion: the root that started at r ends where root perm[r] started. */
  readonly perm: Perm;
  readonly letters: number;
}

/** The motion of a whole word from `positions` (monic): each letter's motion, root by root. */
export function wordMotion(w: Word, positions: readonly Cx[]): WordMotion {
  const n = positions.length;
  const cache = new Map<string, readonly (readonly Cx[])[]>();
  const framesOf = (p: Perm): readonly (readonly Cx[])[] => {
    const key = p.join(",");
    let f = cache.get(key);
    if (!f) {
      f = motion(positions, p, [1, 0]).frames;
      cache.set(key, f);
    }
    return f;
  };
  const where = identityPerm(n); // root r is at position where[r]
  const frames: Cx[][] = [positions.map((z): Cx => [z[0], z[1]])];
  const ls = lettersOf(w);
  for (const l of ls) {
    const m = framesOf(l.perm);
    if (!l.inverse) {
      for (let f = 1; f < m.length; f++) frames.push(where.map((pos) => m[f][pos]));
      for (let r = 0; r < n; r++) where[r] = l.perm[where[r]];
    } else {
      const back = inverse(l.perm);
      const last = m.length - 1;
      for (let f = last - 1; f >= 0; f--)
        frames.push(where.map((pos) => m[f][back[pos]]));
      for (let r = 0; r < n; r++) where[r] = back[where[r]];
    }
  }
  return { frames, perm: [...where], letters: ls.length };
}
