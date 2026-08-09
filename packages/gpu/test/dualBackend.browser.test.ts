import { describe, expect, it, beforeAll } from "vitest";
import {
  runGLSL,
  jsReference,
  compareResults,
  defaultSamples,
  DUAL_BACKEND_CORPUS,
  F_REGRESSION_CORPUS,
  ESCAPE_REGRESSION_CORPUS,
  buildEscapeProbeGLSL,
  PROBE_VERTEX,
} from "../src/dualBackend.js";
import { createProgram } from "../src/shader.js";

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
  if (!ctx)
    throw new Error("WebGL2 unavailable in this browser — cannot run the GLSL harness");
  gl = ctx;
});

describe("@cas/gpu dual-backend: real GLSL ≈ JS across the corpus (browser WebGL2)", () => {
  it("has a WebGL2 context with float render-target readback (EXT_color_buffer_float)", () => {
    expect(gl).toBeTruthy();
    expect(gl.getExtension("EXT_color_buffer_float")).toBeTruthy();
  });

  // Tolerance is RENDERER-appropriate. Headless Chromium's WebGL2 is SwiftShader (software) in CI: its
  // ARITHMETIC (add/sub/mul/div) is float32-exact, so poly/rational maps agree to float32 ε (≤ 2e-6), but
  // it approximates the TRANSCENDENTALS exp/log/sin/cos/tan in software at only ~1e-3 relative precision —
  // far looser than a hardware GPU or float64. (This was measured here: `exp(z)+c` came out ~7e-4 while all
  // arithmetic maps stayed < 2e-6; the dualBackend header's ~1.5e-7 was a hardware-GPU run.) So the shader
  // FORMULA is pinned tightly by the arithmetic maps + the node dualBackend core; transcendental maps get a
  // bound that reflects SwiftShader's transcendental accuracy (still catches a gross formula bug ≫ 5e-3).
  const isTranscendental = (src: string) =>
    /\b(exp|log|sin|cos|tan|lambertw|gamma|zeta)\b/.test(src);
  it.each(DUAL_BACKEND_CORPUS)(
    "$name: GLSL matches the JS backend (renderer-appropriate ε)",
    (c) => {
      const samples = defaultSamples();
      const js = jsReference(c.source, samples);
      const glsl = runGLSL(gl, c.source, samples);
      const { maxAbsError, worst } = compareResults(c.name, samples, js, glsl);
      const tol = isTranscendental(c.source) ? 5e-3 : 2e-6;
      const where = worst
        ? `worst @ z=${worst.sample.z} c=${worst.sample.c} (tol ${tol})`
        : "";
      expect(maxAbsError, where).toBeLessThan(tol);
    },
  );
});

// The emitBody codegen bugs the whole-app review found (H1/H2) — here verified where only a real GPU can:
// the emitted GLSL must actually COMPILE and RUN. (The node dualBackend core pins the emitted string; this
// catches the class of bug where the mirror looks right but the GLSL fails to compile / mis-runs on-device.)
describe("@cas/gpu dual-backend: emitBody codegen regressions compile + run on real WebGL2 (H1/H2)", () => {
  it.each(F_REGRESSION_CORPUS)(
    "$name: the reassigned-param GLSL compiles + matches JS",
    (c) => {
      const samples = defaultSamples();
      const js = jsReference(c.source, samples);
      // runGLSL calls createProgram, which THROWS on a compile error — so a `cvec z =` param redeclaration
      // (the H2 bug) would fail here rather than silently pass a mirror. Pure arithmetic ⇒ float32-exact.
      const glsl = runGLSL(gl, c.source, samples);
      const { maxAbsError, worst } = compareResults(c.name, samples, js, glsl);
      expect(
        maxAbsError,
        worst ? `worst @ z=${worst.sample.z} c=${worst.sample.c}` : "",
      ).toBeLessThan(2e-6);
    },
  );

  it.each(ESCAPE_REGRESSION_CORPUS)(
    "$name: the escape-predicate GLSL compiles (bool fn, no cvec return)",
    (c) => {
      // The H1 bug returned a cvec from a `bool escapeFn` — a GLSL TYPE ERROR. createProgram throws on a
      // compile/link failure, so a successful compile of the ACTUAL emitted shader IS the regression guard.
      const program = createProgram(gl, PROBE_VERTEX, buildEscapeProbeGLSL(c.source));
      expect(program).toBeTruthy();
      gl.deleteProgram(program);
    },
  );
});
