import { describe, expect, it } from "vitest";
import { factorDegreesModP, primesBelow } from "@cas/exact";
import { GALOIS as CORPUS } from "./corpus/galois.js";
import { parsePolynomial } from "../src/engine/parse.js";
import { fromExact, type Polynomial } from "../src/engine/polynomial.js";
import {
  factorGalois,
  galoisEvidence,
  galoisRequest,
  isolate,
  type FactorEvidence,
  type GaloisEvidence,
} from "../src/engine/galois/tier0.js";
import { factorisationCert, galoisCerts } from "../src/engine/certify.js";
import { groupByLabel } from "../src/engine/galois/tables.js";

function poly(text: string, ring: "Q" | "R" | "C" = "Q"): Polynomial {
  const read = parsePolynomial(text, ring);
  if (!read.ok) throw new Error(read.reason);
  const built = fromExact(read.exact, ring);
  if (!built.ok) throw new Error(built.reason);
  return built.poly;
}

const CACHE = new Map<string, Extract<GaloisEvidence, { ok: true }>>();
function evidence(text: string): Extract<GaloisEvidence, { ok: true }> {
  const hit = CACHE.get(text);
  if (hit) return hit;
  const req = galoisRequest(poly(text));
  if (!req.ok) throw new Error(req.reason);
  const ev = galoisEvidence(req.request);
  if (!ev.ok) throw new Error(ev.reason);
  CACHE.set(text, ev);
  return ev;
}

type FactorGalois = NonNullable<FactorEvidence["galois"]>;
/** The factor's Galois evidence, which a test that asks for it requires to exist. */
function gal(f: FactorEvidence): FactorGalois {
  if (!f.galois) throw new Error("a linear factor has no Galois evidence");
  return f.galois;
}

function certs(text: string) {
  const ev = evidence(text);
  const f = ev.factors[0];
  return galoisCerts(gal(f), f.degree, ev.irreducible);
}

/** A permutation of type λ on 0…n−1, raised to the m-th power, as its cycle type (descending). */
function typeOfPower(type: readonly number[], m: number): number[] {
  const perm: number[] = [];
  let at = 0;
  for (const l of type) {
    for (let i = 0; i < l; i++) perm.push(at + ((i + 1) % l));
    at += l;
  }
  const pow = perm.map((_, i) => {
    let j = i;
    for (let k = 0; k < m; k++) j = perm[j];
    return j;
  });
  const seen = new Array<boolean>(pow.length).fill(false);
  const out: number[] = [];
  for (let i = 0; i < pow.length; i++) {
    if (seen[i]) continue;
    let l = 0;
    for (let j = i; !seen[j]; j = pow[j]) {
      seen[j] = true;
      l++;
    }
    out.push(l);
  }
  return out.sort((a, b) => b - a);
}

describe("the corpus (PLAN §7 PRA-4 gate)", () => {
  it("every polynomial is irreducible over ℚ", () => {
    for (const c of CORPUS) {
      const ev = evidence(c.text);
      expect(ev.irreducible, c.id).toBe(true);
      expect(factorisationCert(ev).claim, c.id).toBe("irreducible over ℚ");
    }
  });

  it("names Sₙ or Aₙ exactly when the group IS Sₙ or Aₙ, and nothing else", () => {
    for (const c of CORPUS) {
      const ev = evidence(c.text);
      const g = gal(ev.factors[0]);
      expect(g.verdict, `${c.id} (${c.group})`).toBe(c.verdict);
    }
    // Anti-vacuity: the corpus holds all three outcomes, and more groups than it names.
    const verdicts = CORPUS.map((c) => c.verdict);
    expect(verdicts.filter((v) => v === "open").length).toBeGreaterThan(15);
    expect(verdicts.filter((v) => v === "A").length).toBeGreaterThanOrEqual(5);
    expect(verdicts.filter((v) => v === "S").length).toBeGreaterThanOrEqual(6);
  });

  it("the discriminant is a square exactly for the groups inside Aₙ", () => {
    // Groups of even permutations only: A₃, V₄, A₄, C₅, D₅, A₅, A₄ (6T4), PSL(2,5), C₃²⋊C₄ (6T10), A₆,
    // C₇, F₂₁, PSL(3,2), A₇ — and, independently, exactly the corpus labels the table marks even.
    const even = new Set([
      "3-A3",
      "4-V",
      "4-A4",
      "5-C5",
      "5-D5",
      "5-A5",
      "6-A4",
      "6-S4p",
      "6-PSL2F5",
      "6-G36p",
      "6-A6",
      "7-C7",
      "7-F21",
      "7-PSL32",
      "7-A7",
    ]);
    for (const c of CORPUS) {
      expect(gal(evidence(c.text).factors[0]).discSquare, c.id).toBe(even.has(c.id));
      expect(groupByLabel(c.label).even, c.id).toBe(even.has(c.id));
    }
  });

  it("every cycle type recorded is re-derived at its witness prime", () => {
    for (const c of CORPUS) {
      const f = evidence(c.text).factors[0];
      const coeffs = f.coefficients.map(BigInt);
      for (const w of gal(f).cycleTypes)
        expect(factorDegreesModP(coeffs, w.prime)).toEqual(w.type);
    }
  });
});

