// **CPU ↔ GPU PARITY FOR THE BRANCH-CUT LAYER** — M4.7's gate, and the only test in the repository
// that can tell you the app draws the branch it computes in.
//
// `kernel/branch/correction.ts` decides which determination the ledger's cut rows describe;
// `ui/stage/cut.glsl.ts` decides which one the reader sees. They are two implementations of the same
// predicates, and a drift between them is an app that draws one branch and reports another. So this
// executes the REAL GLSL in real WebGL2 over a grid of sample points and compares against the TS,
// predicate by predicate.
//
// **THE TOLERANCE IS IN POSITION, NOT IN VALUE.** The correction is piecewise constant with integer-
// or rational-sized jumps, so "agrees to 1e-6" is the wrong shape of claim: either the two backends
// put a pixel on the same side of a cut or they do not. What float32 costs is not accuracy but the
// SIDE of a point lying within its own rounding error of a cut, so disagreement is allowed only
// within `NEAR` of some segment — and the test reports how many samples that excused, because an
// exclusion nobody counts is an exclusion that grows.
//
// The rotatable ray is the other shape: `cargCut`/`cpowCut` return a NUMBER, and there the tolerance
// is in value and its floor is set by the GLSL ES `sin`/`cos` allowance rather than by float32 — see
// {@link POW_RELATIVE}, which is where this file's one wrong tolerance was found and why.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { COMPLEX_SINGLE_GLSL, createProgram } from "@cas/gpu";
import {
  MAX_CUT_SEGMENTS,
  argCut,
  cutCorrection,
  cutSegments,
  powCut,
  type CutSegment,
} from "../src/kernel/branch/correction.js";
import { CUT_GLSL, MAX_CUT_SEGMENTS_GLSL } from "../src/ui/stage/cut.glsl.js";
import { PHASE_VERT } from "../src/ui/stage/phase.glsl.js";
import { INFINITY, NO_BRANCH, type BranchChoice } from "../src/kernel/branch/model.js";
import type { Cx } from "../src/kernel/geom.js";

const q = (n: bigint, d = 1n) => Frac.of(n, d);
/** Kept small on purpose: a ray clipped at 1e4 makes float32 cross products ~1e8 and the SIGN soft. */
const RADIUS = 40;
/** How close to a cut a disagreement is excused. One part in ~1e5 of the clip radius. */
const NEAR = 4e-4 * RADIUS;

/**
 * **GLSL ES 3.0's `sin`/`cos` allowance — the floor under any parity claim about a VALUE.**
 *
 * §4.5.1's precision table is ULP counts throughout except here: `sin` and `cos` are required only
 * to hold an ABSOLUTE error below `2^-11` = 4.9e-4 inside `[-π, π]`, four orders of magnitude looser
 * than float32's eps. SwiftShader spends 39% of it — measured worst over this grid, `|sin|` 1.89e-4
 * and `|cos|` 1.89e-4. By contrast `atan` is allowed 4096 ULP and delivers 8.5e-7, which is why
 * {@link argCut}'s block below asserts four orders tighter than {@link powCut}'s.
 *
 * The first draft of this file asserted `3e-5` on `cpowCut` and went red on a CORRECT shader, which
 * is worth recording: from there the repairs are this one and a wrong one (loosen until green). So
 * the number is derived and not fitted. `cpowCut` returns `m·(cos aθ, sin aθ)`, so the absolute
 * error arrives MULTIPLIED by the modulus and the honest comparison is relative, bounded by the
 * sin/cos error itself: `√2·2^-11` if both components err fully, plus 1e-4 for the `log`/`exp`/`atan`
 * chain beneath them.
 *
 * It costs this test nothing, because the defect it exists to catch is not a digit. A wrong window
 * origin, a modulus where whole turns belong, or a sign on `a` moves the value by a full monodromy
 * step `exp(2πi·a)` — a relative error of `2|sin πa|`, which is 1.4 at `α = ±1/2`. Three orders of
 * magnitude separate float32 noise from the wrong branch, and the bound sits in between.
 */
const SINCOS_ABSOLUTE = 2 ** -11;
const POW_RELATIVE = Math.SQRT2 * SINCOS_ABSOLUTE + 1e-4;

