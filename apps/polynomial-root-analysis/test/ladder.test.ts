import { describe, expect, it } from "vitest";
import { cycleType, formatCycles, isIdentity, loopCommutator } from "@cas/monodromy";
import {
  QUINTIC_CANDIDATES,
  identities,
  rung,
  selfFeeding,
  symmetricDerived,
  threeCycleSplit,
} from "../src/engine/ladder/rungs.js";
import { outcome, runLadder, type LadderRun } from "../src/engine/ladder/run.js";
import {
  lettersOf,
  wordDepth,
  wordMotion,
  wordPerm,
  permText,
} from "../src/engine/ladder/word.js";
import { readFormula, rewriteRadicals } from "../src/engine/formula/tree.js";
import { evaluateAlong } from "../src/engine/formula/evaluate.js";
import { ladderVerdict, radicalCert, radicalTheoremCert } from "../src/engine/certify.js";
import { comm, letter } from "../src/engine/ladder/word.js";

function run(degree: 2 | 3 | 4 | 5, formula: string, word: string): LadderRun {
  const r = runLadder(degree, formula, word);
  if (!r.ok) throw new Error(r.reason);
  if (!r.run.evaluation.ok) throw new Error(r.run.evaluation.reason);
  return r.run;
}
const gallery = (d: 2 | 3 | 4 | 5, id?: string): string =>
  (id ? rung(d).formulas.find((f) => f.id === id) : rung(d).formulas[0])?.text ?? "";
const outcomes = (r: LadderRun) =>
  r.evaluation.ok
    ? r.evaluation.radicals.map((o) => [o.radical.level, o.closes, o.winding])
    : [];

describe("Cardano (PLAN §7 PRA-8 gate)", () => {
  const f = gallery(3, "cardano");
  it("is a two-level formula whose value at the start IS a root", () => {
    const r = readFormula(f, 3);
    if (!r.ok) throw new Error(r.reason);
    expect(r.formula.depth).toBe(2);
    const roots = rung(3).roots;
    const ev = evaluateAlong(r.formula, [roots, roots]);
    if (!ev.ok) throw new Error(ev.reason);
    expect(
      Math.min(...roots.map((z) => Math.hypot(z[0] - ev.start[0], z[1] - ev.start[1]))),
    ).toBeLessThan(1e-12);
  });
  it("its outer cube root FAILS on the depth-1 commutator, whose permutation is (123)", () => {
    const r = run(3, f, "d1");
    expect(permText(r.composed)).toBe("(1 2 3)");
    expect(r.agrees).toBe(true);
    const [sq, cube] = outcomes(r);
    expect(sq).toEqual([1, true, 0]);
    expect(cube[0]).toBe(2);
    expect(cube[1]).toBe(false);
    // Measured winding ±2: a winding not divisible by 3, which is all failure needs (≡ ∓1 mod 3).
    expect(Math.abs(cube[2] as number) % 3).not.toBe(0);
    expect(r.outcome).toEqual({ kind: "survives", radical: 1 });
    expect(ladderVerdict(r, "(1 2 3)").level).toBe("≈");
  });
  it("closes on every depth-2 commutator", () => {
    for (const w of rung(3).words.filter((x) => wordDepth(x.word) === 2)) {
      const r = run(3, f, w.id);
      expect(r.evaluation.ok && r.evaluation.closes).toBe(true);
      expect(isIdentity(r.composed)).toBe(true); // A₃ is abelian
      expect(r.outcome).toEqual({ kind: "trivial" });
    }
  });
});

