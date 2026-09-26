import { describe, expect, it } from "vitest";
import { groupElements } from "@cas/monodromy";
import { parsePolynomial } from "../src/engine/parse.js";
import { fromExact, type Polynomial } from "../src/engine/polynomial.js";
import { galoisEvidence, galoisRequest } from "../src/engine/galois/tier0.js";
import {
  correspondence,
  latticeFor,
  orbitValue,
  plainName,
  type Correspondence,
} from "../src/engine/galois/correspondence.js";
import { DiscArith } from "../src/engine/galois/discArith.js";
import { transformDisc } from "../src/engine/galois/descent.js";
import { preciseRoots } from "../src/engine/galois/refine.js";
import { latticeNodeCert, movedCert, overgroupCert } from "../src/engine/certify.js";
import { loopContext, runLoop } from "../src/engine/loops/run.js";
import { analyse } from "../src/engine/analysis/analyse.js";
import { rootDiscs } from "../src/engine/roots/discs.js";

function poly(text: string): Polynomial {
  const read = parsePolynomial(text, "Q");
  if (!read.ok) throw new Error(read.reason);
  const built = fromExact(read.exact, "Q");
  if (!built.ok) throw new Error(built.reason);
  return built.poly;
}

function setup(text: string) {
  const p = poly(text);
  const req = galoisRequest(p);
  if (!req.ok) throw new Error(req.reason);
  const ev = galoisEvidence(req.request);
  if (!ev.ok || !ev.irreducible) throw new Error("not irreducible");
  const f = ev.factors[0];
  const id = f.galois?.identification;
  if (!id || id.tier !== 1) throw new Error("not named");
  const c = latticeFor({
    coefficients: f.coefficients,
    roots: p.roots.map(([x, y]) => [x, y] as const),
    generators: id.generators,
  });
  if (!c.ok) throw new Error(c.reason);
  return { p, f, id, c };
}

const poly3 = (c: Extract<Correspondence, { ok: true }>, idx: number) =>
  c.nodes.filter((n) => n.index === idx).map((n) => n.resolvent?.coefficients.join(","));

describe("x³ − 2: S₃'s six subgroups and their fields (PLAN §7 PRA-6 gate)", () => {
  const { c } = setup("z^3 - 2");
  it("shows all six, with S₃ at the top reading an integer", () => {
    expect(c.everySubgroup).toBe(true);
    expect(c.nodes.map((n) => n.order)).toEqual([6, 3, 2, 2, 2, 1]);
    const top = c.nodes[0];
    expect(top.label).toBe("3T2");
    expect(latticeNodeCert(top)).toMatchObject({ level: "=" });
    expect(top.integer).toBe("0"); // x₀ + x₁ + x₂, the sum of the roots
  });
  it("A₃'s field is ℚ(ω): its polynomial is T² + 108, whose discriminant is −3·12²", () => {
    expect(poly3(c, 2)).toEqual(["108,0,1"]);
  });
  it("each C₂ — the stabiliser of one root — has the field ℚ(∛2) or a conjugate: its polynomial is T³ − 2", () => {
    expect(poly3(c, 3)).toEqual(["-2,0,0,1", "-2,0,0,1", "-2,0,0,1"]);
    expect(c.nodes.filter((n) => n.index === 3).every((n) => n.conjugates === 3)).toBe(
      true,
    );
  });
  it("the trivial group's field is the splitting field, of degree 6", () => {
    const bottom = c.nodes[c.nodes.length - 1];
    expect(bottom.index).toBe(6);
    expect(bottom.resolvent?.coefficients).toHaveLength(7);
    expect(c.nodes.every((n) => latticeNodeCert(n).level === "=")).toBe(true);
  });
  it("the Hasse edges: S₃ over A₃ and the three C₂; all of them over the trivial group", () => {
    expect(c.nodes[0].below).toEqual([1, 2, 3, 4]);
    for (const i of [1, 2, 3, 4]) expect(c.nodes[i].below).toEqual([5]);
  });
});

describe("the D₅ quintic: the F₂₀ invariant is Dummit's θ = 40 (PLAN §7 PRA-6 gate)", () => {
  const { p, c } = setup("z^5 - 5z + 12");
  const f20 = c.overgroups.find((o) => o.label === "5T3");
  it("reads = 40", () => {
    expect(f20?.integer).toBe("40");
    if (f20) expect(overgroupCert(f20).level).toBe("=");
  });

  it("a lasso transposition applied to the roots moves it off 40, asserted with the disc", () => {
    if (!f20) throw new Error("no F₂₀");
    const discs = rootDiscs(p);
    const analysis = analyse(p, discs, {
      coefficient: 0,
      pseudozero: null,
      range: [-2, 2, -2, 2],
      drag: false,
    });
    const ctx = loopContext(p, 0, analysis.branch);
    const run = runLoop(p, { kind: "lasso", point: 0, sign: 1 }, ctx);
    if (!run.ok) throw new Error(run.reason);
    // A certified swap of two roots.
    expect(run.perm.filter((v, i) => v !== i)).toHaveLength(2);
    const r = preciseRoots([12n, -5n, 0n, 0n, 0n, 1n], p.roots, c.bits);
    if (!r.ok) throw new Error(r.reason);
    const A = new DiscArith(c.bits);
    const before = orbitValue(A, r.roots, f20.orbit);
    expect(A.integerIn(before)).toBe(40n);
    const after = orbitValue(A, r.roots, f20.orbit, run.perm);
    expect(A.excludesIntegers(after)).toBe(true);
    // And the card says so, with the move not inside the copy of F₂₀.
    expect(movedCert(run.perm, f20.generators, [0, 0]).claim).toMatch(
      /^after the motion: moved/,
    );
  });
});

