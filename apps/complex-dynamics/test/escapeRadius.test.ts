import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { radialEscapeSq } from "../src/render/glPlot";

// radialEscapeSq recovers R² for a clean radial bailout |z| > R and bails (null) otherwise. It is what
// aligns the perturbation deep-zoom kernel's hard-coded |z| > 2 with the map's real escapeFn, so
// toggling perturbation no longer shifts the smooth-colour bands on presets whose bailout isn't 2.
const radial =
  (R: number) =>
  (z: Complex): boolean =>
    z[0] * z[0] + z[1] * z[1] > R * R;

describe("radialEscapeSq (perturbation bailout ↔ escapeFn)", () => {
  it("recovers R² for radial |z| > R bailouts (2, 4, 10000)", () => {
    expect(radialEscapeSq(radial(2))).toBeCloseTo(4, 6);
    expect(radialEscapeSq(radial(4))).toBeCloseTo(16, 6);
    expect(radialEscapeSq(radial(10000)) as number).toBeCloseTo(1e8, 0);
  });

  it("z²+c 'abs(z)>2' probes to exactly 4.0 in f32 — the shader compare is unchanged", () => {
    const r2 = radialEscapeSq(radial(2)) as number;
    expect(Math.fround(r2)).toBe(4);
  });

  it("returns null for a c-dependent bailout (threshold moves with c ⇒ not a fixed radius)", () => {
    const esc = (z: Complex, c: Complex): boolean =>
      z[0] * z[0] + z[1] * z[1] > c[0] * c[0] + c[1] * c[1]; // |z| > |c|
    expect(radialEscapeSq(esc)).toBeNull();
  });

  it("returns null for a non-radial (half-plane) bailout", () => {
    expect(radialEscapeSq((z: Complex) => z[0] > 3)).toBeNull(); // re(z) > 3
  });

  it("returns null when nothing escapes or everything escapes", () => {
    expect(radialEscapeSq(() => false)).toBeNull();
    expect(radialEscapeSq(() => true)).toBeNull(); // escapes at the origin ⇒ not a bailout
  });
});