describe("Ferrari (PLAN §7 PRA-8 gate)", () => {
  const f = gallery(4, "ferrari");
  it("is three levels deep and names a root at the start", () => {
    const r = readFormula(f, 4);
    if (!r.ok) throw new Error(r.reason);
    expect(r.formula.depth).toBe(3);
    const roots = rung(4).roots;
    const ev = evaluateAlong(r.formula, [roots, roots]);
    if (!ev.ok) throw new Error(ev.reason);
    expect(
      Math.min(...roots.map((z) => Math.hypot(z[0] - ev.start[0], z[1] - ev.start[1]))),
    ).toBeLessThan(1e-12);
  });
  it("fails at depth 2, on the word whose permutation is (14)(23)", () => {
    const r = run(4, f, "d2");
    expect(permText(r.composed)).toBe("(1 4)(2 3)");
    const lv3 = outcomes(r).filter(([level]) => level === 3);
    expect(lv3.some(([, closes]) => closes === false)).toBe(true);
    expect(
      outcomes(r)
        .filter(([level]) => (level as number) <= 2)
        .every(([, c]) => c),
    ).toBe(true);
  });
  it("closes at depth 3", () => {
    const r = run(4, f, "d3");
    expect(r.evaluation.ok && r.evaluation.closes).toBe(true);
    expect(isIdentity(r.composed)).toBe(true); // V₄ is abelian
  });
});

describe("the quintic: every depth is killed (PLAN §7 PRA-8 gate)", () => {
  it("each depth-N candidate, N = 1…4, fails on Ramond's depth-N word, whose permutation is a 3-cycle", () => {
    for (let N = 1; N <= 4; N++) {
      const c = QUINTIC_CANDIDATES[N - 1];
      expect(
        readFormula(c.text, 5).ok &&
          (readFormula(c.text, 5) as { formula: { depth: number } }).formula.depth,
      ).toBe(N);
      const r = run(5, c.text, `d${N}`);
      expect(
        wordDepth(
          rung(5).words.find((w) => w.id === `d${N}`)?.word ?? {
            kind: "letter",
            perm: [],
          },
        ),
      ).toBe(N);
      expect(cycleType(r.composed)).toEqual([3]);
      expect(r.agrees).toBe(true);
      expect(r.evaluation.ok && r.evaluation.closes).toBe(true);
      expect(r.outcome).toEqual({ kind: "refuted", depth: N });
      expect(ladderVerdict(r, permText(r.composed))).toMatchObject({ level: "=" });
      expect(ladderVerdict(r, permText(r.composed)).claim).toMatch(
        new RegExp(
          `depth ${N} is killed by this word, and a formula needs at least ${N + 1}`,
        ),
      );
    }
  });
  it("the candidates are built to be TIGHT: each fails one depth shallower (the four-level one at three)", () => {
    for (let N = 1; N <= 3; N++) {
      const r = run(5, QUINTIC_CANDIDATES[N - 1].text, `d${N - 1}`);
      expect(r.outcome?.kind).toBe("survives");
    }
    expect(run(5, QUINTIC_CANDIDATES[3].text, "d3").outcome).toEqual({
      kind: "refutedMeasured",
      depth: 3,
    });
    expect(run(5, QUINTIC_CANDIDATES[3].text, "d2").outcome?.kind).toBe("survives");
  });
  it("the words are Ramond's self-feeding identity: a 3-cycle as a commutator of 3-cycles, composed", () => {
    const c = [1, 2, 0, 3, 4];
    const [a, b] = threeCycleSplit(c);
    expect(cycleType(a)).toEqual([3]);
    expect(cycleType(b)).toEqual([3]);
    expect(loopCommutator(a, b)).toEqual(c);
    for (let N = 1; N <= 4; N++) {
      const w = selfFeeding(c, N);
      expect(wordPerm(w)).toEqual(c);
      expect(wordDepth(w)).toBe(N);
      expect(lettersOf(w)).toHaveLength(4 ** N);
      expect(lettersOf(w).every((l) => cycleType(l.perm).join() === "2")).toBe(true);
    }
  });
});

