import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { differentiate } from "@cas/expr/derivative";
import { createProgram } from "@cas/gpu/shader";
import {
  VERTEX_SHADER,
  POST_FRAGMENT_SHADER,
  PREVIEW_FRAGMENT_SHADER,
  PERTURBATION_FRAGMENT_SHADER,
  buildFragmentShader,
} from "../src/render/shaderBuilder";

// COMPILES AND LINKS CD'S REAL SHADERS IN A REAL WebGL2 CONTEXT (cd-shader-uncompiled-07).
//
// Until this file, no app shader was compiled anywhere in CI. `glslCodegen.test.ts` asserts on the
// emitted GLSL as a STRING — it can check that a construct is present or absent, but a string
// assertion cannot tell you the program builds. That gap matters most exactly where the string tests
// are weakest: its own header notes the df64 bugs it guards were "forms that only compiled / behaved
// as single", i.e. defects whose entire signature is a compile failure in one precision. And Complex
// Dynamics is PUBLISHED — a df64-only GLSL error reaches users as a dead canvas.
//
// Why this runs in the browser project: compiling GLSL needs a live WebGL2 context, which the
// node/jsdom gate structurally cannot provide. It joins @cas/gpu's existing `pnpm test:browser`
// harness and its existing CI job rather than adding new infrastructure — the marginal cost is this
// file plus a config that points at the same Playwright/Chromium setup.
//
// Scope: compile + LINK only, deliberately. Nothing here renders a pixel or checks a numeric result;
// the float32-numerics backstop is @cas/gpu's dual-backend harness, which drives GLSL through
// runGLSL and compares against the JS reference. A green run here means "the program the app would
// hand the driver actually builds", nothing more.
//
// NOT COVERED, so it is not mistaken for coverage: apps/correspondences' shaders are still never
// compiled. That app is unpublished, and its own finding (corr-shader-mirror-02) was about the TS
// mirror drifting from the shader, which is closed separately by binding the mirror to the GLSL
// source. Its FRAG is also a module-private const, so compiling it would mean exporting internals
// purely for a test.

const f = parse("z*z + c");
const esc = parse("abs(z) > 2");

/** A real WebGL2 context. Throws rather than returning null, so a runner without WebGL2 fails
 *  loudly instead of letting the compile assertions below pass on a dead context. */
function context(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context — headless Chromium should provide one via SwiftShader");
  return gl;
}

describe("CD's real shaders compile and link in WebGL2 (cd-shader-uncompiled-07)", () => {
  it("has a WebGL2 context (otherwise every assertion below is vacuous)", () => {
    expect(() => context()).not.toThrow();
  });

  it("builds the fixed-function shaders (post, preview, perturbation)", () => {
    const gl = context();
    for (const [name, src] of [
      ["post", POST_FRAGMENT_SHADER],
      ["preview", PREVIEW_FRAGMENT_SHADER],
      ["perturbation", PERTURBATION_FRAGMENT_SHADER],
    ] as const) {
      expect(() => createProgram(gl, VERTEX_SHADER, src), name).not.toThrow();
    }
  });

  // The precision sweep is the point: `single` and `df64` share the emitted body verbatim, and a
  // construct valid as vec2 can be invalid as vec4. Both must build.
  for (const precision of ["single", "df64"] as const) {
    it(`builds the generated fragment shader in ${precision}`, () => {
      const gl = context();
      const src = buildFragmentShader(f, esc, precision, differentiate(f, "z"), differentiate(f, "c"));
      expect(() => createProgram(gl, VERTEX_SHADER, src)).not.toThrow();
    });

    it(`builds a NON-holomorphic f (no derivative branch) in ${precision}`, () => {
      const gl = context();
      // conjugate(z) has no symbolic ∂/∂z, so fZFn/fCFn and the multiplier branch are omitted. The
      // program must still link — a dangling reference to the elided function would only show up here.
      const src = buildFragmentShader(parse("conjugate(z)^2 + c"), esc, precision);
      expect(() => createProgram(gl, VERTEX_SHADER, src)).not.toThrow();
    });

    it(`builds with the live parameter \`a\` and a monic degree in ${precision}`, () => {
      const gl = context();
      // `a` is the df64 alias fix (glslCodegen.test.ts pins its SHAPE; this proves it compiles as
      // both vec2 and vec4). monicDegree drives the smooth-iteration normalization.
      const g = parse("z*z*z + a*z + c");
      const src = buildFragmentShader(g, esc, precision, differentiate(g, "z"), differentiate(g, "c"), 3);
      expect(() => createProgram(gl, VERTEX_SHADER, src)).not.toThrow();
    });

    it(`builds with the interior + periodicity bailouts in ${precision}`, () => {
      const gl = context();
      const src = buildFragmentShader(f, esc, precision, differentiate(f, "z"), differentiate(f, "c"), 2, true, true);
      expect(() => createProgram(gl, VERTEX_SHADER, src)).not.toThrow();
    });
  }
});
