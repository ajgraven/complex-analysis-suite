import { describe, expect, it } from "vitest";
import { compose, groupElements, type Perm } from "@cas/monodromy";
import { GALOIS as CORPUS } from "./corpus/galois.js";
import { parsePolynomial } from "../src/engine/parse.js";
import { fromExact, type Polynomial } from "../src/engine/polynomial.js";
import {
  galoisEvidence,
  galoisRequest,
  type FactorEvidence,
} from "../src/engine/galois/tier0.js";
import { identify, transformDisc, MAX_BITS } from "../src/engine/galois/descent.js";
import { monicTransform } from "../src/engine/galois/identify.js";
import { DiscArith, polyFromRoots } from "../src/engine/galois/discArith.js";
import { preciseRoots } from "../src/engine/galois/refine.js";
import { actOn, orbit, stabiliserOrder } from "../src/engine/galois/invariant.js";
import { groupByLabel, groupsOfDegree } from "../src/engine/galois/tables.js";
import { galoisCerts, identityCerts, permText } from "../src/engine/certify.js";
import invariants from "../src/engine/galois/data/invariants.json";

function poly(text: string): Polynomial {
  const read = parsePolynomial(text, "Q");
  if (!read.ok) throw new Error(read.reason);
  const built = fromExact(read.exact, "Q");
  if (!built.ok) throw new Error(built.reason);
  return built.poly;
}

const CACHE = new Map<string, { p: Polynomial; f: FactorEvidence }>();
function run(text: string): { p: Polynomial; f: FactorEvidence } {
  const hit = CACHE.get(text);
  if (hit) return hit;
  const p = poly(text);
  const req = galoisRequest(p);
  if (!req.ok) throw new Error(req.reason);
  const ev = galoisEvidence(req.request);
  if (!ev.ok) throw new Error(ev.reason);
  const out = { p, f: ev.factors[0] };
  CACHE.set(text, out);
  return out;
}
const gal = (f: FactorEvidence) => {
  if (!f.galois) throw new Error("linear");
  return f.galois;
};