describe("the derived series, enumerated (PLAN §7 PRA-8 gate)", () => {
  it("S₄: 24, 12, 4, 1 — solvable; S₅: 120, 60, 60 — it stalls", () => {
    expect(symmetricDerived(4).orders).toEqual([24, 12, 4, 1]);
    expect(symmetricDerived(4).solvable).toBe(true);
    expect(symmetricDerived(5).orders).toEqual([120, 60, 60]);
    expect(symmetricDerived(5).solvable).toBe(false);
    expect(symmetricDerived(5).levels[1]).toHaveLength(60);
    expect(symmetricDerived(3).orders).toEqual([6, 3, 1]);
  });
  it("the identity ladder, composed: [(12),(23)] = (123); [(123),(234)] = (14)(23); V₄ commutes; [(123),(345)] is a 3-cycle", () => {
    const ids = identities(5).map(
      (x) => `[${permText(x.a)}, ${permText(x.b)}] = ${permText(x.result)}`,
    );
    expect(ids).toEqual([
      "[(1 2), (2 3)] = (1 2 3)",
      "[(1 2 3), (2 3 4)] = (1 4)(2 3)",
      "[(1 3)(2 4), (1 4)(2 3)] = ()",
      "[(1 2 3), (3 4 5)] = (2 3 5)",
    ]);
  });
});

describe("words, motions and the evaluator", () => {
  it("a word's permutation read off its motion agrees with the one composed, on every rung", () => {
    for (const d of [2, 3, 4, 5] as const)
      for (const w of rung(d).words) {
        const m = wordMotion(w.word, rung(d).roots);
        expect(m.perm).toEqual(wordPerm(w.word));
        // The motion is closed as a SET: the last frame is the first, permuted.
        const last = m.frames[m.frames.length - 1];
        expect(new Set(last.map((z) => z.join()))).toEqual(
          new Set(rung(d).roots.map((z) => z.join())),
        );
      }
  });
  it("an inverse runs the motion backwards: a word then its inverse brings every root home", () => {
    const w = rung(4).words.find((x) => x.id === "d1")?.word;
    if (!w) throw new Error("no word");
    const there = wordMotion(w, rung(4).roots);
    const back = wordMotion({ kind: "inverse", of: w }, rung(4).roots);
    expect(wordPerm({ kind: "inverse", of: w })).toEqual(back.perm);
    expect(back.perm.map((_, r) => there.perm[back.perm[r]] ?? -1)).toEqual([0, 1, 2, 3]);
    // Backwards means the same frames in reverse, as sets.
    expect(back.frames).toHaveLength(there.frames.length);
  });
  it("the quadratic formula's square root fails on one swap", () => {
    const r = run(2, gallery(2), "d0");
    expect(outcomes(r)).toEqual([[1, false, -1]]);
  });
  it("rewrites cbrt and root(k, ·) into powers, innermost first, and refuses a bad degree", () => {
    expect(rewriteRadicals("cbrt(a0 + root(5, a1))")).toBe("((a0 + ((a1)^(1/5)))^(1/3))");
    expect(rewriteRadicals("root(1, a0)")).toEqual({
      error: "the degree of root(1, …) must be a whole number ≥ 2",
    });
    expect(rewriteRadicals("cbrt(a0")).toEqual({ error: "'cbrt(' is not closed" });
  });
  it("reads levels, and refuses what is not a radical formula", () => {
    const lv = (t: string) => {
      const r = readFormula(t, 3);
      return r.ok ? r.formula.radicals.map((x) => x.level) : r.reason;
    };
    expect(lv("sqrt(a0) + cbrt(a1 + sqrt(a2))")).toEqual([1, 1, 2]);
    expect(lv("sqrt(2) + a0")).toEqual([]);
    expect(lv("p = sqrt(a0); root(4, p + 1)")).toEqual([1, 2]);
    expect(lv("exp(a0)")).toMatch(/not a radical/);
    expect(lv("a3")).toMatch(/a3 is not a coefficient below the leading one/);
    expect(lv("y + 1")).toMatch(/'y' is neither/);
    expect(lv("a0^0.5")).toMatch(/exponent/);
  });
  it("a radicand through 0 refuses by name", () => {
    // disc vanishes where two roots meet: move two roots onto each other.
    const f = readFormula("sqrt(disc)", 2);
    if (!f.ok) throw new Error(f.reason);
    const ev = evaluateAlong(f.formula, [
      [
        [1, 0],
        [-1, 0],
      ],
      [
        [0, 0],
        [0, 0],
      ],
    ]);
    expect(ev.ok).toBe(false);
    if (!ev.ok) expect(ev.reason).toMatch(/passes through 0/);
  });
  it("a measured closure is ≈ and says what was checked", () => {
    const r = run(3, gallery(3), "d1");
    if (!r.evaluation.ok) throw new Error("x");
    const c = radicalCert(
      r.evaluation.radicals[1],
      r.evaluation.samples,
      r.evaluation.halvings,
    );
    expect(c.level).toBe("≈");
    expect(c.method).toMatch(/checked AT the samples, not between them/);
    expect(formatCycles(r.composed)).toBe("(1 2 3)");
  });
});

