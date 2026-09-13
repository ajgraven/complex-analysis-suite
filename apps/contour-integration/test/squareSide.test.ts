// The corrected square bound — and finding D-2, which is the research's version failing to be one.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import {
  asHalfInteger,
  kernelSupBound,
  researchSquareBound,
  squareContourBound,
  squareSideBound,
} from "../src/kernel/bounds/squareSide.js";
import { asSummationKernel } from "../src/kernel/summationKernel.js";
import { fracCmp } from "../src/kernel/bounds/ratBound.js";
import { findPoles } from "../src/kernel/poles.js";
import { analyse } from "../src/engine/analyse.js";
import { squareTemplate } from "../src/engine/contour/templates.js";
import { setParam } from "../src/engine/contour/edit.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { resolveAll } from "../src/engine/contour/model.js";

const must = <T>(v: T | null, what: string): T => {
  if (v === null) throw new Error(`expected ${what}`);
  return v;
};

const kernelOf = (src: string) => must(asSummationKernel(parse(src)), `a kernel in ${src}`);
const half = (n: bigint) => Frac.of(2n * n + 1n, 2n);

/**
 * The measured `|∮_{Γ_N}|`, from the engine's own quadrature — memoised.
 *
 * The `N = 25` square is 51 units across with a pole every unit along its sides, so the node-spacing
 * rule spends real time on it; three tests want the same number and recomputing it took 88 seconds.
 */
const MEASURED = new Map<string, number>();
function measured(src: string, n: number): number {
  const key = `${src}@${n}`;
  const seen = MEASURED.get(key);
  if (seen !== undefined) return seen;
  const fn = makeComplexFn(parse(src));
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const out = integrateContour(f, resolveAll(setParam(squareTemplate(2), "N", n)), []);
  const v = out.value ?? [NaN, NaN];
  const got = Math.hypot(v[0], v[1]);
  MEASURED.set(key, got);
  return got;
}

describe("the certified constants", () => {
  it("brackets coth(π/2) from ABOVE — asserted in ℚ, because float64 cannot see the gap", () => {
    // **THE FLOAT COMPARISON TESTS FLOAT64'S ROUNDING, NOT THE BRACKET.** `coth(π/2)` is
    // `1.090331410727368230030012…` and the bracket is `…030262…`, above it by 2.5e-22 — while the
    // nearest double to either is `1.0903314107273683`, which is above BOTH. So a first draft
    // asserting `sup >= 1/Math.tanh(π/2)` went red on a correct bracket, the same shape of mistake
    // `piUpper().toNumber() === Math.PI` produced in M5.2, and with the same fix: compare in ℚ.
    const sup = kernelSupBound("cot");
    expect(fracCmp(sup, Frac.of(10903314107273682300300n, 10n ** 22n))).toBe(1);
    expect(fracCmp(sup, Frac.of(10903314107273682300400n, 10n ** 22n))).toBe(-1);
  });

  it("errs UPWARD at every truncation, which is the only direction a bound may err", () => {
    // Two truncations stand between `coth(π/2)` and the rational computed for it, and both must push
    // the same way. `π` is truncated DOWN, making `e^π`'s lower bound smaller; the series is cut
    // early, making it smaller again; and `coth(π/2) = 1 + 2/(e^π − 1)` DECREASES in `e^π`, so each
    // makes the answer larger. Measured as monotonicity in the term count rather than argued: fewer
    // terms must give a bound at least as large.
    const withTerms = (t: number) => {
      // The exported constant is memoised, so this reproduces the construction rather than calling
      // it — the claim is about the DIRECTION of the truncations, which is a property of the formula.
      const scale = 10n ** 20n;
      const x = Frac.of(3141592653589793238462n / 10n, scale);
      let sum = Frac.ZERO;
      let term = Frac.ONE;
      for (let k = 0; k < t; k++) {
        sum = sum.add(term);
        term = term.mul(x).div(Frac.of(BigInt(k + 1)));
      }
      return Frac.ONE.add(Frac.of(2n).div(sum.sub(Frac.ONE)));
    };
    const coarse = withTerms(20);
    const fine = withTerms(40);
    expect(fracCmp(coarse, fine)).toBe(1);
    // …and the fine one is still above the truth, so neither truncation crossed it.
    expect(fracCmp(fine, Frac.of(10903314107273682300300n, 10n ** 22n))).toBe(1);
  });

  it("gives csc a sup of exactly 1, with no bracket at all", () => {
    // `≤ 1/sinh(π/2)` on the horizontal sides and `≤ 1` on the vertical ones, so the sup is 1 for
    // EVERY N — which is why G3's slack will be an order of magnitude better than G1's.
    expect(kernelSupBound("csc").equals(Frac.ONE)).toBe(true);
  });

  it("reads N + ½ and refuses everything else", () => {
    expect(asHalfInteger(Frac.of(1n, 2n))).toBe(0n);
    expect(asHalfInteger(Frac.of(5n, 2n))).toBe(2n);
    expect(asHalfInteger(Frac.of(51n, 2n))).toBe(25n);
    expect(asHalfInteger(Frac.of(2n))).toBeNull(); // an integer half-width
    expect(asHalfInteger(Frac.of(7n, 3n))).toBeNull();
    expect(asHalfInteger(Frac.of(-1n, 2n))).toBeNull();
    // A DENOMINATOR OTHER THAN 2 is its own case, and `7/3` does not test it: doubled it is `14/3`,
    // whose numerator is even, so a reader checking only parity would reject it for the wrong
    // reason. `5/6` doubles to `5/3` — odd numerator, and refused only because the denominator is
    // not 1. A mutation sweep found the difference.
    expect(asHalfInteger(Frac.of(5n, 6n))).toBeNull();
    expect(asHalfInteger(Frac.of(1n, 3n))).toBeNull();
  });
});

