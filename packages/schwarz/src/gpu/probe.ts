// Parity probe + upload harness for the GPU σ evaluator (./sigma.glsl.ts). Two halves, split by
// capability exactly like @cas/gpu's dualBackend.ts:
//   · buildSigmaProbeGLSL / packPhi — pure (string assembly, uniform packing); node-testable.
//   · uploadPhi / runSigmaGLSL      — need a live WebGL2 context with float readback; browser-only.
//
// `runSigmaGLSL` is the numeric backstop the CPU-mirror tests structurally can't be: it executes the
// ACTUAL float32 GLSL and reads σ(w) back, so it catches any drift from the CPU engines
// (../unbounded-laurent.ts, ../bounded.ts — the family is selected by `SigmaPhi.family`). CD's production
// renderer reuses `packPhi`/`uploadPhi` to feed the same uniforms into its escape-time shader (S4b/S5-C2).

import { createProgram } from "@cas/gpu/shader";
import { FULLSCREEN_VERTEX_GLSL } from "@cas/gpu/glsl";
import type { Complex, SchwarzBranch } from "../unbounded-laurent.js";
import {
  MAX_BRANCHES,
  MAX_K,
  MAX_LAURENT,
  SIGMA_CONSTS_GLSL,
  SIGMA_UNIFORMS_GLSL,
  SIGMA_COMPLEX_GLSL,
  SIGMA_EVAL_GLSL,
} from "./sigma.glsl.js";

export { MAX_BRANCHES, MAX_K, MAX_LAURENT };

/** The map φ the σ evaluator reconstructs — the same triple `makeUnboundedLaurentSchwarz` takes, so a
 *  test (or CD) builds the CPU engine and the GPU uniforms from ONE spec. */
export interface SigmaPhi {
  /** Family (S5-C2): "unbounded" (default) — φ: {|z|>1}→Ω; "bounded" — φ: {|z|<1}→Ω. */
  family?: "unbounded" | "bounded";
  /** Unbounded leading coefficient (φ ~ c·z at ∞). Real (QD) or complex `[re,im]` (S5-C1). Default [0,0]. */
  c?: number | Complex;
  /** Unbounded Laurent coefficients F[l] (φ gains Σₗ F[l]/zˡ). Default []. */
  F?: readonly Complex[];
  /** Bounded domain centre w₀ (φ(0) = w₀). Default [0,0]. */
  w0?: Complex;
  /** Finite-pole branches (shared by both families). */
  branches?: readonly SchwarzBranch[];
}

/** φ's uniforms packed into the fixed-size typed arrays the shader declares. */
export interface PackedPhi {
  /** 0 unbounded-Laurent · 1 bounded (S5-C2); uploaded to u_family. */
  family: number;
  /** Leading coefficient as a complex `[re, im]` (real c packs to `[c, 0]`); uploaded to the vec2 u_c. */
  c: Complex;
  /** Bounded domain centre w₀; uploaded to the vec2 u_w0. */
  w0: Complex;
  polyA: Float32Array;
  polyALen: number;
  branchZ: Float32Array;
  branchA: Float32Array;
  branchACount: Int32Array;
  nBranches: number;
}

/** Trivial fullscreen-triangle vertex shader; the fragment shader does all the work at one pixel. */
export const SIGMA_PROBE_VERTEX = FULLSCREEN_VERTEX_GLSL;

/**
 * Assemble a self-contained WebGL2 fragment shader that evaluates σ(w) — from the `uW` uniform and the
 * φ uniforms — writing (re, im, ok, 1) into an RGBA32F render target. `ok` is 1.0 when the numerical
 * inverse succeeded (w ∈ Ω with a recoverable preimage — the exterior branch for the unbounded family,
 * the interior branch for the bounded family), else 0.0 with (re,im) = 0.
 *
 * A single σ application per draw: seed Newton fresh from w, run `sigma` once. That is exactly what the
 * CPU `sigma(w)` does, so `runSigmaGLSL` vs the matching CPU engine's `.sigma(w)`
 * (`makeUnboundedLaurentSchwarz` / `makeBoundedSchwarz`) is a like-for-like comparison.
 *
 * The `.w` channel carries the per-step σ scaling |F'(z)|/|φ'(z)| at z = φ⁻¹(w) (the σ distance-estimator
 * factor, S5-B2). `sigma` leaves the converged inverse in `zSeed`, so it is read there with no re-solve;
 * `runSigmaDerivGLSL` reads it back to pin GPU F'/φ' against the CPU engine (0.0 when the inverse failed).
 */
export function buildSigmaProbeGLSL(): string {
  return `#version 300 es
precision highp float;
precision highp int;
${SIGMA_CONSTS_GLSL}
uniform vec2 uW;
${SIGMA_UNIFORMS_GLSL}
${SIGMA_COMPLEX_GLSL}
${SIGMA_EVAL_GLSL}
out vec4 fragColor;
void main() {
  vec2 zSeed = newtonSeedFresh(uW);
  bool ok = true;
  vec2 s = sigma(uW, zSeed, ok);
  float dr = ok ? length(evalFDeriv(zSeed)) / max(length(evalPhiDeriv(zSeed)), EPS_DIV) : 0.0;
  fragColor = vec4(s.x, s.y, ok ? 1.0 : 0.0, dr);
}`;
}

/**
 * Pack φ into the fixed-size typed arrays the shader's uniform arrays expect. `u_branchA` is flat, with
 * branch j's coefficients at `[j*MAX_K … j*MAX_K + m_j)`. Throws if a dimension exceeds its cap (the
 * caller — CD — falls back to the CPU engine in that case, as QD's setPhi does). Pure JS: pinned in the
 * node test.
 */
