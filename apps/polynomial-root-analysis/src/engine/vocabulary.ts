// Every reader-facing word, decided once (PLAN §5.3, DESIGN §9).
//
// House names — the algorithms and theorems the engine is built on — never reach a reader: a label
// that says how the number was computed in a name the reader has to look up is not an explanation.
// The denylist below is asserted over the mounted screen in test/shell.test.ts.

export const APP_NAME = "Polynomial Root Analysis";

export const RING_LABEL = { C: "ℂ", R: "ℝ", Q: "ℚ" } as const;
export const RING_HINT = {
  C: "complex coefficients",
  R: "real coefficients — roots come in conjugate pairs",
  Q: "rational coefficients, kept exactly",
} as const;

// "Plane", not "Roots": the right rail's card is already a region named "Roots", and two landmarks
// with one name are two places a screen reader cannot tell apart (axe's landmark-unique, measured).
export const PANE = {
  roots: "Root plane",
  coefficients: "Coefficient plane",
  overlay: "Roots and coefficients",
} as const;

export const CARD = {
  polynomial: "Polynomial",
  roots: "Roots",
  analysis: "Analysis",
  monodromy: "Monodromy",
  galois: "Galois group over ℚ",
  view: "View",
} as const;

export const ANALYSIS = {
  critical:
    "The critical points — the zeros of p′ — are where the field of unit charges at the roots vanishes: p′/p = Σ 1/(z − rᵢ) = 0. Gauss–Lucas: they lie in the convex hull of the roots.",
  branch: (j: number): string =>
    `Moving a${j} alone, two roots collide exactly where the discriminant vanishes; a loop around one of these points swaps two roots.`,
  pseudozero:
    "The shaded set holds every root of every polynomial whose coefficients are within ε of these, coefficient by coefficient (|Δaₖ| ≤ ε|aₖ|).",
} as const;

export const MONODROMY = {
  none: "Select a coefficient below the leading one: its branch points are what loops go round.",
  noPoints: (j: number): string =>
    `a${j} has no branch points: moving it alone, the roots never collide, so every loop returns them to where they started.`,
  what: "Move the coefficient round a loop and back: the roots come back as a set, but perhaps permuted. A loop round one branch point swaps the two roots that collide there.",
  build: "Build a word (each loop is added to the end)",
  group: (j: number): string => `Group of every loop round a branch point of a${j}`,
  motion:
    "Plays the permutation on the roots themselves: each root moves to where another started, and the coefficients trace a closed loop.",
  braid:
    "The roots' real parts over the course of the last loop or motion, left to right; where two strands cross, the one with the larger imaginary part passes over.",
} as const;

export const GALOIS = {
  what: "Reduce the coefficients mod a prime p: the degrees of the irreducible factors are the cycle lengths of one permutation of the roots, and the Galois group contains it. Every prime below 1000 that divides neither the leading coefficient nor the discriminant adds one.",
  open: "not yet identified",
  openWhy: "no theorem used here names a group from these elements alone",
  reducible: "Each factor's group is found on its own; how they combine is not computed.",
  linear: "a rational root — nothing for a group to move",
  busy: "reading the primes…",
  refused: (why: string): string => `No Galois group: ${why}.`,
} as const;

/** "a swap", "a 5-cycle", "an 8-cycle", "an 11-cycle" — the article follows the spoken number. */
export function aCycle(l: number): string {
  const an = l === 8 || l === 11 || l === 18 || (l >= 80 && l < 90);
  return `${an ? "an" : "a"} ${cycleWord(l)}`;
}

/** "swap", "3-cycle", "5-cycle". */
export function cycleWord(l: number): string {
  return l === 2 ? "swap" : `${l}-cycle`;
}

export function typeText(type: readonly number[]): string {
  return `(${type.join(", ")})`;
}

export function powerWord(m: number): string {
  return m === 2 ? "squared" : m === 3 ? "cubed" : `to the power ${m}`;
}

