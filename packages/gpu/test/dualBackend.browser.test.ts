import { describe, expect, it, beforeAll } from "vitest";
import {
  runGLSL,
  jsReference,
  compareResults,
  defaultSamples,
  DUAL_BACKEND_CORPUS,
} from "../src/dualBackend.js";

// BROWSER-MODE numeric harness (Review P4: GLSL-in-CI). Runs ONLY under `pnpm test:browser`
// (vitest.browser.config.ts) — a real headless-Chromium WebGL2 context — never in the default node gate.
//
// This is the piece the CPU-mirror tests structurally CANNOT be: it executes the ACTUAL float32 GLSL the
// render path emits (via runGLSL) and compares it, sample-by-sample, to the float64 JS backend. The
// dualBackend header records a hand-run of exactly this over DUAL_BACKEND_CORPUS agreeing to ~1.5e-7; this
// wires that check so it runs automatically. If the GLSL codegen (@cas/expr/glsl) ever drifts from the JS
// evaluator, THIS fails — the automated backstop for the H1/H2/H3 class of GPU-only bugs.

let gl: WebGL2RenderingContext;

beforeAll(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("webgl2");
  if (!ctx) throw new Error("WebGL2 unavailable in this browser — cannot run the GLSL harness");
  gl = ctx;
});

describe("@cas/gpu dual-backend: real GLSL ≈ JS across the corpus (browser WebGL2)", () => {
  it("has a WebGL2 context with float render-target readback (EXT_color_buffer_float)", () => {
    expect(gl).toBeTruthy();
    expect(gl.getExtension("EXT_color_buffer_float")).toBeTruthy();
  });

  it.each(DUAL_BACKEND_CORPUS)("$name: GLSL matches the JS backend to float32 ε", (c) => {
    const samples = defaultSamples();
    const js = jsReference(c.source, samples);
    const glsl = runGLSL(gl, c.source, samples);
    const { maxAbsError, worst } = compareResults(c.name, samples, js, glsl);
    // Single-precision GLSL vs float64 JS: agreement to a few ×1e-7 across the O(1) corpus grid
    // (the header's measured bound was ~1.5e-7; 2e-6 leaves margin for SwiftShader's fp32 variance).
    expect(maxAbsError, worst ? `worst @ z=${worst.sample.z} c=${worst.sample.c}` : "").toBeLessThan(2e-6);
  });
});
