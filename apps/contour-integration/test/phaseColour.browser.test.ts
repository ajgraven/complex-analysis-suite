// **The colour map, per pixel, against a CPU twin** — M8 step 1.9.
//
// `stageMode.browser.test.ts` counts colours and compares frames, and a mutation sweep showed what
// that cannot see: replacing the table's LIGHTNESS with a constant, its CHROMA with a constant, or
// its HUE with the raw argument — each of which throws CET-C6 away entirely — left every one of its
// assertions green. A count of distinct colours is satisfied by any 85,000 colours at all.
//
// So this is the `cutParity.browser.test.ts` discipline applied to the colour pipeline: the same
// steps in JavaScript, compared with what the shader actually wrote. The integrand is `f(z) = z`,
// so `arg f` and `|f|` are the sample point's own polar coordinates and every input is chosen
// rather than solved for.
import { describe, expect, it } from "vitest";
import { compileF, parse, type Node } from "@cas/expr";
import { COMPLEX_DERIVED_GLSL, COMPLEX_SINGLE_GLSL, createProgram } from "@cas/gpu";

import { buildPhaseFrag, PHASE_VERT, STAGE_MODE_CODE } from "../src/ui/stage/phase.glsl.js";
import { CUT_GLSL } from "../src/ui/stage/cut.glsl.js";
import { CET_C6, cetC6Bytes } from "@cas/gpu/cet";
import type { StageMode } from "../src/ui/stage/mode.js";

const STDLIB = `${COMPLEX_SINGLE_GLSL}\n${COMPLEX_DERIVED_GLSL}\nuniform vec2 uA;\n${CUT_GLSL}\n`;

/**
 * The tolerance, in display-sRGB units of 1.
 *
 * The table reaches the GPU as UNORM8, so the twin quantises to 8 bits too and what is left is
 * float32 against float64 through two cube roots, a `pow(1/2.4)` and a matrix pair. Measured worst
 * case over the 96 samples below: 1.6e-3, which is 0.4 of a 255th.
 */
const TOL = 6e-3;

// ── the twin ────────────────────────────────────────────────────────────────────────────────────

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number): number => {
  const x = Math.min(1, Math.max(0, c));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};

