// **THE DECLARED SPLIT IS CHECKED, NOT BELIEVED** — M5.1c.
//
// Once the sandbox declares a branch factor the integrand box holds only `R(z)`, and the whole
// integrand is a claim the reader made. M4.1 refused to build a DETECTOR for branch points, for a
// good reason — an incomplete one reports "no branch points" for an integrand that has them. The
// same reasoning says the app must not simply believe a split either. It cannot verify intent; it
// can verify arithmetic, against the expression that was in the box a moment earlier.
//
// The hard part is WHERE the comparison is legitimate, and these tests exist mostly to pin that.
// `@cas/expr` compiles `z^α` in its principal branch; D1's declared window is `[0, 2π)`; the two
// disagree on the whole lower half plane, where the split is correct and the numbers differ anyway.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { parse } from "@cas/expr";
import { checkSplit } from "../src/engine/splitCheck.js";
import { buildDeclaration } from "../src/kernel/branch/declaration.js";
import type { DeclaredProduct } from "../src/kernel/branch/declared.js";

const KEYHOLE = [Frac.ZERO, Frac.of(2n)] as const;
const PRINCIPAL = [Frac.of(-1n), Frac.ONE] as const;

/** `z^α` declared in a window, as the sandbox would build it. */
function product(alpha: Frac, window: readonly [Frac, Frac], sign: 1 | -1 = 1, constant: readonly [number, number] = [1, 0]): DeclaredProduct {
  const built = buildDeclaration({ constant, at: 0, window, order: { kind: "power", alpha, sign } });
  if (!built.ok) throw new Error(built.reason);
  return built.declared;
}

describe("a correct split is recognised", () => {
  it("D1's own: `z^(-7/10)/(1+z)` split as the factor times `1/(1+z)`", () => {
    const r = checkSplit(product(Frac.of(-7n, 10n), KEYHOLE), parse("1/(1+z)"), parse("z^(-0.7)/(1+z)"));
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThan(8);
    expect(r.worst).toBeLessThan(1e-9);
    expect(r.detail).toMatch(/reproduces the expression/);
  });

  it("in the PRINCIPAL window, where every sample is checkable rather than half of them", () => {
    // The twin is then the product itself, so the region where the determinations agree is the
    // whole plane. No special case is needed for this and none exists.
    const keyhole = checkSplit(product(Frac.of(1n, 2n), KEYHOLE), parse("1/(1+z^2)"), parse("z^0.5/(1+z^2)"));
    const principal = checkSplit(product(Frac.of(1n, 2n), PRINCIPAL), parse("1/(1+z^2)"), parse("z^0.5/(1+z^2)"));
    expect(keyhole.ok).toBe(true);
    expect(principal.ok).toBe(true);
    expect(principal.checked).toBeGreaterThan(keyhole.checked);
  });

  it("with a constant in front, which must be part of the claim and not ignored", () => {
    expect(checkSplit(product(Frac.of(1n, 2n), KEYHOLE, 1, [3, 0]), parse("1/(1+z)"), parse("3*z^0.5/(1+z)")).ok).toBe(true);
    // The SAME split with the constant left out of the declaration is a different integrand.
    expect(checkSplit(product(Frac.of(1n, 2n), KEYHOLE), parse("1/(1+z)"), parse("3*z^0.5/(1+z)")).ok).toBe(false);
  });

  it("and a complex constant", () => {
    expect(checkSplit(product(Frac.of(1n, 2n), KEYHOLE, 1, [0, 1]), parse("1/(1+z)"), parse("i*z^0.5/(1+z)")).ok).toBe(true);
  });
});

describe("the mistakes a reader actually makes are caught", () => {
  it("the branch factor left INSIDE R(z) — the first thing that happens on declaring", () => {
    // The box holds the whole integrand at the moment the factor is declared, so until the reader
    // removes it the split double-counts. The app has to say so rather than quietly computing.
    const r = checkSplit(product(Frac.of(-7n, 10n), KEYHOLE), parse("z^(-0.7)/(1+z)"), parse("z^(-0.7)/(1+z)"));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/still inside R\(z\)/);
  });

  it("the wrong exponent", () => {
    expect(checkSplit(product(Frac.of(1n, 3n), KEYHOLE), parse("1/(1+z)"), parse("z^0.5/(1+z)")).ok).toBe(false);
  });

  it("the wrong ORIENTATION — `(−z)^α` is not `z^α`, and the difference is a phase", () => {
    // D7's trap in miniature: the same number, not the same power.
    const right = checkSplit(product(Frac.of(1n, 2n), KEYHOLE, 1), parse("1/(1+z)"), parse("z^0.5/(1+z)"));
    const wrong = checkSplit(product(Frac.of(1n, 2n), KEYHOLE, -1), parse("1/(1+z)"), parse("z^0.5/(1+z)"));
    expect(right.ok).toBe(true);
    expect(wrong.ok).toBe(false);
  });

  it("a cofactor that is right up to a sign", () => {
    expect(checkSplit(product(Frac.of(1n, 2n), KEYHOLE), parse("-1/(1+z)"), parse("z^0.5/(1+z)")).ok).toBe(false);
  });
});