function context(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context — headless Chromium should provide one via SwiftShader");
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("EXT_color_buffer_float unavailable — cannot read float results back");
  }
  return gl;
}

/**
 * Run one `vec4` expression of `z` over `samples`, on the GPU, and read the results back.
 *
 * A local probe rather than `@cas/gpu`'s `runGLSL`, which is shaped for `fFn(z, c)` and has no seat
 * for a uniform array. Same idea, 40 lines, and it sets the cut uniforms this layer needs.
 */
function probe(
  gl: WebGL2RenderingContext,
  body: string,
  samples: readonly Cx[],
  segments: readonly CutSegment[] = [],
  base: Cx = [0, 1],
): Float32Array[] {
  const frag = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uZ;
${COMPLEX_SINGLE_GLSL}
${CUT_GLSL}
void main() { fragColor = ${body}; }
`;
  const program = createProgram(gl, PHASE_VERT, frag);
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  try {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(program);

    const flat = new Float32Array(MAX_CUT_SEGMENTS_GLSL * 4);
    const jumps = new Float32Array(MAX_CUT_SEGMENTS_GLSL);
    for (let j = 0; j < Math.min(segments.length, MAX_CUT_SEGMENTS_GLSL); j++) {
      flat[4 * j] = segments[j].a[0];
      flat[4 * j + 1] = segments[j].a[1];
      flat[4 * j + 2] = segments[j].b[0];
      flat[4 * j + 3] = segments[j].b[1];
      jumps[j] = segments[j].jump;
    }
    gl.uniform1i(gl.getUniformLocation(program, "uCutCount"), Math.min(segments.length, MAX_CUT_SEGMENTS_GLSL));
    gl.uniform2f(gl.getUniformLocation(program, "uCutBase"), base[0], base[1]);
    gl.uniform4fv(gl.getUniformLocation(program, "uCutSeg"), flat);
    gl.uniform1fv(gl.getUniformLocation(program, "uCutJump"), jumps);

    const uZ = gl.getUniformLocation(program, "uZ");
    const out: Float32Array[] = [];
    for (const z of samples) {
      gl.uniform2f(uZ, z[0], z[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Float32Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
      out.push(px);
    }
    return out;
  } finally {
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(fbo);
  }
}

/** A grid over the picture, skipping the origin and the branch points. */
function grid(step = 0.37, reach = 3): Cx[] {
  const out: Cx[] = [];
  for (let x = -reach; x <= reach + 1e-9; x += step) {
    for (let y = -reach; y <= reach + 1e-9; y += step) {
      if (Math.hypot(x, y) < 1e-6) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/** Distance from `z` to the nearest cut segment — what the position tolerance is measured against. */
function nearestCut(z: Cx, segments: readonly CutSegment[]): number {
  let best = Infinity;
  for (const s of segments) {
    const dx = s.b[0] - s.a[0];
    const dy = s.b[1] - s.a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((z[0] - s.a[0]) * dx + (z[1] - s.a[1]) * dy) / len2));
    best = Math.min(best, Math.hypot(z[0] - (s.a[0] + t * dx), z[1] - (s.a[1] + t * dy)));
  }
  return best;
}

const keyhole = (alpha = q(1n, 2n)): BranchChoice => ({
  ...NO_BRANCH,
  convention: "zeroToTwoPi",
  points: [{ id: "b", at: [0, 0], order: { kind: "power", alpha }, label: "z = 0" }],
  cuts: [{ id: "Γ", from: "b", to: INFINITY, via: [[1, 0]] }],
});

const dogbone = (): BranchChoice => ({
  ...NO_BRANCH,
  convention: "zeroToTwoPi",
  points: [
    { id: "b1", at: [-1, 0], order: { kind: "power", alpha: q(-1n, 2n) }, label: "z = −1" },
    { id: "b2", at: [1, 0], order: { kind: "power", alpha: q(-1n, 2n) }, label: "z = 1" },
  ],
  cuts: [{ id: "Γ", from: "b1", to: "b2", via: [] }],
});

/** A hand-dragged cut: the dogbone's arc pulled up into the upper half plane. */
const dragged = (): BranchChoice => ({
  ...dogbone(),
  cuts: [{ id: "Γ", from: "b1", to: "b2", via: [[-0.4, 0.9], [0.5, 0.6]] }],
});

describe("the array sizes agree, because nothing else can check that", () => {
  it("MAX_CUT_SEGMENTS is the same number in both twins", () => {
    expect(MAX_CUT_SEGMENTS_GLSL).toBe(MAX_CUT_SEGMENTS);
  });

  it("links a program that declares the full uniform block", () => {
    // The one thing a string assertion cannot tell you: 64 vec4 plus 64 float of uniforms fit.
    const gl = context();
    expect(() => probe(gl, "vec4(cutCorrection(uZ), 0.0, 0.0, 1.0)", [[1, 1]])).not.toThrow();
  });
});

describe("cargCut agrees with the TS twin", () => {
  // 2e-5 is ~23x the worst measured here (8.5e-7, at theta0 = PI where the added turn is largest).
  // The SPEC promises far less — `atan` may spend 4096 ULP, i.e. ~1e-3 at these magnitudes — so a
  // renderer that is legitimately worse than SwiftShader would fail this and be right to; that is a
  // deliberate choice to keep the sharp claim where it holds, unlike POW_RELATIVE above, where the
  // loose bound is the only honest one.
  it("over a grid, at four window origins", () => {
    const gl = context();
    const samples = grid();
    for (const theta0 of [-Math.PI, 0, Math.PI / 3, Math.PI]) {
      const got = probe(gl, `vec4(cargCut(uZ, ${theta0.toPrecision(17)}), 0.0, 0.0, 1.0)`, samples);
      for (let k = 0; k < samples.length; k++) {
        const want = argCut(samples[k], theta0);
        expect({ theta0, z: samples[k], ok: Math.abs(got[k][0] - want) < 2e-5 }).toEqual({
          theta0,
          z: samples[k],
          ok: true,
        });
      }
    }
  });
});

describe("cargCut reproduces the principal branch EXACTLY, not to an ulp", () => {
  it("differs from atan() by zero, or by one whole turn, and never by a rounding error", () => {
    // **THE CLAIM BOTH TWINS' COMMENTS MAKE, WHICH UNTIL NOW NEITHER BACKEND CHECKED.** `argCut` adds
    // whole TURNS rather than taking a modulus, and the TS twin was rewritten to this shape when the
    // modulus form was measured one ulp off `atan2` at `[3,4]`. The GLSL repeats the claim in a
    // comment — and a mutation sweep found that replacing its body with `theta0 + mod(raw - theta0,
    // TAU)` passes every other assertion in this file, because the difference is ~1e-7 and every
    // tolerance here is looser than that.
    //
    // So the assertion is EXACT EQUALITY, computed in float32 on the GPU so no widening hides it. At
    // `theta0 = -PI` the added turn count is zero everywhere except on ℝ₋, where `atan` returns `+π`
    // and the half-open window `[-π, π)` sends it to `-π` — a difference of exactly one turn, which
    // is the convention and not a rounding error. Those are the only two values allowed.
    const gl = context();
    const samples: Cx[] = [...grid(), [1, 0], [-1, 0], [0, 1], [0, -1], [3, 4], [-40, 0]];
    const TAU32 = Math.fround(2 * Math.PI);
    const got = probe(
      gl,
      `vec4(cargCut(uZ, ${(-Math.PI).toPrecision(17)}) - atan(uZ.y, uZ.x), 0.0, 0.0, 1.0)`,
      samples,
    );
    for (let k = 0; k < samples.length; k++) {
      const d = got[k][0];
      expect({ z: samples[k], d, exact: d === 0 || d === -TAU32 }).toEqual({
        z: samples[k],
        d,
        exact: true,
      });
    }
  });
});

