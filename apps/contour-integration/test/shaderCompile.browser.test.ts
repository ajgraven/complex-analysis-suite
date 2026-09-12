// COMPILES AND LINKS THIS APP'S REAL SHADERS IN A REAL WebGL2 CONTEXT.
//
// Until this file the app had ZERO shader coverage: the node suite (50 files) never touches
// `src/ui/stage/`, and a shader that fails to compile reaches a published app as a blank stage with
// the whole right-hand rail still confidently printing exact answers. `glStage.setIntegrand` throws
// on a compile or link failure and the shell shows it, which is the right behaviour and no substitute
// for knowing the programs build.
//
// The stdlib here is the one `GLStage.setIntegrand` assembles, `CUT_GLSL` included — it comes in
// unconditionally from M4.7c, because the declared branch product is built out of `cpowCut` and one
// program shape is better than two. Drifting from it would make this file assert that a program
// nobody builds compiles.
//
// It mirrors `apps/complex-function-plotter/test/shaderCompile.browser.test.ts` and
// `apps/complex-dynamics/test/shaderCompile.browser.test.ts`, and rides the same Playwright/Chromium
// harness and the same CI job — no new infrastructure. It reconstructs the exact pipeline
// `GLStage.setIntegrand` runs: `parse` → `compileF` → `buildPhaseFrag` → `createProgram`.
//
// The corpus is the SANDBOX'S OWN PRESET LIST plus every tier-D record's contour integrand, because
// those are the expressions a user can actually put on the stage. Tier D's are the ones that matter
// most here: they carry `^` with a non-integer exponent and `sqrt`, the two constructs the phase
// portrait draws a branch cut for.
import { describe, expect, it } from "vitest";
import { compileF, parse } from "@cas/expr";
import { COMPLEX_DERIVED_GLSL, COMPLEX_SINGLE_GLSL, createProgram } from "@cas/gpu";
import { buildPhaseFrag, PHASE_VERT } from "../src/ui/stage/phase.glsl.js";
import { CUT_GLSL } from "../src/ui/stage/cut.glsl.js";
import { FAMILIES } from "../src/families/index.js";
import { contourIntegrandOf } from "../src/families/instantiate.js";
import { primaryGolden } from "../src/families/runFamily.js";
import { PRESETS } from "../src/shell/presets.js";

/** A real WebGL2 context. Throws rather than returning null, so a runner without WebGL2 fails loudly
 *  instead of letting every compile assertion pass on a dead context. */
function context(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context — headless Chromium should provide one via SwiftShader");
  return gl;
}

/** Exactly what `GLStage.setIntegrand` builds, minus the uniform lookups. */
function buildProgram(gl: WebGL2RenderingContext, src: string): WebGLProgram {
  const stdlib = `${COMPLEX_SINGLE_GLSL}\n${COMPLEX_DERIVED_GLSL}\nuniform vec2 uA;\n${CUT_GLSL}\n`;
  return createProgram(gl, PHASE_VERT, buildPhaseFrag(stdlib, compileF(parse(src))));
}

describe("the sandbox's own presets compile", () => {
  it.each(PRESETS.map((p) => p.src))("%s", (src) => {
    const gl = context();
    expect(() => buildProgram(gl, src)).not.toThrow();
  });
});

describe("every record's contour integrand compiles", () => {
  // `contourIntegrandOf` is the same call `runFamily` makes, so this is the expression the stage is
  // actually handed in gallery mode — not the posed one, which for a substituted family is a
  // different function.
  const cases = FAMILIES.map((family) => {
    const built = contourIntegrandOf(family, primaryGolden(family).params);
    if (!built.ok) throw new Error(`${family.id}: ${built.reason}`);
    return [family.id, built.ast] as const;
  });

  it("covers every loaded record", () => {
    expect(cases).toHaveLength(FAMILIES.length);
    expect(FAMILIES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases)("%s", (_id, ast) => {
    const gl = context();
    const stdlib = `${COMPLEX_SINGLE_GLSL}\n${COMPLEX_DERIVED_GLSL}\nuniform vec2 uA;\n${CUT_GLSL}\n`;
    expect(() => createProgram(gl, PHASE_VERT, buildPhaseFrag(stdlib, compileF(ast)))).not.toThrow();
  });
});
