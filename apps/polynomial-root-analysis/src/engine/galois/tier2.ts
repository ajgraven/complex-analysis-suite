// Tier 2: degrees 8–15, by statistics (DESIGN §4.7). An ESTIMATE, and labelled so everywhere.
//
// What is exact here is the list of candidates: every transitive group of degree n that contains an
// element of each cycle type the primes proved present, and whose parity matches the discriminant — a
// group failing either is ruled out by a theorem. What is not exact is the ranking: by Chebotarev the
// share of primes showing each type tends to that type's share of the group, so candidates are ordered
// by a χ² distance between the counts seen and the counts each would predict over the same primes.
// Groups with identical distributions cannot be told apart by ANY number of primes (8T10 and 8T11 are
// the first such pair); the table records them and the card says so.
import { groupsOfDegree, typeKey, type TransitiveGroup } from "./tables.js";

export interface Candidate {
  readonly label: string;
  readonly name: string;
  readonly order: number;
  readonly solvable: boolean;
  /** χ² of the observed type counts against this group's distribution; smaller fits better. */
  readonly score: number;
  /** Candidates in the list this one cannot be separated from by statistics. */
  readonly indistinguishableFrom: readonly string[];
}

export interface Tier2 {
  readonly candidates: readonly Candidate[];
  readonly primesUsed: number;
}

export function rankCandidates(
  n: number,
  observed: readonly { readonly type: readonly number[]; readonly count: number }[],
  discSquare: boolean,
): Tier2 {
  const total = observed.reduce((a, o) => a + o.count, 0);
  const seen = new Map(observed.map((o) => [typeKey(o.type), o.count]));
  const consistent = groupsOfDegree(n).filter(
    (g: TransitiveGroup) =>
      g.even === discSquare && [...seen.keys()].every((k) => (g.cycleTypes[k] ?? 0) > 0),
  );
  const labels = new Set(consistent.map((g) => g.label));
  const candidates = consistent
    .map((g) => {
      let score = 0;
      for (const [k, size] of Object.entries(g.cycleTypes)) {
        const expected = (total * size) / g.order;
        const o = seen.get(k) ?? 0;
        score += ((o - expected) * (o - expected)) / expected;
      }
      return {
        label: g.label,
        name: g.name,
        order: g.order,
        solvable: g.solvable,
        score,
        indistinguishableFrom: g.sameStatisticsAs.filter((l) => labels.has(l)),
      };
    })
    .sort((a, b) => a.score - b.score || a.order - b.order);
  return { candidates, primesUsed: total };
}