describe("x⁵ − x − 1 reads = S₅ with the gate's rows", () => {
  const c = certs("z^5 - z - 1");
  it("the group", () => {
    expect(c.group.level).toBe("=");
    expect(c.group.claim).toBe("the symmetric group S₅ (5T5), of order 120");
  });
  it("the rows", () => {
    const text = c.rows.map((r) => `${r.claim} — ${r.method}`);
    expect(text).toEqual([
      "moves any root to any other — no factorisation over the integers exists — decided exactly",
      "contains a 5-cycle — 5 is a prime greater than 5/2, so no grouping of the roots survives it — a 5-cycle at p = 3",
      "contains a swap of two roots — type (3, 2) at p = 2, cubed is a swap",
      "the discriminant 2869 is not a square — decided exactly: an integer square root",
    ]);
    expect(c.rows.every((r) => r.level === "=")).toBe(true);
    expect(c.group.provenance).toHaveLength(4);
  });
  it("the list of cycle types, first prime first", () => {
    expect(c.types.map((t) => `${t.claim} @ ${t.method}`).slice(0, 2)).toEqual([
      "contains an element of type (3, 2) @ the factors of the polynomial mod 2",
      "contains an element of type (5) @ the factors of the polynomial mod 3",
    ]);
  });
});

describe("x⁵ + 20x + 16 reads = A₅", () => {
  const c = certs("z^5 + 20z + 16");
  it("by a 3-cycle and a square discriminant", () => {
    expect(c.group.claim).toBe("the alternating group A₅ (5T4), of order 60");
    expect(c.rows.map((r) => r.claim)).toContain("contains a 3-cycle");
    expect(c.rows.map((r) => r.claim)).toContain(
      "the discriminant 1024000000 is a square, so every element is an even permutation",
    );
  });
});

describe("the D₅ quintic: the theorem on cycle types does not close, the descent does", () => {
  const ev = evidence("z^5 - 5z + 12");
  const g = gal(ev.factors[0]);
  const c = certs("z^5 - 5z + 12");
  it("the evidence alone names nothing (PRA-4's gate, still true of that step)", () => {
    expect(g.verdict).toBe("open");
    expect(c.types.map((t) => t.claim)).toEqual([
      "contains an element of type (2, 2, 1)",
      "contains an element of type (5)",
      "contains an element of type (1, 1, 1, 1, 1)",
    ]);
    const rows = [...c.rows, ...c.types].map((x) => `${x.claim} ${x.method}`).join(" ");
    expect(rows).not.toMatch(/symmetric|alternating|D₅|dihedral/);
  });
  it("and the descent names D₅ exactly (PRA-5)", () => {
    expect(c.group.level).toBe("=");
    expect(c.group.claim).toBe("D₅ (5T2), of order 10");
  });
});

describe("the power trick", () => {
  it("isolates a cycle exactly when the arithmetic allows, and the power really is that cycle", () => {
    const cases: [number[], number, number | null][] = [
      [[3, 2], 2, 3],
      [[3, 2], 3, 2],
      [[5], 5, 1],
      [[3, 1, 1], 3, 1],
      [[4, 2], 2, null], // 4 is not coprime to 2
      [[2, 2, 1], 2, null], // 2 twice
      [[6, 1], 2, null], // 2 not present
      [[11, 3, 2], 2, 33],
      [[21, 2, 1], 2, 21],
    ];
    for (const [type, l, want] of cases) {
      expect(isolate(type, l), `${type} → ${l}`).toBe(want);
      if (want !== null) {
        const n = type.reduce((a, b) => a + b, 0);
        const expected = [l, ...Array<number>(n - l).fill(1)];
        expect(typeOfPower(type, want)).toEqual(expected);
      }
    }
  });
  it("finds Conrad's transposition at p = 2, where a direct one first appears at p = 311", () => {
    const g = gal(evidence("z^6 + z^4 + z + 3").factors[0]);
    expect(g.transposition).toMatchObject({ prime: 2, type: [3, 2, 1], power: 3 });
    const direct = g.cycleTypes.find((w) => w.type.join() === "2,1,1,1,1");
    expect(direct?.prime).toBe(311);
    expect(g.verdict).toBe("S");
  });
});