/** Where an element came from: "a 5-cycle at p = 3", "type (3, 2) at p = 2, cubed is a swap". */
export function witnessText(w: {
  cycle: number;
  prime: number;
  type: readonly number[];
  power: number;
}): string {
  return w.power === 1
    ? `${aCycle(w.cycle)} at p = ${w.prime}`
    : `type ${typeText(w.type)} at p = ${w.prime}, ${powerWord(w.power)} is ${aCycle(w.cycle)}`;
}

/** The claim a certified disc component makes, worded for a reader. */
export function discClaim(count: number): string {
  return count === 1
    ? "exactly 1 root in this disc"
    : `exactly ${count} roots in these ${count} discs`;
}

export function multiplicityClaim(
  m: number,
  exact: boolean,
  distinct: number | null,
): string {
  if (exact) {
    if (m === 1)
      return distinct === 1 || distinct === null
        ? "a simple root"
        : `${distinct} simple roots`;
    const what = m === 2 ? "double" : m === 3 ? "triple" : `${m}-fold`;
    return distinct === 1 || distinct === null
      ? `a ${what} root`
      : `${distinct} ${what} roots`;
  }
  return `a cluster of ${m} — possibly one root of multiplicity ${m}, possibly ${m} nearby roots`;
}

export const METHOD = {
  coordinate: "numerical root-finding",
  discs: "proved in exact arithmetic on the plotted points",
  multiplicityExact: "decided in exact arithmetic on the rational coefficients",
  cluster: "read off the inclusion discs, which cannot separate the roots inside them",
  kappa: "how far this root moves per relative change in the coefficients",
  discriminantExact: "computed exactly from the rational coefficients",
  discriminantApprox: "the product of the squared root differences, in floating point",
  branchExact:
    "each proved in exact arithmetic to hold exactly one zero of the discriminant",
  branchNumeric: "numerical — the coefficient-plane condition z·q′ − j·q = 0",
  hullCheck: "checked exactly on the plotted points",
  pseudozero:
    "proved on the region's boundary, where every such polynomial stays away from zero",
  tracker: (steps: number, halvings: number): string =>
    `proved in exact arithmetic on every one of ${steps} steps of the loop (${halvings} halved): on each, no two roots can meet`,
  groupTranspositions: "generated by swaps that link every root to every other",
  groupPrimitive: "a primitive group containing a swap or a 3-cycle",
  groupEnumerated: (order: number): string => `every one of its ${order} elements listed`,
  factorExact: "factored exactly over the integers",
  irreducible: "no factorisation over the integers exists — decided exactly",
  modPrime: (p: number): string => `the factors of the polynomial mod ${p}`,
  discSquare: "decided exactly: an integer square root",
  symmetric: "a primitive group containing a swap contains every permutation",
  alternating:
    "a primitive group containing a 3-cycle contains every even permutation, and a square discriminant rules out the odd ones",
  alternatingOdd:
    "a primitive group containing a 3-cycle contains every even permutation, and a discriminant that is not a square puts an odd one in too",
} as const;

/** Words the screen must never carry — the house names of the methods behind it. */
export const DENYLIST: readonly RegExp[] = [
  /\bSmith\b/,
  /\bAberth\b/,
  /\bEhrlich\b/,
  /\bDurand\b/,
  /\bKerner\b/,
  /\bWeierstrass\b/,
  /\bYun\b/,
  /\bStern\b/,
  /\bBrocot\b/,
  /\bdyadic\b/i,
  /\bBigInt\b/,
  /\btier\b/i,
  /\bRouch[eé]\b/,
  /\bMosier\b/,
  /\bBareiss\b/,
  /\bTaylor\b/,
  /\bJordan\b/,
  /\bAtkinson\b/,
  /\bDedekind\b/,
  /\bStauduhar\b/,
  /\bConrad\b/,
  /\bHensel\b/,
  /\bZassenhaus\b/,
  /\bCantor\b/,
  /\bChebotarev\b/,
  /\bMignotte\b/,
  /\bBerlekamp\b/,
  /\bSn\b/,
  /\b\d+T\d+\b/,
];
