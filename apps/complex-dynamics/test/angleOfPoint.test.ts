import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { sqrt } from "@cas/expr/complexJs";
import { parse } from "@cas/expr/parser";
import {
  dynamicalAnglesOfPoint,
  nearestDynamicalAngles,
  nearestParameterAngles,
  parameterAnglesOfPoint,
  _resetAngleLandingCache,
} from "../src/render/angleOfPoint";
import { findNucleus } from "../src/render/inspect";

const Z2C = parse("z^2+c");
const CRIT: Complex = [0, 0];
// Search bound wide enough for every oracle angle (period ≤ 3, preperiod ≤ 1) but small = fast.
const OPTS = { maxPeriod: 4, maxPreperiod: 2 };

/** The α (inner, repelling) fixed point (1 − √(1−4c))/2 of z² + c. */
function alphaFixedPoint(c: Complex): Complex {
  const disc = sqrt([1 - 4 * c[0], -4 * c[1]]);
  return [(1 - disc[0]) / 2, -disc[1] / 2];
}

describe("dynamicalAnglesOfPoint (point on ∂K_c → its external angles)", () => {
  it("basilica α ← {1/3, 2/3} — biaccessible, valence 2", () => {
    const alpha = alphaFixedPoint([-1, 0]); // ≈ (1 − √5)/2 ≈ −0.618
    expect(alpha[0]).toBeCloseTo((1 - Math.sqrt(5)) / 2, 6);
    const res = dynamicalAnglesOfPoint(alpha, [-1, 0], OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(res.valence).toBe(2);
    expect(res.biaccessible).toBe(true);
  });

  it("basilica β ← {0} only — valence 1, not biaccessible", () => {
    const beta: Complex = [(1 + Math.sqrt(5)) / 2, 0]; // ≈ 1.618
    const res = dynamicalAnglesOfPoint(beta, [-1, 0], OPTS);
    expect(res.angles).toEqual([{ p: 0, q: 1 }]);
    expect(res.valence).toBe(1);
    expect(res.biaccessible).toBe(false);
  });

  it("the rabbit's α ← {1/7, 2/7, 4/7} — valence 3", () => {
    const c = findNucleus(Z2C, CRIT, 3, [-0.122, 0.745]); // rabbit centre
    expect(c).not.toBeNull();
    if (!c) return;
    const alpha = alphaFixedPoint(c);
    const res = dynamicalAnglesOfPoint(alpha, c, OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 7 },
      { p: 2, q: 7 },
      { p: 4, q: 7 },
    ]);
    expect(res.valence).toBe(3);
    expect(res.biaccessible).toBe(true);
  });
});