describe("a Galois element fixes the invariants of exactly the subgroups containing it", () => {
  it("x³ − 2: every generator, against every node, in disc arithmetic", () => {
    const { p, c, id } = setup("z^3 - 2");
    const r = preciseRoots([-2n, 0n, 0n, 1n], p.roots, c.bits);
    if (!r.ok) throw new Error(r.reason);
    const A = new DiscArith(c.bits);
    let fixed = 0;
    let moved = 0;
    for (const g of id.generators)
      for (const node of c.nodes) {
        if (node.invariant.kind !== "orbit") continue;
        const inH = groupElements(
          node.generators.map((x) => [...x]),
          3,
          100,
        ).elements.some((e) => e.every((v, i) => v === g[i]));
        // At the roots the field polynomial was built from — after its transformation, which is what
        // makes the conjugate values distinct (x₀²x₁ takes only three values on αωᵏ).
        const y = r.roots.map((w) =>
          transformDisc(A, node.resolvent?.transform ?? [0, 1], w),
        );
        const a = orbitValue(A, y, node.invariant.orbit);
        const b = orbitValue(A, y, node.invariant.orbit, [...g]);
        const dr = a.re - b.re;
        const di = a.im - b.im;
        const sep = dr * dr + di * di > (a.r + b.r) * (a.r + b.r);
        if (inH) {
          expect(sep).toBe(false);
          fixed++;
        } else {
          expect(sep).toBe(true);
          moved++;
        }
      }
    expect(fixed).toBeGreaterThan(0);
    expect(moved).toBeGreaterThan(0);
  });
});

describe("goldens and scope", () => {
  it("in S₅ the F₂₀ node's field polynomial is research 01's sextic for x⁵ − x − 1", () => {
    const { c } = setup("z^5 - z - 1");
    expect(c.everySubgroup).toBe(false);
    expect(c.total).toBe(156);
    expect(c.nodes).toHaveLength(19);
    const f20 = c.nodes.find((n) => n.label === "5T3");
    expect(f20?.resolvent?.coefficients).toEqual([
      "9631",
      "-3637",
      "400",
      "-160",
      "40",
      "-8",
      "1",
    ]);
    // A₅ is the commutator subgroup, its field ℚ(√2869): T² − 2869.
    const a5 = c.nodes.find((n) => n.label === "5T4");
    expect(a5?.derived).toBe(1);
    expect(a5?.resolvent?.coefficients).toEqual(["-2869", "0", "1"]);
  });

  it("degree 7: the transitive sublattice and the derived series, by class, fast", () => {
    const t = performance.now();
    const { c } = setup("z^7 - z - 1");
    expect(performance.now() - t).toBeLessThan(10_000);
    expect(c.nodes.map((n) => [n.label, n.conjugates])).toEqual([
      ["7T7", 1],
      ["7T6", 1],
      ["7T5", 30],
      ["7T4", 120],
      ["7T3", 120],
      ["7T2", 120],
      ["7T1", 120],
    ]);
    expect(c.total).toBe(512);
    expect(c.nodes.find((n) => n.label === "7T1")?.resolventWhy).toMatch(/degree 720/);
  });

  it("a non-monic polynomial: the invariants live on the monic transform's roots", () => {
    // 16z⁵ − 5z + 6: D₅ again (z = x/2 in x⁵ − 5x + 12), so a copy of F₂₀ contains it.
    const { c } = setup("16z^5 - 5z + 6");
    expect(c.overgroups.map((o) => o.label)).toContain("5T3");
  });

  it("refuses past degree 7", () => {
    expect(correspondence([1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n], [], [])).toEqual({
      ok: false,
      reason: "degree 8 is past the lattices this app carries",
    });
  });

  it("names the intransitive subgroups by type", () => {
    const g = (gens: number[][], n: number) => groupElements(gens, n, 1000).elements;
    expect(plainName(g([[1, 0, 2, 3]], 4))).toBe("C₂");
    expect(
      plainName(
        g(
          [
            [1, 0, 2, 3],
            [0, 1, 3, 2],
          ],
          4,
        ),
      ),
    ).toBe("V₄");
    expect(
      plainName(
        g(
          [
            [1, 2, 0, 3],
            [1, 0, 2, 3],
          ],
          4,
        ),
      ),
    ).toBe("S₃");
    expect(
      plainName(
        g(
          [
            [1, 2, 3, 0, 4],
            [3, 2, 1, 0, 4],
          ],
          5,
        ),
      ),
    ).toBe("D₄");
    expect(plainName(g([[0, 1, 2, 3]], 4))).toBe("the trivial group");
  });
});