describe("cpowCut agrees with the TS twin", () => {
  it("over a grid, for the exponents tier D actually uses", () => {
    const gl = context();
    const samples = grid();
    for (const [alpha, theta0] of [
      [0.5, 0],
      [-0.5, 0],
      [0.75, 0],
      [0.25, -Math.PI],
      [-0.5, Math.PI / 2],
    ] as [number, number][]) {
      const got = probe(
        gl,
        `vec4(cpowCut(uZ, ${alpha.toPrecision(17)}, ${theta0.toPrecision(17)}), 0.0, 1.0)`,
        samples,
      );
      for (let k = 0; k < samples.length; k++) {
        const want = powCut(samples[k], alpha, theta0);
        // Relative to the modulus itself, not to max(1, |want|): the sin/cos error is multiplied by
        // it, so dividing by it is what leaves the sin/cos error alone to be compared against its
        // own bound. |z^a| runs over [0.12, 4.2] on this grid, so nothing is amplified.
        const err = Math.hypot(got[k][0] - want[0], got[k][1] - want[1]) / Math.hypot(want[0], want[1]);
        expect({ alpha, z: samples[k], ok: err < POW_RELATIVE }).toEqual({
          alpha,
          z: samples[k],
          ok: true,
        });
      }
    }
  });
});

