// **L1 ON A VERTICAL SIDE — and E1's parameter window, DERIVED.**
//
// The record states `0 < a < 1` and then says what it is for: "*`a > 0` is exactly what makes the
// LEFT vertical side vanish and exactly what makes the integral converge at `x → −∞`; `a < 1` is
// exactly the RIGHT side and exactly `x → +∞`. One condition, two jobs.*" Nothing below declares
// that window. Each half falls out of the sign of one exact rational exponent, and the tests check
// the two ends of it — `a = 1` and `a = 0`, where the bound stops vanishing — because a bound that
// silently discharged there would let the engine prove a false theorem.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { asExponentialLattice } from "../src/kernel/expLattice.js";
import { stripSideBound, type StripSide } from "../src/kernel/bounds/stripSide.js";
import { stripTemplate } from "../src/engine/contour/templates.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { isClosed } from "../src/kernel/geom.js";

const TWO_PI: readonly [number, number] = [0, 2 * Math.PI];

const formOf = (src: string) => {
  const f = asExponentialLattice(parse(src));
  if (f === null) throw new Error(`expected ${src} to read as a lattice form`);
  return f;
};

const boundOf = (src: string, s: Partial<StripSide> = {}) =>
  stripSideBound(formOf(src), {
    side: "right",
    R: 9,
    length: 2 * Math.PI,
    imagRange: TWO_PI,
    ...s,
  });

/** The `≤` the reader is shown, read back out of the claim — the published surface, not an internal. */
function claimedBound(src: string, s: Partial<StripSide> = {}): number {
  const m = /\\le ([0-9.e+-]+)/.exec(boundOf(src, s).certificate.claim);
  if (m === null) throw new Error("no bound in the claim");
  return Number(m[1]);
}

/** `the vertical side:`, by quadrature: `∫ f(x+iy)·i dy`. */
function sideIntegral(src: string, x: number, y0: number, y1: number, n = 20001): number {
  const fn = makeComplexFn(parse(src));
  const h = (y1 - y0) / (n - 1);
  let re = 0;
  let im = 0;
  for (let k = 0; k < n; k++) {
    const weight = k === 0 || k === n - 1 ? 1 : k % 2 ? 4 : 2;
    const v = fn([x, y0 + k * h], [0, 0]) as [number, number];
    // times i
    re += weight * -v[1];
    im += weight * v[0];
  }
  return Math.hypot((re * h) / 3, (im * h) / 3);
}

const e1 = (a: string) => `exp((${a})*z)/(1 + exp(z))`;

describe("E1's window is the two exponents' signs, not a declaration", () => {
  it("the RIGHT side vanishes exactly while a < 1", () => {
    for (const a of ["3/10", "1/2", "91/100", "99/100"]) {
      const b = boundOf(e1(a), { side: "right" });
      expect(b.asymptotics).toBe("vanishes");
      expect(b.certificate.level).toBe("≤");
    }
  });

  it("…and does NOT at a = 1, where the bound is O(1)", () => {
    const b = boundOf(e1("1"), { side: "right" });
    expect(b.asymptotics).toBe("bounded");
    expect(b.exponent).toBe(0);
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.claim).toMatch(/does not vanish/);
  });

  it("…and DIVERGES past it — the record's a-out-of-range trap", () => {
    const b = boundOf(e1("6/5"), { side: "right" });
    expect(b.asymptotics).toBe("diverges");
    expect(b.exponent).toBeCloseTo(0.2, 12);
    expect(b.certificate.claim).toMatch(/diverges/);
  });

  it("the LEFT side vanishes exactly while a > 0, and not at a = 0", () => {
    for (const a of ["3/10", "1/20", "1/100"]) {
      expect(boundOf(e1(a), { side: "left" }).asymptotics).toBe("vanishes");
    }
    expect(boundOf(e1("0"), { side: "left" }).asymptotics).toBe("bounded");
    expect(boundOf(e1("-1/10"), { side: "left" }).asymptotics).toBe("diverges");
  });

  it("reports the exponents as a − 1 and −a exactly", () => {
    // The two jobs, as two rationals. a = 3/10 ⇒ right −7/10, left −3/10.
    expect(boundOf(e1("3/10"), { side: "right" }).exponent).toBeCloseTo(-0.7, 15);
    expect(boundOf(e1("3/10"), { side: "left" }).exponent).toBeCloseTo(-0.3, 15);
    expect(boundOf(e1("91/100"), { side: "right" }).exponent).toBeCloseTo(-0.09, 15);
  });

  it("says which exponent it used, so the derivation can show the two jobs", () => {
    const right = boundOf(e1("3/10"), { side: "right" }).certificate.provenance[0].text;
    const left = boundOf(e1("3/10"), { side: "left" }).certificate.provenance[0].text;
    expect(right).toMatch(/\\operatorname\{Re\}\(a\) \+ \\deg N - \\deg D/);
    expect(left).toMatch(/-\\operatorname\{Re\}\(a\) - \\operatorname\{ord\}_0 N \+ \\operatorname\{ord\}_0 D/);
  });
});