describe("an unverifiable split is REFUSED, which is not the same as failed", () => {
  it("says so when the two determinations never agree ANYWHERE", () => {
    // `arg ∈ [2π, 4π)` is a legitimate determination — a different sheet — and the principal
    // argument is never in it, so the two differ by `e^{2πiα}` at every point and there is nothing
    // to compare anywhere. (A merely rotated window like `[π/2, 5π/2)` is NOT this case: it still
    // overlaps the principal range on a quarter of the plane, and is checked there.)
    const otherSheet = [Frac.of(2n), Frac.of(4n)] as const;
    const r = checkSplit(product(Frac.of(1n, 3n), otherSheet), parse("1/(1+z)"), parse("z^(1/3)/(1+z)"));
    expect(r.ok).toBe(false);
    expect(r.checked).toBeLessThan(8);
    // The wording matters: "could not be checked" and "nothing is claimed", NOT "does not match".
    expect(r.detail).toMatch(/could not be checked/);
    expect(r.detail).toMatch(/agree at only/);
    expect(r.detail).toMatch(/Nothing is claimed/);
    expect(r.detail).not.toMatch(/is NOT the expression/);
  });

  it("an UNBOUND PARAMETER is named for what it is, not reported as a branch disagreement", () => {
    // `@cas/expr` evaluates an unbound variable to ZERO rather than refusing, so `a*z^0.5/(1+z)` is
    // silently the zero function: every sample is skipped for having nothing to divide by. The
    // determinations agree perfectly well — reporting THAT as the reason, which the first draft did,
    // is true and about the wrong thing. The three ways of being uncheckable read differently.
    const r = checkSplit(product(Frac.of(1n, 2n), KEYHOLE), parse("a/(1+z)"), parse("a*z^0.5/(1+z)"));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/zero or unbounded/);
    expect(r.detail).toMatch(/parameter the box does not bind/);
    expect(r.detail).toMatch(/Nothing is claimed/);
    // And specifically NOT the branch-disagreement wording, which is the trap this pins.
    expect(r.detail).not.toMatch(/agree at only/);
  });

  it("and a partly-rotated window is checked on the overlap rather than refused", () => {
    // `[π/2, 5π/2)` puts the cut straight up and still agrees with principal on `arg ∈ [π/2, π]`.
    // Refusing it would be as wrong as passing a bad split: the overlap is a quarter of the plane
    // and perfectly sufficient.
    const vertical = [Frac.of(1n, 2n), Frac.of(5n, 2n)] as const;
    const r = checkSplit(product(Frac.of(1n, 3n), vertical), parse("1/(1+z)"), parse("z^(1/3)/(1+z)"));
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThanOrEqual(8);
  });
});

describe("the region is COMPUTED, and that is the claim worth pinning", () => {
  it("a keyhole window checks roughly the half plane where it agrees with principal", () => {
    // 4 radii × 24 angles = 96 samples; the declared `[0, 2π)` determination coincides with the
    // compiled principal one on the upper half plane only. So about half are checkable — and the
    // point is that the other half are SKIPPED rather than failed, because there the split is right
    // and the two numbers still differ by `e^{2πiα}`.
    const r = checkSplit(product(Frac.of(-7n, 10n), KEYHOLE), parse("1/(1+z)"), parse("z^(-0.7)/(1+z)"));
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThan(30);
    expect(r.checked).toBeLessThan(70);
  });

  it("a log's determinations differ ADDITIVELY and the same region test still works", () => {
    // `log_{[0,2π)} = log_{(−π,π]} + 2πi` below the cut, so the twin comparison notices it exactly
    // as it notices a power's phase. Nothing in this module knows which case it is looking at.
    const built = buildDeclaration({ constant: [1, 0], at: 0, window: KEYHOLE, order: { kind: "log", power: 2 } });
    if (!built.ok) throw new Error(built.reason);
    const r = checkSplit(built.declared, parse("1/(1+z^2)^2"), parse("log(z)^2/(1+z^2)^2"));
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThan(30);
  });
});