describe("the square's bound", () => {
  it("HOLDS against the measured contour integral, with the slack the gallery records", () => {
    const k = kernelOf("pi*cot(pi*z)/z^2");
    for (const n of [3, 25]) {
      const got = must(squareContourBound("cot", k.num, k.den, half(BigInt(n))), "a bound").toNumber();
      const truth = measured("pi*cot(pi*z)/z^2", n);
      expect(got, `N = ${n}`).toBeGreaterThan(truth);
      expect(got / truth, `N = ${n}`).toBeCloseTo(2.2, 1);
    }
  });

  it("is 8π·coth(π/2)·(N+½)·max|f| — four equal sides, one product", () => {
    const k = kernelOf("pi*cot(pi*z)/z^2");
    const side = squareSideBound("cot", k.num, k.den, half(3n));
    const whole = must(squareContourBound("cot", k.num, k.den, half(3n)), "a bound");
    expect(side.value?.toNumber() ?? NaN).toBeCloseTo(whole.toNumber() / 4, 12);
    // `max|1/z²|` at `|z| = 3.5` is `1/12.25`, so the product is `8π·coth(π/2)·3.5/12.25`.
    const byHand = 8 * Math.PI * (1 / Math.tanh(Math.PI / 2)) * 3.5 * (1 / 12.25);
    expect(whole.toNumber()).toBeCloseTo(byHand, 8);
  });

  it("vanishes exactly when deg D − deg N > 1, which is the classical hypothesis", () => {
    const k2 = kernelOf("pi*cot(pi*z)/z^2");
    expect(squareSideBound("cot", k2.num, k2.den, half(3n)).asymptotics).toBe("vanishes");
    expect(squareSideBound("cot", k2.num, k2.den, half(3n)).exponent).toBe(-1);
    // `k = 1` does not vanish — the bound is O(1), and saying so is the point.
    const k1 = kernelOf("pi*cot(pi*z)/z");
    expect(squareSideBound("cot", k1.num, k1.den, half(3n)).asymptotics).toBe("bounded");
    expect(squareSideBound("cot", k1.num, k1.den, half(3n)).exponent).toBe(0);
  });

  it("REFUSES a half-width that is not N + ½, by name", () => {
    const k = kernelOf("pi*cot(pi*z)/z^2");
    for (const h of [Frac.of(2n), Frac.of(7n, 3n), Frac.of(1n)]) {
      const b = squareSideBound("cot", k.num, k.den, h);
      expect(b.value, `half-width ${h.n}/${h.d}`).toBeUndefined();
      expect(b.certificate.level).toBe("⚠");
      expect(b.certificate.method).toMatch(/not uniformly bounded|sup\|K\| is infinite/);
    }
  });

  it("refuses a cofactor whose reverse-triangle bound cannot certify max|f|", () => {
    // A root of the cofactor at or beyond the square: `1/(z−10)` at N = 0 has its pole outside the
    // window the reverse-triangle inequality can see, so the denominator bound is not positive.
    const k = kernelOf("pi*cot(pi*z)/(z-10)");
    expect(squareSideBound("cot", k.num, k.den, half(0n)).value).toBeUndefined();
  });
});

