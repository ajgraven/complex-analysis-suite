// The colour table itself — M8 step 1.9.
//
// `phase.glsl.ts` had drawn a constant-lightness OkLCh sweep since the stage was built, under a
// comment forbidding anyone from calling it CET-C6. These are the properties that make the table
// the real thing rather than a plausible ramp, and they are checked because a colour map is data
// that no other test in the suite can look at: the browser suite asserts what the SHADER did with
// it, which is satisfied by any 256 colours at all.
import { describe, expect, it } from "vitest";

import { CET_C6, cetC6Bytes } from "../src/ui/stage/cetC6.js";

/** Rec. 709 luma, the measure the browser suite's `dark` threshold is set against. */
const luma = (c: readonly [number, number, number]): number =>
  (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) * 255;

const step = (i: number): number => {
  const a = CET_C6[i];
  const b = CET_C6[(i + 1) % CET_C6.length];
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
};

describe("CET-C6", () => {
  it("is 256 sRGB triples, every channel inside the cube", () => {
    expect(CET_C6.length).toBe(256);
    for (const [i, c] of CET_C6.entries()) {
      expect({ i, ok: c.length === 3 && c.every((v) => v >= 0 && v <= 1) }).toEqual({ i, ok: true });
    }
  });

  it("CLOSES ON ITSELF — the wrap-around step is an ordinary step", () => {
    // The property that makes a cyclic map cyclic, and the one a phase portrait needs at
    // `arg f = ±π`: if entry 255 → entry 0 were a jump, the seam would be a line the reader sees
    // running out from every pole, which is precisely the artefact the map exists to avoid.
    const interior = Array.from({ length: 255 }, (_, i) => step(i));
    const wrap = step(255);
    const min = Math.min(...interior);
    const max = Math.max(...interior);
    // Measured: wrap 0.01205, interior [0.00996, 0.02598], mean 0.01817.
    expect(wrap).toBeGreaterThanOrEqual(min);
    expect(wrap).toBeLessThanOrEqual(max);
    expect(max / min).toBeLessThan(3);
  });

  it("has no entry dark enough to be mistaken for ink", () => {
    // What `stageMode.browser.test.ts`'s differential measurement rests on. Measured darkest 93.1;
    // an absolute "dark pixel" threshold below that counts hues rather than isolines, which is why
    // that suite compares the two frames per pixel instead of counting dark ones.
    const darkest = Math.min(...CET_C6.map(luma));
    expect(darkest).toBeGreaterThan(90);
  });

  it("uploads as 256 opaque RGBA texels", () => {
    const bytes = cetC6Bytes();
    expect(bytes.length).toBe(256 * 4);
    for (let i = 3; i < bytes.length; i += 4) expect(bytes[i]).toBe(255);
    // Entry 0 round-trips to the byte the shader samples — the one place the float table and the
    // texture the GPU reads are compared at all.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual(CET_C6[0].map((v) => Math.round(v * 255)));
  });
});
