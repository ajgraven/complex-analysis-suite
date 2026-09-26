// Tier 1: the Galois group of an irreducible polynomial of degree ≤ 7, EXACTLY, by Stauduhar's descent
// (DESIGN §4.6).
//
// The group is carried as a LABELLED group: a conjugate Gc = τ∘G∘τ⁻¹ of a standard table group G,
// acting on the numbered roots, with Gal ≤ Gc proved at every step. Start at Sₙ (or Aₙ when the
// discriminant is a square). For each class of maximal transitive subgroup K of G:
//   • K = G ∩ Aₙ (index 2): Gal ≤ K exactly when the discriminant is a square — decided exactly;
//   • otherwise take the invariant F with Stab_G(F) = K, carried into the labelled frame, and its value
//     v_σ = (σ·F)(z) at every left coset σ of Kc in Gc, as CERTIFIED DISCS (refine.ts, discArith.ts).
//     R(T) = ∏(T − v_σ) has integer coefficients (it is fixed by Gc ⊇ Gal, and the roots of a monic
//     integer polynomial are algebraic integers), so each coefficient's disc, once narrower than ½,
//     names it. An integer θ with R(θ) = 0 and R′(θ) ≠ 0 — both EXACT, in ℤ — is the value of exactly
//     one coset σ, and then Gal ≤ σ∘Kc∘σ⁻¹: descend. A multiple integer root cannot be attributed to a
//     coset, so the roots are replaced by yᵢ = h(zᵢ) for a small integer polynomial h (a Tschirnhaus
//     transformation) and the class tried again. Nothing about the argument needs the yᵢ distinct:
//     g ∈ Gal permutes them by the same labels, so g(v_σ) = v_{gσ} still, and a SIMPLE integer root
//     still names one coset. Shifts x ↦ x + k were not enough on the symmetric examples (x⁴ − 2, x⁷ − 2,
//     the cyclotomic polynomials), whose invariants collide under every translation — measured.
// When no class admits a root, Gc is the group. Every number that decides anything is an integer
// compared exactly; the discs only say WHICH integer.
import { compose, groupElements, inverse, type Perm } from "@cas/monodromy";
import { DiscArith, polyFromRoots, type Disc } from "./discArith.js";
import {
  actOn,
  cosetRepresentatives,
  orbit,
  stabiliserOrder,
  type Exponents,
} from "./invariant.js";
import { preciseRoots, labelsHold } from "./refine.js";
import {
  alternatingGroup,
  groupByLabel,
  symmetricGroup,
  type TransitiveGroup,
} from "./tables.js";
import invariantData from "./data/invariants.json";

type Cx = readonly [number, number];

const INVARIANTS = invariantData as unknown as Record<string, number[]>;

/** Precision cap in fractional bits; past it the descent refuses by name. */
export const MAX_BITS = 4096;
const START_BITS = 128;
/**
 * The Tschirnhaus transformations tried, in order, as ascending integer coefficients of h. The last two
 * are DENSE for a reason: for x⁷ − 2 (roots αζᵏ) the D₇-invariant x₀x₁ takes the values
 * 7·Σ_{j+l≡0 (7)} hⱼhₗ α^{j+l} ζ^{lc}, which is the same constant 7h₀² at every coset unless h has
 * two exponents summing to 7 — so no h of degree ≤ 3 can ever separate them.
 */
export const TRANSFORMS: readonly (readonly number[])[] = [
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 1, 1],
  [1, -1, 1],
  [3, 2, 1],
  [1, 0, 1, 1],
  [2, 1, -1, 1],
  [-1, 3, 0, 1],
  [1, 1, 2, 1, 1],
  [2, 1, 3, 1, 2, 1, 1],
];

export interface DescentStep {
  readonly from: string;
  readonly to: string;
  /** [G : K] — the resolvent's degree, or 2 for the discriminant. */
  readonly index: number;
  readonly via: "discriminant" | "resolvent";
  readonly outcome: "descend" | "stay";
  /** The resolvent's integer root when the step descended by one. */
  readonly root: string | null;
  /** Fractional bits the resolvent was certified at. */
  readonly bits: number;
  /** The transformation h the roots went through (x ↦ x is [0, 1]). */
  readonly transform: readonly number[];
  /** When G holds several classes of subgroups isomorphic to this one (A₇ holds two PSL(3,2)): which. */
  readonly classOf: { readonly k: number; readonly of: number } | null;
}

/** The last resolvent root, so a test can check the labelled group fixes it. */
export interface Witness {
  readonly orbit: readonly Exponents[];
  readonly coset: Perm;
  readonly root: string;
  readonly transform: readonly number[];
}

