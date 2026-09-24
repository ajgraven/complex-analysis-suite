import { describe, expect, it } from "vitest";
import { decodeProbe, Portrait } from "../src/ui/portrait";
import type { Cx } from "../src/engine/polynomial";

// The pseudozero layer's f = log₁₀(|p|/w) comes out of float32 GLSL: |p| from the root form, w by
// log-sum-exp. The node gate never compiles it. Here the shader's `probe` output is read back pixel by
// pixel and compared with a float64 evaluation, and the inside/outside decision — the edge a reader
// sees stroked — with the same decision made in float64.

const W = 96;
const H = 96;

function mount(): { portrait: Portrait; gl: WebGL2RenderingContext } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  document.body.append(canvas);
  const portrait = new Portrait(canvas);
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2");
  return { portrait, gl };
}

function read(gl: WebGL2RenderingContext): Uint8Array {
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}

interface Case {
  readonly name: string;
  readonly roots: readonly Cx[];
  readonly coeffs: readonly Cx[];
  readonly range: [number, number, number, number];
  readonly log10eps: number;
  /** True |p(z)|, float64. */
  readonly abs: (z: Cx) => number;
}

/** Coefficients of ∏(z − rᵢ), real roots. */
function fromRealRoots(rs: readonly number[]): Cx[] {
  let c = [1];
  for (const r of rs) {
    const next = new Array<number>(c.length + 1).fill(0);
    c.forEach((a, k) => {
      next[k + 1] += a;
      next[k] -= r * a;
    });
    c = next;
  }
  return c.map((a) => [a, 0]);
}

const Z5_ROOTS: Cx[] = [
  [1.1673039782614187, 0],
  [0.18123244446987538, 1.0839541013177107],
  [0.18123244446987538, -1.0839541013177107],
  [-0.7648844336005847, 0.35247154603172626],
  [-0.7648844336005847, -0.35247154603172626],
];
const WILK = Array.from({ length: 20 }, (_, i) => i + 1);

const CASES: Case[] = [
  {
    name: "z⁵ − z − 1 at ε = 10^−0.7",
    roots: Z5_ROOTS,
    coeffs: [
      [-1, 0],
      [-1, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [1, 0],
    ],
    range: [-1.6, 1.6, -1.6, 1.6],
    log10eps: -0.7,
    abs: ([x, y]) => {
      // Horner, float64: well-conditioned at this degree.
      let pr = 1;
      let pi = 0;
      for (const a of [0, 0, 0, -1, -1]) {
        const nr = pr * x - pi * y + a;
        pi = pr * y + pi * x;
        pr = nr;
      }
      return Math.hypot(pr, pi);
    },
  },
  {
    name: "Wilkinson's polynomial at ε = 10⁻¹⁰",
    roots: WILK.map((k): Cx => [k, 0]),
    coeffs: fromRealRoots(WILK),
    range: [0, 22, -11, 11],
    log10eps: -10,
    // The root form IS p here — exact roots — where Horner on the coefficients would cancel to noise.
    abs: ([x, y]) => WILK.reduce((m, k) => m * Math.hypot(x - k, y), 1),
  },
];

function cpuF(c: Case, z: Cx): number {
  const r = Math.hypot(z[0], z[1]);
  let w = 0;
  for (let k = c.coeffs.length - 1; k >= 0; k--) w = w * r + Math.hypot(...c.coeffs[k]);
  return Math.log10(c.abs(z) / w);
}

describe("the pseudozero layer's f matches a float64 evaluation", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const { portrait, gl } = mount();
      portrait.render(c.range, c.roots, [1, 0], true, {
        coeffs: c.coeffs,
        log10eps: c.log10eps,
        probe: true,
      });
      const px = read(gl);
      const [x0, x1, y0, y1] = c.range;
      let worst = 0;
      let compared = 0;
      let insideCount = 0;
      let flagChecked = 0;
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const z: Cx = [
            x0 + ((i + 0.5) / W) * (x1 - x0),
            y0 + ((j + 0.5) / H) * (y1 - y0),
          ];
          const f = cpuF(c, z);
          const o = 4 * (j * W + i);
          const g = decodeProbe(px[o], px[o + 1], px[o + 2]);
          // Within a pixel of a root f → −∞ and the probe clamps; float32's z is also coarsest there.
          if (f > -39) {
            const near = c.roots.some(
              ([rx, ry]) => Math.hypot(z[0] - rx, z[1] - ry) < 2e-3,
            );
            if (!near) {
              worst = Math.max(worst, Math.abs(g.f - f));
              compared++;
            }
          }
          // The edge: the inside flag agrees wherever float64 is not itself within the probe's resolution.
          if (Math.abs(f - c.log10eps) > 5e-3) {
            expect(g.inside, `(${z[0]}, ${z[1]}) f=${f}`).toBe(f <= c.log10eps);
            flagChecked++;
            if (g.inside) insideCount++;
          }
        }
      }
      expect(compared).toBeGreaterThan(0.95 * W * H);
      // 16-bit quantization of a 50-wide range is 7.6e-4; float32 log sums add ~1e-5 per term.
      expect(worst).toBeLessThan(2e-3);
      expect(flagChecked).toBeGreaterThan(0.95 * W * H);
      // Non-vacuous: both sides of the edge occur.
      expect(insideCount).toBeGreaterThan(20);
      expect(flagChecked - insideCount).toBeGreaterThan(20);
    });
  }
});

describe("the drawn layer", () => {
  it("greys and lightens the inside, and costs nothing when off", () => {
    const { portrait, gl } = mount();
    const c = { ...CASES[0], log10eps: -0.3 };
    portrait.render(c.range, c.roots, [1, 0], true, null);
    const off = read(gl);
    portrait.render(c.range, c.roots, [1, 0], true, {
      coeffs: c.coeffs,
      log10eps: c.log10eps,
    });
    const on = read(gl);
    let lighter = 0;
    let insideSeen = 0;
    const [x0, x1, y0, y1] = c.range;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const z: Cx = [
          x0 + ((i + 0.5) / W) * (x1 - x0),
          y0 + ((j + 0.5) / H) * (y1 - y0),
        ];
        const f = cpuF(c, z);
        // Deep inside only: the stroke is two pixels wide, and f moves ~0.25 per pixel this close to a
        // root. The pixels next to a root are INCLUDED: an unclamped fwidth stroked them dark (3 of 40).
        if (f > c.log10eps - 0.8) continue;
        insideSeen++;
        const o = 4 * (j * W + i);
        // Luminance up, chroma down: the inside is greyed and lightened.
        const lum = (a: Uint8Array): number =>
          0.2126 * a[o] + 0.7152 * a[o + 1] + 0.0722 * a[o + 2];
        const chroma = (a: Uint8Array): number =>
          Math.max(a[o], a[o + 1], a[o + 2]) - Math.min(a[o], a[o + 1], a[o + 2]);
        if (lum(on) > lum(off) && chroma(on) < 0.5 * chroma(off) + 2) lighter++;
      }
    }
    expect(insideSeen).toBeGreaterThan(20);
    expect(lighter).toBe(insideSeen);
    // And the phase-only render is unchanged by a pseudozero render having happened before it.
    portrait.render(c.range, c.roots, [1, 0], true, null);
    expect(read(gl)).toEqual(off);
  });
});
