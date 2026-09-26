// The Galois correspondence, numerically (PLAN §7 PRA-6, DESIGN §5.2).
//
// Once the group G is known and LABELLED — a permutation group on the numbered roots with Gal = G proved
// by the descent — every subgroup H ≤ G has a fixed field, and an H-invariant θ = F(z) (an orbit sum of
// one root monomial with Stab_G(F) = H) generates it whenever its [G : H] conjugates are distinct. Two
// facts are then EXACT:
//   • at H = G, and at every transitive K ⊇ G, the value F(z) is fixed by all of Gal, hence a rational
//     algebraic integer — an integer — and its certified disc, once narrower than ½, names it;
//   • below G, R_H(T) = ∏_{σ ∈ G/H} (T − F(σ·z)) is fixed by G, so it has integer coefficients that the
//     discs name; its roots are distinct when their discs are pairwise DISJOINT (exact), and then R_H is
//     irreducible (Gal = G moves the cosets transitively) and defines the fixed field of H, of degree
//     [G : H]. A value that is a root of an irreducible R_H of degree > 1 is not rational.
// When two values cannot be separated, the roots go through a Tschirnhaus transformation as in the
// descent; the argument is the same.
//
// Which subgroups: every one for degree ≤ 5 (all ≤ 156 of them, as classes past 30), and for degrees
// 6–7 the transitive ones together with the derived series — PLAN's scope, because S₇ alone has
// 11,300 subgroups.
import {
  compose,
  derivedSeries,
  groupElements,
  inverse,
  isTransitive,
  type Perm,
} from "@cas/monodromy";
import { DiscArith, polyFromRoots, type Disc } from "./discArith.js";
import { TRANSFORMS, transformDisc } from "./descent.js";
import {
  actOn,
  cosetRepresentatives,
  findInvariant,
  orbit,
  type Exponents,
} from "./invariant.js";
import { preciseRoots } from "./refine.js";
import { groupByLabel, groupsOfDegree, symmetricGroup, typeKey } from "./tables.js";
import invariantData from "./data/invariants.json";

type Cx = readonly [number, number];

const INVARIANTS = invariantData as unknown as Record<string, number[]>;

/** The largest [G : H] whose resolvent is computed; above it the node says so. */
export const RESOLVENT_MAX = 60;
/** Past this many subgroups the lattice is shown one class at a time. */
export const LIST_ALL_MAX = 30;

export interface NodeValue {
  readonly re: number;
  readonly im: number;
  readonly r: number;
}

export interface CorrespondenceNode {
  readonly id: number;
  readonly order: number;
  /** [G : H], the degree of the fixed field. */
  readonly index: number;
  /** The transitive-group label, when H is transitive. */
  readonly label: string | null;
  readonly name: string;
  readonly generators: readonly (readonly number[])[];
  /** Subgroups of G conjugate to this one (itself included). */
  readonly conjugates: number;
  readonly normal: boolean;
  /** Its place in G's derived series (0 = G), or null. */
  readonly derived: number | null;
  /** The invariant: an orbit of exponent vectors on the numbered roots, or the square root of the
   *  discriminant (∏_{i<j}(zᵢ − zⱼ)), which no orbit sum of a monomial can replace. */
  readonly invariant:
    | { readonly kind: "orbit"; readonly orbit: readonly Exponents[] }
    | { readonly kind: "vandermonde" };
  /** F(z) at the numbered roots (of the monic transform), for display. */
  readonly value: NodeValue;
  /** H = G: the integer F(z) equals, named by its disc. */
  readonly integer: string | null;
  /** The fixed field's defining polynomial R_H, exact; null with a reason when not computed. */
  readonly resolvent: {
    readonly coefficients: readonly string[];
    readonly transform: readonly number[];
  } | null;
  readonly resolventWhy: string | null;
  /** Ids of the nodes directly below (maximal subgroups among the nodes shown). */
  readonly below: readonly number[];
}

export interface Overgroup {
  readonly label: string;
  readonly name: string;
  readonly order: number;
  /** The copy of it containing G, on the numbered roots. */
  readonly generators: readonly (readonly number[])[];
  readonly orbit: readonly Exponents[];
  readonly integer: string;
  readonly value: NodeValue;
}

