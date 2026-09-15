import { describe, expect, it } from "vitest";
import { makeUnboundedLaurentSchwarz, type Complex } from "@cas/schwarz";
import { schwarzBoundaryPoly, SCHWARZ_FLAT_RGB } from "../src/render/schwarzView";
import { createSchwarzGLRenderer } from "../src/render/schwarzGL";

// The σ view's in-Ω mask, against the float64 CPU field — in a real browser, because the property is a
// float32 GLSL one and the node/jsdom gate cannot compile a shader.
//
// WHAT BROKE. `inOmega()` is a rasterised polygon mask; σ is PARTIAL — ψ = φ⁻¹ exists on φ(𝔻*) alone.
// Inside the band where they disagree the shader asks sigma() about a point outside its domain, Newton
// converges to a preimage on the wrong sheet, and the pixel returns the flat grey "invalid". Because the
// picture iterates, that lands on ∂Ω and on every σ-preimage of it — speckle along every tile edge, which
// in this app is grey and reads as shading rather than as an error.
//
// Measured before the fix, on the cusped deltoid below: 0.55% of a 512² frame at 1× and 1.14% at 30×, of
// which 99.9% reached a point the mask called in-Ω where NO |z| > 1 preimage exists (decided by exact
// cubic roots, so non-existence rather than a search that gave up) — against 0 of 3000 control pixels.
//
// WHAT IS PINNED HERE, AND WHAT IS NOT. This asserts zero invalid pixels. The obvious second clause —
// "and the classification still matches the float64 CPU field", to reject a fix that buys silence by
// grossly over-dilating the mask — could not be built ON THIS FIXTURE, three ways. It IS built, on a
// different one, in the sibling schwarzGL.browser.test.ts: the pole-bearing φ there has a σ field of
// exactly two classes (K and the first tile), which under the sqrt ramp are two DISTINGUISHABLE colours,
// so a displaced boundary is visible as a pixel disagreeing with the CPU in the interior of a class.
// Measured there: the check bites once ∂Ω moves by about one screen pixel, 38.7× the margin shipped.
//
// Why the deltoid resists it, and why the residue is a structural guard in
// packages/gpu/test/maskTexture.test.ts instead:
//
//   • class-level agreement with renderSchwarzField: a 10x over-dilated mask scored 100.000% at every
//     view, including one centred on ∂Ω. K is painted `fundamentalColor(0)` and an in-Ω pixel
//     `fundamentalColor(n)`, so both read as "fundamental" and a displaced boundary agrees with itself.
//   • colour-level agreement with the same: 51% for the fix, the over-dilation AND the pre-fix tree
//     alike. The CPU field paints its own fixed blue→cyan→white ramp, not the selectable colormap the
//     GPU samples, so the two are not colour-comparable at all (which is why the sibling
//     schwarzGL.browser.test.ts compares the GPU to the PALETTE, never to this field).
//   • K-region area: 199.6% / 212.8% / 196.2% error for fix / over-dilated / pre-fix — a real signal,
//     but the region is not isolable, because computeT(1) lands on the colormap's t=0 end too, so the
//     count is "K plus its n=1 shell" rather than K.
//
// A number that cannot separate the fix from the failure it guards against is not evidence, and a test
// built on one passes forever while meaning nothing. The converse bit too: the sibling's pole-bearing
// case used to assert `distinctColors > 1` — "structure, not a flat fill" — and that map's honest frame
// IS flat under the linear ramp, so the assertion was passing on two stray `invalid` speckle pixels.
// Fixing the defect broke the test that the defect had been satisfying.

// φ(z) = z + 0.5/z², so φ′ = 0 at z³ = 1: the three critical points sit exactly ON |z| = 1 and ∂Ω is the
// cusped hypocycloid. The extremal domain of the family, not a corner case — and the same fixture
// schwarzGL.browser.test.ts uses.
const DELTOID: { c: number; F: Complex[] } = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]] };
const OPTS = { maxIter: 48, escapeR: 1e4 };

const VIEWS: { label: string; center: [number, number]; zoom: number }[] = [
  { label: "1x", center: [0, 0], zoom: 0.4 },
  { label: "6x", center: [0, 0], zoom: 2.4 },
  { label: "30x", center: [1.24, 0.6], zoom: 12 },
  { label: "boundary", center: [0.25, 0.433], zoom: 38 },
];

function readPixels(glCanvas: HTMLCanvasElement, size: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2D context for readback");
  ctx.drawImage(glCanvas, 0, 0);
  return ctx.getImageData(0, 0, size, size).data;
}

/** Pixels painted exactly this flat class colour. */
function countClass(d: Uint8ClampedArray, rgb: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) n++;
  }
  return n;
}

describe("CD σ mask: it never claims a point ψ cannot invert", () => {
  it("paints no invalid pixel on the cusped deltoid, at any zoom", () => {
    const r = createSchwarzGLRenderer();
    expect(r, "WebGL2 present but the σ shader failed to build").not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    r.setPhi(DELTOID, schwarzBoundaryPoly(engine));
    // viridis is never neutral grey, so the invalid class (80,80,80) is unambiguous in the readback.
    r.setColormap("viridis");

    const size = 512;
    for (const v of VIEWS) {
      expect(r.render({ center: v.center, zoom: v.zoom }, size, OPTS)).toBe(true);
      const d = readPixels(r.canvas, size);
      expect(countClass(d, SCHWARZ_FLAT_RGB.invalid), "invalid pixels @ " + v.label).toBe(0);
    }
    r.destroy();
  }, 240_000);

});

