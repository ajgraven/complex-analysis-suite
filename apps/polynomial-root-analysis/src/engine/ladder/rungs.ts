// The four rungs of the ladder (PLAN §7 PRA-8): degree 2 … 5, each a generic polynomial (roots in
// general position, so no motion brings two together and no gallery radicand vanishes), a gallery of
// radical formulas, words of increasing commutator depth, the identities they rest on, and the derived
// series of Sₙ — enumerated, not quoted.
import { derivedSeries, groupElements, loopCommutator, type Perm } from "@cas/monodromy";
import type { Cx } from "../types.js";
import { comm, letter, wordPerm, type Word } from "./word.js";

export type RungDegree = 2 | 3 | 4 | 5;

export interface GalleryFormula {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

export interface RungWord {
  readonly id: string;
  readonly word: Word;
}

export interface Rung {
  readonly degree: RungDegree;
  readonly name: string;
  readonly roots: readonly Cx[];
  readonly formulas: readonly GalleryFormula[];
  readonly words: readonly RungWord[];
}

/** Roots on a slightly irregular n-gon: general position, well apart, no symmetry to hide behind. */
function generic(n: number): Cx[] {
  const radii = [1, 0.86, 1.12, 0.94, 1.05];
  return Array.from({ length: n }, (_, k): Cx => {
    const a = 0.37 + (2 * Math.PI * k) / n + 0.11 * Math.sin(3 * k + 1);
    const r = radii[k];
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}

const t = (n: number, i: number, j: number): Perm => {
  const p = Array.from({ length: n }, (_, k) => k);
  p[i] = j;
  p[j] = i;
  return p;
};
const c3 = (n: number, i: number, j: number, k: number): Perm => {
  const p = Array.from({ length: n }, (_, m) => m);
  p[i] = j;
  p[j] = k;
  p[k] = i;
  return p;
};
const same = (a: Perm, b: Perm): boolean => a.every((v, i) => v === b[i]);

/**
 * A 3-cycle `c` as a commutator of two 3-cycles, found by searching them in a fixed order — Ramond's
 * self-feeding identity [(ijk), (kℓm)] = (jkm), in whichever form this convention's composition gives.
 */
export function threeCycleSplit(c: Perm): [Perm, Perm] {
  const n = c.length;
  const threes: Perm[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++)
        if (i !== j && j !== k && i !== k && i < j && i < k) threes.push(c3(n, i, j, k));
  for (const a of threes)
    for (const b of threes) if (same(loopCommutator(a, b), c)) return [a, b];
  throw new Error("no split");
}

/**
 * Ramond's depth-N word for a 3-cycle `c`: at depth 1, `c` as a commutator of two swaps; above that,
 * `c` = [a, b] with a, b 3-cycles (the self-feeding identity), each a word one level down. Its letters
 * are swaps — Ramond's level A — so every level of the tower is a commutator of the one below.
 */
export function selfFeeding(c: Perm, depth: number): Word {
  const n = c.length;
  if (depth === 0) return letter(c);
  if (depth === 1) {
    const swaps: Word[] = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) swaps.push(letter(t(n, i, j)));
    return commutatorFor(c, swaps);
  }
  const [a, b] = threeCycleSplit(c);
  return comm(selfFeeding(a, depth - 1), selfFeeding(b, depth - 1));
}

/** The first commutator of two transposition letters, or of two such commutators, that gives `target`. */
function commutatorFor(target: Perm, pieces: readonly Word[]): Word {
  for (const a of pieces)
    for (const b of pieces) {
      const w = comm(a, b);
      if (same(wordPerm(w), target)) return w;
    }
  throw new Error("no commutator");
}

// Cardano, with ONE cube root: the second is −p/(3u), not an independent ∛ — two independently tracked
// cube roots lose the link u·v = −p/3 the first time a loop turns one and not the other, and the
// "formula" then computes something that is no longer a root.
const CARDANO =
  "p = a1 - a2^2/3; q = 2*a2^3/27 - a1*a2/3 + a0; u = cbrt(-q/2 + sqrt(q^2/4 + p^3/27)); u - p/(3*u) - a2/3";

// Ferrari, in Euler's form: the depressed quartic y⁴ + py² + qy + r = 0 has roots (√z₁ + √z₂ + √z₃)/2,
// the zₖ the roots of its resolvent cubic z³ + 2pz² + (p² − 4r)z − q² (Cardano again, one cube root),
// with √z₁√z₂√z₃ = −q — so the third square root is −q/(√z₁√z₂), not a third radical. Three levels:
// √ inside ∛ inside √.
const FERRARI = [
  "p = a2 - 3*a3^2/8",
  "q = a1 - a3*a2/2 + a3^3/8",
  "r = a0 - a3*a1/4 + a3^2*a2/16 - 3*a3^4/256",
  "b2 = 2*p",
  "b1 = p^2 - 4*r",
  "b0 = -q^2",
  "P = b1 - b2^2/3",
  "Q = 2*b2^3/27 - b1*b2/3 + b0",
  "u = cbrt(-Q/2 + sqrt(Q^2/4 + P^3/27))",
  "w = (-1 + i*sqrt(3))/2",
  "z1 = u - P/(3*u) - b2/3",
  "z2 = w*u - P/(3*w*u) - b2/3",
  "s1 = sqrt(z1)",
  "s2 = sqrt(z2)",
  "(s1 + s2 - q/(s1*s2))/2 - a3/4",
].join("; ");

/**
 * Candidate quintic formulas, one per depth — built, not guessed: each level's constant is placed where
 * the level below, followed along the word one depth shallower, winds round it, so the candidate FAILS
 * there (measured) and closes one level deeper (the theorem). The four-level candidate is built on the
 * three-level one and, like any formula here, is already ruled out by the depth-3 word: no fourth
 * constant was found that the depth-3 word's curve winds round (its sub-words are other 3-cycles).
 */
export const QUINTIC_CANDIDATES: readonly GalleryFormula[] = [
  { id: "q1", label: "one level", text: "sqrt(disc)" },
  { id: "q2", label: "two levels", text: "cbrt(-20.875 - 27.75*i + sqrt(disc))" },
  {
    id: "q3",
    label: "three levels",
    text: "sqrt(-0.625 - 0.5*i + cbrt(-20.875 - 27.75*i + sqrt(disc)))",
  },
  {
    id: "q4",
    label: "four levels",
    text: "root(5, 3 + sqrt(-0.625 - 0.5*i + cbrt(-20.875 - 27.75*i + sqrt(disc))))",
  },
];

function buildRung(degree: RungDegree): Rung {
  const n = degree;
  const roots = generic(n);
  const T = (i: number, j: number): Word => letter(t(n, i, j));
  const words: RungWord[] = [{ id: "d0", word: T(0, 1) }];
  let formulas: GalleryFormula[] = [];
  if (n === 2) {
    formulas = [
      {
        id: "quadratic",
        label: "the quadratic formula",
        text: "(-a1 + sqrt(a1^2 - 4*a0))/2",
      },
    ];
  }
  const transpositions: Word[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) transpositions.push(T(i, j));
  if (n >= 3) {
    // (123) as a commutator of two swaps.
    const d1 = commutatorFor(c3(n, 0, 1, 2), transpositions);
    words.push({ id: "d1", word: d1 });
  }
  if (n === 3) {
    formulas = [{ id: "cardano", label: "Cardano's formula", text: CARDANO }];
    const ones = transpositions.flatMap((a) => transpositions.map((b) => comm(a, b)));
    // Depth 2 in S₃: commutators of 3-cycles, all trivial since A₃ is abelian.
    const d2 = ones.filter((w) => wordPerm(w).some((v, i) => v !== i));
    words.push(
      { id: "d2", word: comm(d2[0], d2[1]) },
      { id: "d2b", word: comm(d2[1], d2[2]) },
    );
  }
  if (n === 4) {
    formulas = [
      { id: "ferrari", label: "Ferrari's formula (Euler's form)", text: FERRARI },
    ];
    const ones = transpositions.flatMap((a) => transpositions.map((b) => comm(a, b)));
    const target: Perm = [3, 2, 1, 0]; // (14)(23)
    const d2 = commutatorFor(target, ones);
    words.push({ id: "d2", word: d2 });
    const twos = ones
      .flatMap((a) => ones.slice(0, 12).map((b) => comm(a, b)))
      .filter((w) => wordPerm(w).some((v, i) => v !== i));
    const other = twos.find((w) => !same(wordPerm(w), target)) ?? twos[1];
    words.push({ id: "d3", word: comm(d2, other) });
  }
  if (n === 5) {
    formulas = [...QUINTIC_CANDIDATES];
    const target = c3(n, 0, 1, 2);
    words.length = 0;
    words.push({ id: "d0", word: letter(t(n, 0, 1)) });
    for (let d = 1; d <= 4; d++)
      words.push({ id: `d${d}`, word: selfFeeding(target, d) });
  }
  return {
    degree,
    name: n === 2 ? "Quadratic" : n === 3 ? "Cubic" : n === 4 ? "Quartic" : "Quintic",
    roots,
    formulas,
    words,
  };
}

const RUNGS = new Map<RungDegree, Rung>();
export function rung(degree: RungDegree): Rung {
  let r = RUNGS.get(degree);
  if (!r) {
    r = buildRung(degree);
    RUNGS.set(degree, r);
  }
  return r;
}

/** The derived series of Sₙ, enumerated: each level's order and elements. */
export function symmetricDerived(n: number): {
  orders: number[];
  levels: Perm[][];
  solvable: boolean;
} {
  const gens: Perm[] = [t(n, 0, 1), Array.from({ length: n }, (_, k) => (k + 1) % n)];
  const s = derivedSeries(gens, n);
  const levels = s.levels.map((l) =>
    l.order === 1
      ? [Array.from({ length: n }, (_, k) => k)]
      : groupElements([...l.generators], n, 1000).elements,
  );
  return { orders: s.levels.map((l) => l.order), levels, solvable: s.solvable === true };
}

/** One step of the identity ladder (research 02 §11): [a, b], composed by the permutation engine. */
export interface Identity {
  readonly a: Perm;
  readonly b: Perm;
  readonly result: Perm;
}

/** The identities each rung rests on: swaps give 3-cycles; 3-cycles give double swaps (or 3-cycles). */
export function identities(degree: RungDegree): Identity[] {
  const n = degree;
  const pairs: [Perm, Perm][] = [];
  if (n >= 3) pairs.push([t(n, 0, 1), t(n, 1, 2)]);
  if (n >= 4) {
    pairs.push([c3(n, 0, 1, 2), c3(n, 1, 2, 3)]);
    const v1: Perm = t(n, 0, 2).map((x, i) => (i === 1 ? 3 : i === 3 ? 1 : x));
    const v2: Perm = t(n, 0, 3).map((x, i) => (i === 1 ? 2 : i === 2 ? 1 : x));
    pairs.push([v1, v2]);
  }
  if (n >= 5) pairs.push([c3(n, 0, 1, 2), c3(n, 2, 3, 4)]);
  return pairs.map(([a, b]) => ({ a, b, result: loopCommutator(a, b) }));
}