// **FINDING D-2**, executed rather than described.
describe("research 03 §8's bound is not a bound", () => {
  it("reads BELOW the measured contour integral at every N tested", () => {
    // `(M/N^k)·coth(π/2)·4(2N+1)` drops the π from `π cot(πz)`. The gallery records 3.392 vs 3.567
    // at N = 3 and 0.356 vs 0.493 at N = 25; both are recomputed here from the engine's own
    // quadrature, so the wrong statement is refuted by a test and not only by a paragraph.
    const k = kernelOf("pi*cot(pi*z)/z^2");
    const rows = [3, 25].map((n) => {
      const research = must(researchSquareBound("cot", k.num, k.den, BigInt(n)), "the stated bound");
      return { n, research: research.toNumber(), truth: measured("pi*cot(pi*z)/z^2", n) };
    });
    expect(rows[0]?.truth ?? NaN).toBeCloseTo(3.567, 2);
    expect(rows[0]?.research ?? NaN).toBeCloseTo(3.392, 2);
    expect(rows[1]?.truth ?? NaN).toBeCloseTo(0.493, 2);
    expect(rows[1]?.research ?? NaN).toBeCloseTo(0.356, 2);
    for (const r of rows) {
      expect(r.research, `N = ${r.n}: a bound must be ≥ the thing it bounds`).toBeLessThan(r.truth);
    }
  });

  it("is short by 4.9% at N = 3 and 27.8% at N = 25 — the gallery's “30–40%” is the LIMIT", () => {
    // A correction to the correction. `tier-efg.md` §6 says the stated bound fails "by 30–40 % at
    // every `N` tested", and the shortfall is measured here at 4.9% (N = 3) and 27.8% (N = 25). It
    // GROWS, because the ratio between the two bounds is `π·(N/(N+½))^k` — the missing π times a
    // factor that tends to 1 — so 30% is the asymptote rather than the typical case. The FINDING is
    // untouched: at every N the stated quantity is below the thing it is supposed to bound, which is
    // what makes it not a bound. Only its magnitude was overstated at small N.
    const k = kernelOf("pi*cot(pi*z)/z^2");
    const shortfall = (n: number) => {
      const research = must(researchSquareBound("cot", k.num, k.den, BigInt(n)), "stated").toNumber();
      return 1 - research / measured("pi*cot(pi*z)/z^2", n);
    };
    const at3 = shortfall(3);
    const at25 = shortfall(25);
    expect(at3).toBeCloseTo(0.049, 3);
    expect(at25).toBeCloseTo(0.278, 3);
    expect(at25).toBeGreaterThan(at3);
  });

  it("is short by exactly the π it drops, which is what makes the finding a diagnosis", () => {
    // The two differ by the factor `π · (N/(N+½))^k`: the missing π, and `N^k` where the derivation
    // has `(N+½)^k`. So the correction is not a tightening — it is a missing factor of π, and the
    // second difference goes the other way and is small.
    const k = kernelOf("pi*cot(pi*z)/z^2");
    for (const n of [3, 25]) {
      const research = must(researchSquareBound("cot", k.num, k.den, BigInt(n)), "stated").toNumber();
      const derived = must(squareContourBound("cot", k.num, k.den, half(BigInt(n))), "derived").toNumber();
      const ratio = derived / research;
      expect(ratio, `N = ${n}`).toBeCloseTo(Math.PI * (n / (n + 0.5)) ** 2, 6);
    }
  });
});

