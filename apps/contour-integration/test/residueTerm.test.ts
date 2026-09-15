// Pass 5 when the unknown is a TERM of the residue sum — SG-1's arithmetic and its refusals.
//
// Two kinds of claim live here and they are different in kind. The arithmetic ones are checked
// against a DIRECT SUMMATION of the series, tail and all, which shares nothing with the engine's
// route (exact residues, a Möbius function of `e^{2πiz₀}`, a ratio of basis elements) — so a wrong
// weight, a dropped residue or a sign is caught by a number rather than by a restatement. The
// structural ones are refusals, and each is asserted to name the thing that is wrong, because a
// refusal whose message does not identify the defect is only marginally better than a wrong answer.
import { describe, expect, it } from "vitest";
import { Gauss, SqrtExt } from "@cas/exact";
import { parse } from "@cas/expr";
import { asSummationKernel, type SummationKernel } from "../src/kernel/summationKernel.js";
import { cofactorResidues, ratioToTuple } from "../src/kernel/kernelResidue.js";
import { ExpSum } from "../src/kernel/expSum.js";
import { solveResidueTerm } from "../src/families/solveResidueTerm.js";
import { FAMILIES, loadFamilies } from "../src/families/index.js";
import { contourIntegrandOf } from "../src/families/instantiate.js";
import { primaryGolden, runFamily, solveFamily } from "../src/families/runFamily.js";
import { summationRecord } from "./helpers/summationRecord.js";
import { RatPi } from "../src/kernel/ratPi.js";
import type { Family, FamilyPiece, FamilyTarget } from "../src/families/schema.js";

const kernelOf = (src: string): SummationKernel => {
  const k = asSummationKernel(parse(src));
  if (k === null) throw new Error(`expected a kernel in ${src}`);
  return k;
};

const knownOf = (kernel: SummationKernel) => {
  const r = cofactorResidues(kernel);
  if (!r.ok) throw new Error(r.reason);
  return r.total;
};

/**
 * A minimal tier-G record: a square whose four sides vanish, and an unknown inside the sum.
 *
 * Written out rather than spread from a loaded record because there is no G record yet — M5.6c
 * brings the first. Only the four fields the solve reads carry content; the rest is the schema's
 * required shape, and leaving it honest (rather than casting) is what makes the test exercise the
 * same object the loader will hand it.
 */