describe("cutCorrection agrees with the TS twin", () => {
  const systems: { name: string; branch: BranchChoice; reference: ReadonlyMap<string, Frac> }[] = [
    { name: "a keyhole ray against the principal ray", branch: keyhole(), reference: new Map([["b", Frac.ONE]]) },
    {
      name: "D6's bounded cut against its window rays",
      branch: dogbone(),
      reference: new Map([
        ["b1", Frac.ZERO],
        ["b2", Frac.ZERO],
      ]),
    },
    {
      name: "a cut DRAGGED off its ray into the upper half plane",
      branch: dragged(),
      reference: new Map([
        ["b1", Frac.ZERO],
        ["b2", Frac.ZERO],
      ]),
    },
    { name: "no reference at all", branch: dragged(), reference: new Map() },
  ];

  it.each(systems.map((c) => [c.name, c] as const))("%s", (_name, kase) => {
    const gl = context();
    const segments = cutSegments(kase.branch, RADIUS, kase.reference);
    expect(segments.length).toBeGreaterThan(0);
    const samples = grid();
    const got = probe(gl, "vec4(cutCorrection(uZ), 0.0, 0.0, 1.0)", samples, segments);

    let excused = 0;
    for (let k = 0; k < samples.length; k++) {
      const want = cutCorrection(samples[k], [0, 1], segments);
      if (Math.abs(got[k][0] - want) < 1e-5) continue;
      // A disagreement is allowed ONLY within a rounding-error's distance of a cut, where the two
      // backends may legitimately put the point on different sides.
      const distance = nearestCut(samples[k], segments);
      expect({ z: samples[k], want, got: got[k][0], distance }).toEqual({
        z: samples[k],
        want,
        got: got[k][0],
        distance: expect.closeTo(distance, 12) as unknown as number,
      });
      expect(distance).toBeLessThan(NEAR);
      excused += 1;
    }
    // The exclusion is counted, because an exclusion nobody counts is one that grows. A grid of ~290
    // points against a handful of cuts should graze one or two at most.
    expect(excused).toBeLessThanOrEqual(4);
  });

  it("agrees EXACTLY where a sample lies on a cut, because both backends are strict there", () => {
    // **THE STRICT INEQUALITIES, WHICH THE GRID CANNOT REACH.** `signedCross` counts a touch as no
    // crossing, in both twins, and both say so in a comment. No point of a generic grid lies exactly
    // on a cut, so loosening the GLSL's `<` to `<=` passed all 38 assertions above — found by the
    // mutation sweep, and the gap is not academic: a cut DRAGGED by hand lands on a pixel centre
    // sooner or later, and M4.1 already decided that a grazing contact has no side to declare.
    //
    // Only the two exactly-representable configurations are used. The dragged arc's vertices are
    // 0.9 and -0.4, so a "point on the cut" there is a point within float32 rounding of it, which is
    // the position tolerance above and not this claim. Here every coordinate, every cross product and
    // every jump (±1/2, ±1) is exact in BOTH backends, so the comparison is `toBe`.
    const gl = context();
    const onGpu: { name: string; branch: BranchChoice; reference: ReadonlyMap<string, Frac>; samples: Cx[] }[] = [
      {
        // Segments: (0,0)→(1,0) and (1,0)→(42,0) at +1/2, the reference ray (0,0)→(-40,0) at -1/2.
        name: "keyhole",
        branch: keyhole(),
        reference: new Map([["b", Frac.ONE]]),
        samples: [
          [0.5, 0], // z exactly on the cut's first segment
          [2, 0], //   z exactly on its second
          [1, 0], //   z exactly on the vertex between them
          [-2, 0], //  z exactly on the reference ray
          [0, -1], //  [base,z] passes exactly through the branch point: the `spans` strictness
          [-2, -1], // the control — a genuine crossing of the reference ray
        ],
      },
      {
        // Segments: (-1,0)→(1,0) at -1/2, rays (-1,0)→(40,0) and (1,0)→(42,0) at +1/2.
        name: "dogbone",
        branch: dogbone(),
        reference: new Map([
          ["b1", Frac.ZERO],
          ["b2", Frac.ZERO],
        ]),
        samples: [
          [0.5, 0], //  on the declared arc AND on the first reference ray at once
          [-0.5, 0],
          [1, 0], //    the branch points themselves, where three segments meet
          [-1, 0],
          [3, 0], //    on both reference rays
          [2, -1], //   [base,z] passes exactly through the branch point (1,0)
          [0, -1], //   a transversal crossing at an exact point: the correction is an INTEGER
        ],
      },
    ];

    let nonzero = 0;
    for (const kase of onGpu) {
      const segments = cutSegments(kase.branch, RADIUS, kase.reference);
      const got = probe(gl, "vec4(cutCorrection(uZ), 0.0, 0.0, 1.0)", kase.samples, segments);
      for (let k = 0; k < kase.samples.length; k++) {
        const want = cutCorrection(kase.samples[k], [0, 1], segments);
        expect({ case: kase.name, z: kase.samples[k], m: got[k][0] }).toEqual({
          case: kase.name,
          z: kase.samples[k],
          m: want,
        });
        if (want !== 0) nonzero += 1;
      }
    }
    // Without this the block could pass by every correction being zero, which is most of what an
    // on-cut sample gives you — the strictness is exactly the rule that makes them zero.
    expect(nonzero).toBeGreaterThan(0);
  });

  it("is identically zero with no cuts, on both backends", () => {
    const gl = context();
    const samples = grid();
    const got = probe(gl, "vec4(cutCorrection(uZ), 0.0, 0.0, 1.0)", samples, []);
    for (let k = 0; k < samples.length; k++) {
      expect({ z: samples[k], m: got[k][0] }).toEqual({ z: samples[k], m: 0 });
      expect(cutCorrection(samples[k], [0, 1], [])).toBe(0);
    }
  });
});

