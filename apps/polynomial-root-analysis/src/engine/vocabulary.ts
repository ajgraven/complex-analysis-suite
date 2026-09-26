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
  parameter: "Parameter plane (t)",
  parameterLegend:
    "✕: the branch points of t, where two roots of p(t, z) collide. The square is the base point t₀ — drag it; the dashed loops are the flower of lassos from it.",
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
  noPoints: (name: string): string =>
    `${name} has no branch points: moving it alone, the roots never collide, so every loop returns them to where they started.`,
  what: "Move the coefficient round a loop and back: the roots come back as a set, but perhaps permuted. A loop round one branch point swaps the two roots that collide there.",
  build: "Build a word (each loop is added to the end)",
  group: (name: string): string => `Group of every loop round a branch point of ${name}`,
  whatFamily:
    "Move t round a loop from the base point and back: the roots of p(t₀, z) come back as a set, but perhaps permuted. Each lasso leaves t₀ along its own straight line.",
  motion:
    "Plays the permutation on the roots themselves: each root moves to where another started, and the coefficients trace a closed loop.",
  braid:
    "The roots' real parts over the course of the last loop or motion, left to right; where two strands cross, the one with the larger imaginary part passes over.",
} as const;

export const FAMILY = {
  heading: "Family",
  what: "A polynomial in z whose coefficients depend on a parameter t: one polynomial for every t. Where two of its roots collide — the zeros of the discriminant in t — the roots are branched, and a loop of t round one such point comes back with two of them swapped.",
  box: "p(t, z) =",
  presets: "Families",
  open: "Open this family",
  base: "Base point t₀ =",
  baseWhy: "Every lasso starts and ends here, and the root plane shows p(t₀, z).",
  points: (k: number): string => `${k} branch point${k === 1 ? "" : "s"} in t`,
  pointsLabel: "Branch points of t",
  flower:
    "The flower of lassos: one from t₀ round each branch point, each along its own straight tether",
  flowerLabel: "Each lasso's permutation of the roots",
  group: "Monodromy group — the Galois group over ℂ(t)",
  specialise: (t0: string): string => `Open p(${t0}, z) in the sandbox`,
  back: "Back to the family",
  leave: "Leave the family",
  bridgeHeading: "From ℂ(t) to ℚ",
  bridgeWhy:
    "The monodromy group G is the Galois group over ℂ(t). It is a normal subgroup of the Galois group A over ℚ(t), and for every rational t₀ off the branch points the Galois group of p(t₀, z) over ℚ is a subgroup of A — equal to it except for t₀ in a thin set (Hilbert's irreducibility theorem).",
  specialised: (fam: string, t0: string): string =>
    `This is the member t = ${t0} of the family ${fam}.`,
  notRational:
    "t₀ is not a rational number, so p(t₀, z) is not a polynomial over ℚ — move the base point to a rational to compare.",
} as const;

export const GALOIS = {
  what: "Reduce the coefficients mod a prime p: the degrees of the irreducible factors are the cycle lengths of one permutation of the roots, and the Galois group contains it. Every prime below 1000 that divides neither the leading coefficient nor the discriminant adds one.",
  open: "not yet identified",
  openWhy: "no theorem used here names a group from these elements alone",
  reducible: "Each factor's group is found on its own; how they combine is not computed.",
  linear: "a rational root — nothing for a group to move",
  busy: "reading the primes…",
  refused: (why: string): string => `No Galois group: ${why}.`,
  solvable: "solvable — the roots can be written with radicals",
  notSolvable: "not solvable — the roots cannot be written with radicals",
  indistinguishable: (label: string, others: readonly string[]): string =>
    `the primes cannot separate ${label} from ${others.join(", ")}: their cycle types occur in the same proportions`,
  generators: "Generators, as permutations of the roots",
  candidates: "Groups still consistent with the primes, best fit first",
  estimateWhy:
    "Past degree 7 no group is proved here: each candidate contains every cycle type seen and matches the discriminant, and the ranking is by how well its proportions match the counts.",
  play: (text: string): string => `Play ${text} on the roots`,
  moreCandidates: (k: number): string =>
    `and ${k} more group${k === 1 ? "" : "s"} still consistent, each a worse fit`,
} as const;

export const LATTICE = {
  toggle: "Show the Galois correspondence: each subgroup and its fixed field",
  busy: "working out the subgroups and their fields…",
  refused: "No correspondence",
  overgroups:
    "Groups containing the Galois group: the invariant of each is fixed by every element, so it is an integer.",
  overgroupsLabel: "Groups containing the Galois group, with their integer invariants",
  heading: (total: number, every: boolean): string =>
    every
      ? `Its ${total} subgroup${total === 1 ? "" : "s"}, largest first, each with its fixed field:`
      : `Its subgroups, one per conjugacy class (${total} in all), largest first, each with its fixed field:`,
  nodesLabel: "Subgroups of the Galois group and their fixed fields",
  conjugates: (k: number, every: boolean): string =>
    every ? `one of ${k} conjugates` : `and ${k - 1} conjugate${k === 2 ? "" : "s"}`,
  derived: (k: number): string =>
    k === 1 ? "the commutator subgroup" : `step ${k} of the derived series`,
  below: (names: readonly string[]): string => `(contains ${names.join(", ")})`,
  played: (perm: string): string =>
    `After the last motion, ${perm}: an invariant stays exactly when the motion lies in its subgroup.`,
  longPoly: (degree: number, digits: number): string =>
    `a polynomial of degree ${degree} with integer coefficients of up to ${digits} digits`,
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
  descent:
    "descended from the symmetric group one maximal subgroup at a time, each step decided by an integer found exactly",
  resolvent: (bits: number, plain: boolean): string =>
    `its coefficients certified from the roots to ${bits} bits and rounded to integers; the root tested exactly${plain ? "" : ", after a change of variable that makes it simple"}`,
  statistics: (primes: number): string =>
    `ranked by how often each cycle type appeared among ${primes} primes — an estimate`,
  solvableTable: "read from the group's structure",
  generatorsTheorem: "every permutation of this parity is in the group",
  generatorsFix: (root: string): string =>
    `each fixes the last resolvent's integer root ${root}`,
  generatorsDescent: "the group the descent ended at",
  fixedByAll:
    "the Galois group lies inside it, so the invariant is fixed by every element: a rational algebraic integer, named by its certified disc",
  fieldPolynomial: (plain: boolean): string =>
    `its coefficients certified from the roots and rounded to integers; its roots proved distinct, so it is irreducible${plain ? "" : ", after a change of variable that separates them"}`,
  membership: "decided exactly: the motion is (or is not) an element of this subgroup",
  movedValue: "the invariant at the moved roots, in floating point",
  familyBranch:
    "the zeros of the discriminant in t, each proved in exact arithmetic to hold exactly one",
  geometric:
    "the Galois group over ℂ(t) is the monodromy group (Riemann's existence theorem), here generated by the certified lassos, which leave one base point along tethers that never cross",
  arithmeticSymmetric:
    "it contains the monodromy group, which is already every permutation",
  arithmeticSquare:
    "it contains the alternating monodromy group, and the discriminant is a square in ℚ(t), so it is even",
  arithmeticNotSquare:
    "it contains the alternating monodromy group, and the discriminant is not a square in ℚ(t), so it has an odd element too",
  hilbert:
    "the specialisation's group is a subgroup of the group over ℚ(t) (Hilbert); a subgroup of the same order is the whole group",
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
];