function squareRecord(over: {
  readonly lower: string;
  readonly upper: string;
  readonly terms: string;
  readonly weight: 1 | 2;
  readonly pieces?: readonly FamilyPiece[];
}): Family {
  const target: FamilyTarget = {
    id: "S",
    kind: "sum",
    variable: "n",
    lower: over.lower,
    upper: over.upper,
    summand: "1/(n^2+a^2)",
    convergence: "absolute",
    symbols: {},
  };
  const side = (id: string, colour: 0 | 1 | 2 | 3): FamilyPiece => ({
    id,
    name: id,
    role: "vanish",
    lemma: "L2",
    colour,
    geom: { kind: "segment", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
  });
  return {
    id: "synthetic-square",
    title: "a square with the unknown inside the sum",
    taxonomySection: "§8",
    tier: "G",
    targets: [target],
    parameters: [],
    hypotheses: [],
    contour: {
      template: "square",
      limitParams: [{ name: "N", to: "inf", through: "halfIntegers" }],
      pieces: over.pieces ?? [side("right", 0), side("top", 1), side("left", 2), side("bottom", 3)],
      orientation: "ccw",
      windings: [],
    },
    vanishingLemmas: [],
    residueSelection: {
      rule: "all",
      targetTerms: [{ targetId: "S", terms: over.terms, weight: over.weight }],
    },
    closedForm: { expr: "(pi/a)*coth(pi*a)" },
    rigor: { policy: "min", inputs: [] },
    traps: [],
    golden: [],
  };
}

const TWO_SIDED = { lower: "-inf", upper: "inf", terms: "poles(K) ∩ Z", weight: 1 } as const;

function solve(family: Family, src: string) {
  const kernel = kernelOf(src);
  return solveResidueTerm(family, { kernel, known: knownOf(kernel), pieceLimits: [] });
}

const reason = (r: ReturnType<typeof solve>): string => {
  if (r.ok) throw new Error("expected a refusal");
  return r.reason;
};

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// The independent check: sum the series directly.
//
// The head is summed term by term; the tail is the MIDPOINT rule `∫_{N+½}^∞`, whose error is
// `O(g''(N))` rather than the trapezoid's `O(g'(N))` — so at N = 2000 it contributes ~1e-11 and the
// comparison is sharp enough to see a missing residue, not merely a factor of two.
// ──────────────────────────────────────────────────────────────────────────────────────────────────
const N = 2000;

/** `Σ_{n=1}^∞ 1/(n²+a²)`, and `Σ_{n∈ℤ}` is `2·that + 1/a²`. */
function sumOverN(a: number): number {
  let head = 0;
  for (let n = 1; n <= N; n++) head += 1 / (n * n + a * a);
  return head + (Math.PI / 2 - Math.atan((N + 0.5) / a)) / a;
}

/**
 * `Σ_{n=1}^∞ n²/(n⁴+4)`, whose `n = 0` term is zero.
 *
 * The tail has no elementary closed form, so it is quadratured — under `u = 1/x`, where
 * `∫_M^∞ x²/(x⁴+4) dx = ∫_0^{1/M} du/(1+4u⁴)` is an analytic integrand on a tiny interval and
 * Simpson is exact to machine precision. Still wholly independent of the engine, which is the point.
 */
function sumEvenVanishing(): number {
  let head = 0;
  for (let n = 1; n <= N; n++) head += (n * n) / (n * n * n * n + 4);
  const M = N + 0.5;
  const h = 1 / M / 200;
  let tail = 0;
  for (let k = 0; k < 200; k++) {
    const [u0, u1, u2] = [k * h, (k + 0.5) * h, (k + 1) * h];
    const g = (u: number) => 1 / (1 + 4 * u * u * u * u);
    tail += (h / 6) * (g(u0) + 4 * g(u1) + g(u2));
  }
  return head + tail;
}

describe("the two-sided sum: Σ_{n∈ℤ} 1/(n²+a²)", () => {
  // `a = p/q` exactly, so the cofactor's poles `±ia` are Gaussian and the kernel is representable.
  it.each([
    ["3/4", 0.75],
    ["1", 1],
    ["1/4", 0.25],
    ["5/2", 2.5],
  ])("a = %s", (exprA, a) => {
    const r = solve(squareRecord(TWO_SIDED), `pi*cot(pi*z)/(z^2+(${exprA})^2)`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const direct = 2 * sumOverN(a) + 1 / (a * a);
    expect(r.solved.value).toBeCloseTo(direct, 9);
    // And it IS `(π/a)coth(πa)` — the closed form, reached from the other side.
    expect(r.solved.value).toBeCloseTo((Math.PI / a) / Math.tanh(Math.PI * a), 9);
    expect(r.solved.weight).toBe(1);
    expect(r.solved.targetId).toBe("S");
  });

  it("carries T/π as an exact ratio, and the decimal is π times its real part", () => {
    const r = solve(squareRecord(TWO_SIDED), "pi*cot(pi*z)/(z^2+(3/4)^2)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Tagged, because there are two rings and they are incomparable — this is G2's.
    expect(r.solved.solvedIn.ring).toBe("exponential");
    if (r.solved.solvedIn.ring !== "exponential") return;
    const [re, im] = ratioToTuple(r.solved.solvedIn.piUnits);
    expect(im).toBeCloseTo(0, 12);
    expect(Math.PI * re).toBe(r.solved.value);
    // `T/π = coth(πa)/a` — the ratio, before anything names it.
    expect(re).toBeCloseTo(1 / Math.tanh(Math.PI * 0.75) / 0.75, 12);
  });

  it("prints the NAMED form, and its value is the form's", () => {
    const r = solve(squareRecord(TWO_SIDED), "pi*cot(pi*z)/(z^2+1)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.solved.text).toBe("π·coth(π)");
    expect(r.solved.value).toBeCloseTo(Math.PI / Math.tanh(Math.PI), 12);
    expect(r.solved.certificates.every((c) => c.level === "=")).toBe(true);
  });

  it("an unnameable ratio keeps its exact value and loses only the FORM", () => {
    // A cofactor with a single pole off the imaginary axis: the quotient is exact, and nothing in
    // `cothForm.ts`'s declared shape describes it. The answer is a decimal and the text is absent —
    // a missing formatter, never a missing value.
    const r = solve(squareRecord(TWO_SIDED), "pi*cot(pi*z)/(z-1/2)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.solved.text).toBeUndefined();
    expect(r.solved.form).toBeUndefined();
    expect(Number.isFinite(r.solved.value)).toBe(true);
  });

  it("the csc companion alternates, and the alternation belongs to the KERNEL", () => {
    const r = solve(squareRecord(TWO_SIDED), "pi*csc(pi*z)/(z^2+1)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    let direct = 1;
    for (let n = 1; n <= N; n++) direct += (2 * (n % 2 === 0 ? 1 : -1)) / (n * n + 1);
    // `Σ(−1)ⁿ/(n²+1) = π/sinh(π)`, and the cofactor is the SAME one the cot case used — the
    // alternation is the KERNEL's, which is why `Σ(−1)ⁿ/n²` will cost nothing once `Σ1/n²` exists.
    expect(r.solved.value).toBeCloseTo(Math.PI / Math.sinh(Math.PI), 9);
    // An alternating tail is bounded by its first omitted term, `2/(N+1)² ≈ 5e-7`, so five digits
    // is what this comparison can honestly claim — and a wrong kernel is out by 0.55, not by 1e-6.
    expect(r.solved.value).toBeCloseTo(direct, 5);
  });
});

describe("the weight is DERIVED from the target's range, then checked against the record", () => {
  const ONE_SIDED = { lower: "1", upper: "inf", terms: "poles(K) ∩ Z", weight: 2 } as const;
  // Even, with `f(0) = 0` — so `Σ_{n∈ℤ} = 2·Σ_{n≥1}` exactly, and weight 2 is legitimate. The
  // denominator is a BINOMIAL `z⁴ + 4`, whose roots `±1±i` are Gaussian and which
  // `exactPolesOf` splits by recursive difference-of-squares; a product of two quadratics is a
  // general quartic to it and declines, which is a limit of the engine and not of the record.
  const EVEN_VANISHING = "pi*cot(pi*z)*z^2/(z^4+4)";

  it("halves a one-sided sum of an even summand whose n = 0 term vanishes", () => {
    const r = solve(squareRecord(ONE_SIDED), EVEN_VANISHING);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.solved.weight).toBe(2);
    expect(r.solved.value).toBeCloseTo(sumEvenVanishing(), 9);
  });

  it("the same contour two-sided is exactly twice it, and BOTH land on the series", () => {
    const one = solve(squareRecord(ONE_SIDED), EVEN_VANISHING);
    const two = solve(squareRecord(TWO_SIDED), EVEN_VANISHING);
    expect(one.ok && two.ok).toBe(true);
    if (!one.ok || !two.ok) return;
    // The ratio alone would be a tautology — the solve divides by `w`, so `2×` is arithmetic it
    // cannot fail. What is not tautological is that each lands on its OWN series, summed directly:
    // a weight read out of the record rather than derived would put one of them on the other's.
    expect(one.solved.value).toBeCloseTo(sumEvenVanishing(), 9);
    expect(two.solved.value).toBeCloseTo(2 * sumEvenVanishing(), 9);
    expect(two.solved.value).toBeCloseTo(2 * one.solved.value, 12);
  });

  it("refuses weight 1 on a one-sided target, naming the weight its range forces", () => {
    const r = solve(squareRecord({ ...ONE_SIDED, weight: 1 }), EVEN_VANISHING);
    expect(reason(r)).toMatch(/declares weight 1.*forces 2/s);
  });

  it("refuses weight 2 on a two-sided target", () => {
    const r = solve(squareRecord({ ...TWO_SIDED, weight: 2 }), "pi*cot(pi*z)/(z^2+1)");
    expect(reason(r)).toMatch(/declares weight 2.*forces 1/s);
  });

  it("refuses halving an ODD summand, decided over ℚ(i) and not sampled", () => {
    // `z/(z⁴+4)` is odd, so `Σ_ℤ = 0 ≠ 2Σ_{n≥1}` — the halving is invalid whatever the numbers
    // happen to look like.
    const r = solve(squareRecord(ONE_SIDED), "pi*cot(pi*z)*z/(z^4+4)");
    expect(reason(r)).toMatch(/cofactor is not even/);
  });

  it("refuses halving when f(0) ≠ 0, which the weight would otherwise absorb", () => {
    const r = solve(squareRecord(ONE_SIDED), "pi*cot(pi*z)/(z^2+1)");
    expect(reason(r)).toMatch(/f\(0\) ≠ 0.*Σ_\{n∈ℤ\} = f\(0\) \+ 2·Σ_\{n≥1\}/s);
  });

  it("refuses a range it does not read, rather than guessing a weight for it", () => {
    const r = solve(squareRecord({ ...TWO_SIDED, lower: "0" }), "pi*cot(pi*z)/(z^2+1)");
    expect(reason(r)).toMatch(/runs from '0' to 'inf'/);
  });

  it("refuses a FINITE upper limit, which is not a limit of the contour at all", () => {
    // `Σ_{n=−∞}^{5}` is not what any square establishes: the residue sum runs over every integer the
    // contour encloses, and `N → ∞` encloses them all. A truncated range with weight 1 would read
    // the whole sum and label it a partial one.
    const r = solve(squareRecord({ ...TWO_SIDED, upper: "5" }), "pi*cot(pi*z)/(z^2+1)");
    expect(reason(r)).toMatch(/runs from '-inf' to '5'/);
  });
});

describe("the refusals that keep the route inside its own ring", () => {
  it("refuses a record whose target is ALSO a piece of the contour", () => {
    const withTarget = squareRecord({
      ...TWO_SIDED,
      pieces: [
        {
          id: "axis",
          name: "axis",
          role: "target",
          colour: 0,
          geom: { kind: "segment", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
        },
      ],
    });
    expect(reason(solve(withTarget, "pi*cot(pi*z)/(z^2+1)"))).toMatch(
      /carries the target on the LEFT.*neither the exponential basis nor ℚ\(i\)\(π\) holds both/s,
    );
  });

  it("refuses a non-zero piece limit, naming the piece — and a ZERO one is no obstacle", () => {
    const kernel = kernelOf("pi*cot(pi*z)/(z^2+1)");
    const limits = (contribution: ExpSum) => [
      { pieceId: "quiet", contribution: ExpSum.ZERO },
      { pieceId: "indent", contribution },
    ];
    const alive = solveResidueTerm(squareRecord(TWO_SIDED), {
      kernel,
      known: knownOf(kernel),
      pieceLimits: limits(ExpSum.fromSqrtExt(SqrtExt.ONE)),
    });
    expect(alive.ok).toBe(false);
    if (!alive.ok) expect(alive.reason).toMatch(/piece 'indent' contributes a non-zero limit/);
    // A piece that vanishes is listed and contributes nothing, which is the ordinary case: the
    // refusal is about the VALUE, not about the piece appearing at all.
    const dead = solveResidueTerm(squareRecord(TWO_SIDED), {
      kernel,
      known: knownOf(kernel),
      pieceLimits: limits(ExpSum.ZERO),
    });
    expect(dead.ok).toBe(true);
  });

  it("refuses a sum that comes out COMPLEX, because its terms are real", () => {
    // `1/(z − i)` has a lone pole with no conjugate partner, so `−ρ/w` is purely imaginary: the
    // arithmetic is impeccable and the answer is not a sum of real terms. `Σ 1/(n − i)` is `iπcoth(π)`
    // in the symmetric limit, which is exactly what the guard sees and declines to call a real sum.
    const r = solve(squareRecord(TWO_SIDED), "pi*cot(pi*z)/(z-i)");
    expect(reason(r)).toMatch(/has imaginary part.*but its terms are real/s);
  });

  it("refuses an excluded n = 0 where the cofactor is REGULAR there", () => {
    // The excluded term is then `f(0)`, an ALGEBRAIC number, where the rest of the sum carries the
    // kernel's π. M5.7 carries the OTHER case — a collision, whose residue is in ℚ(i)(π) — and this
    // one belongs to no convergent record: a cofactor whose only poles are at integers has them all
    // collide, and one with a pole elsewhere is the mixed case above.
    const r = solve(squareRecord({ ...TWO_SIDED, terms: "poles(K) ∩ Z \\ {0}" }), "pi*cot(pi*z)/(z^2+1)");
    expect(reason(r)).toMatch(/exclude n = 0.*ALGEBRAIC/s);
  });

  it("refuses a merged residue supplied against target terms that claim every integer", () => {
    const kernel = kernelOf("pi*cot(pi*z)/z^2");
    const r = solveResidueTerm(squareRecord(TWO_SIDED), {
      kernel,
      known: knownOf(kernel),
      excluded: RatPi.piPower(2, Gauss.int(-1)),
      pieceLimits: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/on BOTH sides of the identity/);
  });

  it("refuses a merged residue ALONGSIDE a cofactor pole away from the integers", () => {
    // `π cot(πz)·(z²+1+z²·…)`: one kernel whose cofactor has both a collision and an ordinary pole.
    // The two residues are in incomparable rings, and adding them numerically would produce a
    // decimal labelled exact.
    const kernel = kernelOf("pi*cot(pi*z)/(z^2*(z^2+1))");
    const r = solveResidueTerm(squareRecord({ ...TWO_SIDED, lower: "1", weight: 2 }), {
      kernel,
      known: knownOf(kernel),
      excluded: RatPi.piPower(2, Gauss.int(-1)),
      pieceLimits: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/no ring in this app holds both/);
  });

  it("refuses a predicate outside the vocabulary, and quotes the vocabulary", () => {
    const r = solve(squareRecord({ ...TWO_SIDED, terms: "every pole, honestly" }), "pi*cot(pi*z)/(z^2+1)");
    expect(reason(r)).toMatch(/'every pole, honestly' is not one this engine executes/);
    expect(reason(r)).toContain("poles(K) ∩ Z");
  });

  it("refuses a record that names an unknown it does not declare", () => {
    const wrong = squareRecord(TWO_SIDED);
    const r = solve(
      { ...wrong, residueSelection: { rule: "all", targetTerms: [{ targetId: "T", terms: "poles(K) ∩ Z", weight: 1 }] } },
      "pi*cot(pi*z)/(z^2+1)",
    );
    expect(reason(r)).toMatch(/names 'T', which is not one of this record's unknowns/);
  });

  it("refuses two unknowns inside one sum", () => {
    const wrong = squareRecord(TWO_SIDED);
    const r = solve(
      {
        ...wrong,
        residueSelection: {
          rule: "all",
          targetTerms: [
            { targetId: "S", terms: "poles(K) ∩ Z", weight: 1 },
            { targetId: "S", terms: "poles(K) ∩ Z", weight: 1 },
          ],
        },
      },
      "pi*cot(pi*z)/(z^2+1)",
    );
    expect(reason(r)).toMatch(/declares 2/);
  });

  it("refuses a record with no targetTerms at all — this route is not a fallback", () => {
    const wrong = squareRecord(TWO_SIDED);
    const r = solve({ ...wrong, residueSelection: { rule: "all" } }, "pi*cot(pi*z)/(z^2+1)");
    expect(reason(r)).toMatch(/declares no `residueSelection\.targetTerms`/);
  });
});

describe("the loader judges a declaration it cannot check with rank(M)", () => {
  // **SG-1 INVERTS INVARIANT 4.** `M` is identically zero for a record whose unknown is inside the
  // residue sum, so the usual `rank(M) = m` would drop every tier-G record for being what it is.
  // What replaces it is the DECLARATION's own consistency — which means a record with a broken
  // declaration must still be dropped, or the substitution has cost the invariant its teeth.
  const G2 = (): Family => {
    const found = FAMILIES.find((f) => f.id === "series-cot-kernel");
    if (found === undefined) throw new Error("G2 is not loaded");
    return found;
  };

  it("loads G2, which declares one", () => {
    const loaded = loadFamilies([G2()]);
    expect(loaded.violations).toEqual([]);
    expect(loaded.families.size).toBe(1);
  });

  it.each([
    [
      "a weight its range does not force",
      (f: Family): Family => ({
        ...f,
        residueSelection: {
          ...f.residueSelection,
          targetTerms: [{ targetId: "S", terms: "poles(K) ∩ Z", weight: 2 }],
        },
      }),
    ],
    [
      "an unknown it does not declare",
      (f: Family): Family => ({
        ...f,
        residueSelection: {
          ...f.residueSelection,
          targetTerms: [{ targetId: "T", terms: "poles(K) ∩ Z", weight: 1 }],
        },
      }),
    ],
    [
      "a predicate outside the vocabulary",
      (f: Family): Family => ({
        ...f,
        residueSelection: {
          ...f.residueSelection,
          targetTerms: [{ targetId: "S", terms: "all of them", weight: 1 }],
        },
      }),
    ],
    [
      "the target ALSO on the contour, which is the mixed case",
      (f: Family): Family => ({
        ...f,
        contour: {
          ...f.contour,
          pieces: f.contour.pieces.map((p, k) => (k === 0 ? { ...p, role: "target" as const } : p)),
        },
      }),
    ],
  ])("drops a record with %s", (_what, broken) => {
    const loaded = loadFamilies([broken(G2())]);
    expect(loaded.violations.length).toBeGreaterThan(0);
    expect(loaded.violations[0].invariant).toBe(4);
    expect(loaded.violations[0].message).toMatch(/the declaration does not hold/);
    expect(loaded.families.size).toBe(0);
  });
});

describe("the corpus is untouched by the route existing", () => {
  // The claim M5.6b's evidence rests on, kept as an assertion rather than left in a scratch diff:
  // a summation kernel and an unknown inside the sum go together. A record with a kernel and no
  // `targetTerms` would take the scalar route over an integrand whose poles are every integer; a
  // record with `targetTerms` and no kernel would be solved against an empty sum and return 0.
  it.each(FAMILIES.map((f) => [f.id, f] as const))("%s", (_id, family) => {
    const built = contourIntegrandOf(family, primaryGolden(family).params);
    expect(built.ok, built.ok ? "" : built.reason).toBe(true);
    if (!built.ok) return;
    const hasKernel = asSummationKernel(built.ast) !== null;
    expect(hasKernel).toBe(family.residueSelection.targetTerms !== undefined);
  });
});

describe("through the family door — the route is reached, and reached FIRST", () => {
  /**
   * The synthetic record with real square geometry and a fixture, so `solveFamily` can run it.
   *
   * Worth the extra shape: it exercises the DISPATCH as well as the solve, and the dispatch has an
   * ordering claim to make. The sum route is chosen ahead of the `theorem.piUnits === undefined`
   * check, because for a tier-G record that check is both true and beside the point — the unknown is
   * not on the left of the identity, so "the residue theorem produced no closed-contour value" would
   * refuse a record that is perfectly well posed.
   */
  const runnable = (integrand: string): Family => summationRecord(integrand);

  it("solveFamily takes the sum route and lands on the series", () => {
    const family = runnable("pi*cot(pi*z)/(z^2+(3/4)^2)");
    const r = solveFamily(family, family.golden[0]);
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    if (!r.ok) return;
    expect(r.route).toBe("sum");
    expect(r.solved.value).toBeCloseTo(2 * sumOverN(0.75) + 1 / 0.5625, 9);
    // `cofactorResidues`' own certificate travels with the answer, AHEAD of Pass 5's — the evidence
    // for `ρ` before the claim that rests on it, which is the order the derivation panel renders.
    // Anchored, because Pass 5's own claim `S = −(Σ_j Res(K·f, z_j))/1` contains the same phrase and
    // an unanchored match would pass with the two swapped.
    expect(r.solved.certificates[0].claim).toMatch(/^Σ_j Res\(K·f, z_j\)/);
    expect(r.solved.certificates[r.solved.certificates.length - 1].claim).toMatch(/^S = −/);
  });

  it("the LEDGER sees the kernel's poles — the hole M5.5b closed, through the family door", () => {
    // Without the kernel handed to `analyse`, `findPoles` reports ZERO poles for a `cot` integrand
    // and the ledger says the contour is clear of singularities it runs straight through — while the
    // sum route, which reads only LEGALITY and the piece limits, still returns the right number. So
    // the answer being right is NOT evidence that the ledger is honest, and this asserts the ledger.
    const family = runnable("pi*cot(pi*z)/(z^2+(3/4)^2)");
    // `N` pinned here rather than left to the display default, so the count below is the test's own.
    const r = runFamily(family, family.golden[0], { geometry: { N: 4 } });
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    if (!r.ok) return;
    expect(r.run.summation).toBeDefined();
    // Half-width `N + ½ = 4.5`, so the integers −4…4 are enclosed — nine of them, every one a pole
    // — PLUS the cofactor's own `±(3/4)i`, which `findPoles` reports no more than it reports the
    // integers. Eleven. The count was nine until the cofactor's half of the hole was closed too.
    const catches = r.run.ledger.rows.filter((row) => row.constraint === "CATCH");
    expect(catches.some((row) => /at 11 singularities/.test(row.claim))).toBe(true);
    // And every side is killed by the SQUARE bound, which exists only because there is a kernel.
    const kills = r.run.ledger.rows.filter((row) => row.constraint === "KILL");
    expect(kills.length).toBe(4);
    expect(kills.every((row) => row.status === "satisfied" && /O\(\(N\+½\)\^-1\)/.test(row.claim))).toBe(true);
  });

  it("refuses a record that claims an unknown inside a sum with no kernel to sum", () => {
    // Without this the route would solve against an EMPTY residue sum and return 0 — a number, for
    // every such record, and nothing about it would look like a refusal.
    const family = runnable("1/(z^2+1)");
    const r = solveFamily(family, family.golden[0]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/carries no summation kernel/);
  });

  it("does not fall through to the scalar route, which would refuse for the wrong reason", () => {
    // The discriminator for the dispatch's ORDER: the scalar route's complaint would be about
    // `piUnits` or about no piece carrying the target role, neither of which is this record's defect.
    const family = runnable("1/(z^2+1)");
    const r = solveFamily(family, family.golden[0]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).not.toMatch(/piUnits|units of π|target role/);
  });
});
