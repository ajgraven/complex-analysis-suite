// The transitive groups of degree 2–15 (`data/transitive.json`, generated from GAP's transgrp by
// scripts/generate-transitive-groups.mjs) — as permutation groups the engine can compute with.
//
// Conventions, the app's throughout: points are 0-based, a permutation is its image list, and
// `compose(a, b)` is a ∘ b (b first). A maximal subgroup class carries `conj` = π with
// K = π ∘ H ∘ π⁻¹, H the standard group of that label — checked in the suite against the generators.
import type { Perm } from "@cas/monodromy";
import data from "./data/transitive.json";

export interface MaximalClass {
  /** The label of the standard group this class is conjugate to. */
  readonly label: string;
  /** Generators of a representative K ≤ G (the standard G of the parent entry). */
  readonly generators: readonly Perm[];
  /** π with K = π ∘ H ∘ π⁻¹, H = the standard `label`. */
  readonly conj: Perm;
}

export interface TransitiveGroup {
  readonly label: string;
  readonly degree: number;
  /** The index j in nTj. */
  readonly index: number;
  /** The name a reader knows (degree ≤ 7), else GAP's. */
  readonly name: string;
  readonly gapName: string;
  readonly order: number;
  /** Contained in Aₙ. */
  readonly even: boolean;
  readonly solvable: boolean;
  readonly primitive: boolean;
  readonly generators: readonly Perm[];
  /** Elements per cycle type, the type written longest part first with fixed points: "3.1.1". */
  readonly cycleTypes: Readonly<Record<string, number>>;
  /** Labels with the identical cycle-type distribution — no count of primes separates them. */
  readonly sameStatisticsAs: readonly string[];
  /** Degree ≤ 7: every class of maximal transitive subgroup. */
  readonly maximalTransitive?: readonly MaximalClass[];
}

interface RawGroup {
  label: string;
  name: string;
  gapName: string;
  order: number;
  even: boolean;
  solvable: boolean;
  primitive: boolean;
  generators: number[][];
  cycleTypes: Record<string, number>;
  sameStatisticsAs: string[];
  maximalTransitive?: { label: string; generators: number[][]; conj: number[] }[];
}

export const TABLE_SOURCE = (data as unknown as { source: string }).source;

const BY_LABEL = new Map<string, TransitiveGroup>();
const BY_DEGREE = new Map<number, TransitiveGroup[]>();

/** Add a degree range's groups — the generated JSON, as imported. */
export function registerTable(raw: unknown): void {
  const degrees = (raw as { degrees: Record<string, RawGroup[]> }).degrees;
  for (const [n, groups] of Object.entries(degrees)) {
    if (BY_DEGREE.has(Number(n))) continue;
    BY_DEGREE.set(
      Number(n),
      groups.map((g) => {
        const entry: TransitiveGroup = {
          ...g,
          degree: Number(n),
          index: Number(g.label.split("T")[1]),
        };
        BY_LABEL.set(g.label, entry);
        return entry;
      }),
    );
  }
}
// Degrees 2–7 ship in the main bundle; 8–15 (three quarters of the bytes, used only by Tier 2's
// statistics) are registered by the worker, and fetched lazily on the main thread by `loadLargeTable`.
registerTable(data);

let large: Promise<void> | null = null;
/** Fetch and register degrees 8–15; idempotent. */
export function loadLargeTable(): Promise<void> {
  large ??= import("./data/transitive-8-15.json").then((m) => registerTable(m.default));
  return large;
}

/** Is degree n's list present right now? */
export function hasDegree(n: number): boolean {
  return BY_DEGREE.has(n);
}

/** The largest degree the table holds (once fully loaded). */
export const TABLE_MAX_DEGREE = 15;
/** The largest degree with maximal-subgroup data, where the group is identified exactly. */
export const EXACT_MAX_DEGREE = 7;

/** OEIS A002106, the number of transitive groups of degree n — Sₙ is the last, Aₙ the one before it. */
export const TRANSITIVE_COUNT = [0, 1, 1, 2, 5, 5, 16, 7, 50, 34, 45, 8, 301, 9, 63, 104];

export function groupByLabel(label: string): TransitiveGroup {
  const g = BY_LABEL.get(label);
  if (!g) throw new Error(`no transitive group ${label} in the table`);
  return g;
}

export function groupsOfDegree(n: number): readonly TransitiveGroup[] {
  return BY_DEGREE.get(n) ?? [];
}

function factorial(n: number): number {
  let f = 1;
  for (let k = 2; k <= n; k++) f *= k;
  return f;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number): string => [...String(n)].map((d) => SUB[Number(d)]).join("");

/**
 * Sₙ or Aₙ without the table: their labels are fixed by the numbering (the last two of degree n) and
 * their generators are the textbook ones, so the theorem that names them needs no data.
 */
export function standardGroup(n: number, alt: boolean): TransitiveGroup {
  const cycle = Array.from({ length: n }, (_, i) => (i + 1) % n);
  const swap = Array.from({ length: n }, (_, i) => (i === 0 ? 1 : i === 1 ? 0 : i));
  const three = Array.from({ length: n }, (_, i) => (i < 3 ? (i + 1) % 3 : i));
  // An n-cycle is even exactly when n is odd; otherwise fix the first point.
  const evenCycle =
    n % 2 === 1
      ? cycle
      : Array.from({ length: n }, (_, i) => (i === 0 ? 0 : (i % (n - 1)) + 1));
  const count = TRANSITIVE_COUNT[n];
  return {
    label: `${n}T${alt ? count - 1 : count}`,
    degree: n,
    index: alt ? count - 1 : count,
    name: `${alt ? "A" : "S"}${sub(n)}`,
    gapName: alt ? `A${n}` : `S${n}`,
    order: alt ? factorial(n) / 2 : factorial(n),
    even: alt,
    solvable: false,
    primitive: true,
    generators: alt ? [three, evenCycle] : [swap, cycle],
    cycleTypes: {},
    sameStatisticsAs: [],
  };
}

/** Sₙ: the one group of order n!. */
export function symmetricGroup(n: number): TransitiveGroup {
  const list = groupsOfDegree(n);
  if (!list.length) return standardGroup(n, false);
  return list.reduce((a, b) => (b.order > a.order ? b : a));
}

/** Aₙ (n ≥ 3): the even group of order n!/2. */
export function alternatingGroup(n: number): TransitiveGroup | null {
  if (n < 3) return null;
  if (!hasDegree(n)) return standardGroup(n, true);
  const s = symmetricGroup(n);
  return groupsOfDegree(n).find((g) => g.even && 2 * g.order === s.order) ?? null;
}

/** The key a cycle type is stored under: the parts, longest first, with the fixed points. */
export function typeKey(type: readonly number[]): string {
  return [...type].sort((a, b) => b - a).join(".");
}