describe("the ledger's KILL pass on a square side", () => {
  const run = (src: string, n: number) => {
    const ast = parse(src);
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const kernel = asSummationKernel(ast);
    return analyse({
      ast,
      f,
      poles: findPoles(ast),
      contour: setParam(squareTemplate(2), "N", n),
      ...(kernel === null ? {} : { summation: { kernel } }),
      // These tests are about the KILL rows, which come from the exact-ℚ bound and never from the
      // quadrature — so the work ceiling that exists for a DRAG is the right tool here too. Without
      // it each call spends 13 seconds refining around the kernel's poles for a number nothing below
      // reads; a capped piece says so in its own certificate either way.
      budget: { maxEvaluations: 4096 },
    });
  };

  it("kills all four sides at a half-integer, where before no lemma applied at all", () => {
    const rows = run("pi*cot(pi*z)/(z^2+1)", 3).ledger.rows.filter((r) => r.constraint === "KILL");
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === "satisfied")).toBe(true);
    expect(rows.every((r) => r.evidence.level === "≤")).toBe(true);
    expect(rows[0]?.claim).toMatch(/→ 0 as N → ∞/);
  });

  it("names coth(π/2) in the certificate, and the π the research drops", () => {
    const row = run("pi*cot(pi*z)/(z^2+1)", 3).ledger.rows.find((r) => r.constraint === "KILL");
    expect(row?.evidence.method).toMatch(/coth\(π\/2\)/);
    expect((row?.evidence.provenance ?? []).some((p) => /research 03 §8/.test(p.text))).toBe(true);
  });

  it("REFUSES every side at an integer half-width", () => {
    // N = 1.5 puts the half-width at 2. LEGALITY refuses it too (the sides run through the kernel's
    // poles) — and so does the BOUND, independently, because sup|K| is infinite there. Two different
    // rows, one geometry, and neither inherited from the other.
    const rows = run("pi*cot(pi*z)/(z^2+1)", 1.5).ledger.rows.filter((r) => r.constraint === "KILL");
    expect(rows.every((r) => r.status !== "satisfied")).toBe(true);
  });

  it("declines a side of a RECTANGLE that is not a square", () => {
    // `sup|cot πz| ≤ coth(π(N+½))` is a statement about `Γ_N`'s geometry, so a side whose offset and
    // half-length disagree gets no bound of this shape. The contour below is 3.5 wide and 1.5 tall,
    // centred, axis-parallel — everything but square.
    const ast = parse("pi*cot(pi*z)/(z^2+1)");
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const kernel = must(asSummationKernel(ast), "a kernel");
    const corners: [number, number][] = [
      [3.5, -1.5],
      [3.5, 1.5],
      [-3.5, 1.5],
      [-3.5, -1.5],
    ];
    const oblong = {
      pieces: corners.map((from, k) => ({
        id: `side-${k}`,
        name: `side ${k}`,
        geom: {
          kind: "segment" as const,
          from: { x: from[0], y: from[1] },
          to: { x: corners[(k + 1) % 4]?.[0] ?? 0, y: corners[(k + 1) % 4]?.[1] ?? 0 },
        },
        role: "vanish" as const,
        lemma: "L2" as const,
        colour: 0 as const,
      })),
      params: {},
    };
    const a = analyse({ ast, f, poles: findPoles(ast), contour: oblong, summation: { kernel } });
    const kill = a.ledger.rows.filter((r) => r.constraint === "KILL");
    expect(kill.every((r) => r.status !== "satisfied")).toBe(true);
  });

  it("leaves a NON-kernel integrand on its old route, unchanged", () => {
    // The square with a plain rational integrand gets no summation seat, so `disposeArc` declines a
    // segment and the row is the familiar fallthrough — not a square bound applied to an integrand
    // it is not about.
    const rows = run("1/(1+z^2)", 3).ledger.rows.filter((r) => r.constraint === "KILL");
    expect(rows.every((r) => r.status === "unknown")).toBe(true);
  });
});