describe("sweep survivors (PRA-8)", () => {
  it("a radical whose inner radical failed does not RETURN, and has no winding to report", () => {
    const r = run(3, gallery(3, "cardano"), "d0");
    if (!r.evaluation.ok) throw new Error("x");
    const cube = r.evaluation.radicals[1];
    expect(cube.returns).toBe(false);
    expect(cube.winding).toBeNull();
    expect(radicalCert(cube, 1, 0).claim).toBe(
      "does not close (its radicand does not come back)",
    );
  });
  it("a halved step grows back: extra samples stay proportional to the halvings", () => {
    const r = run(4, gallery(4, "ferrari"), "d3");
    if (!r.evaluation.ok) throw new Error("x");
    expect(r.evaluation.halvings).toBeGreaterThan(0);
    expect(r.evaluation.samples).toBeLessThan(
      r.motion.frames.length + 4 * r.evaluation.halvings + 10,
    );
  });
  it("a power by 1/2 is a square root", () => {
    const f = readFormula("a0^(1/2) + a1", 3);
    expect(f.ok && f.formula.radicals.map((x) => x.k)).toEqual([2]);
  });
  it("a commutator's depth is one more than its DEEPER side", () => {
    const x = letter([1, 0, 2]);
    expect(wordDepth(comm(x, comm(x, x)))).toBe(2);
    expect(wordDepth(comm(comm(x, x), x))).toBe(2);
  });
  it("the theorem speaks for a radical of level equal to the word's depth, and not above it", () => {
    expect(radicalTheoremCert(2, 2)?.level).toBe("=");
    expect(radicalTheoremCert(3, 2)).toBeNull();
  });
  it("a measured closure that contradicts the theorem is a contradiction, not a result", () => {
    const r = run(3, gallery(3, "cardano"), "d2");
    if (!r.evaluation.ok) throw new Error("x");
    const ev = r.evaluation;
    // Pretend the level-2 radical had been measured failing along this depth-2 word.
    const forged = {
      ...ev,
      radicals: ev.radicals.map((o) =>
        o.radical.level === 2 ? { ...o, closes: false } : o,
      ),
    };
    expect(outcome(r.formula, 2, r.composed, forged)).toEqual({
      kind: "contradiction",
      radical: 1,
    });
    expect(
      ladderVerdict(
        { ...r, evaluation: forged, outcome: { kind: "contradiction", radical: 1 } },
        "()",
      ).level,
    ).toBe("⚠");
  });
  it("a verdict carried by measurement alone is ≈", () => {
    const r = run(5, QUINTIC_CANDIDATES[3].text, "d3");
    expect(ladderVerdict(r, permText(r.composed)).level).toBe("≈");
  });
});