export type Correspondence =
  | {
      readonly ok: true;
      readonly nodes: readonly CorrespondenceNode[];
      /** Every subgroup (true) or one per conjugacy class (false). */
      readonly everySubgroup: boolean;
      readonly total: number;
      /** Transitive groups strictly containing G: their invariants are integers. */
      readonly overgroups: readonly Overgroup[];
      readonly bits: number;
    }
  | { readonly ok: false; readonly reason: string };

const key = (p: Perm): string => p.join(",");
const setKey = (els: readonly Perm[]): string => els.map(key).sort().join("|");
const conj = (t: Perm, g: Perm): Perm => compose(t, compose(g, inverse(t)));

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number): string => [...String(n)].map((d) => SUB[Number(d)]).join("");

/** The order of a permutation. */
function orderOf(g: Perm): number {
  let k = 1;
  let x = g;
  while (!x.every((v, i) => v === i)) {
    x = compose(g, x);
    k++;
  }
  return k;
}

/**
 * A name for a subgroup that is not a table group (intransitive), by its isomorphism type where the
 * order and the element orders decide it — every order a subgroup of S₅ has, and the small ones beyond.
 */
export function plainName(els: readonly Perm[]): string {
  const order = els.length;
  if (order === 1) return "the trivial group";
  const orders = els.map(orderOf);
  const count = (k: number): number => orders.filter((o) => o === k).length;
  if (orders.includes(order)) return `C${sub(order)}`;
  const abelian = els.every((a) =>
    els.every((b) => key(compose(a, b)) === key(compose(b, a))),
  );
  if (order === 4) return "V₄";
  if (order === 6) return "S₃";
  if (order === 8) {
    if (abelian) return count(4) > 0 ? "C₄ × C₂" : "C₂³";
    return count(2) === 5 ? "D₄" : "Q₈";
  }
  if (order === 12) {
    if (abelian) return "C₆ × C₂";
    if (count(6) === 0 && count(2) === 3) return "A₄";
    if (count(2) === 7) return "D₆";
  }
  if (order === 24 && count(2) === 9 && count(4) === 6) return "S₄";
  if (order === 20 && count(4) === 10) return "F₂₀";
  if (order === 10) return "D₅";
  return `a group of order ${order}`;
}

/** Every subgroup of a small group, by closing pairs of elements (every subgroup of S₅ is 2-generated). */
function allSubgroups(G: readonly Perm[], n: number): Perm[][] {
  const seen = new Map<string, Perm[]>();
  for (let i = 0; i < G.length; i++)
    for (let j = i; j < G.length; j++) {
      const els = groupElements([G[i], G[j]], n, 10_000).elements;
      const k = setKey(els);
      if (!seen.has(k)) seen.set(k, els);
    }
  return [...seen.values()];
}

/** Identify a transitive subgroup's label by its cycle-type counts and order (exact for n ≤ 7 but for
 *  statistically twinned groups, which do not occur below degree 8). */
