import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { compileEscape } from "../src/glsl.js";

// In-package guard for the sqrt-free `abs(E) op k` ⟹ `cabs2(E) op k·k` peephole (commit 0527fe5,
// review MED #5 / A6). This is a keystone hot-loop optimization — it rewrites the escape predicate run
// for every pixel every iteration — but before this test its emitted-string contract was pinned ONLY by
// the @cas/gpu / complex-dynamics browser corpora (cross-package, and ci.yml's `browser` job is a
// non-blocker). These assertions live in the package that OWNS the transform, on the lint/typecheck/test
// gated path, so a regression fails fast and locally.
//
// Emission conventions (see glsl.ts): the folded form emits `cabs2(` (the squared magnitude); the
// declined form falls back to `cre1(cabs(...))` — the sqrt path. `cabs2(` does not contain the substring
// `cabs(` (the digit `2` sits between), so `cabs(` cleanly discriminates "peephole declined".

describe("@cas/expr GLSL abs-squared escape peephole", () => {
  it("folds `abs(z) > k` (constant k ≥ 0) to the sqrt-free `cabs2(E) > k·k`", () => {
    const g = compileEscape(parse("abs(z) > 2"));
    expect(g).toContain("cabs2("); // squared-magnitude form
    expect(g).toContain("4.0"); // k·k = 2² emitted as the compared literal, NOT k
    expect(g).not.toContain("cabs("); // no leftover sqrt `cabs(...)` call
  });

  it("folds the mirrored `k > abs(z)` form too", () => {
    const g = compileEscape(parse("2 > abs(z)"));
    expect(g).toContain("cabs2(");
    expect(g).toContain("4.0");
    expect(g).not.toContain("cabs(");
  });

  it("does NOT fold when the threshold is a parameter (non-constant RHS stays the sqrt form)", () => {
    // constReal(var) === null ⇒ the peephole declines; the escape test keeps the exact sqrt comparison.
    const g = compileEscape(parse("abs(z) > k"), { params: ["k"] });
    expect(g).toContain("cabs("); // sqrt fallback
    expect(g).not.toContain("cabs2("); // must not have been folded
  });

  it("does NOT square a negative constant into a flipped test", () => {
    // k < 0 makes `abs(E) op k` trivially decidable and squaring would flip the sense — the guard `k >= 0`
    // must decline, keeping the unsquared literal.
    const g = compileEscape(parse("abs(z) > -1"));
    expect(g).not.toContain("cabs2("); // not folded (squaring -1 → +1 would flip the test)
    expect(g).toContain("cneg("); // the negation is preserved, unsquared, in the sqrt fallback
  });

  it("declines the fold when k·k would overflow float32 (keeps the working sqrt form)", () => {
    // k ≈ 2e19 ⇒ k·k ≈ 4e38 > FLOAT32_MAX (3.4e38): squaring would emit an fp32 literal that rounds to
    // Inf, making `cabs2(E) > Inf` permanently false (escape never fires). The guard must fall back.
    const g = compileEscape(parse("abs(z) > 2e19"));
    expect(g).not.toContain("cabs2("); // fold declined
    expect(g).toContain("cabs("); // sqrt fallback used
    expect(g).not.toContain("4e+38"); // the overflowing squared literal must NOT appear
    expect(g).not.toMatch(/Inf/i); // and definitely no Inf literal
  });

  it("still folds a large-but-safe threshold (k·k within float32 range)", () => {
    // A realistic large escape radius (1e6 ⇒ k·k = 1e12 ≪ 3.4e38) must still take the fast path.
    const g = compileEscape(parse("abs(z) > 1000000"));
    expect(g).toContain("cabs2(");
    expect(g).not.toContain("cabs(");
  });
});