describe("E2 needs no condition at all, from the same arithmetic", () => {
  const e2 = (xi: string) => `exp(i*(${xi})*z)/cosh(z)`;
  const PI_STRIP: readonly [number, number] = [0, Math.PI];

  it("vanishes on both sides for every real ξ, with exponent −1", () => {
    for (const xi of ["0", "2", "-3/2", "7"]) {
      for (const side of ["right", "left"] as const) {
        const b = boundOf(e2(xi), { side, length: Math.PI, imagRange: PI_STRIP });
        expect(b.asymptotics).toBe("vanishes");
        expect(b.exponent).toBe(-1);
      }
    }
  });

  it("carries Im(a) into the VALUE and not into the limit", () => {
    // `|e^{iξz}| = e^{−ξy}` is bounded on a strip of finite height whatever ξ is. A negative ξ makes
    // the constant `e^{π|ξ|}` — the record's `e^{π·max(0,−ξ)}` — and the exponent does not move.
    const plus = claimedBound(e2("2"), { side: "right", length: Math.PI, imagRange: PI_STRIP });
    const minus = claimedBound(e2("-2"), { side: "right", length: Math.PI, imagRange: PI_STRIP });
    // Compared RELATIVELY: the claim prints `toExponential(3)`, so four significant digits are all
    // a reader — or this test — can read back out of it.
    expect(Math.abs(minus / plus / Math.exp(2 * Math.PI) - 1)).toBeLessThan(1e-3);
    expect(boundOf(e2("-2"), { side: "right", length: Math.PI, imagRange: PI_STRIP }).exponent).toBe(-1);
  });
});

describe("the bound is a bound, at finite R", () => {
  it("dominates the integral it bounds, on both sides and at several radii", () => {
    for (const R of [3, 6, 9]) {
      for (const side of ["right", "left"] as const) {
        const x = side === "right" ? R : -R;
        const claimed = claimedBound(e1("3/10"), { side, R });
        const actual = sideIntegral(e1("3/10"), x, 0, 2 * Math.PI);
        expect(actual).toBeLessThanOrEqual(claimed);
      }
    }
  });

  it("…including where Im(a) carries the constant — E2 at a POSITIVE ξ", () => {
    // With `Im(a) = ξ > 0` the factor `e^{−ξy}` is largest at `y = 0`, so the bound takes `max`
    // over the strip's ends. Taking `min` there scales the bound by `e^{−ξπ}` and it stops being
    // one — invisible to a test that only compares ±ξ, since that ratio is unchanged.
    const PI_STRIP: readonly [number, number] = [0, Math.PI];
    for (const xi of [2, 5]) {
      const src = `exp(i*(${xi})*z)/cosh(z)`;
      for (const R of [2, 4]) {
        for (const side of ["right", "left"] as const) {
          const claimed = claimedBound(src, { side, R, length: Math.PI, imagRange: PI_STRIP });
          const actual = sideIntegral(src, side === "right" ? R : -R, 0, Math.PI);
          expect(actual).toBeLessThanOrEqual(claimed);
        }
      }
    }
  });

  it("IS the expression the record writes, on both sides", () => {
    // E1's own sideConditions: `|∫| ≤ 2π e^{aR}/(e^R − 1)` on the right, from `|1+e^z| ≥ |e^z| − 1`,
    // and `|∫| ≤ 2π e^{−aR}/(1 − e^{−R})` on the left, from `|1+e^z| ≥ 1 − |e^z|`. The two use
    // DIFFERENT terms of D — the top coefficient as `|w| → ∞`, the constant one as `|w| → 0` — and a
    // sweep found that a bound taking the top term in both limits is still a valid `≤` on E1 (the ML
    // slack, ~2.5×, covers the error), so "it dominates the integral" could not tell them apart.
    const a = 0.3;
    for (const R of [1, 3, 6]) {
      const right = claimedBound(e1("3/10"), { side: "right", R });
      expect(Math.abs(right / ((2 * Math.PI * Math.exp(a * R)) / (Math.exp(R) - 1)) - 1)).toBeLessThan(1e-3);

      const left = claimedBound(e1("3/10"), { side: "left", R });
      expect(Math.abs(left / ((2 * Math.PI * Math.exp(-a * R)) / (1 - Math.exp(-R))) - 1)).toBeLessThan(1e-3);
    }
  });

  it("shrinks as R grows, at the rate the exponent predicts", () => {
    // right: e^{−0.7R}, so a step of 3 in R should cost about e^{−2.1} ≈ 0.122.
    const ratio = claimedBound(e1("3/10"), { side: "right", R: 9 }) / claimedBound(e1("3/10"), { side: "right", R: 6 });
    expect(ratio).toBeGreaterThan(0.08);
    expect(ratio).toBeLessThan(0.18);
  });

  it("flags the float step in its own provenance rather than letting it pass", () => {
    const p = boundOf(e1("3/10")).certificate.provenance;
    const flagged = p.find((s) => !s.ok);
    expect(flagged?.text).toMatch(/\$e\^\{\\kappa R\}\$ is transcendental/);
  });

  it("carries no `value` field, because that one is documented exact", () => {
    expect(boundOf(e1("3/10")).value).toBeUndefined();
  });
});