function labelOf(els: readonly Perm[], n: number): string | null {
  if (
    !isTransitive(els.slice(0, Math.min(els.length, 40)), n) &&
    !isTransitive([...els], n)
  )
    return null;
  const counts: Record<string, number> = {};
  for (const e of els) {
    const seen = new Array<boolean>(n).fill(false);
    const t: number[] = [];
    for (let i = 0; i < n; i++) {
      if (seen[i]) continue;
      let l = 0;
      for (let j = i; !seen[j]; j = e[j]) {
        seen[j] = true;
        l++;
      }
      t.push(l);
    }
    const k = typeKey(t);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const match = groupsOfDegree(n).filter(
    (g) =>
      g.order === els.length &&
      JSON.stringify(Object.entries(g.cycleTypes).sort()) ===
        JSON.stringify(Object.entries(counts).sort()),
  );
  return match.length === 1 ? match[0].label : null;
}

/** F(π·z) = Σ_{e ∈ orbit} ∏ z_{π(i)}^{eᵢ}, as a disc. */
export function orbitValue(
  A: DiscArith,
  z: readonly Disc[],
  orb: readonly Exponents[],
  pi: Perm | null = null,
): Disc {
  let sum = A.int(0n);
  for (const e of orb) {
    let term = A.int(1n);
    for (let i = 0; i < e.length; i++)
      if (e[i] > 0) term = A.mul(term, A.pow(z[pi ? pi[i] : i], e[i]));
    sum = A.add(sum, term);
  }
  return sum;
}

/** ∏_{i<j} (z_{π(i)} − z_{π(j)}). */
export function vandermonde(
  A: DiscArith,
  z: readonly Disc[],
  pi: Perm | null = null,
): Disc {
  let p = A.int(1n);
  const w = pi ? pi.map((k) => z[k]) : z;
  for (let i = 0; i < w.length; i++)
    for (let j = i + 1; j < w.length; j++) p = A.mul(p, A.sub(w[i], w[j]));
  return p;
}

const disjoint = (a: Disc, b: Disc): boolean => {
  const dr = a.re - b.re;
  const di = a.im - b.im;
  const s = a.r + b.r;
  return dr * dr + di * di > s * s;
};

/**
 * The correspondence for the monic integer polynomial F whose labelled Galois group is generated by
 * `gens` (permutations of the roots at `approx`, in that order), with `discSquare` its discriminant's
 * verdict.
 */
export function correspondence(
  F: readonly bigint[],
  approx: readonly Cx[],
  gens: readonly (readonly number[])[],
  startBits = 128,
): Correspondence {
  const n = F.length - 1;
  if (n > 7)
    return { ok: false, reason: `degree ${n} is past the lattices this app carries` };
  const Gc = groupElements(
    gens.map((g) => [...g]),
    n,
    10_000,
  ).elements;
  const Gset = new Set(Gc.map(key));
  const order = Gc.length;

  // The subgroups shown, one entry per subgroup (degree ≤ 5, when few) or per conjugacy class.
  const derived = derivedSeries(
    gens.map((g) => [...g]),
    n,
    10_000,
  );
  const derivedKeys = derived.levels.map((l) =>
    setKey(
      groupElements(
        l.generators.map((g) => [...g]),
        n,
        10_000,
      ).elements,
    ),
  );
  let entries: Entry[];
  let total: number;
  if (n <= 5) {
    const all = allSubgroups(Gc, n);
    total = all.length;
    const classes = classesOf(all, Gc);
    entries =
      total <= LIST_ALL_MAX
        ? classes.flatMap((c) =>
            c.map((els) => ({ els, frame: undefined, conjugates: c.length, members: c })),
          )
        : classes.map((c) => ({
            els: c[0],
            frame: undefined,
            conjugates: c.length,
            members: c,
          }));
  } else {
    const reps = transitiveClasses(Gc, Gset, order, n);
    entries = [{ els: Gc, frame: undefined, conjugates: 1, members: null }, ...reps];
    for (const l of derived.levels) {
      const els = groupElements(
        l.generators.map((g) => [...g]),
        n,
        10_000,
      ).elements;
      if (!entries.some((e) => setKey(e.els) === setKey(els)))
        entries.push({ els, frame: undefined, conjugates: 1, members: null });
    }
    total = entries.reduce((t, e) => t + e.conjugates, 0);
  }
  entries.sort((x, y) => y.els.length - x.els.length);
  const everySubgroup = entries.length === total;

  // Precision: refine, and double while any disc the claims read is too wide.
  for (let S = startBits; S <= 4096; S *= 2) {
    const refined = preciseRoots(F, approx, S);
    if (!refined.ok) return refined;
    const A = new DiscArith(S);
    const z = refined.roots;
    const built = buildNodes(A, z, entries, Gc, order, n, derivedKeys);
    if (built === "precision") continue;
    const over = overgroups(A, z, Gset, order, n);
    if (over === "precision") continue;
    return { ok: true, nodes: built, everySubgroup, total, overgroups: over, bits: S };
  }
  return { ok: false, reason: "the invariants could not be certified within 4096 bits" };
}

function invariantFor(
  H: readonly Perm[],
  Gc: readonly Perm[],
  n: number,
  frame: { label: string; tau: Perm } | undefined,
): { kind: "orbit"; orbit: Exponents[] } | { kind: "vandermonde" } {
  if (H.length === Gc.length)
    return { kind: "orbit", orbit: orbit(Gc, [1, ...new Array<number>(n - 1).fill(0)]) };
  // G ∩ Aₙ of an odd G: only an alternating function has that stabiliser.
  const even = H.every((h) => sign(h) === 1);
  if (even && 2 * H.length === Gc.length && !Gc.every((g) => sign(g) === 1))
    return { kind: "vandermonde" };
  if (frame) {
    const stored = INVARIANTS[`Sn/${frame.label}`];
    const H0 = groupByLabel(frame.label);
    if (stored) {
      const orb = orbit(
        groupElements([...H0.generators], n, 10_000).elements,
        stored,
      ).map((e) => actOn(frame.tau, e));
      return { kind: "orbit", orbit: orb };
    }
  }
  const inv = findInvariant(`G:${setKey(Gc)}/H:${setKey(H)}`, Gc, H, n);
  return { kind: "orbit", orbit: inv.orbit.map((e) => [...e]) };
}

function sign(p: Perm): number {
  let s = 1;
  const seen = new Array<boolean>(p.length).fill(false);
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let l = 0;
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = true;
      l++;
    }
    if (l % 2 === 0) s = -s;
  }
  return s;
}