export function packPhi(phi: SigmaPhi): PackedPhi {
  const F = phi.F ?? [];
  const branches = phi.branches ?? [];
  if (F.length > MAX_LAURENT) {
    throw new Error(`packPhi: Laurent length ${F.length} > MAX_LAURENT ${MAX_LAURENT}`);
  }
  if (branches.length > MAX_BRANCHES) {
    throw new Error(`packPhi: ${branches.length} branches > MAX_BRANCHES ${MAX_BRANCHES}`);
  }

  const polyA = new Float32Array(MAX_LAURENT * 2);
  for (let l = 0; l < F.length; l++) {
    polyA[2 * l] = F[l][0];
    polyA[2 * l + 1] = F[l][1];
  }

  const branchZ = new Float32Array(MAX_BRANCHES * 2);
  const branchA = new Float32Array(MAX_BRANCHES * MAX_K * 2);
  const branchACount = new Int32Array(MAX_BRANCHES);
  for (let j = 0; j < branches.length; j++) {
    const br = branches[j];
    if (br.A.length > MAX_K) {
      throw new Error(`packPhi: branch ${j} order ${br.A.length} > MAX_K ${MAX_K}`);
    }
    branchZ[2 * j] = br.z[0];
    branchZ[2 * j + 1] = br.z[1];
    branchACount[j] = br.A.length;
    for (let k = 0; k < br.A.length; k++) {
      branchA[2 * (j * MAX_K + k)] = br.A[k][0];
      branchA[2 * (j * MAX_K + k) + 1] = br.A[k][1];
    }
  }

  const cc = phi.c ?? [0, 0];
  const c: Complex = typeof cc === "number" ? [cc, 0] : [cc[0], cc[1]];
  const family = phi.family === "bounded" ? 1 : 0;
  const w0: Complex = phi.w0 ? [phi.w0[0], phi.w0[1]] : [0, 0];
  return { family, c, w0, polyA, polyALen: F.length, branchZ, branchA, branchACount, nBranches: branches.length };
}

/** Upload a packed φ to the currently-bound program's uniforms. Call after `gl.useProgram(program)`. */
export function uploadPhi(gl: WebGL2RenderingContext, program: WebGLProgram, packed: PackedPhi): void {
  const at = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
  gl.uniform1i(at("u_family"), packed.family);
  gl.uniform2f(at("u_c"), packed.c[0], packed.c[1]);
  gl.uniform2f(at("u_w0"), packed.w0[0], packed.w0[1]);
  gl.uniform2fv(at("u_polyA"), packed.polyA);
  gl.uniform1i(at("u_polyALen"), packed.polyALen);
  gl.uniform2fv(at("u_branchZ"), packed.branchZ);
  gl.uniform2fv(at("u_branchA"), packed.branchA);
  gl.uniform1iv(at("u_branchACount"), packed.branchACount);
  gl.uniform1i(at("u_nBranches"), packed.nBranches);
}

/**
 * Compile the probe, upload φ once, render each w to a 1×1 RGBA32F target, and map the read-back pixel
 * through `read`. The shared draw harness behind `runSigmaGLSL` (σ from RGB) and `runSigmaDerivGLSL`
 * (the .w derivative factor). Requires a WebGL2 context with EXT_color_buffer_float (for float readback).
 */
function runProbe<T>(
  gl: WebGL2RenderingContext,
  phi: SigmaPhi,
  ws: readonly Complex[],
  read: (px: Float32Array) => T,
): T[] {
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("EXT_color_buffer_float unavailable — cannot read back float σ results");
  }
  const program = createProgram(gl, SIGMA_PROBE_VERTEX, buildSigmaProbeGLSL());
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
    uploadPhi(gl, program, packPhi(phi));
    const uW = gl.getUniformLocation(program, "uW");
    const px = new Float32Array(4);
    const out: T[] = [];
    for (const w of ws) {
      gl.uniform2f(uW, w[0], w[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
      out.push(read(px));
    }
    return out;
  } finally {
    // Release the probe's GL objects — called once per case, so leaking these would accumulate
    // programs / textures / buffers across a test run (matches dualBackend's runGLSL).
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buf);
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fbo);
  }
}

/**
 * GPU-backend σ evaluation: for each w render to a 1×1 RGBA32F target and read σ(w) back. Returns the σ
 * value, or null when the shader reported the inverse failed (w ∉ Ω).
 */
export function runSigmaGLSL(
  gl: WebGL2RenderingContext,
  phi: SigmaPhi,
  ws: readonly Complex[],
): (Complex | null)[] {
  return runProbe(gl, phi, ws, (px) => (px[2] > 0.5 ? [px[0], px[1]] : null));
}

/**
 * GPU-backend read-back of the σ distance-estimator per-step factor |F'(z)|/|φ'(z)| at z = φ⁻¹(w) (S5-B2).
 * Returns the ratio, or null when the shader reported the inverse failed (w ∉ Ω). Pins the GLSL evalFDeriv
 * against the CPU engine's evalFDeriv/evalPhiDeriv.
 */
export function runSigmaDerivGLSL(
  gl: WebGL2RenderingContext,
  phi: SigmaPhi,
  ws: readonly Complex[],
): (number | null)[] {
  return runProbe(gl, phi, ws, (px) => (px[2] > 0.5 ? px[3] : null));
}
