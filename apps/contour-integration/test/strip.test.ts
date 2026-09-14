// **TIER E — the two records, and the two claims they exist to make about each other.**
//
// E1 and E2 are a matched pair. Both are one rectangle in a quasi-periodic strip; what differs is
// the quasi-period `λ`, and every contrast between them follows from it:
//
//   - `λ = e^{2πia}` sits on the UNIT CIRCLE  → `1 − λ` factors as a SINE   → `π/sin(πa)`
//   - `λ = −e^{−πξ}` is a NEGATIVE REAL       → `1 − λ` factors as a COSH   → `π/cosh(πξ/2)`
//
// and the parameter window follows the same way: E1 needs `0 < a < 1` and E2 needs nothing, out of
// one ML exponent evaluated at `Re(a)` and at `Re(iξ) = 0`.
import { describe, expect, it } from "vitest";
import { FAMILIES } from "../src/families/index.js";
import { runFamily, solveFamily } from "../src/families/runFamily.js";
import type { Family, Golden } from "../src/families/schema.js";

const family = (id: string): Family => {
  const f = FAMILIES.find((x) => x.id === id);
  if (f === undefined) throw new Error(`no record '${id}'`);
  return f;
};
const E1 = family("strip-exponential-quasiperiod");
const E2 = family("strip-sech-fourier");
const D1 = family("mellin-keyhole");

function solved(f: Family, params: Golden["params"]): { text?: string; value: number } {
  const g: Golden = { params, value: "", numeric: 0, verifiedTo: 1, method: "ad hoc, for this test" };
  const r = solveFamily(f, g);
  if (!r.ok) throw new Error(`${f.id} at ${JSON.stringify(params)} refused: ${r.reason}`);
  return { ...(r.solved.text === undefined ? {} : { text: r.solved.text }), value: r.solved.value };
}

describe("E1 is the logarithmic image of D1 — the record's own cross-family invariant", () => {
  it("agrees with the keyhole at the same parameter, under x = log t", () => {
    // `t = e^x` carries `∫ℝ e^{ax}/(1+e^x)dx` onto `∫₀^∞ t^{a−1}/(1+t)dt`: the keyhole's phase
    // `e^{2πis}` and the strip's `λ` are the same number at `s = a`. Two contours that share no
    // geometry, no template and no lemma reach the same value — and, at these bindings, the same
    // TEXT, which is the stronger statement.
    for (const a of [0.3, 0.5]) {
      const strip = solved(E1, { a });
      const keyhole = solved(D1, { alpha: a });
      expect(Math.abs(strip.value - keyhole.value)).toBeLessThan(1e-12);
      expect(strip.text).toBe(keyhole.text);
    }
  });
});

describe("E2's sech is a fixed point of the Fourier transform — the sign-error canary", () => {
  it("reproduces sech(πu) from sech(πt), in the e^{2πiut} convention", () => {
    // The record: substituting `x = πt`, `ξ = 2u` turns the closed form into
    // `∫ℝ sech(πt)e^{2πiut}dt = sech(πu)`. A sign error anywhere in the strip machinery — the
    // factor's sign, the quasi-period's, the residue's — breaks the fixed point, which is why the
    // record calls it "the cleanest possible regression test".
    for (const u of [0.25, 0.5, 1, 2]) {
      const got = solved(E2, { xi: 2 * u }).value / Math.PI;
      expect(Math.abs(got - 1 / Math.cosh(Math.PI * u))).toBeLessThan(1e-12);
    }
  });

  it("is EVEN in ξ, which the form itself shows rather than the number alone", () => {
    for (const xi of [1, 2.5]) {
      const plus = solved(E2, { xi });
      const minus = solved(E2, { xi: -xi });
      expect(Math.abs(plus.value - minus.value)).toBeLessThan(1e-12);
      // `cosh` is even, so the two print IDENTICALLY — the sign is gone from the form, not merely
      // cancelled in the decimal.
      expect(plus.text).toBe(minus.text);
    }
  });

  it("is well-posed at ξ = 0, where E1's analogue would divide by zero", () => {
    // `1 − λ = 1 + e^0 = 2` here. Had the top side's factor been written `−e^{−πξ}` it would be
    // `1 − 1 = 0`, and the failure would read as a degenerate solve rather than as a sign error.
    expect(solved(E2, { xi: 0 }).text).toBe("π");
    expect(solved(E2, { xi: 0 }).value).toBeCloseTo(Math.PI, 12);
  });
});