describe("parameterAnglesOfPoint (point on ∂M → its external angles)", () => {
  it("the period-2 root −3/4 ← {1/3, 2/3} — biaccessible", () => {
    const res = parameterAnglesOfPoint([-0.75, 0], OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(res.biaccessible).toBe(true);
  });

  it("the cardioid cusp 1/4 ← {0} — valence 1", () => {
    const res = parameterAnglesOfPoint([0.25, 0], OPTS);
    expect(res.angles).toEqual([{ p: 0, q: 1 }]);
    expect(res.valence).toBe(1);
  });

  it("the Misiurewicz tip −2 ← {1/2} — valence 1 (preperiodic angle)", () => {
    const res = parameterAnglesOfPoint([-2, 0], OPTS);
    expect(res.angles).toEqual([{ p: 1, q: 2 }]);
    expect(res.valence).toBe(1);
  });

  it("the Misiurewicz point c = i has 1/6 among its angles", () => {
    const res = parameterAnglesOfPoint([0, 1], OPTS);
    expect(res.angles).toContainEqual({ p: 1, q: 6 });
  });
});

describe("nearest*Angles (snap an imprecise click to the co-landing cluster)", () => {
  it("a click 0.03 off the basilica α still resolves {1/3, 2/3} and snaps to α", () => {
    const alpha = alphaFixedPoint([-1, 0]);
    const query: Complex = [alpha[0] + 0.03, alpha[1] - 0.02]; // imprecise click nearby
    const res = nearestDynamicalAngles(query, [-1, 0], OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(res.biaccessible).toBe(true);
    expect(res.point?.[0]).toBeCloseTo(alpha[0], 3);
    expect(res.point?.[1]).toBeCloseTo(alpha[1], 3);
  });

  it("a click near the ∂M root −3/4 snaps to it and returns {1/3, 2/3}", () => {
    const res = nearestParameterAngles([-0.76, 0.02], OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(res.point?.[0]).toBeCloseTo(-0.75, 3);
    expect(res.point?.[1]).toBeCloseTo(0, 3);
  });

  it("a click in empty space (far from any landing) returns nothing", () => {
    const res = nearestDynamicalAngles([5, 5], [-1, 0], OPTS);
    expect(res.angles).toEqual([]);
    expect(res.point).toBeNull();
  });
});

describe("landing memo (cd-render-08)", () => {
  // The interactive entry points cache landAll — tracing every enumerated ray — because only the
  // cheap snap depends on where the user clicked. Measured 190 ms / 79 ms for a cold click on the
  // parameter / dynamical plane, so a stale or shared-mutable cache would be both wrong AND the
  // thing that made it fast. These pin that it stays correct.
  it("a repeated call returns the same answer as a cold one (parameter plane)", () => {
    _resetAngleLandingCache();
    const cold = nearestParameterAngles([-0.75, 0.1], OPTS);
    const warm = nearestParameterAngles([-0.75, 0.1], OPTS);
    expect(warm).toEqual(cold);
  });

  it("a repeated call returns the same answer as a cold one (dynamical plane)", () => {
    const c: Complex = [-1, 0];
    const alpha = alphaFixedPoint(c);
    _resetAngleLandingCache();
    const cold = nearestDynamicalAngles([alpha[0] + 0.01, alpha[1]], c, OPTS);
    const warm = nearestDynamicalAngles([alpha[0] + 0.01, alpha[1]], c, OPTS);
    expect(warm).toEqual(cold);
  });

  it("serves DIFFERENT queries correctly from one cached landing set", () => {
    // The cached array is shared across calls. If anything downstream mutated it — a sort in place,
    // a splice — the second query would silently get a corrupted set. Ask two different questions
    // against one cache and compare each to its own cold answer.
    _resetAngleLandingCache();
    const warmA = nearestParameterAngles([-0.75, 0.1], OPTS);
    const warmB = nearestParameterAngles([0.25, 0], OPTS);
    _resetAngleLandingCache();
    const coldB = nearestParameterAngles([0.25, 0], OPTS);
    _resetAngleLandingCache();
    const coldA = nearestParameterAngles([-0.75, 0.1], OPTS);
    expect(warmA).toEqual(coldA);
    expect(warmB).toEqual(coldB);
  });

  it("re-derives when c changes — the dynamical key carries it", () => {
    // Landings on ∂K_c depend on c. A key that dropped it would answer for the previous Julia set.
    _resetAngleLandingCache();
    const basilica = alphaFixedPoint([-1, 0]);
    const atBasilica = nearestDynamicalAngles([basilica[0] + 0.01, basilica[1]], [-1, 0], OPTS);
    const atZero = nearestDynamicalAngles([basilica[0] + 0.01, basilica[1]], [0, 0], OPTS);
    _resetAngleLandingCache();
    const atZeroCold = nearestDynamicalAngles([basilica[0] + 0.01, basilica[1]], [0, 0], OPTS);
    expect(atZero).toEqual(atZeroCold);
    expect(atBasilica.angles).not.toEqual(atZero.angles); // c really is a different problem
  });

  it("re-derives when the search bounds change", () => {
    _resetAngleLandingCache();
    const narrow = nearestParameterAngles([-0.75, 0.1], { maxPeriod: 2, maxPreperiod: 1 });
    const wide = nearestParameterAngles([-0.75, 0.1], OPTS);
    _resetAngleLandingCache();
    const wideCold = nearestParameterAngles([-0.75, 0.1], OPTS);
    expect(wide).toEqual(wideCold);
    // A wider search can only find at least as many landings as a narrower one.
    expect(wide.angles.length).toBeGreaterThanOrEqual(narrow.angles.length);
  });
});

// ── WP4 / I3 (review 2026-09-16): valence is a decision, not a proximity count ────────────────
// Co-landing was decided at 5e-3 — a screen distance, not a landing error — so the finder counted
// every ray that landed anywhere nearby and then printed the point as "biaccessible".
describe("angles of a point — a ray counts only if it lands THERE", () => {
  it("β is univalent: exactly one ray lands at the basilica's β fixed point", () => {
    // β = the repelling fixed point on the real axis; only θ = 0 lands there. At 5e-3 this
    // reported valence 21, every one of them spurious, and called β biaccessible.
    const r = nearestDynamicalAngles([1.618034, 0], [-1, 0]);
    expect(r.valence).toBe(1);
    expect(r.biaccessible).toBe(false);
    expect(r.angles[0].p / r.angles[0].q).toBeCloseTo(0, 12);
  });

  it("the tip of ∂M is univalent: only θ = 1/2 lands at c = −2", () => {
    // Reported valence 33 at 5e-3.
    const r = nearestParameterAngles([-2, 0]);
    expect(r.valence).toBe(1);
    expect(r.angles[0].p / r.angles[0].q).toBeCloseTo(0.5, 12);
  });

  it("still finds the genuine co-landings it always found", () => {
    // The anti-vacuity clause: tightening must remove the false rays and no others. Both of these
    // are identical at 5e-3, 1e-6, 1e-9 and 1e-12 — a real co-landing agrees to ~1e-16.
    expect(nearestDynamicalAngles([-0.618034, 0], [-1, 0]).valence).toBe(2); // basilica α
    expect(nearestDynamicalAngles([-0.276, 0.4797], [-0.122561, 0.744862]).valence).toBe(3); // rabbit α
    expect(nearestParameterAngles([-0.75, 0]).valence).toBe(2); // the period-2 root
  });

  // The OTHER direction of the same tightening, missed when it landed. `lamination.ts` drops an
  // unrefined landing ("Newton did not converge, so the error is the ray-tracing step rather than
  // machine precision"); this module kept them but, at 1e-9, they can pair with nothing — so a
  // genuine co-landing was silently SPLIT and the finder under-counted, printing a bare number.
  // Over-counting became under-counting, which is worse: valence 21 at β is obviously wrong, while
  // "Not biaccessible (valence 1)" at a component root is plausible and false. (Review follow-up.)
  describe("an unresolved ray makes the valence a lower bound, not a smaller number", () => {
    // A primitive period-n component root's two rays differ by exactly 1/(2ⁿ−1) — exact
    // combinatorics, no numerics needed to know they co-land.
    const UNRESOLVED: [string, [number, number]][] = [
      ["period-6 root, rays 13/21 and 40/63", [-1.28418, -0.4271]],
      ["period-6 root, rays 5/21 and 16/63", [-0.21745, 1.1145]],
      ["real period-5 root, rays 15/31 and 16/31", [-1.98537, 0]],
    ];
    for (const [name, c] of UNRESOLVED) {
      it(`refuses to state a valence at the ${name}`, () => {
        const r = nearestParameterAngles(c);
        expect(r.exact, "an unresolved landing sits here").toBe(false);
        // What must NOT happen: a confident count. Before this, all three read valence 1 and
        // "Not biaccessible" — the co-landing split by a tolerance the rays could not meet.
        expect(r.biaccessible, "so biaccessibility is not asserted either way").toBe(false);
        expect(r.valence, "and the count carried is a floor, not an answer").toBeLessThan(2);
      });
    }

    it("leaves every resolved point exactly as it was", () => {
      // The clause that stops the fix being 'mark everything uncertain': these all resolve, so they
      // must still report `exact` and their real valence.
      for (const [name, c, v] of [
        ["cardioid cusp", [0.25, 0], 1],
        ["period-2 root", [-0.75, 0], 2],
        ["1/3 bulb root", [-0.125, 0.649519], 2],
        ["the tip", [-2, 0], 1],
      ] as [string, [number, number], number][]) {
        const r = nearestParameterAngles(c);
        expect(r.exact, name).toBe(true);
        expect(r.valence, name).toBe(v);
      }
    });
  });
});