interface Entry {
  readonly els: Perm[];
  /** For a transitive entry: its table label and the τ with els = τ∘K∘τ⁻¹. */
  readonly frame: { label: string; tau: Perm } | undefined;
  readonly conjugates: number;
  /** Every member of its class, when they were listed (degree ≤ 5). */
  readonly members: readonly Perm[][] | null;
}

/** Group subgroups into conjugacy classes under Gc (element sets, degree ≤ 5). */
function classesOf(all: readonly Perm[][], Gc: readonly Perm[]): Perm[][][] {
  const done = new Set<string>();
  const classes: Perm[][][] = [];
  for (const H of all) {
    if (done.has(setKey(H))) continue;
    const members = new Map<string, Perm[]>();
    for (const g of Gc) {
      const c = H.map((h) => conj(g, h));
      const ck = setKey(c);
      if (!members.has(ck)) members.set(ck, c);
    }
    for (const ck of members.keys()) done.add(ck);
    classes.push([...members.values()]);
  }
  return classes;
}

/**
 * The classes of transitive subgroups of Gc (degree 6–7), one representative each with its class size.
 * A coset tK is named by the set t·O of K's stored invariant orbit (Stab_{Sₙ}(O) = K exactly), and a
 * COPY tKt⁻¹ by its cosets modulo the normaliser: t and t∘s give the same copy for every s ∈ N(K).
 * That makes finding and grouping them cheap — S₇ has 1,472 transitive subgroups of these kinds, and
 * listing each one's elements took 37 s (measured) where this takes under one.
 */
function transitiveClasses(
  Gc: readonly Perm[],
  Gset: ReadonlySet<string>,
  order: number,
  n: number,
): Entry[] {
  const Sn = groupElements([...symmetricGroup(n).generators], n, 10_000).elements;
  const orbKey = (o: readonly Exponents[]): string =>
    o
      .map((e) => e.join(","))
      .sort()
      .join("|");
  const out: Entry[] = [];
  for (const K of groupsOfDegree(n)) {
    if (K.order >= order || order % K.order !== 0) continue;
    const stored = INVARIANTS[`Sn/${K.label}`];
    if (!stored) continue;
    const Kels = groupElements([...K.generators], n, 10_000).elements;
    const Kset = new Set(Kels.map(key));
    const Ostd = orbit(Kels, stored);
    const N = Sn.filter((x) => K.generators.every((g) => Kset.has(key(conj(x, g)))));
    const copyOf = new Map<string, number>();
    const copies: Perm[] = [];
    for (const t of Sn) {
      if (!K.generators.every((g) => Gset.has(key(conj(t, g))))) continue;
      if (copyOf.has(orbKey(Ostd.map((e) => actOn(t, e))))) continue;
      const id = copies.length;
      copies.push(t);
      for (const x of N) copyOf.set(orbKey(Ostd.map((e) => actOn(compose(t, x), e))), id);
    }
    const placed = new Set<number>();
    for (const [id, t0] of copies.entries()) {
      if (placed.has(id)) continue;
      const members = new Set<number>();
      for (const g of Gc) {
        const m = copyOf.get(orbKey(Ostd.map((e) => actOn(compose(g, t0), e))));
        if (m !== undefined) members.add(m);
      }
      for (const m of members) placed.add(m);
      out.push({
        els: groupElements(
          K.generators.map((g) => conj(t0, g)),
          n,
          10_000,
        ).elements,
        frame: { label: K.label, tau: t0 },
        conjugates: members.size,
        members: null,
      });
    }
  }
  return out;
}