describe("reducible polynomials", () => {
  it("shows the factorisation, and the group per factor", () => {
    const ev = evidence("(z^2 - 2)*(z^3 - 2)*(z - 5)^2");
    expect(ev.irreducible).toBe(false);
    expect(factorisationCert(ev).claim).toBe("factors over ℚ into 4 irreducible factors");
    expect(ev.factors.map((f) => [f.coefficients.join(","), f.multiplicity])).toEqual([
      ["-5,1", 2],
      ["-2,0,1", 1],
      ["-2,0,0,1", 1],
    ]);
    expect(ev.factors[0].galois).toBeNull();
    expect(gal(ev.factors[1]).verdict).toBe("S");
    expect(gal(ev.factors[2]).verdict).toBe("S");
  });
  it("a square-free polynomial with an irreducible factor of multiplicity 2 is not irreducible", () => {
    expect(evidence("(z^3 - 2)^2").irreducible).toBe(false);
  });
});

describe("what is not asked", () => {
  it("refuses a Gaussian coefficient by name", () => {
    const r = galoisRequest(poly("z^2 + i", "C"));
    expect(r).toEqual({
      ok: false,
      reason: expect.stringMatching(/need rational coefficients/),
    });
  });
  it("clears denominators: (1/2)z³ − 1 is 2·(z³ − 2)/4, the same group as z³ − 2", () => {
    const r = galoisRequest(poly("z^3/2 - 1"));
    expect(r.ok && r.request.coefficients).toEqual(["-2", "0", "0", "1"]);
  });
});

describe("large degree", () => {
  it("degree 16 and degree 24 read = S at any degree, within a worker's budget", () => {
    for (const [text, n] of [
      ["z^16 + z + 1", 16],
      ["z^24 + z + 1", 24],
    ] as const) {
      const t = performance.now();
      const g = gal(evidence(text).factors[0]);
      const ms = performance.now() - t;
      expect(g.verdict).toBe("S");
      expect(g.primesUsed).toBeGreaterThan(150);
      expect(ms).toBeLessThan(5000);
      expect(certs(text).group.claim).toContain(`S${n === 16 ? "₁₆" : "₂₄"}`);
    }
  });
  it("uses every good prime below 1000 and no bad one", () => {
    const f = [-1n, -1n, 0n, 0n, 0n, 1n];
    const g = factorGalois(f, 1000);
    // disc = 2869 = 19·151: the two primes the theorem is silent at.
    expect(g.primesUsed).toBe(primesBelow(1000).length - 2);
  });
});

describe("the PRA-4 sweep's survivors, each closed by the property it exposed", () => {
  it("a 3-cycle and a discriminant that is not a square name Sₙ when no swap has been seen", () => {
    // z⁴ − 6z − 3 below p = 10: type (3, 1) at 5 and nothing with a swap in it. The discriminant is
    // what separates Sₙ from Aₙ here, and it is not a square.
    const g = factorGalois([-3n, -6n, 0n, 0n, 1n], 10);
    expect(g.transposition).toBeNull();
    expect(g.threeCycle).toMatchObject({ prime: 5, type: [3, 1], power: 1 });
    expect(g.discSquare).toBe(false);
    expect(g.verdict).toBe("S");
    const c = galoisCerts(g, 4, true);
    expect(c.group.claim).toBe("the symmetric group S₄ (4T5), of order 24");
    expect(c.rows.map((r) => r.claim)).toContain("contains a 3-cycle");
    // With every prime below 1000 a swap does turn up, and the answer does not move.
    expect(factorGalois([-3n, -6n, 0n, 0n, 1n], 1000).verdict).toBe("S");
  });

  it("an (n − 1)-cycle is a primitivity witness, and the longest one is preferred", () => {
    // Degree 9: the primes above 9/2 give 5- and 7-cycles, but an 8-cycle is longer.
    const g = factorGalois([-1n, -1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n], 1000);
    expect(g.primitive).toMatchObject({ cycle: 8, type: [8, 1], power: 1 });
    const rows = galoisCerts(g, 9, true).rows;
    expect(rows[1].method).toBe("an 8-cycle at p = 23");
    expect(rows[1].claim).toBe(
      "contains an 8-cycle — one fewer than 9, so no grouping of the roots survives it",
    );
  });
});
