// The Galois corpus (DESIGN §8), as far as PRA-4 can reach it: every polynomial with its group, and
// what the evidence-only step must say — `S` or `A` exactly when the group IS Sₙ or Aₙ, `open`
// otherwise. A named non-symmetric group reading `S` would be a false theorem; the suite checks both
// directions.
//
// Sources. Degrees 2–6: Cohen's per-group polynomials (A Course in Computational Algebraic Number
// Theory, §6.3), as sympy's galois-group suite carries them. The Klüners–Malle database PLAN names was
// not reachable from this environment (STATUS, PRA-4), so degree 7 is assembled from citable
// constructions instead: six of its seven groups, F₂₁ (7T3) left for PRA-5 to fill.
export interface GaloisCase {
  readonly id: string;
  readonly text: string;
  /** The group, as a reader names it. */
  readonly group: string;
  readonly order: number;
  /** What the evidence alone must conclude. */
  readonly verdict: "S" | "A" | "open";
  readonly source: string;
}

const COHEN = "Cohen §6.3";

export const GALOIS: readonly GaloisCase[] = [
  { id: "2-S2", text: "z^2+z+1", group: "S₂", order: 2, verdict: "S", source: COHEN },
  {
    id: "3-A3",
    text: "z^3+z^2-2z-1",
    group: "A₃",
    order: 3,
    verdict: "A",
    source: COHEN,
  },
  { id: "3-S3", text: "z^3+2", group: "S₃", order: 6, verdict: "S", source: COHEN },
  {
    id: "4-C4",
    text: "z^4+z^3+z^2+z+1",
    group: "C₄",
    order: 4,
    verdict: "open",
    source: COHEN,
  },
  { id: "4-V", text: "z^4+1", group: "V₄", order: 4, verdict: "open", source: COHEN },
  { id: "4-D4", text: "z^4-2", group: "D₄", order: 8, verdict: "open", source: COHEN },
  { id: "4-A4", text: "z^4+8z+12", group: "A₄", order: 12, verdict: "A", source: COHEN },
  { id: "4-S4", text: "z^4+z+1", group: "S₄", order: 24, verdict: "S", source: COHEN },
  {
    id: "5-C5",
    text: "z^5+z^4-4z^3-3z^2+3z+1",
    group: "C₅",
    order: 5,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "5-D5",
    text: "z^5-5z+12",
    group: "D₅",
    order: 10,
    verdict: "open",
    source: COHEN,
  },
  { id: "5-F20", text: "z^5+2", group: "F₂₀", order: 20, verdict: "open", source: COHEN },
  { id: "5-A5", text: "z^5+20z+16", group: "A₅", order: 60, verdict: "A", source: COHEN },
  { id: "5-S5", text: "z^5-z+1", group: "S₅", order: 120, verdict: "S", source: COHEN },
  {
    id: "5-S5-sandbox",
    text: "z^5-z-1",
    group: "S₅",
    order: 120,
    verdict: "S",
    source: "research 01 §4",
  },
  {
    id: "6-C6",
    text: "z^6+z^5+z^4+z^3+z^2+z+1",
    group: "C₆",
    order: 6,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-S3",
    text: "z^6+108",
    group: "S₃ (6T2)",
    order: 6,
    verdict: "open",
    source: COHEN,
  },
  { id: "6-D6", text: "z^6+2", group: "D₆", order: 12, verdict: "open", source: COHEN },
  {
    id: "6-A4",
    text: "z^6-3z^2-1",
    group: "A₄ (6T4)",
    order: 12,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-G18",
    text: "z^6+3z^3+3",
    group: "C₃ × S₃",
    order: 18,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-A4xC2",
    text: "z^6-3z^2+1",
    group: "A₄ × C₂",
    order: 24,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-S4p",
    text: "z^6-4z^2-1",
    group: "S₄⁺ (6T7)",
    order: 24,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-S4m",
    text: "z^6-3z^5+6z^4-7z^3+2z^2+z-4",
    group: "S₄⁻ (6T8)",
    order: 24,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-G36m",
    text: "z^6+2z^3-2",
    group: "S₃ × S₃",
    order: 36,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-S4xC2",
    text: "z^6+2z^2+2",
    group: "S₄ × C₂",
    order: 48,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-PSL2F5",
    text: "z^6+10z^5+55z^4+140z^3+175z^2+170z+25",
    group: "PSL(2,5)",
    order: 60,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-PGL2F5",
    text: "z^6+10z^5+55z^4+140z^3+175z^2-3019z+25",
    group: "PGL(2,5)",
    order: 120,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-G36p",
    text: "z^6+6z^4+2z^3+9z^2+6z-4",
    group: "C₃² ⋊ C₄",
    order: 36,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-G72",
    text: "z^6+2z^4+2z^3+z^2+2z+2",
    group: "C₃² ⋊ D₄",
    order: 72,
    verdict: "open",
    source: COHEN,
  },
  {
    id: "6-A6",
    text: "z^6+24z-20",
    group: "A₆",
    order: 360,
    verdict: "A",
    source: COHEN,
  },
  { id: "6-S6", text: "z^6+z+1", group: "S₆", order: 720, verdict: "S", source: COHEN },
  // Conrad's example: the first prime showing a transposition DIRECTLY is 311; the power trick finds
  // one at p = 2.
  {
    id: "6-S6-conrad",
    text: "z^6+z^4+z+3",
    group: "S₆",
    order: 720,
    verdict: "S",
    source: "Conrad, Recognizing Sₙ and Aₙ, Ex. 2.4",
  },
  // The Gaussian period polynomial of ℚ(ζ₂₉) of degree 7 — recomputed from the periods in @cas/exact's suite.
  {
    id: "7-C7",
    text: "z^7+z^6-12z^5-7z^4+28z^3+14z^2-9z+1",
    group: "C₇",
    order: 7,
    verdict: "open",
    source: "Gaussian periods, p = 29",
  },
  // The Hilbert class field of ℚ(√−71) (class number 7): disc = −71³.
  {
    id: "7-D7",
    text: "z^7-z^6-z^5+z^4-z^3-z^2+2z+1",
    group: "D₇",
    order: 14,
    verdict: "open",
    source: "Hilbert class field of ℚ(√−71)",
  },
  {
    id: "7-F42",
    text: "z^7-2",
    group: "F₄₂",
    order: 42,
    verdict: "open",
    source: "radical extension",
  },
  {
    id: "7-PSL32",
    text: "z^7-7z+3",
    group: "PSL(3,2)",
    order: 168,
    verdict: "open",
    source: "Trinks",
  },
  // Found by searching z⁷ + az + b for a square discriminant, and named by this step itself.
  {
    id: "7-A7",
    text: "z^7-56z+48",
    group: "A₇",
    order: 2520,
    verdict: "A",
    source: "search, square discriminant",
  },
  {
    id: "7-S7",
    text: "z^7-z-1",
    group: "S₇",
    order: 5040,
    verdict: "S",
    source: "Osada",
  },
];
