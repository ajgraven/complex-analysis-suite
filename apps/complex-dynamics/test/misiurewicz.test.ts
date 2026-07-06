/**
 * Tests for the Misiurewicz finder (`findMisiurewicz` in src/render/inspect.ts). A Misiurewicz
 * point is where the critical orbit is strictly preperiodic, fᵐ⁺ᵏ(0) = fᵐ(0). Oracles for z²+c:
 *   c = i  has critical orbit 0, i, −1+i, −i, −1+i, …  ⇒ preperiod 2, period 2;
 *   c = −2 has critical orbit 0, −2, 2, 2, …           ⇒ preperiod 2, period 1.
 * Newton must be seeded near the target (other roots of fᵐ⁺ᵏ−fᵐ include centres like c=0,−1).
 */
import { describe, it, expect } from "vitest";
import { parse } from "@cas/expr/parser";
import { findMisiurewicz } from "../src/render/inspect";
import type { Complex } from "../src/complex";

const Z2C = parse("z^2+c");
const CRIT: Complex = [0, 0];

describe("findMisiurewicz", () => {
  it("lands c = i from a nearby seed (preperiod 2, period 2)", () => {
    const c = findMisiurewicz(Z2C, CRIT, 2, 2, [0.1, 1.1]);
    expect(c).not.toBeNull();
    expect((c as Complex)[0]).toBeCloseTo(0, 9);
    expect((c as Complex)[1]).toBeCloseTo(1, 9);
  });

  it("lands c = −2 from a nearby seed (preperiod 2, period 1)", () => {
    const c = findMisiurewicz(Z2C, CRIT, 2, 1, [-2.1, 0.05]);
    expect(c).not.toBeNull();
    expect((c as Complex)[0]).toBeCloseTo(-2, 9);
    expect((c as Complex)[1]).toBeCloseTo(0, 9);
  });

  it("returns null for a non-holomorphic f (no analytic derivative)", () => {
    expect(findMisiurewicz(parse("conjugate(z^2)+c"), CRIT, 2, 2, [0.1, 1.1])).toBeNull();
  });

  it("rejects non-positive preperiod or period", () => {
    expect(findMisiurewicz(Z2C, CRIT, 0, 2, [0, 1])).toBeNull();
    expect(findMisiurewicz(Z2C, CRIT, 2, 0, [0, 1])).toBeNull();
  });
});