describe("the correction and the rotatable ray agree ON THE GPU too", () => {
  it("turns the GPU's principal √ into the GPU's keyhole √", () => {
    // The same three-way check the node suite does on the CPU, run entirely in GLSL: `cpowCut` at
    // the principal window, times `cutFactor`, must equal `cpowCut` at the keyhole window. Two
    // shader functions that share only `casCross`, agreeing about a determination.
    const gl = context();
    const segments = cutSegments(keyhole(), RADIUS, new Map([["b", Frac.ONE]]));
    const samples = grid(0.41).filter((z) => nearestCut(z, segments) > NEAR);
    const corrected = probe(
      gl,
      `vec4(cmul(cpowCut(uZ, 0.5, ${(-Math.PI).toPrecision(17)}), cutFactor(uZ)), 0.0, 1.0)`,
      samples,
      segments,
    );
    const direct = probe(gl, "vec4(cpowCut(uZ, 0.5, 0.0), 0.0, 1.0)", samples, segments);
    for (let k = 0; k < samples.length; k++) {
      // POW_RELATIVE again, for the reason given there. SwiftShader in fact agrees with itself to
      // ~1e-5 across this block, because its sin/cos error is smooth in the argument and largely
      // cancels between two evaluations of the same modulus — but that is an implementation detail
      // of one renderer, not a promise, and asserting it would be asserting the detail. The claim
      // here is that `cutFactor` moves the value by a WHOLE monodromy step, which is 1.4 relative.
      const err =
        Math.hypot(corrected[k][0] - direct[k][0], corrected[k][1] - direct[k][1]) /
        Math.hypot(direct[k][0], direct[k][1]);
      expect({ z: samples[k], ok: err < POW_RELATIVE }).toEqual({ z: samples[k], ok: true });
    }
  });
});