describe("what the strip-side bound refuses", () => {
  it("a side on the imaginary axis, and one with no length", () => {
    expect(boundOf(e1("3/10"), { R: 0 }).certificate.level).toBe("⚠");
    expect(boundOf(e1("3/10"), { length: 0 }).certificate.level).toBe("⚠");
  });

  it("an R too small for the reverse triangle inequality to say anything", () => {
    // `|2 + e^z| ≥ e^R − 2` is vacuous until `R > ln 2`. (For `1 + e^z` it is positive at every
    // `R > 0`, however tiny — which is why the case had to be constructed rather than assumed.)
    const b = boundOf("1/(2 + exp(z))", { R: 0.5 });
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.method).toMatch(/take a larger R/);
    // Past it, the same integrand bounds perfectly well.
    expect(boundOf("1/(2 + exp(z))", { R: 4 }).certificate.level).toBe("≤");
  });

  it("and claims NOTHING about the limit while refusing", () => {
    // The field the disposal row's status is read from. `e1("3/10")` vanishes on the right side, so
    // carrying the exponent's verdict through a refusal put `"vanishes"` beside a `⚠` — which is
    // exactly the disagreement between a number and its label this app exists to prevent.
    expect(boundOf(e1("3/10"), { R: 0 }).asymptotics).toBe("unestablished");
    expect(boundOf(e1("3/10"), { length: 0 }).asymptotics).toBe("unestablished");
    expect(boundOf("1/(2 + exp(z))", { R: 0.5 }).asymptotics).toBe("unestablished");
    // And a bound that WAS reached keeps its own verdict, whichever it is.
    expect(boundOf(e1("3/10")).asymptotics).toBe("vanishes");
    expect(boundOf(e1("1")).asymptotics).toBe("bounded");
    expect(boundOf(e1("6/5")).asymptotics).toBe("diverges");
  });
});

describe("stripTemplate — an argument, not a shape", () => {
  it("closes, and binds R to the R → ∞ limit", () => {
    const c = stripTemplate();
    expect(isClosed(resolveAll(c))).toBe(true);
    expect(c.params.R.limit).toEqual({ to: "inf" });
  });

  it("gives the top side the REPRODUCES role — E1's first trap, structurally", () => {
    // "The top side does not vanish; it REPRODUCES (L7 is not a vanishing lemma)."
    const c = stripTemplate();
    expect(c.pieces.map((p) => p.role)).toEqual(["target", "vanish", "reproduces", "vanish"]);
    expect(c.pieces.filter((p) => p.role === "vanish").every((p) => p.lemma === "L1")).toBe(true);
  });

  it("names the strip height in the top side, for 2π and π alike", () => {
    expect(stripTemplate(2 * Math.PI).pieces[2].name).toBe("the line Im z = 2π");
    expect(stripTemplate(Math.PI).pieces[2].name).toBe("the line Im z = π");
  });

  it("is a SIBLING of rectangleTemplate, which keeps its four free sides", () => {
    // The sandbox's rectangle is an editable shape; collapsing the two would give it roles nobody
    // asked for.
    const c = stripTemplate(Math.PI, 4);
    const g = resolveAll(c);
    expect(g[1].kind === "segment" && g[1].from[0]).toBe(4);
    expect(g[3].kind === "segment" && g[3].from[0]).toBe(-4);
  });
});
