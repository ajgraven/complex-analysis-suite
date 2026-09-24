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
];
