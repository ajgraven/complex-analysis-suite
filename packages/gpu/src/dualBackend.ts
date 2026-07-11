// Dual-backend GLSL≈JS invariant harness (Phase 5, RISKS.md "hard part 2"). @cas/expr compiles one
// AST to two backends — a JS interpreter (makeComplexFn) and a GLSL string (compileF). They must agree,
// or the CPU/overlay reference and the GPU render silently diverge. This harness compiles f(z,c) into a
// self-contained WebGL2 probe shader, evaluates it on a grid of (z,c) samples in a real GL context, and
// compares to the JS backend.
//
// Split by capability: `buildProbeGLSL` (pure string assembly) and `jsReference` (pure computation) run
// anywhere, including node — they are the unit-testable core. `runGLSL` needs a live WebGL2 context with
// float render targets, so it runs in a browser (Vitest browser mode, or driven via a preview browser).
// This is why @cas/gpu depends on @cas/expr: the renderer executes what the compiler emits (the same
// dependency direction the Complex Dynamics app already has).
//
// Proven (2026-07, a preview-browser run of `runGLSL` over DUAL_BACKEND_CORPUS × defaultSamples in a
// real WebGL2 context): the single-precision GLSL backend agrees with the JS float64 backend to within
// float32 epsilon — max ABSOLUTE error ~1.5e-7 (the complex-plane distance |f_js − f_glsl| that
// `compareResults` reports as `maxAbsError`; sample |f| is O(1) on the corpus grid, so it doubles as a
// relative bound) across the holomorphic, anti-holomorphic (conjugate), rational, and transcendental
// (exp) maps. Wiring this as an ongoing CI check needs Vitest browser mode
// (@vitest/browser + a browser channel); until then the node suite (test/dualBackend.test.ts) guards the
// pure core (buildProbeGLSL / jsReference / compareResults) and the numeric run is reproducible by hand.

import { parse } from "@cas/expr/parser";
import { compileF, compileEscape } from "@cas/expr/glsl";
import { makeComplexFn, makeEscapeFn } from "@cas/expr/evaluate";
import type { Complex } from "@cas/expr/complex";
import { COMPLEX_SINGLE_GLSL } from "./glsl/complexSingle.glsl.js";
import { COMPLEX_DERIVED_GLSL } from "./glsl/complexDerived.glsl.js";
import { createProgram } from "./shader.js";

export interface Sample {
  z: Complex;
  c: Complex;
}

export interface DualCase {
  name: string;
  /** An @cas/expr source for f(z, c), e.g. "z^2 + c". */
  source: string;
}

/** Trivial fullscreen-triangle vertex shader; the fragment shader does all the work at one pixel. */
export const PROBE_VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/**
 * Assemble a self-contained WebGL2 (GLSL ES 3.00) fragment shader that evaluates f(z, c) — compiled
 * from `source` by @cas/expr — on the `uZ`/`uC` uniforms, writing the complex result's (re, im) into
 * an RGBA32F render target. Single precision (`cvec` = `vec2`), which is what the render path uses.
 */
export function buildProbeGLSL(source: string): string {
  const fFn = compileF(parse(source));
  return `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${fFn}
uniform vec2 uZ;
uniform vec2 uC;
uniform vec2 uA;
out vec4 fragColor;
void main() {
  cvec r = fFn(vec_(uZ.x, uZ.y), vec_(uC.x, uC.y));
  fragColor = vec4(cre1(r), cre1(cim(r)), 0.0, 1.0);
}`;
}

/** JS-backend reference: evaluate f(z, c) for each sample via @cas/expr's interpreter (float64). */
export function jsReference(source: string, samples: Sample[]): Complex[] {
  const f = makeComplexFn(parse(source));
  return samples.map((s) => f(s.z, s.c));
}

/**
 * GLSL-backend evaluation: compile the probe, render each sample to a 1×1 RGBA32F target, and read
 * back f(z, c) as (re, im). Requires a WebGL2 context with EXT_color_buffer_float (for float readback).
 */
export function runGLSL(gl: WebGL2RenderingContext, source: string, samples: Sample[]): Complex[] {
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("EXT_color_buffer_float unavailable — cannot read back float results");
  }
  const program = createProgram(gl, PROBE_VERTEX, buildProbeGLSL(source));
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  try {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, 1, 1);

    gl.useProgram(program);
    const uZ = gl.getUniformLocation(program, "uZ");
    const uC = gl.getUniformLocation(program, "uC");
    const px = new Float32Array(4);
    const out: Complex[] = [];
    for (const s of samples) {
      gl.uniform2f(uZ, s.z[0], s.z[1]);
      gl.uniform2f(uC, s.c[0], s.c[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
      out.push([px[0], px[1]]);
    }
    return out;
  } finally {
    // Release the probe's GL objects — runGLSL is called once per dual-backend case, so leaking these
    // would accumulate programs / textures / buffers across a test run.
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buf);
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fbo);
  }
}

