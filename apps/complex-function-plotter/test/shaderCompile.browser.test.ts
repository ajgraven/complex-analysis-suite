import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { freeParameters, substitute } from "@cas/expr/ast";
import { differentiate } from "@cas/expr/derivative";
import { compileF } from "@cas/expr/glsl";
import { createProgram } from "@cas/gpu/shader";
import { buildFragmentShader, VERTEX_SHADER } from "../src/render/colorShader.js";
import { buildSurfaceProgram } from "../src/render3d/surfaceShader.js";
import { buildSphereFragment } from "../src/render3d/sphereShader.js";
import { buildRiemannProgram } from "../src/render3d/riemannSurface.js";
import { detectRiemannForm } from "../src/riemann/inverse.js";

// COMPILES + LINKS THE PLOTTER'S REAL SHADERS IN A REAL WebGL2 CONTEXT (Track B: close the "app GLSL
// never compiled in CI" gap). Until this file the plotter had ZERO shader coverage in CI — the node
// suite (colorShader.test.ts / surface3d.test.ts / sphere.test.ts) asserts on the emitted GLSL as a
// STRING, which can check a construct is present but CANNOT tell you the program builds. The plotter is
// PUBLISHED, so a shader that fails to compile/link reaches users as a dead canvas.
//
// This mirrors apps/complex-dynamics/test/shaderCompile.browser.test.ts and rides @cas/gpu's existing
// `pnpm test:browser` Playwright/Chromium harness + CI job — no new infrastructure. It reconstructs the
// EXACT pipeline Plot.compileSource + rebuild{,Surface,Sphere}Program run: parse → freeParameters →
// compileF (fFn, and fpFn when differentiable) → build{Fragment,Surface,Sphere} → createProgram (which
// throws on a compile/link error). Compile + link only; the float32-numerics backstop stays @cas/gpu's
// dual-backend harness.

/** A real WebGL2 context. Throws rather than returning null so a runner without WebGL2 fails loudly
 *  instead of letting the compile assertions pass on a dead context. */
function context(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context — headless Chromium should provide one via SwiftShader");
  return gl;
}

/** The plotter's compile pipeline for a source string (optionally through the ∞-inspector's z → 1/z). */
function compile(src: string, inspectInfinity = false): { names: string[]; fGlsl: string; fpGlsl: string | null } {
  let ast = parse(src);
  if (inspectInfinity) ast = substitute(ast, "z", parse("1/z"));
  const names = freeParameters(ast);
  const fGlsl = compileF(ast, "fFn", { params: names });
  let fpGlsl: string | null = null;
  try {
    fpGlsl = compileF(differentiate(ast, "z"), "fpFn", { params: names }); // omitted for non-differentiable f
  } catch {
    fpGlsl = null;
  }
  return { names, fGlsl, fpGlsl };
}

// A corpus spanning the render path's shape space: polynomials, poles/rationals, transcendentals,
// hyperbolics (derived from exp — the class the earlier dual-backend fix touched), the float32 special
// functions (Γ / ζ / W — each non-differentiable in the system, so fpGlsl is null and the surface takes
// its geometric-normal branch), named parameters (uParam_<name> aliasing), and a non-holomorphic map.
const CORPUS: { name: string; src: string }[] = [
  { name: "z^2 (polynomial)", src: "z^2" },
  { name: "1/z (simple pole)", src: "1/z" },
  { name: "(z^2-1)/(z^2+1) (rational)", src: "(z^2 - 1)/(z^2 + 1)" },
  { name: "exp(z)", src: "exp(z)" },
  { name: "sin+cos (trig)", src: "sin(z) + cos(z)" },
  { name: "sinh+tanh (hyperbolic, derived)", src: "sinh(z) + tanh(z)" },
  { name: "log(z)", src: "log(z)" },
  { name: "sqrt(z)", src: "sqrt(z)" },
  { name: "gamma(z) (Lanczos, no f')", src: "gamma(z)" },
  { name: "zeta(z) (Borwein, no f')", src: "zeta(z)" },
  { name: "lambertw(z) (Halley, no f')", src: "lambertw(z)" },
  { name: "z^2 + a (named parameter)", src: "z^2 + a" },
  { name: "a*sin(z) + b (two parameters)", src: "a*sin(z) + b" },
  { name: "conjugate(z) (non-holomorphic)", src: "conjugate(z)" },
  { name: "conjugate(z)^2 + a (non-holo + param)", src: "conjugate(z)^2 + a" },
];

describe("the plotter's real shaders compile + link in WebGL2 (Track B)", () => {
  it("has a WebGL2 context (otherwise every assertion below is vacuous)", () => {
    expect(() => context()).not.toThrow();
  });

  it.each(CORPUS)("$name — 2D · surface · sphere programs all build", (c) => {
    const gl = context();
    const { names, fGlsl, fpGlsl } = compile(c.src);
    expect(() => createProgram(gl, VERTEX_SHADER, buildFragmentShader(fGlsl, names)), "2D").not.toThrow();
    const surf = buildSurfaceProgram(fGlsl, names, fpGlsl);
    expect(() => createProgram(gl, surf.vertex, surf.fragment), "surface").not.toThrow();
    expect(() => createProgram(gl, VERTEX_SHADER, buildSphereFragment(fGlsl, names)), "sphere").not.toThrow();
  });

  it("builds the ∞-inspector body (f(1/z)) for all three views", () => {
    const gl = context();
    const { names, fGlsl, fpGlsl } = compile("z^2 + a", true);
    expect(() => createProgram(gl, VERTEX_SHADER, buildFragmentShader(fGlsl, names)), "2D").not.toThrow();
    const surf = buildSurfaceProgram(fGlsl, names, fpGlsl);
    expect(() => createProgram(gl, surf.vertex, surf.fragment), "surface").not.toThrow();
    expect(() => createProgram(gl, VERTEX_SHADER, buildSphereFragment(fGlsl, names)), "sphere").not.toThrow();
  });

  // The Riemann-surface mode (ADR-0027): the invertible primitives whose parametrize-by-w program must
  // build + link. Each is a recognized RiemannForm whose gZFn/gWFn compile through the same @cas/expr path.
  const RIEMANN_CORPUS = [
    "sqrt(z)",
    "log(z)",
    "z^(1/3)",
    "z^(2/3)",
    "arcsin(z)",
    "arccos(z)",
    "arctan(z)",
    "2*sqrt(z)+1",
    "sqrt(2*z+1)",
    "(1+i)*log(z)",
  ];
  it.each(RIEMANN_CORPUS)("Riemann-surface program builds for %s", (src) => {
    const gl = context();
    const form = detectRiemannForm(parse(src));
    expect(form, src).not.toBeNull();
    if (!form) return;
    const prog = buildRiemannProgram(
      compileF(form.zFromT, "gZFn"),
      compileF(form.wFromT, "gWFn"),
    );
    expect(() => createProgram(gl, prog.vertex, prog.fragment), "riemann").not.toThrow();
  });

  it("builds the surface with NO f' (geometric-normal branch) for a differentiable f too", () => {
    // The surface program has two shading paths (analytic normal when fpGlsl is present, geometric when
    // not). Γ/ζ/W exercise the null path above; force it here for a holomorphic f so both branches of
    // buildSurfaceProgram are compiled regardless of which functions happen to be differentiable.
    const gl = context();
    const { names, fGlsl } = compile("z^3 + a");
    const surf = buildSurfaceProgram(fGlsl, names, null);
    expect(() => createProgram(gl, surf.vertex, surf.fragment)).not.toThrow();
  });
});