function buildNodes(
  A: DiscArith,
  z: readonly Disc[],
  entries: readonly Entry[],
  Gc: readonly Perm[],
  order: number,
  n: number,
  derivedKeys: readonly string[],
): CorrespondenceNode[] | "precision" {
  const nodes: CorrespondenceNode[] = [];
  for (const [id, entry] of entries.entries()) {
    const H = entry.els;
    const k = setKey(H);
    const transitive = isTransitive([...H], n);
    const frame = entry.frame ?? (transitive ? transitiveFrame(H, n) : undefined);
    const label = frame?.label ?? (transitive ? labelOf(H, n) : null);
    const inv = invariantFor(H, Gc, n, frame);
    const value = inv.kind === "orbit" ? orbitValue(A, z, inv.orbit) : vandermonde(A, z);
    const index = order / H.length;
    let integer: string | null = null;
    if (index === 1) {
      const m = A.integerIn(value);
      if (m === null) return "precision";
      integer = m.toString();
    }
    // The fixed field's polynomial.
    let resolvent: CorrespondenceNode["resolvent"] = null;
    let resolventWhy: string | null = null;
    if (index > 1 && index <= RESOLVENT_MAX) {
      if (inv.kind === "vandermonde") {
        // (T − δ)(T + δ) = T² − δ², and δ² is the discriminant: an integer the disc names.
        const d = A.integerIn(A.mul(value, value));
        if (d === null) return "precision";
        resolvent = { coefficients: [(-d).toString(), "0", "1"], transform: [0, 1] };
      } else {
        const r = nodeResolvent(A, z, Gc, inv.orbit);
        if (r === "precision") return "precision";
        if (r === null) resolventWhy = "its conjugate values could not be separated";
        else resolvent = r;
      }
    } else if (index > RESOLVENT_MAX)
      resolventWhy = `degree ${index} is past the ${RESOLVENT_MAX} this app certifies`;
    nodes.push({
      id,
      order: H.length,
      index,
      label,
      name: label ? groupByLabel(label).name : plainName(H),
      generators: generatorsOf(H, n),
      conjugates: entry.conjugates,
      normal: entry.conjugates === 1,
      derived: derivedKeys.indexOf(k) >= 0 ? derivedKeys.indexOf(k) : null,
      invariant:
        inv.kind === "orbit"
          ? { kind: "orbit", orbit: inv.orbit }
          : { kind: "vandermonde" },
      value: A.toNumbers(value),
      integer,
      resolvent,
      resolventWhy,
      below: [],
    });
  }
  // Hasse edges: node j is directly below node i when a CONJUGATE of j lies in i (classes are shown by
  // one representative) and no shown node sits strictly between.
  const sets = entries.map((e) => new Set(e.els.map(key)));
  const memo = new Map<string, boolean>();
  const within = (a: number, b: number): boolean => {
    if (
      entries[a].els.length >= entries[b].els.length ||
      entries[b].els.length % entries[a].els.length
    )
      return false;
    const mk = `${a}<${b}`;
    const hit = memo.get(mk);
    if (hit !== undefined) return hit;
    const ga = generatorsOf(entries[a].els, n);
    const r = Gc.some((g) => ga.every((x) => sets[b].has(key(conj(g, x)))));
    memo.set(mk, r);
    return r;
  };
  return nodes.map((node, i) => ({
    ...node,
    below: nodes
      .map((_, j) => j)
      .filter(
        (j) =>
          within(j, i) &&
          !nodes.some((_, m) => m !== j && m !== i && within(j, m) && within(m, i)),
      ),
  }));
}

function transitiveFrame(
  H: readonly Perm[],
  n: number,
): { label: string; tau: Perm } | undefined {
  const label = labelOf(H, n);
  if (!label) return undefined;
  const K = groupByLabel(label);
  if (K.order === symmetricGroup(n).order) return undefined;
  const Hset = new Set(H.map(key));
  for (const t of groupElements([...symmetricGroup(n).generators], n, 10_000).elements)
    if (K.generators.every((g) => Hset.has(key(conj(t, g))))) return { label, tau: t };
  return undefined;
}