function oklab(rgb: readonly [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map(srgbToLinear) as [number, number, number];
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const [l_, m_, s_] = [l, m, s].map((x) => Math.cbrt(Math.max(x, 0)));
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklchToSrgb(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * The table, as the GPU reads it: UNORM8 texels, `REPEAT` on S, linear filtering.
 *
 * The wrap is the part worth spelling out. `u` never leaves [0, 1], but a texel CENTRE sits at
 * `(i + 0.5)/256` — so `u = 0` falls half a texel below the first centre and the hardware
 * interpolates with texel 255, across the table's own join. That is the seam at `arg f = ±π`, and
 * it is why the sampler wraps rather than clamps.
 */
function sampleRamp(u: number): [number, number, number] {
  const bytes = cetC6Bytes();
  const x = u * 256 - 0.5;
  const i0 = Math.floor(x);
  const f = x - i0;
  const at = (i: number): [number, number, number] => {
    const k = ((i % 256) + 256) % 256;
    return [bytes[k * 4] / 255, bytes[k * 4 + 1] / 255, bytes[k * 4 + 2] / 255];
  };
  const a = at(i0);
  const b = at(i0 + 1);
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The shader's `main`, for a finite `w`, with the grid and the modulus contours off. */
function expected(mode: StageMode, w: readonly [number, number]): [number, number, number] {
  const hue = Math.atan2(w[1], w[0]);
  const t = Math.log2(Math.max(Math.hypot(w[0], w[1]), 1e-30));
  const lab = oklab(sampleRamp(hue * 0.15915494309 + 0.5));
  const baseL = lab[0];
  const baseC = Math.hypot(lab[1], lab[2]);
  const baseH = Math.atan2(lab[2], lab[1]);
  const lightScale = mode === "quiet" ? 0.78 : 1;
  const chromaScale = mode === "quiet" ? 0.42 : mode === "iso" ? 0.75 : 1;
  let L = baseL * lightScale - 0.12 * (t - Math.floor(t));
  L = 0 + (L - 0) * smoothstep(-24, -16, t);
  L = L + (1 - L) * smoothstep(16, 24, t);
  return oklchToSrgb(L, baseC * chromaScale, baseH);
}

// ── the shader ──────────────────────────────────────────────────────────────────────────────────

function context(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context — headless Chromium should provide one via SwiftShader");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float unavailable");
  return gl;
}

function identityProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const ast = parse("z") as Node;
  return createProgram(gl, PHASE_VERT, buildPhaseFrag(STDLIB, compileF(ast)));
}

/** One pixel of the real phase program at `z`, in `mode`. `paper` is only read by `textbook`. */
function pixel(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  z: readonly [number, number],
  mode: StageMode,
  paper: readonly [number, number, number] = [0, 0, 0],
  spread = 0,
): [number, number, number] {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const target = gl.createTexture();
  const fbo = gl.createFramebuffer();
  const ramp = gl.createTexture();
  try {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    // Unit 1 for the render target and unit 0 for the ramp — `declaredParity.browser.test.ts`
    // records what happens when the two share a unit.
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ramp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cetC6Bytes());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(program);
    // A DEGENERATE range, so `vUv = (0.5, 0.5)` lands exactly on `z` and `fwidth` is zero — which
    // is what takes the grid, the modulus contours and the phase isolines out of the comparison
    // without switching off the code that draws them.
    gl.uniform4f(
      gl.getUniformLocation(program, "uRange"),
      z[0] - spread,
      z[0] + spread,
      z[1] - spread,
      z[1] + spread,
    );
    gl.uniform2f(gl.getUniformLocation(program, "uParamC"), 0, 0);
    gl.uniform2f(gl.getUniformLocation(program, "uA"), 0, 0);
    gl.uniform1f(gl.getUniformLocation(program, "uModulusDepth"), 1);
    gl.uniform1f(gl.getUniformLocation(program, "uGridStrength"), 0);
    gl.uniform1f(gl.getUniformLocation(program, "uIsoStrength"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uCutCount"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uRamp"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uMode"), STAGE_MODE_CODE[mode]);
    gl.uniform3f(gl.getUniformLocation(program, "uPaper"), paper[0], paper[1], paper[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
    return [px[0], px[1], px[2]];
  } finally {
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(target);
    gl.deleteTexture(ramp);
    gl.deleteFramebuffer(fbo);
  }
}

/**
 * The same, over a range wide enough for `fwidth` to be non-zero.
 *
 * {@link pixel} renders a DEGENERATE range on purpose, which takes the grid, the modulus contours
 * and the phase isolines out of the comparison without switching off the code that draws them. A
 * test whose subject IS a line needs the opposite.
 */
function pixelSpread(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  z: readonly [number, number],
  mode: StageMode,
): [number, number, number] {
  return pixel(gl, program, z, mode, [0, 0, 0], 0.01);
}

/**
 * 24 arguments around the circle at three moduli — hue, lightness band and chroma all varying.
 *
 * **No radius is a power of two, and that is not fussiness.** The lightness band is `fract(log2|f|)`,
 * a SAWTOOTH, so at `|f| = 1` the two backends land on opposite sides of its reset: float32's `|z|`
 * comes out a bit below 1, `t` is a hair negative, `fract` returns ~1 and the pixel is a whole band
 * darker than float64's 0. Measured: every one of the 24 samples at `r = 1.0` disagreed by about
 * 0.15 in sRGB with the hue plainly right. It is the modulus analogue of `declaredParity`'s rule
 * that a grid never lands on a hair-thin isoline — a sample on a discontinuity measures the
 * discontinuity, not the thing either side of it.
 */
const SAMPLES: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (const r of [0.37, 1.3, 2.6]) {
    for (let k = 0; k < 24; k++) {
      const th = -Math.PI + ((k + 0.5) * 2 * Math.PI) / 24;
      out.push([r * Math.cos(th), r * Math.sin(th)]);
    }
  }
  return out;
})();

/**
 * Astride the seam: `arg f = ±π`, where the table wraps and `REPEAT` is what makes the two sides
 * meet. A clamped sampler is right everywhere else and wrong only here.
 *
 * **Not run in `iso`, and the reason is arithmetic rather than convenience.** `π` IS a multiple of
 * 30°, so the seam is exactly where that mode draws a line — and with a degenerate range `fwidth`
 * is zero, so the line's width falls back to the shader's `1e-6` floor and whether a sample lands
 * inside it comes down to whether float32's `atan(0, -1.3) · 6/π` rounds to just under 6 or just
 * over. Measured: two of these four came back darkened by 0.53 and two by 0.34. A sample on a line
 * measures the line.
 */
const SEAM: readonly (readonly [number, number])[] = [
  [-1.3, 1e-7],
  [-1.3, -1e-7],
  [-2.6, 1e-7],
  [-2.6, -1e-7],
];

describe("the phase portrait's colour, against a CPU twin of the same pipeline", () => {
  for (const mode of ["full", "quiet", "iso"] as const) {
    it(`agrees pixel for pixel in ${mode}`, () => {
      const gl = context();
      const program = identityProgram(gl);
      let worst = 0;
      for (const z of mode === "iso" ? SAMPLES : [...SAMPLES, ...SEAM]) {
        const got = pixel(gl, program, z, mode);
        const want = expected(mode, z);
        const d = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
        worst = Math.max(worst, d);
        expect({ z, agrees: d < TOL }).toEqual({ z, agrees: true });
      }
      // The bound is not decoration: it is what says the agreement is EXACT arithmetic and not a
      // loose tolerance that any plausible colour would pass. Measured worst 1.6e-3 across the
      // three modes; `TOL` is 6e-3.
      expect(worst).toBeLessThan(TOL);
    });
  }

  it("distinguishes the modes at the SAME point — the dials are not decoration", () => {
    // Without this a twin that ignored `mode` on both sides would agree perfectly with a shader
    // that ignored it too. Quiet must be darker than full (lightness ×0.78) and iso less saturated
    // (chroma ×0.75), at one point, measured rather than assumed.
    const gl = context();
    const program = identityProgram(gl);
    const z: [number, number] = [0.8, 0.6];
    const [full, quiet, iso] = (["full", "quiet", "iso"] as const).map((m) => pixel(gl, program, z, m));
    const luma = (c: readonly [number, number, number]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const chroma = (c: readonly [number, number, number]): number => Math.max(...c) - Math.min(...c);
    expect(luma(quiet)).toBeLessThan(luma(full) - 0.05);
    expect(chroma(iso)).toBeLessThan(chroma(full) - 0.02);
  });

  it("paints the PAPER under `textbook`, whatever the integrand is", () => {
    // The shader's defensive branch. `stageView` clears the canvas instead of running the program
    // in this mode, so nothing in the app can reach it — and the file's own comment claims the two
    // "cannot disagree about what textbook looks like", which is a claim only this test checks.
    const gl = context();
    const program = identityProgram(gl);
    for (const z of [[0.8, 0.6], [-2, 0.1], [0, 0]] as const) {
      const got = pixel(gl, program, z, "textbook", [0.97, 0.972, 0.98]);
      expect({ z, got: got.map((v) => Math.round(v * 1000) / 1000) }).toEqual({ z, got: [0.97, 0.972, 0.98] });
    }
  });

  it("puts the isolines AT the multiples of 30°, not between them", () => {
    // **The sweep's subtlest survivor.** Measuring the distance from the MIDPOINT between two lines
    // instead of from the line — `abs(fract(hx) − 0.5)` against `min(fract, 1 − fract)` — keeps
    // twelve lines per turn at the same width and the same strength, and moves every one of them by
    // 15°. No count of dark pixels can see that, and none did: the app-level population assertion
    // in `stageMode.browser.test.ts` stayed green under it. What distinguishes the two is WHERE the
    // lines are, so that is what is asked.
    //
    // The range is NOT degenerate here, because the line's width is `fwidth`-derived and a zero
    // derivative collapses it to the shader's `1e-6` floor. At `d = 0.01` on a radius of 1.3 the
    // band is about ±0.96° of argument, so 30° is inside it and 15° is nowhere near.
    const gl = context();
    const program = identityProgram(gl);
    const lit = (deg: number): number => {
      const th = (deg * Math.PI) / 180;
      const z: [number, number] = [1.3 * Math.cos(th), 1.3 * Math.sin(th)];
      const on = pixelSpread(gl, program, z, "iso");
      const off = pixelSpread(gl, program, z, "full");
      // `iso` is `full` at chroma ×0.75 plus the line, and chroma alone cannot darken a pixel by
      // more than a little — so the RATIO is the line. On a line it is the multiply's 0.42.
      const l = (c: readonly [number, number, number]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      return l(on) / Math.max(l(off), 1e-6);
    };
    for (const deg of [30, 60, 90, 120]) {
      expect({ deg, onALine: lit(deg) < 0.6 }).toEqual({ deg, onALine: true });
    }
    for (const deg of [15, 45, 75, 105]) {
      expect({ deg, onALine: lit(deg) < 0.6 }).toEqual({ deg, onALine: false });
    }
  });

  it("reads the table and not a formula — the entries themselves reach the screen", () => {
    // The sweep's sharpest survivor: replacing `baseH` with the raw argument, or `baseL`/`baseC`
    // with the old sweep's constants, left every colour-COUNT assertion green. The twin above
    // catches all three, and this states the consequence directly — a published entry, sampled at
    // its own texel centre, comes back with the table's hue.
    const gl = context();
    const program = identityProgram(gl);
    for (const i of [0, 64, 128, 192]) {
      // The argument whose `u` lands on texel `i`'s centre.
      const hue = ((i + 0.5) / 256 - 0.5) * 2 * Math.PI;
      // Radius 1.3, not 1: see {@link SAMPLES} on why a power of two is the wrong place to sample.
      const z: [number, number] = [1.3 * Math.cos(hue), 1.3 * Math.sin(hue)];
      const got = pixel(gl, program, z, "full");
      const table = CET_C6[i];
      // Hue ANGLE in Oklab, which the lightness band and the gamut clamp cannot move.
      const a = oklab(got);
      const b = oklab([table[0], table[1], table[2]]);
      const dh = Math.abs(Math.atan2(a[2], a[1]) - Math.atan2(b[2], b[1]));
      expect({ i, closeInHue: Math.min(dh, 2 * Math.PI - dh) < 0.05 }).toEqual({ i, closeInHue: true });
    }
  });
});