export interface DualResult {
  name: string;
  maxAbsError: number;
  /** The sample with the largest error, for diagnostics. */
  worst: { sample: Sample; js: Complex; glsl: Complex } | null;
}

/** Compare JS vs GLSL results elementwise; report the max abs error (in the complex plane) + worst case. */
export function compareResults(
  name: string,
  samples: Sample[],
  js: Complex[],
  glsl: Complex[],
): DualResult {
  let maxAbsError = 0;
  let worst: DualResult["worst"] = null;
  for (let i = 0; i < samples.length; i++) {
    const dRe = js[i][0] - glsl[i][0];
    const dIm = js[i][1] - glsl[i][1];
    const err = Math.hypot(dRe, dIm);
    if (err > maxAbsError) {
      maxAbsError = err;
      worst = { sample: samples[i], js: js[i], glsl: glsl[i] };
    }
  }
  return { name, maxAbsError, worst };
}

/** A curated corpus: holomorphic polynomials, an anti-holomorphic (tricorn) map, a rational map, and a
 *  transcendental — the map families the suite actually renders. */
export const DUAL_BACKEND_CORPUS: DualCase[] = [
  { name: "z^2 + c", source: "z^2 + c" },
  { name: "z^3 + c", source: "z^3 + c" },
  { name: "z^2 + z + c", source: "z^2 + z + c" },
  { name: "conjugate(z)^2 + c", source: "conjugate(z)^2 + c" },
  { name: "(z^2 + c)/(z - c)", source: "(z^2 + c)/(z - c)" },
  { name: "exp(z) + c", source: "exp(z) + c" },
];

/** Deterministic (z, c) sample grid over a modest disc — no RNG (Math.random is unavailable in some
 *  runtimes and would make failures non-reproducible); a fixed lattice covers the plane adequately. */
export function defaultSamples(): Sample[] {
  const samples: Sample[] = [];
  const axis = [-1.3, -0.7, -0.2, 0.2, 0.7, 1.3];
  for (const zr of axis) {
    for (const zi of axis) {
      // pair each z with a c drawn from the same lattice, rotated, to vary c without an N^4 blowup
      const cr = zi * 0.5 - 0.4;
      const ci = zr * 0.5 + 0.1;
      samples.push({ z: [zr, zi], c: [cr, ci] });
    }
  }
  return samples;
}

// ── Regression corpus for the two emitBody codegen bugs the whole-app review found (H1/H2). These are
// alternate SPELLINGS of ordinary maps that stress the parameter-reassignment / trailing-assignment paths.
// The JS backend always accepted them; the emitted GLSL must too, or it fails to COMPILE while the CPU
// overlay works. packages/expr/test/emitBodyHighs.test.ts pins the emitted STRING; running these through
// runGLSL (H2) / compiling buildEscapeProbeGLSL (H1) in a real WebGL2 context is the stronger check that the
// GLSL actually compiles + runs on a GPU — the class of regression only the browser harness can catch.

/** H2 (PKG-expr-B-02): assigning to a shader PARAMETER must NOT redeclare it (`cvec z =` → GLSL error).
 *  `z = z^2 + c; z` ≡ z²+c and `c = c^2; z + c` ≡ z+c² — same maps, exercised through the reassign path. */
export const F_REGRESSION_CORPUS: DualCase[] = [
  { name: "H2: z = z^2 + c; z (reassign param z)", source: "z = z^2 + c; z" },
  { name: "H2: c = c^2; z + c (reassign param c)", source: "c = c^2; z + c" },
];

/** H1 (PKG-expr-B-01): an escape predicate ENDING in an assignment must coerce to bool (real-part ≠ 0), not
 *  `return <cvec>;` from a `bool escapeFn` (a GLSL type error). `fSource` is the map makeEscapeFn needs. */
export const ESCAPE_REGRESSION_CORPUS: { name: string; source: string; fSource: string }[] = [
  { name: "H1: x = z^2 (assignment-ending escape predicate)", source: "x = z^2", fSource: "z^2 + c" },
];

/** Assemble a self-contained WebGL2 fragment shader for a `bool escapeFn(z,c)` (compileEscape), writing
 *  1.0/0.0 to the render target — the escape-predicate counterpart of buildProbeGLSL. */
export function buildEscapeProbeGLSL(source: string): string {
  const escFn = compileEscape(parse(source));
  return `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${escFn}
uniform vec2 uZ;
uniform vec2 uC;
out vec4 fragColor;
void main() {
  bool e = escapeFn(vec_(uZ.x, uZ.y), vec_(uC.x, uC.y));
  fragColor = vec4(e ? 1.0 : 0.0, 0.0, 0.0, 1.0);
}`;
}

/** JS-backend reference for an escape predicate (one boolean per sample). */
export function jsEscapeReference(source: string, fSource: string, samples: Sample[]): boolean[] {
  const f = makeEscapeFn(parse(source), parse(fSource));
  return samples.map((s) => f(s.z, s.c));
}
