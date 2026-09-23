import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet } from "../src/engine/alphabet";
import { walkAt, walkSpec } from "../src/engine/limit/walk";
import { bandtDecide } from "../src/engine/limit/bandt";

const compile = (spec: Parameters<typeof compileAlphabet>[0]): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};
const TRINARY = walkSpec(compile({ preset: "trinary" }));
const LITTLEWOOD = walkSpec(compile({ preset: "littlewood" }));
const NEWMAN = walkSpec(compile({ preset: "zero-one" }));
/** Not closed under conjugation, so its limit set is not conjugate-symmetric — see the corpus below. */
const COMPLEX = walkSpec(compile({ preset: "custom", custom: "1, 0.5+0.5i, -1" }));

/** The grid both formulations are run over: inside the band, away from the origin, away from `|z| = 1`. */
function* probes(count: number, span: number): Generator<[number, number]> {
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) {
      const x = -span + (2 * span * (i + 0.5)) / count;
      const y = -span + (2 * span * (j + 0.5)) / count;
      const abs = Math.hypot(x, y);
      if (abs < 0.05 || abs > 0.78) continue;
      yield [x, y];
    }
  }
}

describe("Bandt's Algorithm 1 against the walk", () => {
  it("decides the same points, and counts the same frontier", () => {
    // The two run in different coordinate systems with different arithmetic: the walk multiplies by a
    // precomputed power and compares against a bound that shrinks with the depth; Bandt's divides by `z`
    // at every step and compares against a radius that does not move. An error in the walk's tail
    // formula, its power table or its depth indexing changes one and not the other.
    //
    // The FRONTIER COUNTS are compared, not just the two booleans — which is why the walk is run
    // exhaustively here and nowhere else. Two programs that agree on "is this set empty" 200 times could
    // still disagree about the set; two that agree on its size cannot, by much.
    let checked = 0;
    let inSet = 0;
    for (const [name, spec, depth] of [
      ["trinary", TRINARY, 13],
      ["littlewood", LITTLEWOOD, 20],
      ["{0,1}", NEWMAN, 18],
      // A COMPLEX alphabet, and the reason there is one: `1/z` and `1/conj z` agree everywhere over a
      // real alphabet, and both formulations carry that step, so a corpus of real alphabets alone
      // would pass with either of them conjugating. 772 of 2,816 points inside the band disagree with
      // their own conjugate over this one.
      ["{1, ½+½i, −1}", COMPLEX, 12],
    ] as const) {
      for (const [x, y] of probes(14, 0.78)) {
        const walked = walkAt(spec, x, y, { depth, eps: 0, budget: 4e6, exhaustive: true });
        const bandt = bandtDecide(spec, x, y, depth, 8e6);
        if (walked.exhausted || !bandt.decided) continue;
        checked++;
        if (walked.hits > 0) inSet++;
        expect(bandt.inSet, `${name} at ${x},${y}`).toBe(walked.hits > 0);
        expect(bandt.frontier, `${name} frontier at ${x},${y}`).toBe(walked.hits);
      }
    }
    // Anti-vacuity, both ways: a corpus that is all-in or all-out would agree for the wrong reason.
    // Measured: 624 points decided by both formulations, of which 158 are in the set and 466 are not.
    expect(checked).toBeGreaterThan(550);
    expect(inSet).toBeGreaterThan(120);
    expect(checked - inSet).toBeGreaterThan(400);
  });

  it("agrees about Bousch's ½ from the other side of the change of variable", () => {
    // Bandt's radius `R = max|a|·|z|/(1−|z|)` is derived by summing the FUTURE, not by rearranging the
    // walk's tail. `|v_0| = |a_0| = 1 ≤ R` is again `|z| ≥ ½`.
    expect(bandtDecide(LITTLEWOOD, 0.49, 0, 20).inSet).toBe(false);
    expect(bandtDecide(LITTLEWOOD, 0.51, 0, 20).inSet).toBe(true);
    expect(bandtDecide(LITTLEWOOD, 0.49, 0, 20).examined).toBe(1);
    // And `z = ½` EXACTLY, where `|v_k| = R` at every level: the containment must be inclusive, or
    // Bousch's own boundary point falls out of the set. The walk asserts the same thing from the other
    // side of the change of variable, where it is `|s_k| ≤ tail` rather than `|v_k| ≤ R`.
    const boundary = bandtDecide(LITTLEWOOD, 0.5, 0, 24);
    expect(boundary.inSet).toBe(true);
    expect(boundary.frontier).toBe(1);
    expect(boundary.examined).toBe(49);
  });

  it("finds Barnsley and Harrington's hole on the real axis, where `M` is not", () => {
    // Bandt's `M` for `{−1, 0, 1}` has a visible hole straddling the real axis around `|z| ≈ 0.6`, which
    // is the feature the `limit-bandt` place points at. Both formulations must agree that it is a hole.
    for (const x of [0.5, 0.55, 0.6, 0.62]) {
      expect(bandtDecide(TRINARY, x, 0.004, 16).inSet, `x = ${x}`).toBe(false);
      expect(walkAt(TRINARY, x, 0.004, { depth: 16, eps: 0, budget: 2e6 }).reach, `x = ${x}`).toBeLessThan(17);
    }
    // And that its surroundings are not.
    for (const [x, y] of [
      [0.4, 0.5],
      [-0.6, 0.3],
      [0.55, 0.45],
    ] as const) {
      expect(bandtDecide(TRINARY, x, y, 16).inSet, `${x},${y}`).toBe(true);
    }
  });

  it("withholds an answer rather than guessing when its own cap is reached", () => {
    const capped = bandtDecide(TRINARY, 0.5, 0.5, 20, 50);
    expect(capped.decided).toBe(false);
    expect(capped.inSet).toBe(false);
    expect(bandtDecide(TRINARY, 0.5, 0.5, 20, 8e6).decided).toBe(true);
  });
});