describe("Tier 1: every transitive group of degree 2–7 named exactly (PLAN §7 PRA-5 gate)", () => {
  it("each corpus polynomial reads its own label, `=`, on the reader's numbered roots", () => {
    const seen = new Set<string>();
    for (const c of CORPUS) {
      const { f } = run(c.text);
      const id = gal(f).identification;
      expect(id.tier, c.id).toBe(1);
      if (id.tier !== 1) continue;
      expect(id.label, `${c.id} (${c.group})`).toBe(c.label);
      expect(id.order).toBe(c.order);
      expect(id.labelsHold, c.id).toBe(true);
      expect(galoisCerts(gal(f), f.degree, true).group.level, c.id).toBe("=");
      seen.add(id.label);
    }
    // All 36 groups of degree 2–7 — the plan's "37 groups of degree 3–7" counted degree 1 and 2 in.
    const all = [2, 3, 4, 5, 6, 7].flatMap((n) => groupsOfDegree(n).map((g) => g.label));
    expect(all).toHaveLength(36);
    expect([...seen].sort()).toEqual([...all].sort());
  }, 120_000);

  it("the labelled generators generate a group of the named order, and every cycle type the primes proved is in it", () => {
    for (const c of CORPUS) {
      const { f } = run(c.text);
      const g = gal(f);
      if (g.identification.tier !== 1) continue;
      const { elements } = groupElements(
        g.identification.generators.map((x) => [...x]),
        f.degree,
        10_000,
      );
      expect(elements.length, c.id).toBe(c.order);
      const types = new Set(
        elements.map((e) => {
          const t: number[] = [];
          const seenPt = new Array<boolean>(e.length).fill(false);
          for (let i = 0; i < e.length; i++) {
            if (seenPt[i]) continue;
            let l = 0;
            for (let j = i; !seenPt[j]; j = e[j]) {
              seenPt[j] = true;
              l++;
            }
            t.push(l);
          }
          return t.sort((a, b) => b - a).join(".");
        }),
      );
      for (const w of g.cycleTypes)
        expect(types.has(w.type.join(".")), `${c.id} ${w.type}`).toBe(true);
    }
  }, 120_000);

  it("the labelled generators fix the last resolvent's certified integer root (asserted to the disc radius)", () => {
    let checked = 0;
    for (const c of CORPUS) {
      const { p, f } = run(c.text);
      const g = gal(f);
      if (g.verdict !== "open") continue;
      const F = monicTransform(f.coefficients.map(BigInt));
      const lc = Number(f.coefficients[f.degree]);
      const r = identify(
        F,
        p.roots.map(([x, y]) => [lc * x, lc * y] as const),
        g.discSquare,
      );
      if (!r.ok || !r.witness) continue;
      const A = new DiscArith(r.bits);
      const y = r.roots.map((z) => transformDisc(A, r.witness?.transform ?? [0, 1], z));
      const theta = BigInt(r.witness.root);
      for (const gen of r.generators) {
        const moved = r.witness.orbit.map((e) => actOn(gen, e));
        let v = A.int(0n);
        for (const e of moved) {
          let term = A.int(1n);
          e.forEach((k, i) => {
            for (let t = 0; t < k; t++) term = A.mul(term, y[i]);
          });
          v = A.add(v, term);
        }
        expect(A.integerIn(v), `${c.id} ${gen}`).toBe(theta);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
  }, 120_000);
});

describe("the five quintic families (PLAN §7 PRA-5 gate)", () => {
  const cases: [string, string, string[]][] = [
    ["z^5 - z - 1", "S₅ (5T5)", []],
    ["z^5 + 20z + 16", "A₅ (5T4)", []],
    [
      "z^5 - 5z + 12",
      "D₅ (5T2)",
      ["inside A₅ (5T4): the discriminant is a square", "inside a copy of D₅ (5T2)"],
    ],
    ["z^5 - 2", "F₂₀ (5T3)", ["inside a copy of F₂₀ (5T3)"]],
    [
      "z^5 + z^4 - 4z^3 - 3z^2 + 3z + 1",
      "C₅ (5T1)",
      ["inside a copy of D₅ (5T2)", "inside a copy of C₅ (5T1)"],
    ],
  ];
  for (const [text, name, stepsWanted] of cases)
    it(`${text} reads ${name}`, () => {
      const { p, f } = run(text);
      const g = gal(f);
      expect(galoisCerts(g, 5, true).group.claim).toContain(name);
      const ic = identityCerts(g.identification, p.labels);
      const steps = ic.steps.map((s) => s.claim);
      for (const w of stepsWanted)
        expect(
          steps.some((s) => s.startsWith(w)),
          `${text}: ${w}`,
        ).toBe(true);
      expect(ic.steps.every((s) => s.level === "=")).toBe(true);
      expect(ic.solvable?.claim).toMatch(
        name.startsWith("S₅") || name.startsWith("A₅") ? /^not solvable/ : /^solvable/,
      );
    });

  it("the C₅/D₅ step is the last descent, from D₅ to C₅, with the degree-2 relative resolvent", () => {
    const { f } = run("z^5 + z^4 - 4z^3 - 3z^2 + 3z + 1");
    const id = gal(f).identification;
    if (id.tier !== 1) throw new Error("not named");
    const descents = id.steps.filter((s) => s.outcome === "descend");
    const last = descents[descents.length - 1];
    expect(last).toMatchObject({ from: "5T2", to: "5T1", index: 2, via: "resolvent" });
  });
});

describe("Trinks' z⁷ − 7z + 3", () => {
  it("reads = PSL(3,2) (7T5), order 168, not solvable", () => {
    const { p, f } = run("z^7 - 7z + 3");
    const g = gal(f);
    expect(galoisCerts(g, 7, true).group.claim).toBe("PSL(3,2) (7T5), of order 168");
    const ic = identityCerts(g.identification, p.labels);
    expect(ic.solvable?.level).toBe("=");
    expect(ic.solvable?.claim).toBe(
      "not solvable — the roots cannot be written with radicals",
    );
    // A₇ holds TWO classes of PSL(3,2); the steps name which one failed and which one held.
    const steps = ic.steps.map((x) => x.claim);
    expect(
      steps.some((x) =>
        /^inside (a|no) copy of PSL\(3,2\) \(7T5\) of the (first|second) of its 2 kinds/.test(
          x,
        ),
      ),
    ).toBe(true);
    // Its generators, written on the reader's roots.
    expect(ic.generators.length).toBeGreaterThan(0);
    for (const gen of ic.generators)
      expect(gen.cert.claim).toMatch(/^(\(r[₀-₉]+( r[₀-₉]+)+\))+$/);
  });
});

describe("Tier 2: statistics only, and says so", () => {
  it("an 8T10 polynomial lists 8T10 and 8T11 as indistinguishable, and prints ≈", () => {
    // Its group checked with GAP's GaloisType (= 10); z⁸ − 4z⁶ − 4z⁴ + 4z² + 1 is 8T11 by the same check.
    for (const text of ["z^8 - 3z^6 + 4z^4 - 2z^2 + 1", "z^8 - 4z^6 - 4z^4 + 4z^2 + 1"]) {
      const { p, f } = run(text);
      const g = gal(f);
      const id = g.identification;
      expect(id.tier, text).toBe(2);
      if (id.tier !== 2) continue;
      const labels = id.candidates.map((c) => c.label);
      expect(labels).toContain("8T10");
      expect(labels).toContain("8T11");
      const top = id.candidates[0];
      expect(["8T10", "8T11"]).toContain(top.label);
      expect(top.indistinguishableFrom).toEqual([top.label === "8T10" ? "8T11" : "8T10"]);
      const c = galoisCerts(g, 8, true);
      expect(c.group.level).toBe("≈");
      expect(c.group.restriction).toMatch(/cannot separate 8T1[01] from 8T1[01]/);
      const ic = identityCerts(id, p.labels);
      expect(ic.candidates.every((x) => x.level === "≈")).toBe(true);
      expect(ic.generators).toHaveLength(0);
    }
  });

  it("every candidate contains every type seen and matches the discriminant's parity", () => {
    const { f } = run("z^8 - 3z^6 + 4z^4 - 2z^2 + 1");
    const g = gal(f);
    if (g.identification.tier !== 2) throw new Error("not tier 2");
    for (const c of g.identification.candidates) {
      const G = groupByLabel(c.label);
      expect(G.even).toBe(g.discSquare);
      for (const w of g.cycleTypes)
        expect(G.cycleTypes[w.type.join(".")] ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("the machinery", () => {
  it("every stored invariant has stabiliser exactly its subgroup", () => {
    const stored = invariants as Record<string, number[]>;
    let count = 0;
    for (const [k, mono] of Object.entries(stored)) {
      const [label, idx] = k.split("/");
      const G = groupByLabel(label);
      const m = G.maximalTransitive?.[Number(idx)];
      if (!m) throw new Error(k);
      const n = G.degree;
      const Kel = groupElements(
        m.generators.map((x) => [...x]),
        n,
        10_000,
      ).elements;
      const Gel = groupElements(
        G.generators.map((x) => [...x]),
        n,
        10_000,
      ).elements;
      expect(stabiliserOrder(Gel, orbit(Kel, mono)), k).toBe(groupByLabel(m.label).order);
      count++;
    }
    expect(count).toBeGreaterThan(30);
  });

  it("refined roots are certified: each disc holds one root, and the discs shrink with the bits", () => {
    const F = [-1n, -1n, 0n, 0n, 0n, 1n];
    const approx = [
      [1.1673, 0],
      [0.1812, 1.0839],
      [0.1812, -1.0839],
      [-0.7648, 0.3524],
      [-0.7648, -0.3524],
    ] as const;
    const a = preciseRoots(F, approx, 128);
    const b = preciseRoots(F, approx, 512);
    if (!a.ok || !b.ok) throw new Error("refused");
    for (let i = 0; i < 5; i++) {
      expect(a.roots[i].r < 1n << 20n).toBe(true);
      expect(b.roots[i].r < 1n << 20n).toBe(true);
    }
  });

  it("disc arithmetic contains the true value: ∏(T − k) for k = 1…6 rounds to the exact integers", () => {
    const A = new DiscArith(64);
    const values = [1n, 2n, 3n, 4n, 5n, 6n].map((k) => ({ ...A.int(k), r: 3n }));
    const R = polyFromRoots(A, values).map((c) => A.integerIn(c));
    expect(R).toEqual([720n, -1764n, 1624n, -735n, 175n, -21n, 1n]);
    expect(
      A.excludesIntegers({ re: (5n << 64n) + (1n << 63n), im: 0n, r: 1n << 60n }),
    ).toBe(true);
    expect(A.excludesIntegers({ re: 5n << 64n, im: 0n, r: 1n })).toBe(false);
  });

  it("the precision cap is a stated number, and permText writes the reader's labels", () => {
    expect(MAX_BITS).toBe(4096);
    expect(permText([1, 2, 0, 3], [4, 2, 1, 3])).toBe("(r₄ r₂ r₁)");
    const p: Perm = compose([1, 0, 2], [0, 2, 1]);
    expect(permText(p, null)).toBe("(r₁ r₂ r₃)");
  });
});