/** A small generating set, greedily. */
function generatorsOf(H: readonly Perm[], n: number): Perm[] {
  const gens: Perm[] = [];
  let size = 1;
  for (const h of H) {
    if (size === H.length) break;
    const next = groupElements([...gens, h], n, 10_000).elements.length;
    if (next > size) {
      gens.push(h);
      size = next;
    }
  }
  return gens;
}

function nodeResolvent(
  A: DiscArith,
  z: readonly Disc[],
  Gc: readonly Perm[],
  orb: readonly Exponents[],
): { coefficients: string[]; transform: readonly number[] } | "precision" | null {
  const cosets = cosetRepresentatives(Gc, orb);
  for (const h of TRANSFORMS) {
    const y = z.map((w) => transformDisc(A, h, w));
    const values = cosets.map((s) =>
      orbitValue(
        A,
        y,
        orb.map((e) => actOn(s, e)),
      ),
    );
    if (!values.every((v) => A.narrow(v))) return "precision";
    let separated = true;
    for (let i = 0; i < values.length && separated; i++)
      for (let j = i + 1; j < values.length; j++)
        if (!disjoint(values[i], values[j])) {
          separated = false;
          break;
        }
    if (!separated) continue;
    const coefficients: string[] = [];
    for (const c of polyFromRoots(A, values)) {
      const m = A.integerIn(c);
      if (m === null) return "precision";
      coefficients.push(m.toString());
    }
    return { coefficients, transform: h };
  }
  return null;
}

/** The transitive groups strictly containing Gc, one copy each, with their (integer) invariants. */
function overgroups(
  A: DiscArith,
  z: readonly Disc[],
  Gset: ReadonlySet<string>,
  order: number,
  n: number,
): Overgroup[] | "precision" {
  const Sn = groupElements([...symmetricGroup(n).generators], n, 10_000).elements;
  const out: Overgroup[] = [];
  for (const K of groupsOfDegree(n)) {
    if (K.order <= order || K.order % order !== 0) continue;
    const stored = INVARIANTS[`Sn/${K.label}`];
    if (!stored) continue; // Sₙ and Aₙ: nothing to read.
    const Kstd = groupElements([...K.generators], n, 10_000).elements;
    // A copy t∘K∘t⁻¹ containing G: every element of G conjugates back into K.
    const Kset = new Set(Kstd.map(key));
    const t = Sn.find((s) =>
      [...Gset].every((g) => Kset.has(key(conj(inverse(s), g.split(",").map(Number))))),
    );
    if (!t) continue;
    const orb = orbit(Kstd, stored).map((e) => actOn(t, e));
    const value = orbitValue(A, z, orb);
    const m = A.integerIn(value);
    if (m === null) return "precision";
    out.push({
      label: K.label,
      name: K.name,
      order: K.order,
      generators: K.generators.map((g) => conj(t, g)),
      orbit: orb,
      integer: m.toString(),
      value: A.toNumbers(value),
    });
  }
  return out;
}

/** What the worker is asked for: one irreducible factor, the reader's roots of it, its labelled group. */
export interface LatticeRequest {
  /** The primitive integer factor, ascending, as decimal strings. */
  readonly coefficients: readonly string[];
  /** Its roots in the order the group's generators number them (of f itself, not the monic transform). */
  readonly roots: readonly (readonly [number, number])[];
  readonly generators: readonly (readonly number[])[];
}

/** The correspondence for a request: the monic transform F(y) = lcⁿ⁻¹·f(y/lc) has roots lc·xᵢ. */
export function latticeFor(req: LatticeRequest): Correspondence {
  const f = req.coefficients.map((c) => BigInt(c));
  const n = f.length - 1;
  const lc = f[n];
  const F = f.map((c, k) => (k === n ? 1n : c * lc ** BigInt(n - 1 - k)));
  const scale = Number(lc);
  return correspondence(
    F,
    req.roots.map(([x, y]) => [scale * x, scale * y] as const),
    req.generators,
  );
}