export type Tier1 =
  | {
      readonly ok: true;
      readonly group: TransitiveGroup;
      /** τ: the labelled group is τ∘G∘τ⁻¹. */
      readonly tau: Perm;
      /** The group's generators as permutations of the numbered roots (0-based). */
      readonly generators: readonly Perm[];
      /** Whether the numbering is the reader's — each plotted root's own disc holds the root it names. */
      readonly labelsHold: boolean;
      readonly steps: readonly DescentStep[];
      readonly witness: Witness | null;
      /** The certified roots the last step used (for the witness check). */
      readonly roots: readonly Disc[];
      readonly bits: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * The stored invariant for G's class `ci`, verified where it is used: its orbit's stabiliser in G must be
 * exactly K, or the descent refuses by name rather than trusting the table.
 */
export function storedInvariant(
  G: TransitiveGroup,
  ci: number,
  table: Readonly<Record<string, readonly number[]>> = INVARIANTS,
): { ok: true; orbit: Exponents[] } | { ok: false; reason: string } {
  const m = G.maximalTransitive?.[ci];
  if (!m) return { ok: false, reason: `${G.label} has no class ${ci}` };
  const K = groupByLabel(m.label);
  const monomial = table[`${G.label}/${ci}`];
  if (!monomial)
    return { ok: false, reason: `no invariant is stored for ${G.label} ⊃ ${K.label}` };
  const n = G.degree;
  const orb = orbit(groupElements([...m.generators], n, 10_000).elements, monomial);
  const Gstd = groupElements([...G.generators], n, 10_000).elements;
  if (stabiliserOrder(Gstd, orb) !== K.order)
    return {
      ok: false,
      reason: `the stored invariant for ${G.label} ⊃ ${K.label} is not one`,
    };
  return { ok: true, orbit: orb };
}

function classOf(
  classes: readonly { readonly label: string }[],
  ci: number,
): { k: number; of: number } | null {
  const same = classes
    .map((c, i) => [c.label, i] as const)
    .filter(([l]) => l === classes[ci].label);
  return same.length > 1
    ? { k: same.findIndex(([, i]) => i === ci) + 1, of: same.length }
    : null;
}

const conjugate = (tau: Perm, g: Perm): Perm => compose(tau, compose(g, inverse(tau)));

function elementsOf(g: TransitiveGroup, tau: Perm): Perm[] {
  const n = g.degree;
  return groupElements([...g.generators], n, 10_000).elements.map((e) =>
    conjugate(tau, e),
  );
}

/** v = Σ_{e ∈ orbit} ∏ z_{σ(i)}^{eᵢ}, as a disc. */
function valueAt(
  A: DiscArith,
  powers: Disc[][],
  orb: readonly Exponents[],
  sigma: Perm,
): Disc {
  let sum = A.int(0n);
  for (const e of orb) {
    let term = A.int(1n);
    for (let i = 0; i < e.length; i++)
      if (e[i] > 0) term = A.mul(term, powers[sigma[i]][e[i]]);
    sum = A.add(sum, term);
  }
  return sum;
}

const evalInt = (c: readonly bigint[], x: bigint): bigint =>
  c.reduceRight((acc, a) => acc * x + a, 0n);
const derivInt = (c: readonly bigint[]): bigint[] =>
  c.slice(1).map((a, k) => a * BigInt(k + 1));

type Trial =
  | { kind: "descend"; coset: Perm; root: bigint }
  | { kind: "stay" }
  | { kind: "multiple" }
  | { kind: "precision" };

/** One class at one precision and one shift. */
/** h(z) as a disc, Horner. */
export function transformDisc(A: DiscArith, h: readonly number[], z: Disc): Disc {
  let acc = A.int(BigInt(h[h.length - 1]));
  for (let k = h.length - 2; k >= 0; k--) acc = A.add(A.mul(acc, z), A.int(BigInt(h[k])));
  return acc;
}

function tryClass(
  A: DiscArith,
  roots: readonly Disc[],
  h: readonly number[],
  cosets: readonly Perm[],
  orb: readonly Exponents[],
): Trial {
  const maxE = Math.max(...orb.flat());
  const shifted = roots.map((z) => transformDisc(A, h, z));
  const powers = shifted.map((z) => {
    const p: Disc[] = [A.int(1n)];
    for (let k = 1; k <= maxE; k++) p.push(A.mul(p[k - 1], z));
    return p;
  });
  const values = cosets.map((s) => valueAt(A, powers, orb, s));
  if (!values.every((v) => A.narrow(v))) return { kind: "precision" };
  const R = polyFromRoots(A, values);
  const coeffs: bigint[] = [];
  for (const c of R) {
    const k = A.integerIn(c);
    if (k === null) return { kind: "precision" };
    coeffs.push(k);
  }
  const dR = derivInt(coeffs);
  let multiple = false;
  for (let i = 0; i < values.length; i++) {
    const theta = A.integerIn(values[i]);
    if (theta === null || evalInt(coeffs, theta) !== 0n) continue;
    if (evalInt(dR, theta) === 0n) {
      multiple = true;
      continue;
    }
    // A simple root is the value of exactly one coset; its disc must be the only one holding θ.
    const holders = values.filter((v) => A.integerIn(v) === theta).length;
    if (holders !== 1) return { kind: "precision" };
    return { kind: "descend", coset: cosets[i], root: theta };
  }
  return multiple ? { kind: "multiple" } : { kind: "stay" };
}

/**
 * Identify the Galois group of the MONIC, IRREDUCIBLE integer polynomial F (ascending) whose roots the
 * reader sees at `approx`, in that order.
 */
export function identify(
  F: readonly bigint[],
  approx: readonly Cx[],
  discSquare: boolean,
): Tier1 {
  const n = F.length - 1;
  if (n < 2 || n > 7) return { ok: false, reason: `degree ${n} is outside 2–7` };
  let start = symmetricGroup(n);
  const steps: DescentStep[] = [];
  if (discSquare) {
    const a = alternatingGroup(n);
    if (a) {
      steps.push({
        from: start.label,
        to: a.label,
        index: 2,
        via: "discriminant",
        outcome: "descend",
        root: null,
        bits: 0,
        transform: TRANSFORMS[0],
        classOf: null,
      });
      start = a;
    }
  }
  let G = start;
  let tau: Perm = Array.from({ length: n }, (_, i) => i);
  let S = START_BITS;
  let refined = preciseRoots(F, approx, S);
  if (!refined.ok) return refined;
  let witness: Witness | null = null;

  descend: for (;;) {
    const Gc = elementsOf(G, tau);
    const classes = G.maximalTransitive ?? [];
    for (let ci = 0; ci < classes.length; ci++) {
      const m = classes[ci];
      const K = groupByLabel(m.label);
      if (K.even && !G.even && 2 * K.order === G.order) {
        // G ∩ Aₙ. A square discriminant started the descent at Aₙ, so every G reached since is even
        // and this class only ever meets a discriminant that is NOT a square: Gal is not inside it.
        steps.push({
          from: G.label,
          to: K.label,
          index: 2,
          via: "discriminant",
          outcome: "stay",
          root: null,
          bits: 0,
          transform: TRANSFORMS[0],
          classOf: null,
        });
        continue;
      }
      const inv = storedInvariant(G, ci);
      if (!inv.ok) return inv;
      const orbStd = inv.orbit;
      const orb = orbStd.map((e) => actOn(tau, e));
      const cosets = cosetRepresentatives(Gc, orb);
      let decided: Trial | null = null;
      let used: readonly number[] = TRANSFORMS[0];
      for (const h of TRANSFORMS) {
        for (;;) {
          const A = new DiscArith(S);
          const t = tryClass(A, refined.roots, h, cosets, orb);
          if (t.kind !== "precision") {
            decided = t;
            break;
          }
          if (2 * S > MAX_BITS)
            return {
              ok: false,
              reason: `a resolvent could not be certified within ${MAX_BITS} bits`,
            };
          S *= 2;
          refined = preciseRoots(F, approx, S);
          if (!refined.ok) return refined;
        }
        used = h;
        if (decided.kind !== "multiple") break;
      }
      if (!decided || decided.kind === "multiple")
        return {
          ok: false,
          reason: `the resolvent for ${K.name} kept a repeated integer root through ${TRANSFORMS.length} transformations of the roots`,
        };
      if (decided.kind === "descend") {
        steps.push({
          from: G.label,
          to: K.label,
          index: cosets.length,
          via: "resolvent",
          outcome: "descend",
          root: decided.root.toString(),
          bits: S,
          transform: used,
          classOf: classOf(classes, ci),
        });
        witness = {
          orbit: orb.map((e) => actOn(decided.coset, e)),
          coset: decided.coset,
          root: decided.root.toString(),
          transform: used,
        };
        // Gal ≤ σ∘(τ∘K∘τ⁻¹)∘σ⁻¹ with K = π∘H∘π⁻¹: the new τ is σ∘τ∘π.
        tau = compose(decided.coset, compose(tau, m.conj));
        G = K;
        continue descend;
      }
      steps.push({
        from: G.label,
        to: K.label,
        index: cosets.length,
        via: "resolvent",
        outcome: "stay",
        root: null,
        bits: S,
        transform: used,
        classOf: classOf(classes, ci),
      });
    }
    break;
  }
  return {
    ok: true,
    group: G,
    tau,
    generators: G.generators.map((g) => conjugate(tau, g)),
    labelsHold: labelsHold(F, approx, refined.roots, S),
    steps,
    witness,
    roots: refined.roots,
    bits: S,
  };
}
