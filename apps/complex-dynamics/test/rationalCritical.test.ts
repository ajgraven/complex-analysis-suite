import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "@cas/expr/parser";
import { findRationalCriticalPoints } from "../src/render/critical";

const sortByValue = (xs: Complex[]): Complex[] =>
  [...xs].sort((p, q) => p[0] - q[0] || p[1] - q[1]);

/** Assert two complex-number sets match (within tol), independent of order. */
function expectPoints(got: Complex[] | null, want: Complex[], tol = 1e-5): void {
  expect(got).not.toBeNull();
  if (!got) return;
  const g = sortByValue(got);
  const w = sortByValue(want);
  expect(g).toHaveLength(w.length);
  for (let i = 0; i < w.length; i++) {
    expect(Math.hypot(g[i][0] - w[i][0], g[i][1] - w[i][1])).toBeLessThan(tol);
  }
}

describe("findRationalCriticalPoints", () => {
  it("degree-3 rational z²(z−4)/(1−4z): finite critical points {0, (19±√105)/16}", () => {
    // f′ numerator = z·(−8z² + 19z − 8); roots z = 0 and z = (19 ± √105)/16 (the Herman-ring map's
    // free critical points; independent of the e^{2πiτ} prefactor, which only scales the numerator).
    const r = Math.sqrt(105);
    const want: Complex[] = [
      [0, 0],
      [(19 - r) / 16, 0],
      [(19 + r) / 16, 0],
    ];
    expectPoints(findRationalCriticalPoints(parse("z^2*(z-4)/(1-4*z)"), [0, 0], [0, 0]), want);
  });

  it("symmetric family (z²+c)/(1+cz²): the only finite critical point is 0 (the other is ∞)", () => {
    // f′ = 2z(1−c²)/(1+cz²)², so the lone finite critical point is z = 0.
    expectPoints(findRationalCriticalPoints(parse("(z^2+c)/(1+c*z^2)"), [0, 0], [0.5, 0]), [[0, 0]]);
    expectPoints(findRationalCriticalPoints(parse("(z^2+c)/(1+c*z^2)"), [0, 0], [0.1, 0.3]), [[0, 0]]);
  });

  it("McMullen V3 (z²+A)/(c²−z²): lone finite critical point 0", () => {
    // f′ numerator = 2z(c²+A); the finite critical point is z = 0.
    expectPoints(findRationalCriticalPoints(parse("(z^2+a)/(c^2-z^2)"), [0.3, 0], [0.7, 0.2]), [
      [0, 0],
    ]);
  });

  it("also handles a plain polynomial (degree-1 numerator of f′)", () => {
    // z³ + c ⇒ f′ = 3z² ⇒ double critical point at 0.
    const got = findRationalCriticalPoints(parse("z^3+c"), [0, 0], [0.2, 0.1]);
    expect(got).not.toBeNull();
    if (got) for (const p of got) expect(Math.hypot(p[0], p[1])).toBeLessThan(1e-5);
  });

  it("returns null for a non-rational map (transcendental / non-holomorphic)", () => {
    expect(findRationalCriticalPoints(parse("sin(z)+c"), [0, 0], [0, 0])).toBeNull();
    expect(findRationalCriticalPoints(parse("conjugate(z^2)+c"), [0, 0], [0, 0])).toBeNull();
  });
});
