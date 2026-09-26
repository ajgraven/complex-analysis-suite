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

const RAW = (data as unknown as { degrees: Record<string, RawGroup[]> }).degrees;
export const TABLE_SOURCE = (data as unknown as { source: string }).source;

const BY_LABEL = new Map<string, TransitiveGroup>();
const BY_DEGREE = new Map<number, TransitiveGroup[]>();
for (const [n, groups] of Object.entries(RAW)) {
  const list = groups.map((g) => {
    const entry: TransitiveGroup = {
      ...g,
      degree: Number(n),
      index: Number(g.label.split("T")[1]),
    };
    BY_LABEL.set(g.label, entry);
    return entry;
  });
  BY_DEGREE.set(Number(n), list);
}

/** The largest degree the table holds. */
export const TABLE_MAX_DEGREE = Math.max(...BY_DEGREE.keys());
/** The largest degree with maximal-subgroup data, where the group is identified exactly. */
export const EXACT_MAX_DEGREE = 7;

export function groupByLabel(label: string): TransitiveGroup {
  const g = BY_LABEL.get(label);
  if (!g) throw new Error(`no transitive group ${label} in the table`);
  return g;
}

export function groupsOfDegree(n: number): readonly TransitiveGroup[] {
  return BY_DEGREE.get(n) ?? [];
}

/** Sₙ: the one group of order n!. */
export function symmetricGroup(n: number): TransitiveGroup {
  const list = groupsOfDegree(n);
  return list.reduce((a, b) => (b.order > a.order ? b : a));
}

/** Aₙ (n ≥ 3): the even group of order n!/2. */
export function alternatingGroup(n: number): TransitiveGroup | null {
  const s = symmetricGroup(n);
  return groupsOfDegree(n).find((g) => g.even && 2 * g.order === s.order) ?? null;
}

/** The key a cycle type is stored under: the parts, longest first, with the fixed points. */
export function typeKey(type: readonly number[]): string {
  return [...type].sort((a, b) => b - a).join(".");
}