describe("the sine and the cosh are one recogniser reading the sign of λ", () => {
  it("gives E1 a sine and E2 a cosh, at matching magnitudes", () => {
    expect(solved(E1, { a: 0.3 }).text).toBe("π/sin(3π/10)");
    expect(solved(E2, { xi: 2 }).text).toBe("π/cosh(π)");
  });

  it("E1 DEGENERATES at integer a and E2 cannot degenerate at all", () => {
    // `sin(πa) = 0` at `a ∈ ℤ` is the division by zero E1's `lambda-one-degenerate` trap describes.
    // `cosh` of a real argument is never zero, so E2 has no such point — a property of the factoring
    // rather than a range check, and the reason the record calls its solve unconditionally well-posed.
    const g: Golden = { params: { a: 1 }, value: "", numeric: 0, verifiedTo: 1, method: "ad hoc" };
    const r = solveFamily(E1, g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/carries no information|is ZERO|exactly zero/);

    // Every real ξ, including large ones where e^{−πξ} underflows the other way.
    for (const xi of [0, 1e-6, 5, -5]) expect(solved(E2, { xi }).value).toBeGreaterThan(0);
  });
});

describe("the strip is DECLARED, and the declaration is checked", () => {
  it("refuses when the contour encloses a lattice point outside the declared strip", () => {
    // E1's strip is `0 < Im z < 2π` and its lattice is spaced `2πi`. A contour twice as tall catches
    // `z = 3iπ` as well, which the declaration does not cover — so the theorem refuses rather than
    // summing the declared pole and reporting a number for a contour that is not this one. E1's
    // `wrong-strip-height` trap, at run time.
    const tall: Family = {
      ...E1,
      contour: {
        ...E1.contour,
        pieces: E1.contour.pieces.map((p) =>
          p.geom.kind === "segment"
            ? {
                ...p,
                geom: {
                  kind: "segment" as const,
                  from: { ...p.geom.from, y: typeof p.geom.from.y === "number" && p.geom.from.y > 0 ? 4 * Math.PI : p.geom.from.y },
                  to: { ...p.geom.to, y: typeof p.geom.to.y === "number" && p.geom.to.y > 0 ? 4 * Math.PI : p.geom.to.y },
                },
              }
            : p,
        ),
      },
    };
    const g: Golden = { params: { a: 0.3 }, value: "", numeric: 0, verifiedTo: 1, method: "ad hoc" };

    // No value comes out…
    expect(solveFamily(tall, g).ok).toBe(false);
    // …and the REASON is named where a reason lives — in the theorem's own certificate, which is
    // what the derivation panel renders. `solveFamily`'s message is the generic downstream one
    // ("the residue theorem produced no exact closed-contour value"), as it is for every
    // theorem-level refusal in the app; the specific sentence has to be asserted at its source or it
    // is untested.
    const run = runFamily(tall, g);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const said = run.run.theorem.verdict.certificates ?? [];
    expect(JSON.stringify(said)).toMatch(/OUTSIDE the declared strip/);
  });

  it("refuses when the contour PASSES THROUGH a margin pole, which is worse than enclosing one", () => {
    // The top side moved to `Im z = 3π` runs exactly through `z = 3iπ`, a lattice point one period
    // above the declared strip. Its winding is not decided — and an undecided winding about a pole
    // the record never declared is not something to wave through on the grounds that it is outside.
    const through: Family = {
      ...E1,
      contour: {
        ...E1.contour,
        pieces: E1.contour.pieces.map((p) =>
          p.geom.kind === "segment"
            ? {
                ...p,
                geom: {
                  kind: "segment" as const,
                  from: { ...p.geom.from, y: typeof p.geom.from.y === "number" && p.geom.from.y > 0 ? 3 * Math.PI : p.geom.from.y },
                  to: { ...p.geom.to, y: typeof p.geom.to.y === "number" && p.geom.to.y > 0 ? 3 * Math.PI : p.geom.to.y },
                },
              }
            : p,
        ),
      },
    };
    const g: Golden = { params: { a: 0.3 }, value: "", numeric: 0, verifiedTo: 1, method: "ad hoc" };
    expect(solveFamily(through, g).ok).toBe(false);
    const run = runFamily(through, g);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(JSON.stringify(run.run.theorem.verdict.certificates ?? [])).toMatch(/could not be decided/);
  });

  it("accepts the SAME contour once the record declares the taller strip", () => {
    // The check is about the declaration matching the contour, not about the height being 2π — so
    // widening the declaration to match makes it pass, and the value changes because a second pole
    // is genuinely enclosed.
    const g: Golden = { params: { a: 0.3 }, value: "", numeric: 0, verifiedTo: 1, method: "ad hoc" };
    const declaredTaller: Family = { ...E1, strip: { heightOverPi: "4" } };
    const r = runFamily(declaredTaller, g);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.run.theorem.verdict.certificates ?? [])).not.toMatch(/OUTSIDE/);
  });
});
